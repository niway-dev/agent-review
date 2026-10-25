/**
 * Reviews a pull request with Claude Code (`claude -p`) and posts the result as a GitHub review.
 *
 *   bun scripts/claude-review.ts review <pr> [paths…]   review it; after the first review, only
 *                                                       what changed since the last reviewed commit
 *   bun scripts/claude-review.ts comment <pr>           route the owner's @claude comment, read
 *                                                       from $REQUEST, to a review or an answer
 *
 * Every changed line is read. Files nobody reviews (lockfiles, build output, generated code) are
 * dropped first. The rest are scored by risk (`riskScore`) and packed into batches of about 1,000
 * changed lines (`planBatches`), riskiest first; each batch is one `claude -p` call with its diff
 * inside the prompt, read from stdin. A batch that leaves files unaccounted for is re-run once
 * with only those files. Money bounds the run, not size: each batch has its own budget, and once
 * the pull request's budget is spent the remaining batches are listed as not reviewed. A file
 * that is still not accounted for makes the review "partial", on its first line.
 *
 * Findings become inline review comments on their lines, so the owner can answer each one in its
 * thread; a finding outside the diff goes in the review body. The review is advisory: it never
 * approves, requests changes or blocks a merge. On a re-review, Claude reads its open threads and
 * the owner's replies and answers in each thread. It never resolves one.
 *
 * What to look for beyond the defaults (correctness, security, the repository's CLAUDE.md or
 * AGENTS.md) comes from `.github/claude-review.md` when the repository has one.
 *
 * Claude only reads: no shell, no GitHub token, `--restricted` (the head's `.claude/` settings and
 * hooks are ignored), no MCP servers, `/proc` denied. This script holds the tokens and
 * refuses to post text containing the API key. That is best-effort, not a sandbox: it relies on
 * the consumer repository's trust assumption (only the owner pushes), stated in its workflow.
 *
 * Needs GH_TOKEN, ANTHROPIC_API_KEY, GITHUB_REPOSITORY and `claude` on the PATH. With
 * CLAUDE_REVIEW_DRY_RUN=1 it reads GitHub but prints the review instead of posting it, and runs
 * `claude` with whatever login the machine has, so a change to the kit can be tried locally.
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export interface PrFile {
  filename: string;
  additions: number;
  deletions: number;
  /** GitHub omits it for binary files and very large diffs. */
  patch?: string;
}

export interface Finding {
  path: string;
  /** A new-side line, or 0 for a finding about the whole file. */
  line: number;
  /** "should_fix": a correctness or security defect. "note": anything else worth reading. */
  severity: "should_fix" | "note";
  category: "correctness" | "security" | "rules" | "adr" | "other";
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

const MARKER = /<!-- claude-review sha=([A-Za-z0-9]+) -->/;
const KEY_SHAPE = /sk-ant-[a-z0-9]+-[A-Za-z0-9_-]{20,}/;
const short = (sha: string) => sha.slice(0, 7);
const label = (f: Finding) =>
  `**${f.severity === "should_fix" ? "Should fix" : "Note"} (${f.category}): ${f.title}**`;
const at = (f: { path: string; line: number }) => (f.line > 0 ? `${f.path}:${f.line}` : f.path);

export function parseCommand(body: string): Command | null {
  // Only the rest of the first line: "@claude review\n\nthanks" asks for a review, not a path.
  const match = body.match(/@claude\b(.*)/);
  if (!match) return null;
  const words = match[1].trim().split(/\s+/).filter(Boolean);
  if (words[0]?.toLowerCase() === "review") return { kind: "review", paths: words.slice(1) };
  return { kind: "answer" };
}

const underPath = (name: string, path: string) =>
  name === path || name.startsWith(path.endsWith("/") ? path : `${path}/`);

/** Words after `@claude review` that name no changed file ("again", "please") are not paths. */
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
 * Path rules for `riskScore`, product-agnostic: where a defect costs most in most repositories.
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
 * One review from the batches' outputs. A finding two batches report on the same line in the
 * same category is one defect, kept once, as "should fix" if either said so; two findings on one
 * line in different categories (a correctness bug and a rule violation on one statement) are
 * two defects and both stay. A file reviewed in a retry counts as reviewed.
 */
export function mergeOutputs(parts: { label: string; output: ReviewOutput }[]): ReviewOutput {
  const reviewed = new Set(parts.flatMap((p) => p.output.files_reviewed));
  const skipped = new Map<string, string>();
  for (const p of parts)
    for (const s of p.output.files_skipped)
      if (!reviewed.has(s.path)) skipped.set(s.path, s.reason);
  const findings = new Map<string, Finding>();
  for (const p of parts)
    for (const f of p.output.findings) {
      const key = `${f.path}:${f.line}:${f.category}`;
      const kept = findings.get(key);
      if (!kept || (kept.severity === "note" && f.severity === "should_fix")) findings.set(key, f);
    }
  const replies = new Map<number, ReviewOutput["thread_replies"][number]>();
  for (const p of parts) for (const r of p.output.thread_replies) replies.set(r.comment_id, r);
  const summaries = parts.filter((p) => p.output.summary.trim() !== "");
  return {
    files_reviewed: [...reviewed],
    files_skipped: [...skipped].map(([path, reason]) => ({ path, reason })),
    findings: [...findings.values()],
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
 * The diff Claude reads, with each line's number in the file at the head commit on the left
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

export const marker = (sha: string) => `<!-- claude-review sha=${sha} -->`;

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

export function buildReview(input: {
  output: ReviewOutput;
  files: PrFile[];
  headSha: string;
  since: string | null;
  /** Limited to `@claude review <paths>`. */
  scoped: boolean;
  costUsd: number;
  batches?: BatchReport[];
}): Review {
  const { output, files, headSha, since, scoped, costUsd, batches = [] } = input;
  const commentable = new Map(files.map((f) => [f.filename, commentableLines(f.patch ?? "")]));
  const comments: InlineComment[] = [];
  const outsideDiff: Finding[] = [];
  for (const f of output.findings) {
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
      `⚠️ **Partial review**: Claude reviewed ${expected.length - notReviewed.length} of ${expected.length} files of ${scope}, at \`${short(headSha)}\`. Not reviewed: ${fullList}. Ask \`@claude review <paths>\` for the rest.`,
    );
  } else {
    parts.push(
      `**Claude review** of ${scope}, at \`${short(headSha)}\`: all ${expected.length} files reviewed.`,
    );
  }
  const fixes = output.findings.filter((f) => f.severity === "should_fix").length;
  parts.push(
    `${output.findings.length} finding(s), ${fixes} to fix; ${comments.length} on their lines. Reply in a comment's thread to answer it.`,
  );
  if (outsideDiff.length > 0) {
    parts.push(
      "### Outside the diff",
      ...outsideDiff.map((f) => `- ${label(f)} (\`${at(f)}\`): ${f.body}`),
    );
  }
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
  parts.push(`<sub>Claude Sonnet 5.5${batchCount} · $${costUsd.toFixed(2)}</sub>`);
  // The next `@claude review` starts from this commit, so only a review that covered everything
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

export function leaksKey(texts: string[], key: string) {
  return texts.some((t) => (key !== "" && t.includes(key)) || KEY_SHAPE.test(t));
}

// ---------------------------------------------------------------------------------------------
// GitHub and Claude: everything below talks to the network and is exercised by the workflow.

const SCHEMA = {
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
        required: ["path", "line", "severity", "category", "title", "body"],
        properties: {
          path: { type: "string" },
          line: { type: "integer", minimum: 0 },
          severity: { enum: ["should_fix", "note"] },
          category: { enum: ["correctness", "security", "rules", "adr", "other"] },
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

const RULES = `Severity "should_fix" is only for:
1. A correctness bug: name the input or state that fails and what happens.
2. A security problem: credentials, user data, or a trust boundary the change weakens.
Everything else is a "note": a violation of the repository's CLAUDE.md or AGENTS.md rules, a
change that contradicts an accepted decision record without superseding it, and anything else
worth the author's time. Skip praise, style a formatter would catch, and speculation you cannot
tie to the diff. Write in English.`;

/** The repository's own review focus, appended to the rules when it exists. */
function repoFocus() {
  const path = ".github/claude-review.md";
  return existsSync(path)
    ? `\n\nThis repository's review focus (${path}):\n\n${readFileSync(path, "utf8")}`
    : "";
}

function env(name: string, fallback?: string) {
  const value = process.env[name] ?? fallback;
  if (value === undefined || value === "") throw new Error(`${name} is not set`);
  return value;
}

function gh(args: string[], input?: string) {
  const run = spawnSync("gh", args, { input, encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });
  if (run.status !== 0) throw new Error(`gh ${args.slice(0, 3).join(" ")} failed: ${run.stderr}`);
  return run.stdout;
}

const jsonLines = <T>(text: string) =>
  text
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l) as T);

// `gh --jq` prints string results raw, like `jq -r`: `@json` of an object prints the object's
// JSON, and `@json` of a string prints the quoted string. One JSON value per line either way.
export function listFiles(repo: string, pr: number): PrFile[] {
  const jq = ".[] | {filename, additions, deletions, patch} | @json";
  return jsonLines<PrFile>(
    gh(["api", "--paginate", `repos/${repo}/pulls/${pr}/files`, "--jq", jq]),
  );
}

export function lastReviewedSha(repo: string, pr: number) {
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

export function compareFiles(repo: string, base: string, head: string) {
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
 * The kit's own unresolved threads, with the replies Claude may read. On a public repository
 * anyone can reply in a thread, so only replies by people with access reach the model: anything
 * else is untrusted text in Claude's context.
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

export function openThreads(repo: string, pr: number) {
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

const DRY_RUN = process.env.CLAUDE_REVIEW_DRY_RUN === "1";

function postReview(repo: string, pr: number, headSha: string, review: Review) {
  if (DRY_RUN) {
    console.log(`--- review at ${short(headSha)} ---\n${review.body}`);
    for (const c of review.comments) console.log(`--- ${c.path}:${c.line} ---\n${c.body}`);
    return;
  }
  const send = (r: Review) =>
    gh(
      ["api", "-X", "POST", `repos/${repo}/pulls/${pr}/reviews`, "--input", "-"],
      JSON.stringify({ commit_id: headSha, event: "COMMENT", body: r.body, comments: r.comments }),
    );
  try {
    send(review);
  } catch (error) {
    if (review.comments.length === 0) throw error;
    console.error(`GitHub refused the inline comments; posting them in the body. ${error}`);
    send(moveCommentsToBody(review));
  }
}

/** The engine's own settings, next to the script (consumer layout) or one level up (this repo). */
export function findEngineSettings(scriptDir: string) {
  for (const path of [
    join(scriptDir, "engine-settings.json"),
    join(scriptDir, "..", "engine-settings.json"),
  ]) {
    if (existsSync(path)) return path;
  }
  // Never run without it: the deny rules and the hardening flags come together.
  throw new Error(`engine-settings.json not found next to ${scriptDir}`);
}

/**
 * The `claude` arguments; the prompt itself goes through stdin, never as an argument. `--restricted`
 * drops the code-running tools and ignores the head's user, project and local settings (so its
 * `.claude/` hooks do not load); `--strict-mcp-config` skips MCP servers; `--tools` names the only
 * tools that exist. `--allowedTools` and `--disallowedTools` stay as before. The `/proc` deny
 * rules are not verified under `--restricted`: it confines file tools to the working directories,
 * which may already exclude `/proc`, but nothing here proves it.
 */
export function buildClaudeArgs(opts: {
  dir: string;
  budgetUsd: number;
  model: string;
  settings: string;
  schema?: object;
}) {
  return [
    "-p",
    "--model",
    opts.model,
    "--max-budget-usd",
    String(opts.budgetUsd),
    "--restricted",
    "--strict-mcp-config",
    "--tools",
    "Read,Glob,Grep",
    "--settings",
    opts.settings,
    "--add-dir",
    opts.dir,
    "--allowedTools",
    "Read,Glob,Grep",
    "--disallowedTools",
    "Bash,Read(//proc/**),Grep(//proc/**),Glob(//proc/**)",
    "--output-format",
    "json",
    ...(opts.schema ? ["--json-schema", JSON.stringify(opts.schema)] : []),
  ];
}

/** The prompt goes through stdin: a batch's diff in an argument would hit Linux's 128 KB limit. */
function runClaude(prompt: string, dir: string, budgetUsd: number, schema?: object) {
  const childEnv = { ...process.env };
  delete childEnv.GH_TOKEN;
  delete childEnv.GITHUB_TOKEN;
  const args = buildClaudeArgs({
    dir,
    budgetUsd,
    schema,
    model: env("CLAUDE_REVIEW_MODEL", "claude-sonnet-5-5"),
    settings: findEngineSettings(import.meta.dir),
  });
  const run = spawnSync("claude", args, {
    input: prompt,
    env: childEnv,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  if (run.error || !run.stdout) {
    throw new Error(`claude did not run (status ${run.status}): ${run.error ?? run.stderr}`);
  }
  const result = JSON.parse(run.stdout) as {
    is_error: boolean;
    subtype: string;
    num_turns: number;
    total_cost_usd: number;
    duration_ms: number;
    result?: string;
    structured_output?: ReviewOutput;
  };
  const { is_error, subtype, num_turns, total_cost_usd, duration_ms } = result;
  console.log(JSON.stringify({ is_error, subtype, num_turns, total_cost_usd, duration_ms }));
  return result;
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

function refuseLeak(texts: string[]) {
  if (leaksKey(texts, process.env.ANTHROPIC_API_KEY ?? "")) {
    throw new Error("The output contains something shaped like an Anthropic key; not posting it.");
  }
}

function review(repo: string, pr: number, words: string[]) {
  const meta = JSON.parse(
    gh(["pr", "view", String(pr), "-R", repo, "--json", "headRefOid,title,body,author"]),
  );
  const headSha: string = meta.headRefOid;
  const bodyOnly = (body: string) => postReview(repo, pr, headSha, { body, comments: [] });

  const prFiles = listFiles(repo, pr);
  const { paths, ignored } = resolveScope(
    words,
    prFiles.map((f) => f.filename),
  );
  if (ignored.length > 0)
    console.log(`Not paths in this pull request, ignored: ${ignored.join(" ")}`);
  const last = lastReviewedSha(repo, pr);
  if (last === headSha && paths.length === 0) {
    bodyOnly(
      `Already reviewed at \`${short(headSha)}\`. Push changes, or ask \`@claude review <paths>\`.`,
    );
    return;
  }
  let since: string | null = null;
  let files = prFiles;
  if (last && paths.length === 0) {
    const cmp = compareFiles(repo, last, headSha);
    if (cmp.status === "ahead") {
      since = last;
      files = cmp.files;
    } else {
      console.log(
        `The last reviewed commit ${short(last)} is not behind the head (${cmp.status}); full review.`,
      );
    }
  }

  const extra = (process.env.CLAUDE_REVIEW_EXCLUDE ?? "").split(",").filter(Boolean);
  const { kept, dropped } = filterFiles(files, [...DEFAULT_EXCLUDE, ...extra], paths);
  if (kept.length === 0) {
    bodyOnly(
      `Nothing to review at \`${short(headSha)}\`: the ${dropped.length} changed file(s) are all lockfiles, build output or generated, or outside the requested paths.`,
    );
    return;
  }
  const totalBudget = Number(env("CLAUDE_REVIEW_BUDGET_USD", "3"));
  const batchBudget = Number(env("CLAUDE_REVIEW_BATCH_BUDGET_USD", "0.75"));
  const batches = planBatches(kept, {
    maxLines: Number(env("CLAUDE_REVIEW_BATCH_LINES", "1000")),
    // About 40k tokens at 3.5 characters a token.
    maxChars: Number(env("CLAUDE_REVIEW_BATCH_CHARS", "140000")),
  });
  const threads = last ? openThreads(repo, pr) : [];
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
        `**Claude ran out of its budget** ($${batchBudget} a batch, $${totalBudget} the pull request) before finishing any batch: nothing here was reviewed reliably. Review part of it: \`@claude review <path> [path…]\`.`,
      );
      return;
    }
    throw new Error("Claude did not return a review for any batch.");
  }
  const merged = mergeOutputs(parts);
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
  });
  // Only threads the script handed over: an id the model made up would reply elsewhere.
  const known = new Set(threads.map((t) => t.comment_id));
  const replies = merged.thread_replies.filter((r) => known.has(r.comment_id));
  refuseLeak([built.body, ...built.comments.map((c) => c.body), ...replies.map((r) => r.reply)]);
  postReview(repo, pr, headSha, built);
  for (const r of replies) {
    const label = r.status === "addressed" ? "Looks addressed" : "Still open";
    if (DRY_RUN) {
      console.log(`--- reply to ${r.comment_id}: ${label} ---\n${r.reply}`);
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

/** One `claude -p` over one batch, with the batch's diff inside the prompt. */
function reviewBatch(
  ctx: ReviewContext,
  files: PrFile[],
  threads: ReturnType<typeof openBotThreads>,
  part: { index: number; total: number; retry?: boolean },
  budgetUsd: number,
) {
  const dir = mkdtempSync(join(tmpdir(), "claude-review-"));
  writeFileSync(
    join(dir, "pr.json"),
    JSON.stringify(
      { title: ctx.meta.title, body: ctx.meta.body, author: ctx.meta.author?.login },
      null,
      2,
    ),
  );
  writeFileSync(join(dir, "threads.json"), JSON.stringify(threads, null, 2));
  const prompt = buildBatchPrompt(ctx, files, threads.length > 0, part, dir, repoFocus());

  const call = attempt(() => runClaude(prompt, dir, budgetUsd, SCHEMA), budgetUsd);
  if (!call.ok) {
    console.error(`A batch call failed: ${call.error}`);
    return { output: undefined, budget: false, turns: 0, costUsd: call.costUsd, failed: true };
  }
  const result = call.value;
  const output = !result.is_error ? result.structured_output : undefined;
  return {
    output,
    budget: /budget/i.test(result.subtype),
    turns: result.num_turns,
    costUsd: result.total_cost_usd ?? 0,
    failed: false,
  };
}

function answer(repo: string, pr: number, question: string) {
  const dir = mkdtempSync(join(tmpdir(), "claude-answer-"));
  writeFileSync(
    join(dir, "pr.json"),
    gh(["pr", "view", String(pr), "-R", repo, "--json", "title,body,files"]),
  );
  writeFileSync(join(dir, "pr.diff"), gh(["pr", "diff", String(pr), "-R", repo]));
  const prompt = `This is pull request #${pr} in ${repo}, checked out at its head. Its title, body and file
list are in ${dir}/pr.json and its diff in ${dir}/pr.diff. Read CLAUDE.md first.

The repository owner asked on the pull request:

<request>
${question}
</request>

Answer it. Your final message is posted verbatim as the comment, so it holds the answer and
nothing else. Write in English.`;
  // One question is one call, with the budget a whole review had before batches: $1.
  const result = runClaude(prompt, dir, Number(env("CLAUDE_REVIEW_ANSWER_BUDGET_USD", "1")));
  if (result.is_error || !result.result)
    throw new Error(`Claude did not answer (${result.subtype}).`);
  const body = `${result.result}\n\n<sub>Claude Sonnet 5.5 · $${result.total_cost_usd.toFixed(2)}</sub>`;
  refuseLeak([body]);
  if (DRY_RUN) {
    console.log(body);
    return;
  }
  gh(["pr", "comment", String(pr), "-R", repo, "--body-file", "-"], body);
}

if (import.meta.main) {
  if (!DRY_RUN) env("ANTHROPIC_API_KEY");
  env("GH_TOKEN");
  // Before any call is paid for: a missing settings file would otherwise fail every batch.
  findEngineSettings(import.meta.dir);
  const repo = env("GITHUB_REPOSITORY");
  const [mode, prArg, ...rest] = process.argv.slice(2);
  const pr = Number(prArg);
  if (!Number.isInteger(pr) || pr <= 0)
    throw new Error("usage: claude-review.ts review|comment <pr> [paths…]");
  if (mode === "review") review(repo, pr, rest);
  else if (mode === "comment") {
    const request = env("REQUEST");
    const command = parseCommand(request);
    if (command?.kind === "review") review(repo, pr, command.paths);
    else if (command) answer(repo, pr, request);
  } else throw new Error("usage: claude-review.ts review|comment <pr> [paths…]");
}
