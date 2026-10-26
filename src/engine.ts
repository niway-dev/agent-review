/**
 * The review engine: provider-neutral. It reads a pull request through `gh`, plans batches, asks a
 * `ProviderAdapter` to review each one, and posts the result as a GitHub review. The agent CLI
 * itself (flags, binary, hardening) lives in `src/providers/`.
 *
 * Every kept file is accounted for: reviewed, retried, or listed with a closed reason. Files
 * nobody reviews (lockfiles, build output, generated code, `AGENT_REVIEW_EXCLUDE` matches) are
 * dropped first and never read. The rest are scored by risk (`riskScore`) and packed into
 * batches of about 1,000 changed lines (`planBatches`), riskiest first; each batch is one provider call with its diff
 * inside the prompt. A batch that leaves files unaccounted for is re-run once with only those
 * files. Money bounds the run, not size: each batch has its own budget, and once the pull
 * request's budget is spent the remaining batches are listed as not reviewed. A file that is
 * still not accounted for makes the review "partial", on its first line.
 *
 * Findings become inline review comments on their lines, so the operator can answer each one in
 * its thread; a finding outside the diff, and every "info" finding, goes in the review body. Each
 * finding is labelled on two axes, a severity and a topic (`SEVERITY`, `TOPIC`). The engine adds
 * its own "info" notice for every changed decision record (`adrNotices`). The review is advisory: it never
 * approves, requests changes or blocks a merge. On a re-review, the agent reads its open threads
 * and the operator's replies and answers in each thread. It never resolves one.
 *
 * What to look for beyond the defaults comes from `.github/agent-review.md` when the repository
 * has one (`.github/claude-review.md` is still read, with a notice).
 *
 * The engine holds the GitHub token and posts; the agent only reads and gets no token. The engine
 * throws, posting nothing, when the provider says any text to post holds a credential. That is
 * best-effort, not a sandbox: it relies on the consumer repository's trust assumption (only trusted people push).
 * The command-line entry point is `src/cli.ts`.
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { operatorProblem, type EngineConfig } from "./config";
import type { ProviderAdapter } from "./providers/types";

export interface PrFile {
  filename: string;
  additions: number;
  deletions: number;
  /** GitHub omits it for binary files and very large diffs. */
  patch?: string;
}

/**
 * Severity answers "when does the author act on this". The keys are in rank order, highest first:
 * when two batches report the same defect, the higher one is kept. This table and `TOPIC` are the
 * only place a label's emojis live; the word always follows the emoji, so a label stays searchable
 * and readable without emoji fonts or by a screen reader.
 */
export const SEVERITY = {
  blocker: { emoji: "🔴", word: "Blocker" },
  fix: { emoji: "🟠", word: "Fix" },
  consider: { emoji: "🟡", word: "Consider" },
  info: { emoji: "⚪", word: "Info" },
} as const;

/** Topic answers "what is the finding about". There is no catch-all: an unclassifiable finding is a question. */
export const TOPIC = {
  bug: { emoji: "🐛", word: "bug" },
  security: { emoji: "🔐", word: "security" },
  rules: { emoji: "📜", word: "rules" },
  adr: { emoji: "🏛️", word: "adr" },
  docs: { emoji: "📝", word: "docs" },
  tests: { emoji: "🧪", word: "tests" },
  perf: { emoji: "⚡", word: "perf" },
  cleanup: { emoji: "🧹", word: "cleanup" },
  question: { emoji: "❓", word: "question" },
} as const;

export type Severity = keyof typeof SEVERITY;
export type Topic = keyof typeof TOPIC;
const SEVERITIES = Object.keys(SEVERITY) as Severity[];
const TOPICS = Object.keys(TOPIC) as Topic[];

export interface Finding {
  path: string;
  /** A new-side line, or 0 for a finding about the whole file. */
  line: number;
  /** When the author acts: see `SEVERITY`. "info" never becomes an inline thread. */
  severity: Severity;
  /** What the finding is about: see `TOPIC`. */
  topic: Topic;
  title: string;
  body: string;
}

/** The only reasons a file may go unreviewed. "Read, nothing to flag" is a reviewed file. */
export const SKIP_REASONS = ["binary", "no_diff_and_unreadable"] as const;

export interface ReviewOutput {
  files_reviewed: string[];
  files_skipped: { path: string; reason: string }[];
  findings: Finding[];
  thread_replies: { comment_id: number; status: "addressed" | "still_open"; reply: string }[];
  summary: string;
}

export interface InlineComment {
  path: string;
  line: number;
  side: "RIGHT";
  body: string;
}

export interface Review {
  body: string;
  comments: InlineComment[];
}

export type Command = { kind: "review"; paths: string[] } | { kind: "answer" };

export const DEFAULT_EXCLUDE = [
  "**/bun.lock",
  "**/package-lock.json",
  "**/yarn.lock",
  "**/pnpm-lock.yaml",
  "**/*.lock",
  "**/dist/**",
  "**/build/**",
  "**/out/**",
  "**/*.min.js",
  "**/*.map",
  "**/*.snap",
  "**/*.generated.*",
  "**/worker-configuration.d.ts",
];

// The old marker is still read so repositories reviewed before the rename keep their incremental state.
const MARKER = /<!-- (?:agent-review|claude-review) sha=([A-Za-z0-9]+) -->/;
const short = (sha: string) => sha.slice(0, 7);
/** `🟠📝 **Fix · docs: stale cell**`: both emojis, then the severity, topic and title in words. */
export const label = (f: Finding) =>
  `${SEVERITY[f.severity].emoji}${TOPIC[f.topic].emoji} **${SEVERITY[f.severity].word} · ${TOPIC[f.topic].word}: ${f.title}**`;
const at = (f: { path: string; line: number }) => (f.line > 0 ? `${f.path}:${f.line}` : f.path);

/** The mention that always works besides the configured keyword, during the migration. */
export const MENTION_ALIAS = "@claude";
const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function parseCommand(body: string, keyword = "@agent-review"): Command | null {
  // Only the rest of the first line: "@agent-review review\n\nthanks" asks for a review, not a path.
  const names = [keyword, MENTION_ALIAS].map(escapeRegExp).join("|");
  const match = body.match(new RegExp(`(?:${names})(?![\\w-])(.*)`));
  if (!match) return null;
  const words = match[1].trim().split(/\s+/).filter(Boolean);
  if (words[0]?.toLowerCase() === "review") return { kind: "review", paths: words.slice(1) };
  return { kind: "answer" };
}

const underPath = (name: string, path: string) =>
  name === path || name.startsWith(path.endsWith("/") ? path : `${path}/`);

/** Words after `review` in a request that name no changed file ("again", "please") are not paths. */
export function resolveScope(words: string[], filenames: string[]) {
  const paths = words.filter((w) => filenames.some((f) => underPath(f, w)));
  return { paths, ignored: words.filter((w) => !paths.includes(w)) };
}

export function filterFiles(files: PrFile[], exclude: string[], scope: string[]) {
  const globs = exclude.map((pattern) => new Bun.Glob(pattern));
  const inScope = (name: string) => scope.length === 0 || scope.some((p) => underPath(name, p));
  const kept: PrFile[] = [];
  const dropped: PrFile[] = [];
  for (const f of files) {
    if (!inScope(f.filename)) continue;
    (globs.some((g) => g.match(f.filename)) ? dropped : kept).push(f);
  }
  return { kept, dropped };
}

export type FileKind = "code" | "test" | "docs";

const TEST_PATH = [
  /(^|\/)(__tests__|tests?|fixtures)\//,
  /\.(test|spec)\.[cm]?[jt]sx?$/,
  /(^|\/)test-[^/]*$/,
];
const DOCS_PATH = [
  /\.(md|mdx|txt|css|scss)$/,
  /^docs\//,
  /(^|\/)(messages|locales|i18n)\/[^/]*\.json$/,
];

/** Production code first, then tests, then documentation, styles and messages. */
export function fileKind(path: string): FileKind {
  if (TEST_PATH.some((r) => r.test(path))) return "test";
  if (DOCS_PATH.some((r) => r.test(path))) return "docs";
  return "code";
}

/**
 * Path rules for `riskScore`. These are defaults taken from the first consumer (`ipc`, `preload`,
 * `main`, `apps/<name>/src`) and are the owner's to tune; per-repository configuration is planned
 * (https://github.com/niway-dev/agent-review/issues/5).
 * The highest matching weight wins. A test or a document scores its kind's weight whatever its
 * path, so `ipc/foo.test.ts` does not outrank the IPC code it tests.
 */
export const RISK_RULES: { glob: string; weight: number; why: string }[] = [
  { glob: ".github/workflows/**", weight: 8, why: "CI runs with the repository's secrets" },
  { glob: "**/ipc/**", weight: 8, why: "a process boundary" },
  { glob: "**/preload/**", weight: 8, why: "a process boundary" },
  {
    glob: "**/*{auth,credential,secret,token,permission,security,crypto}*",
    weight: 7,
    why: "credentials or access control",
  },
  { glob: "**/package.json", weight: 6, why: "dependencies" },
  { glob: "**/shared/types/**", weight: 6, why: "a contract more than one side imports" },
  { glob: "**/{migrations,schema,db}/**", weight: 6, why: "stored data" },
  { glob: "scripts/**", weight: 7, why: "scripts that run with the repository's tokens" },
  { glob: "**/*.sh", weight: 6, why: "shell code" },
  { glob: "**/infra/**", weight: 6, why: "infrastructure" },
  { glob: "**/main/**", weight: 5, why: "a privileged process" },
];
const KIND_WEIGHT: Record<FileKind, number> = { code: 4, test: 2, docs: 1 };
const riskGlobs = RISK_RULES.map((r) => ({ ...r, matcher: new Bun.Glob(r.glob) }));

export function riskScore(path: string): number {
  const kind = fileKind(path);
  if (kind !== "code") return KIND_WEIGHT[kind];
  const weights = riskGlobs.filter((r) => r.matcher.match(path)).map((r) => r.weight);
  return Math.max(KIND_WEIGHT.code, ...weights);
}

/** The module a file belongs to, so a batch keeps a module's code, tests and docs together. */
export function moduleKey(path: string): string {
  const parts = path.split("/");
  if (parts[0] === "apps" && parts[2] === "src" && parts.length > 4)
    return parts.slice(0, 4).join("/");
  if ((parts[0] === "apps" || parts[0] === "packages") && parts.length > 2)
    return parts.slice(0, 2).join("/");
  return parts.length > 1 ? parts[0] : "(root)";
}

export interface Batch {
  files: PrFile[];
  lines: number;
  maxRisk: number;
}

const KIND_ORDER: Record<FileKind, number> = { code: 0, test: 1, docs: 2 };
const sizeOf = (f: PrFile) => f.additions + f.deletions;

/**
 * Packs the files into batches of at most `maxLines` changed lines and `maxChars` of diff.
 * Modules are taken riskiest first, so if the budget runs out, the dangerous part was read;
 * inside a batch, production code comes before tests and documentation. A file larger than
 * either limit is a batch of its own.
 */
export function planBatches(
  files: PrFile[],
  limits: { maxLines: number; maxChars: number },
): Batch[] {
  const modules = new Map<string, PrFile[]>();
  for (const f of files) {
    const key = moduleKey(f.filename);
    modules.set(key, [...(modules.get(key) ?? []), f]);
  }
  const ordered = [...modules.values()]
    .map((group) =>
      group.sort(
        (a, b) =>
          riskScore(b.filename) - riskScore(a.filename) || a.filename.localeCompare(b.filename),
      ),
    )
    .sort(
      (a, b) =>
        riskScore(b[0].filename) - riskScore(a[0].filename) ||
        a[0].filename.localeCompare(b[0].filename),
    )
    .flat();

  const batches: PrFile[][] = [];
  let current: PrFile[] = [];
  let lines = 0;
  let chars = 0;
  for (const f of ordered) {
    const size = sizeOf(f);
    const length = f.patch?.length ?? 0;
    if (
      current.length > 0 &&
      (lines + size > limits.maxLines || chars + length > limits.maxChars)
    ) {
      batches.push(current);
      current = [];
      lines = 0;
      chars = 0;
    }
    current.push(f);
    lines += size;
    chars += length;
  }
  if (current.length > 0) batches.push(current);

  return batches.map((group) => ({
    files: [...group].sort(
      (a, b) => KIND_ORDER[fileKind(a.filename)] - KIND_ORDER[fileKind(b.filename)],
    ),
    lines: group.reduce((n, f) => n + sizeOf(f), 0),
    maxRisk: Math.max(...group.map((f) => riskScore(f.filename))),
  }));
}

/**
 * The files of a batch the model left unaccounted for. A skip counts only with a closed reason
 * and only for a file GitHub sent no diff for: a file with a diff in the prompt can always be read.
 */
export function batchGaps(files: PrFile[], output: ReviewOutput | undefined): PrFile[] {
  if (!output) return files;
  const reviewed = new Set(output.files_reviewed);
  const skipped = new Set(
    output.files_skipped
      .filter((s) => (SKIP_REASONS as readonly string[]).includes(s.reason))
      .map((s) => s.path),
  );
  return files.filter((f) => !reviewed.has(f.filename) && !(skipped.has(f.filename) && !f.patch));
}

/** Each open thread goes to the batch holding its file; a thread on no batch's file, to the first. */
export function assignThreads<T extends { path: string }>(threads: T[], batches: Batch[]): T[][] {
  const out: T[][] = batches.map(() => []);
  for (const t of threads) {
    const i = batches.findIndex((b) => b.files.some((f) => f.filename === t.path));
    out[Math.max(i, 0)]?.push(t);
  }
  return out;
}

/**
 * One finding per path, line and topic: two reports of the same defect (from two batches, or the
 * model and the engine's ADR notice) are kept once, at the higher severity; on a tie, the first
 * wins. Two findings on one line with different topics (a bug and a rule violation on one
 * statement) are two defects and both stay.
 */
export function dedupeFindings(findings: Finding[]): Finding[] {
  const rank = (f: Finding) => SEVERITIES.indexOf(f.severity);
  const kept = new Map<string, Finding>();
  for (const f of findings) {
    const key = `${f.path}:${f.line}:${f.topic}`;
    const old = kept.get(key);
    if (!old || rank(f) < rank(old)) kept.set(key, f);
  }
  return [...kept.values()];
}

/**
 * The notice that a pull request edits a decision record, one per changed file under a
 * `docs/adr/` directory at any depth. It comes from the paths, not from the model: it is free,
 * worded the same every time, and as "info" it never opens a thread the author must answer.
 */
export function adrNotices(filenames: string[]): Finding[] {
  return filenames
    .filter((name) => /(^|\/)docs\/adr\//.test(name))
    .map((path) => ({
      path,
      line: 0,
      severity: "info",
      topic: "adr",
      title: "Edits an accepted decision record",
      body: "This pull request edits an accepted decision record. If the change supersedes a decision, say so in the record.",
    }));
}

/**
 * One review from the batches' outputs. Findings are deduplicated by `dedupeFindings`. A file
 * reviewed in a retry counts as reviewed.
 */
export function mergeOutputs(parts: { label: string; output: ReviewOutput }[]): ReviewOutput {
  const reviewed = new Set(parts.flatMap((p) => p.output.files_reviewed));
  const skipped = new Map<string, string>();
  for (const p of parts)
    for (const s of p.output.files_skipped)
      if (!reviewed.has(s.path)) skipped.set(s.path, s.reason);
  const replies = new Map<number, ReviewOutput["thread_replies"][number]>();
  for (const p of parts) for (const r of p.output.thread_replies) replies.set(r.comment_id, r);
  const summaries = parts.filter((p) => p.output.summary.trim() !== "");
  return {
    files_reviewed: [...reviewed],
    files_skipped: [...skipped].map(([path, reason]) => ({ path, reason })),
    findings: dedupeFindings(parts.flatMap((p) => p.output.findings)),
    thread_replies: [...replies.values()],
    summary:
      summaries.length === 1
        ? summaries[0].output.summary
        : summaries.map((p) => `**${p.label}.** ${p.output.summary}`).join("\n\n"),
  };
}

export interface BatchReport {
  label: string;
  files: number;
  lines: number;
  maxRisk: number;
  /** "reviewed", "reviewed after a retry", or why it did not run or finish. */
  status: string;
  turns: number;
  costUsd: number;
}

/** The new-side line numbers a review comment can target: added and context lines. */
export function commentableLines(patch: string): Set<number> {
  const lines = new Set<number>();
  let next = 0;
  for (const row of patch.split("\n")) {
    const hunk = row.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
    if (hunk) {
      next = Number(hunk[1]);
    } else if (row.startsWith("+") || row.startsWith(" ")) {
      lines.add(next++);
    }
  }
  return lines;
}

/**
 * The diff the agent reads, with each line's number in the file at the head commit on the left
 * (blank for removed lines), so the `line` it reports is one GitHub can anchor a thread to.
 */
export function annotateDiff(files: PrFile[]) {
  const out: string[] = [];
  for (const f of files) {
    out.push(`### ${f.filename}`);
    if (!f.patch) {
      out.push("(no diff from GitHub: binary or too large; read the file itself)");
      continue;
    }
    let next = 0;
    for (const row of f.patch.split("\n")) {
      const hunk = row.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
      if (hunk) {
        next = Number(hunk[1]);
        out.push(row);
      } else if (row.startsWith("+") || row.startsWith(" ")) {
        out.push(`${String(next++).padStart(5)} ${row}`);
      } else {
        out.push(`      ${row}`);
      }
    }
  }
  return out.join("\n");
}

export const marker = (sha: string) => `<!-- agent-review sha=${sha} -->`;

export const readMarker = (body: string) => body.match(MARKER)?.[1] ?? null;

export function coverageGaps(expected: string[], reviewed: string[], skipped: string[]) {
  const accounted = new Set([...reviewed, ...skipped]);
  return expected.filter((f) => !accounted.has(f));
}

/** GitHub refuses a review body above 65,536 characters; stay well under it. */
export const MAX_BODY_CHARS = 60_000;

/**
 * Joins `items` with ", " in at most `room` characters. When they do not all fit, the list is cut
 * to what fits and ends with "… and N more (see the Coverage by batch table)".
 */
export function fitList(items: string[], room: number): string {
  const all = items.join(", ");
  if (all.length <= room) return all;
  const tail = (left: number) => `… and ${left} more (see the Coverage by batch table)`;
  const kept: string[] = [];
  let length = 0;
  for (const [i, item] of items.entries()) {
    const next = length + (kept.length > 0 ? 2 : 0) + item.length;
    // What the list would be if it stopped after this item.
    const left = items.length - (i + 1);
    const total = next + (left > 0 ? 2 + tail(left).length : 0);
    if (total > room) break;
    kept.push(item);
    length = next;
  }
  const more = tail(items.length - kept.length);
  return kept.length > 0 ? `${kept.join(", ")}, ${more}` : more;
}

/**
 * "3 finding(s): 1 blocker(s), 2 to fix", with only the groups that have findings: a reader
 * scanning the body sees at once whether anything blocks. "info" is in the total, not a group.
 */
export function countLine(findings: Finding[]): string {
  if (findings.length === 0) return "0 findings";
  const count = (s: Severity) => findings.filter((f) => f.severity === s).length;
  const groups = [
    [count("blocker"), "blocker(s)"],
    [count("fix"), "to fix"],
    [count("consider"), "to consider"],
  ] as const;
  const shown = groups.filter(([n]) => n > 0).map(([n, what]) => `${n} ${what}`);
  return `${findings.length} finding(s)${shown.length > 0 ? `: ${shown.join(", ")}` : ""}`;
}

export function buildReview(input: {
  output: ReviewOutput;
  files: PrFile[];
  headSha: string;
  since: string | null;
  /** Limited to `<mention> review <paths>`. */
  scoped: boolean;
  costUsd: number;
  batches?: BatchReport[];
  /** From `ProviderAdapter.modelLabel()`, for the footer. */
  modelLabel: string;
  /** The configured mention keyword, for the hint on how to ask for the rest. */
  mention?: string;
}): Review {
  const { output, files, headSha, since, scoped, costUsd, batches = [], modelLabel } = input;
  const mention = input.mention ?? "@agent-review";
  const commentable = new Map(files.map((f) => [f.filename, commentableLines(f.patch ?? "")]));
  const comments: InlineComment[] = [];
  const outsideDiff: Finding[] = [];
  // Information asks for no reply, so it never opens a thread, even on a diff line.
  const forInfo = output.findings.filter((f) => f.severity === "info");
  for (const f of output.findings) {
    if (f.severity === "info") continue;
    if (commentable.get(f.path)?.has(f.line)) {
      comments.push({
        path: f.path,
        line: f.line,
        side: "RIGHT",
        body: `${label(f)}\n\n${f.body}`,
      });
    } else outsideDiff.push(f);
  }

  const expected = files.map((f) => f.filename);
  const reviewed = new Set(output.files_reviewed);
  const notReviewed = expected.filter((f) => !reviewed.has(f));
  const reasons = new Map(output.files_skipped.map((s) => [s.path, s.reason]));
  const scope = since ? `changes since \`${short(since)}\`` : "the whole pull request";
  const parts: string[] = [];
  const list = notReviewed.map((f) => `\`${f}\`${reasons.has(f) ? ` (${reasons.get(f)})` : ""}`);
  const fullList = list.join(", ");
  if (notReviewed.length > 0) {
    parts.push(
      `⚠️ **Partial review**: the agent reviewed ${expected.length - notReviewed.length} of ${expected.length} files of ${scope}, at \`${short(headSha)}\`. Not reviewed: ${fullList}. Ask \`${mention} review <paths>\` for the rest.`,
    );
  } else {
    parts.push(
      `**Agent review** of ${scope}, at \`${short(headSha)}\`: all ${expected.length} files reviewed.`,
    );
  }
  parts.push(
    `${countLine(output.findings)}; ${comments.length} on their lines. Reply in a comment's thread to answer it.`,
  );
  const listed = (f: Finding) => `- ${label(f)} (\`${at(f)}\`): ${f.body}`;
  if (outsideDiff.length > 0) parts.push("### Outside the diff", ...outsideDiff.map(listed));
  if (forInfo.length > 0) parts.push("### For your information", ...forInfo.map(listed));
  parts.push("### Summary", output.summary);
  if (batches.length > 0) {
    const rows = batches.map(
      (b) =>
        `| ${b.label} | ${b.files} | ${b.lines} | ${b.maxRisk} | ${b.status} | ${b.turns} | $${b.costUsd.toFixed(2)} |`,
    );
    parts.push(
      `<details><summary>Coverage by batch</summary>\n\n| Batch | Files | Lines | Highest risk | Status | Turns | Cost |\n| --- | --- | --- | --- | --- | --- | --- |\n${rows.join("\n")}\n\n</details>`,
    );
  }
  const batchCount = batches.length > 1 ? ` · ${batches.length} batches` : "";
  parts.push(`<sub>${modelLabel}${batchCount} · $${costUsd.toFixed(2)}</sub>`);
  // The next `review` request starts from this commit, so only a review that covered everything
  // may move it; a scoped or partial one would leave the rest never reviewed.
  if (!scoped && notReviewed.length === 0) parts.push(marker(headSha));
  const body = parts.join("\n\n");
  if (body.length <= MAX_BODY_CHARS || notReviewed.length === 0) return { body, comments };
  // Only the list of unreviewed files can be long enough to matter: cut it to what fits.
  const room = MAX_BODY_CHARS - (body.length - fullList.length);
  return { body: body.replace(fullList, () => fitList(list, Math.max(room, 0))), comments };
}

/** For a review GitHub refused (422): every inline finding moves to the body. */
export function moveCommentsToBody(review: Review): Review {
  if (review.comments.length === 0) return review;
  const moved = review.comments.map(
    (c) => `- \`${c.path}:${c.line}\`: ${c.body.replace(/\n\n/, " ")}`,
  );
  const section = `### On their lines (GitHub refused them inline)\n\n${moved.join("\n")}`;
  const summary = review.body.indexOf("\n\n### Summary");
  const body =
    summary === -1
      ? `${review.body}\n\n${section}`
      : `${review.body.slice(0, summary)}\n\n${section}${review.body.slice(summary)}`;
  return { body, comments: [] };
}

// ---------------------------------------------------------------------------------------------
// GitHub and the provider: everything below talks to the network and is exercised by the workflow.

/** The structured output the provider must return; the finding enums come from `SEVERITY` and `TOPIC`. */
export const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["files_reviewed", "files_skipped", "findings", "thread_replies", "summary"],
  properties: {
    files_reviewed: { type: "array", items: { type: "string" } },
    files_skipped: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["path", "reason"],
        properties: { path: { type: "string" }, reason: { enum: [...SKIP_REASONS] } },
      },
    },
    findings: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["path", "line", "severity", "topic", "title", "body"],
        properties: {
          path: { type: "string" },
          line: { type: "integer", minimum: 0 },
          severity: { enum: SEVERITIES },
          topic: { enum: TOPICS },
          title: { type: "string" },
          body: { type: "string" },
        },
      },
    },
    thread_replies: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["comment_id", "status", "reply"],
        properties: {
          comment_id: { type: "integer" },
          status: { enum: ["addressed", "still_open"] },
          reply: { type: "string" },
        },
      },
    },
    summary: { type: "string" },
  },
};

/** The two label axes in prose for the model; the words match `SEVERITY` and `TOPIC`. */
export const RULES = `Every finding has a severity, which tells the author when to act, and a topic, which says
what it is about. Pick the severity by its test, not by how serious the finding feels:
- "blocker": fix before merging. Only when you can name the input, state or trust boundary that
  fails if the change merges as is.
- "fix": wrong today; fix it in this pull request, but it does not block the merge. The fix is
  specific and the author would not argue with it.
- "consider": would be better, and the author may decline. A matter of judgement, not a defect.
- "info": nothing to change, awareness only. It asks for no reply and is never posted on a line.
Topics:
- "bug": the code does the wrong thing for some input or state.
- "security": credentials, user data, or a trust boundary the change weakens.
- "rules": a violation of CLAUDE.md, AGENTS.md or a repository convention.
- "adr": the change contradicts an accepted decision record in docs/adr/ without superseding it.
- "docs": documentation or comments that are stale or contradict the code.
- "tests": missing coverage, or a test that does not test what its name says.
- "perf": cost, latency, repeated work, N+1 queries.
- "cleanup": duplication, dead code, a misleading name.
- "question": you could not determine something and ask the author.
Any severity combines with any topic: a README that tells users to run a destructive command is a
"blocker" with topic "docs". "info" is normally the engine's own notice; if you return one, it goes
in the review body. A "question" takes the severity of its worst plausible answer: if the answer
could make it a blocker, the question is a "blocker".
Never report that the pull request edits a file in docs/adr/: the engine posts that notice itself.
Report only code that contradicts an accepted decision record.
Skip praise, style a formatter would catch, and speculation you cannot tie to the diff. Write in English.`;

export const FOCUS_PATH = ".github/agent-review.md";
/** The path used before the rename; still read, with a notice. */
export const OLD_FOCUS_PATH = ".github/claude-review.md";

/** The repository's own review focus, appended to the rules when it exists. */
function repoFocus(warn: (line: string) => void, repoDir: string) {
  let path = FOCUS_PATH;
  if (!existsSync(join(repoDir, path)) && existsSync(join(repoDir, OLD_FOCUS_PATH))) {
    warn(`${OLD_FOCUS_PATH} is deprecated; rename it to ${FOCUS_PATH}.`);
    path = OLD_FOCUS_PATH;
  }
  return existsSync(join(repoDir, path))
    ? `\n\nThis repository's review focus (${path}):\n\n${readFileSync(join(repoDir, path), "utf8")}`
    : "";
}

/** Runs `gh` and returns stdout; swapped for a stub in tests. */
export type GhFn = (args: string[], input?: string) => string;

export const defaultGh: GhFn = (args, input) => {
  const run = spawnSync("gh", args, { input, encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });
  if (run.status !== 0) throw new Error(`gh ${args.slice(0, 3).join(" ")} failed: ${run.stderr}`);
  return run.stdout;
};

/** Everything the engine needs from outside: GitHub, the agent, settings and output. */
export interface Deps {
  gh: GhFn;
  provider: ProviderAdapter;
  config: EngineConfig;
  /**
   * The checked-out head of the pull request: data the engine reads (the focus file) and the
   * agent's working directory. It is never the engine's own working directory. Default: the
   * current directory.
   */
  repoDir?: string;
  log: (line: string) => void;
  warn: (line: string) => void;
}

const jsonLines = <T>(text: string) =>
  text
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l) as T);

// `gh --jq` prints string results raw, like `jq -r`: `@json` of an object prints the object's
// JSON, and `@json` of a string prints the quoted string. One JSON value per line either way.
export function listFiles(gh: GhFn, repo: string, pr: number): PrFile[] {
  const jq = ".[] | {filename, additions, deletions, patch} | @json";
  return jsonLines<PrFile>(
    gh(["api", "--paginate", `repos/${repo}/pulls/${pr}/files`, "--jq", jq]),
  );
}

export function lastReviewedSha(gh: GhFn, repo: string, pr: number) {
  const jq = '.[] | select(.user.login == "github-actions[bot]") | .body | @json';
  const bodies = jsonLines<string>(
    gh(["api", "--paginate", `repos/${repo}/pulls/${pr}/reviews`, "--jq", jq]),
  );
  return (
    bodies
      .map(readMarker)
      .filter((s): s is string => s !== null)
      .at(-1) ?? null
  );
}

export function compareFiles(gh: GhFn, repo: string, base: string, head: string) {
  const jq = "{status, files: [.files[] | {filename, additions, deletions, patch}]}";
  return JSON.parse(gh(["api", `repos/${repo}/compare/${base}...${head}`, "--jq", jq])) as {
    status: string;
    files: PrFile[];
  };
}

export interface RawThread {
  isResolved: boolean;
  path: string;
  line: number | null;
  comments: {
    nodes: {
      databaseId: number;
      author: { login: string } | null;
      authorAssociation: string;
      body: string;
    }[];
  };
}

const TRUSTED = new Set(["OWNER", "MEMBER", "COLLABORATOR"]);

/**
 * The tool's own unresolved threads, with the replies the agent may read. On a public repository
 * anyone can reply in a thread, so only replies by people with access reach the model: anything
 * else is untrusted text in the agent's context.
 */
export function openBotThreads(threads: RawThread[]) {
  return threads
    .filter((t) => !t.isResolved && t.comments.nodes[0]?.author?.login === "github-actions")
    .map((t) => ({
      comment_id: t.comments.nodes[0].databaseId,
      path: t.path,
      line: t.line,
      finding: t.comments.nodes[0].body,
      replies: t.comments.nodes
        .slice(1)
        .filter((c) => TRUSTED.has(c.authorAssociation))
        .map((c) => ({ author: c.author?.login ?? "ghost", body: c.body })),
    }));
}

export function openThreads(gh: GhFn, repo: string, pr: number) {
  const [owner, name] = repo.split("/");
  const query = `query($owner: String!, $name: String!, $pr: Int!) {
    repository(owner: $owner, name: $name) { pullRequest(number: $pr) {
      reviewThreads(first: 100) { nodes { isResolved path line
        comments(first: 30) { nodes { databaseId author { login } authorAssociation body } } } } } } }`;
  const raw = gh([
    "api",
    "graphql",
    "-f",
    `query=${query}`,
    "-F",
    `owner=${owner}`,
    "-F",
    `name=${name}`,
    "-F",
    `pr=${pr}`,
  ]);
  return openBotThreads(JSON.parse(raw).data.repository.pullRequest.reviewThreads.nodes);
}

function postReview(deps: Deps, repo: string, pr: number, headSha: string, review: Review) {
  if (deps.config.dryRun) {
    deps.log(`--- review at ${short(headSha)} ---\n${review.body}`);
    for (const c of review.comments) deps.log(`--- ${c.path}:${c.line} ---\n${c.body}`);
    return;
  }
  const send = (r: Review) =>
    deps.gh(
      ["api", "-X", "POST", `repos/${repo}/pulls/${pr}/reviews`, "--input", "-"],
      JSON.stringify({ commit_id: headSha, event: "COMMENT", body: r.body, comments: r.comments }),
    );
  try {
    send(review);
  } catch (error) {
    if (review.comments.length === 0) throw error;
    deps.warn(`GitHub refused the inline comments; posting them in the body. ${error}`);
    send(moveCommentsToBody(review));
  }
}

/**
 * Runs one call so that its failure does not end the review: the batches that did run still
 * post. A call that died without a result is counted at its cap, since what it spent is unknown.
 */
export function attempt<T>(
  run: () => T,
  capUsd: number,
): { ok: true; value: T } | { ok: false; error: string; costUsd: number } {
  try {
    return { ok: true, value: run() };
  } catch (error) {
    return { ok: false, error: String(error).slice(0, 300), costUsd: capUsd };
  }
}

function refuseLeak(deps: Deps, texts: string[]) {
  if (deps.provider.leaksSecret(texts)) {
    throw new Error("The output contains something shaped like a provider credential; not posting it.");
  }
}

export function review(deps: Deps, repo: string, pr: number, words: string[]) {
  const { gh, config } = deps;
  const meta = JSON.parse(
    gh(["pr", "view", String(pr), "-R", repo, "--json", "headRefOid,title,body,author"]),
  );
  const headSha: string = meta.headRefOid;
  const bodyOnly = (body: string) => postReview(deps, repo, pr, headSha, { body, comments: [] });

  const prFiles = listFiles(gh, repo, pr);
  const { paths, ignored } = resolveScope(
    words,
    prFiles.map((f) => f.filename),
  );
  if (ignored.length > 0)
    deps.log(`Not paths in this pull request, ignored: ${ignored.join(" ")}`);
  const last = lastReviewedSha(gh, repo, pr);
  if (last === headSha && paths.length === 0) {
    bodyOnly(
      `Already reviewed at \`${short(headSha)}\`. Push changes, or ask \`${config.mention} review <paths>\`.`,
    );
    return;
  }
  let since: string | null = null;
  let files = prFiles;
  if (last && paths.length === 0) {
    const cmp = compareFiles(gh, repo, last, headSha);
    if (cmp.status === "ahead") {
      since = last;
      files = cmp.files;
    } else {
      deps.log(
        `The last reviewed commit ${short(last)} is not behind the head (${cmp.status}); full review.`,
      );
    }
  }

  const { kept, dropped } = filterFiles(files, [...DEFAULT_EXCLUDE, ...config.exclude], paths);
  if (kept.length === 0) {
    bodyOnly(
      `Nothing to review at \`${short(headSha)}\`: the ${dropped.length} changed file(s) are all lockfiles, build output or generated, or outside the requested paths.`,
    );
    return;
  }
  const totalBudget = config.budgetUsd;
  const batchBudget = config.batchBudgetUsd;
  const batches = planBatches(kept, {
    maxLines: config.batchLines,
    // About 40k tokens at 3.5 characters a token.
    maxChars: config.batchChars,
  });
  const threads = last ? openThreads(gh, repo, pr) : [];
  const threadsByBatch = assignThreads(threads, batches);
  const everyFile = kept.map((f) => `- ${f.filename} +${f.additions} −${f.deletions}`).join("\n");
  const context = { pr, repo, headSha, since, paths, dropped: dropped.length, everyFile, meta };

  const parts: { label: string; output: ReviewOutput }[] = [];
  const reports: BatchReport[] = [];
  const notRun: string[] = [];
  let spent = 0;
  // Below this a batch cannot read its prompt, so it is not started.
  const MIN_BATCH_USD = 0.05;
  let budgetError = false;

  batches.forEach((batch, i) => {
    const label = `Batch ${i + 1} of ${batches.length}`;
    const remaining = () => totalBudget - spent;
    if (remaining() < MIN_BATCH_USD) {
      notRun.push(...batch.files.map((f) => f.filename));
      reports.push({
        label,
        files: batch.files.length,
        lines: batch.lines,
        maxRisk: batch.maxRisk,
        status: "not run: budget spent",
        turns: 0,
        costUsd: 0,
      });
      return;
    }
    const first = reviewBatch(
      deps,
      context,
      batch.files,
      threadsByBatch[i],
      { index: i + 1, total: batches.length },
      Math.min(batchBudget, remaining()),
    );
    spent += first.costUsd;
    if (first.output) parts.push({ label, output: first.output });
    if (first.budget) budgetError = true;
    let status = first.output
      ? "reviewed"
      : first.budget
        ? "ran out of its budget"
        : first.failed
          ? "the call failed"
          : "returned no review";
    let turns = first.turns;
    let cost = first.costUsd;

    // One retry with only the files the first pass left unaccounted for.
    const gaps = batchGaps(batch.files, first.output);
    if (gaps.length > 0 && remaining() >= MIN_BATCH_USD) {
      const retry = reviewBatch(
        deps,
        context,
        gaps,
        [],
        { index: i + 1, total: batches.length, retry: true },
        Math.min(batchBudget, remaining()),
      );
      spent += retry.costUsd;
      turns += retry.turns;
      cost += retry.costUsd;
      if (retry.output) parts.push({ label: `${label}, retry`, output: retry.output });
      const left = batchGaps(gaps, retry.output);
      status =
        left.length === 0 ? "reviewed after a retry" : `${left.length} file(s) left after a retry`;
    } else if (gaps.length > 0) {
      status = `${gaps.length} file(s) left: budget spent`;
    }
    reports.push({
      label,
      files: batch.files.length,
      lines: batch.lines,
      maxRisk: batch.maxRisk,
      status,
      turns,
      costUsd: cost,
    });
  });

  if (parts.length === 0) {
    if (budgetError) {
      bodyOnly(
        `**The agent ran out of its budget** ($${batchBudget} a batch, $${totalBudget} the pull request) before finishing any batch: nothing here was reviewed reliably. Review part of it: \`${config.mention} review <path> [path…]\`.`,
      );
      return;
    }
    throw new Error("The agent did not return a review for any batch.");
  }
  const merged = mergeOutputs(parts);
  // The engine's notices come first so that, on a tie with the model's own, its wording is kept.
  merged.findings = dedupeFindings([
    ...adrNotices(kept.map((f) => f.filename)),
    ...merged.findings,
  ]);
  for (const path of notRun)
    merged.files_skipped.push({ path, reason: "not reached: the pull request's budget was spent" });

  const built = buildReview({
    output: merged,
    files: kept,
    headSha,
    since,
    scoped: paths.length > 0,
    costUsd: spent,
    batches: reports,
    modelLabel: deps.provider.modelLabel(),
    mention: config.mention,
  });
  // Only threads the script handed over: an id the model made up would reply elsewhere.
  const known = new Set(threads.map((t) => t.comment_id));
  const replies = merged.thread_replies.filter((r) => known.has(r.comment_id));
  refuseLeak(deps, [
    built.body,
    ...built.comments.map((c) => c.body),
    ...replies.map((r) => r.reply),
  ]);
  postReview(deps, repo, pr, headSha, built);
  for (const r of replies) {
    const label = r.status === "addressed" ? "Looks addressed" : "Still open";
    if (config.dryRun) {
      deps.log(`--- reply to ${r.comment_id}: ${label} ---\n${r.reply}`);
      continue;
    }
    gh([
      "api",
      "-X",
      "POST",
      `repos/${repo}/pulls/${pr}/comments/${r.comment_id}/replies`,
      "-f",
      `body=**${label}** at \`${short(headSha)}\`: ${r.reply}`,
    ]);
  }
}

export interface ReviewContext {
  pr: number;
  repo: string;
  headSha: string;
  since: string | null;
  paths: string[];
  dropped: number;
  everyFile: string;
  meta: { title: string; body: string; author?: { login: string } };
}

/** The prompt for one batch: its framing, the rules, the repository's focus and its diff last. */
export function buildBatchPrompt(
  ctx: ReviewContext,
  files: PrFile[],
  hasThreads: boolean,
  part: { index: number; total: number; retry?: boolean },
  dir: string,
  focus: string,
) {
  const list = files.map((f) => `- ${f.filename} +${f.additions} −${f.deletions}`).join("\n");
  const scope = ctx.since
    ? `only the changes since commit ${ctx.since}, the last reviewed one`
    : "the whole pull request";
  return `You are reviewing pull request #${ctx.pr} in ${ctx.repo}, checked out at its head commit ${ctx.headSha}.
Read CLAUDE.md first: it holds this repository's rules, and the ADRs in docs/adr/ hold its decisions.

The pull request's title, body and author are in ${dir}/pr.json. The review covers ${scope}${ctx.paths.length ? `, limited to ${ctx.paths.join(", ")}` : ""}.
It is split into parts that are reviewed separately; this is part ${part.index} of ${part.total}${part.retry ? ", a second pass over files the first pass did not account for" : ""}.
Every file the review covers, for orientation (${ctx.dropped} more, lockfiles, build output and generated, were left out on purpose):
${ctx.everyFile}

This part holds exactly these files, and their diff is at the end of this prompt:
${list}

Each diff line starts with its line number in the file at the head commit (blank for removed
lines). Use that number as a finding's \`line\`, never a position in the diff.

Review every file of this part, including tests, stylesheets, documentation and messages: a
test that asserts the wrong thing or a doc that says something false is a finding. Read a
changed file in full when a finding needs its surroundings, and read files of other parts or
callers in the repository to confirm a finding that crosses them. Report findings only on this
part's files. You do not manage a budget: the harness that runs you enforces its own limits, so
never shorten your reading to save effort. A file you read and found nothing worth flagging in
goes in files_reviewed.
files_skipped is only for a file whose diff below says GitHub sent none: reason "binary" for a
binary file, "no_diff_and_unreadable" when you could not read it in the repository either.
${
  hasThreads
    ? `
Open review threads from earlier rounds on this part's files, with the owner's replies, are in
${dir}/threads.json. For each one, decide whether the current code addresses it and add a
thread_replies entry with a short reply to the owner. Do not repeat a finding that already has an
open thread.
`
    : ""
}
${RULES}${focus}

<diff>
${annotateDiff(files)}
</diff>`;
}

/** One provider call over one batch, with the batch's diff inside the prompt. */
function reviewBatch(
  deps: Deps,
  ctx: ReviewContext,
  files: PrFile[],
  threads: ReturnType<typeof openBotThreads>,
  part: { index: number; total: number; retry?: boolean },
  budgetUsd: number,
) {
  const dir = mkdtempSync(join(tmpdir(), "agent-review-"));
  writeFileSync(
    join(dir, "pr.json"),
    JSON.stringify(
      { title: ctx.meta.title, body: ctx.meta.body, author: ctx.meta.author?.login },
      null,
      2,
    ),
  );
  writeFileSync(join(dir, "threads.json"), JSON.stringify(threads, null, 2));
  const prompt = buildBatchPrompt(
    ctx,
    files,
    threads.length > 0,
    part,
    dir,
    repoFocus(deps.warn, deps.repoDir ?? process.cwd()),
  );

  const call = attempt(() => runProvider(deps, prompt, dir, budgetUsd, SCHEMA), budgetUsd);
  if (!call.ok) {
    deps.warn(`A batch call failed: ${call.error}`);
    return { output: undefined, budget: false, turns: 0, costUsd: call.costUsd, failed: true };
  }
  const result = call.value;
  const output = !result.isError ? (result.structuredOutput as ReviewOutput | undefined) : undefined;
  return {
    output,
    budget: result.terminalReason === "budget",
    turns: result.turns,
    costUsd: result.costUsd,
    failed: false,
  };
}

/** The prompt goes through stdin: a batch's diff in an argument would hit Linux's 128 KB limit. */
function runProvider(deps: Deps, prompt: string, dir: string, budgetUsd: number, schema?: object) {
  const result = deps.provider.run({
    prompt,
    cwd: deps.repoDir ?? process.cwd(),
    addDirs: [dir],
    allowedTools: ["read", "glob", "grep"],
    maxBudgetUsd: budgetUsd,
    outputSchema: schema,
    promptViaStdin: true,
  });
  deps.log(
    JSON.stringify({
      is_error: result.isError,
      terminal_reason: result.terminalReason,
      turns: result.turns,
      cost_usd: result.costUsd,
      duration_ms: result.durationMs,
    }),
  );
  return result;
}

export function answer(deps: Deps, repo: string, pr: number, question: string) {
  const dir = mkdtempSync(join(tmpdir(), "agent-answer-"));
  writeFileSync(
    join(dir, "pr.json"),
    deps.gh(["pr", "view", String(pr), "-R", repo, "--json", "title,body,files"]),
  );
  writeFileSync(join(dir, "pr.diff"), deps.gh(["pr", "diff", String(pr), "-R", repo]));
  const prompt = `This is pull request #${pr} in ${repo}, checked out at its head. Its title, body and file
list are in ${dir}/pr.json and its diff in ${dir}/pr.diff. Read CLAUDE.md first.

The repository operator asked on the pull request:

<request>
${question}
</request>

Answer it. Your final message is posted verbatim as the comment, so it holds the answer and
nothing else. Write in English.`;
  // One question is one call, with the budget a whole review had before batches: $1.
  const result = runProvider(deps, prompt, dir, deps.config.answerBudgetUsd);
  if (result.isError || !result.text)
    throw new Error(`The agent did not answer (${result.terminalReason}).`);
  const body = `${result.text}\n\n<sub>${deps.provider.modelLabel()} · $${result.costUsd.toFixed(2)}</sub>`;
  refuseLeak(deps, [body]);
  if (deps.config.dryRun) {
    deps.log(body);
    return;
  }
  deps.gh(["pr", "comment", String(pr), "-R", repo, "--body-file", "-"], body);
}

/**
 * The `comment` command: routes the operator's comment to a review, an answer or nothing.
 * `author` is the comment's author when the caller knows it; anyone else is ignored (the workflow
 * checks this too). An empty or placeholder operator is an error.
 */
export function comment(deps: Deps, repo: string, pr: number, request: string, author?: string) {
  const { operator } = deps.config;
  // Before anything else: an unset or placeholder operator would let a stranger who registered
  // that login command the tool.
  const problem = operatorProblem(operator);
  if (problem) throw new Error(problem);
  if (author && author.toLowerCase() !== operator.toLowerCase()) {
    deps.warn(`Comment by ${author}, not the operator ${operator}; nothing to do.`);
    return;
  }
  const command = parseCommand(request, deps.config.mention);
  if (command?.kind === "review") review(deps, repo, pr, command.paths);
  else if (command) answer(deps, repo, pr, request);
}
