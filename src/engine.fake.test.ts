import { describe, expect, test } from "bun:test";
import { loadConfig } from "./config";
import { comment, review, type Deps, type GhFn, type ReviewOutput } from "./engine";
import type { ProviderAdapter, ProviderRequest, ProviderResult } from "./providers/types";

/** Plays back one scripted answer per call and records what the engine asked for. */
class FakeProvider implements ProviderAdapter {
  readonly name = "fake";
  readonly requests: ProviderRequest[] = [];
  constructor(private readonly script: ((request: ProviderRequest) => Partial<ProviderResult>)[]) {}
  preflight() {}
  modelLabel() {
    return "Fake Model 1 via Fake CLI 0.1";
  }
  leaksSecret(texts: string[]) {
    return texts.some((t) => t.includes("SECRET"));
  }
  run(request: ProviderRequest): ProviderResult {
    this.requests.push(request);
    const step = this.script[this.requests.length - 1];
    if (!step) throw new Error("the fake provider has no answer left");
    return {
      costUsd: 0,
      turns: 1,
      durationMs: 1,
      terminalReason: "success",
      isError: false,
      raw: {},
      ...step(request),
    };
  }
}

const out = (over: Partial<ReviewOutput>): ReviewOutput => ({
  files_reviewed: [],
  files_skipped: [],
  findings: [],
  thread_replies: [],
  summary: "",
  ...over,
});

const MANAGER = "apps/api/src/main/session/session-manager.ts";
const STORE = "apps/api/src/main/session/store.ts";
const LOGO = "assets/logo.png";
const GUIDE = "docs/guides/2026-01-01-export-format.md";

const prFiles = [
  { filename: MANAGER, additions: 6, deletions: 0, patch: "@@ -1,1 +1,6 @@\n ctx\n+a\n+b\n+c\n+d\n+e" },
  { filename: STORE, additions: 3, deletions: 0, patch: "@@ -0,0 +1,3 @@\n+x\n+y\n+z" },
  { filename: LOGO, additions: 0, deletions: 0 }, // binary: GitHub sends no patch
  { filename: GUIDE, additions: 4, deletions: 0, patch: "@@ -0,0 +1,4 @@\n+w\n+x\n+y\n+z" },
];

/** A GitHub with one pull request and no earlier review; records what the engine posts. */
function fakeGh(posted: { review?: { body: string; comments: unknown[] } }): GhFn {
  return (args, input) => {
    const line = args.join(" ");
    if (line.startsWith("pr view"))
      return JSON.stringify({ headRefOid: "head1234567", title: "t", body: "b", author: { login: "u" } });
    if (line.includes("/pulls/7/files")) return prFiles.map((f) => JSON.stringify(f)).join("\n");
    if (line.includes("/pulls/7/reviews") && !args.includes("POST")) return "";
    if (line.includes("-X POST repos/o/r/pulls/7/reviews")) {
      posted.review = JSON.parse(input ?? "{}");
      return "{}";
    }
    throw new Error(`unexpected gh call: ${line}`);
  };
}

describe("the batch loop against a fake provider", () => {
  test("two batches, one skipped file and a retry: merged body and budget arithmetic", () => {
    const posted: { review?: { body: string; comments: { path: string; line: number; body: string }[] } } = {};
    const provider = new FakeProvider([
      // Batch 1 (manager, store, logo): store is left unaccounted for, the logo is skipped as binary.
      () => ({
        costUsd: 0.3,
        turns: 4,
        structuredOutput: out({
          files_reviewed: [MANAGER],
          files_skipped: [{ path: LOGO, reason: "binary" }],
          findings: [
            {
              path: MANAGER,
              line: 2,
              severity: "should_fix",
              category: "correctness",
              title: "Off by one",
              body: "Fails for an empty list.",
            },
          ],
          summary: "Manager looks mostly fine.",
        }),
      }),
      // The retry covers only the store.
      () => ({
        costUsd: 0.1,
        turns: 2,
        structuredOutput: out({ files_reviewed: [STORE], summary: "Store fine." }),
      }),
      // Batch 2: the guide.
      () => ({
        costUsd: 0.2,
        turns: 3,
        structuredOutput: out({ files_reviewed: [GUIDE], summary: "Guide fine." }),
      }),
    ]);
    const deps: Deps = {
      gh: fakeGh(posted),
      provider,
      config: loadConfig({
        AGENT_REVIEW_BATCH_LINES: "10",
        AGENT_REVIEW_BATCH_BUDGET_USD: "0.5",
        AGENT_REVIEW_BUDGET_USD: "0.8",
      }),
      log: () => {},
      warn: () => {},
    };

    review(deps, "o/r", 7, []);

    // Three calls: batch 1, its retry, batch 2. Each cap is min(batch budget, what is left).
    expect(provider.requests).toHaveLength(3);
    const caps = provider.requests.map((r) => r.maxBudgetUsd);
    expect(caps[0]).toBeCloseTo(0.5, 5); // min(0.5, 0.8)
    expect(caps[1]).toBeCloseTo(0.5, 5); // min(0.5, 0.8 - 0.3)
    expect(caps[2]).toBeCloseTo(0.4, 5); // min(0.5, 0.8 - 0.3 - 0.1)
    for (const r of provider.requests) {
      expect(r.allowedTools).toEqual(["read", "glob", "grep"]);
      expect(r.promptViaStdin).toBe(true);
      expect(r.outputSchema).toBeDefined();
    }
    // The retry's prompt holds only the store; the first batch's holds three files.
    expect(provider.requests[1].prompt).toContain("second pass");
    expect(provider.requests[1].prompt).toContain(`- ${STORE} +3 −0`);
    expect(provider.requests[1].prompt).not.toContain(`- ${MANAGER} +6 −0\n\nThis`);

    const body = posted.review?.body ?? "";
    // The binary logo is the only file not reviewed, so the review is partial and unmarked.
    expect(body.split("\n")[0]).toContain("Partial review");
    expect(body).toContain("reviewed 3 of 4 files");
    expect(body).toContain(`\`${LOGO}\` (binary)`);
    expect(body).not.toContain("agent-review sha=");
    expect(body).toContain("1 finding(s), 1 to fix; 1 on their lines");
    expect(body).toContain("| Batch 1 of 2 | 3 | 9 | 5 | reviewed after a retry | 6 | $0.40 |");
    expect(body).toContain("| Batch 2 of 2 | 1 | 4 | 1 | reviewed | 3 | $0.20 |");
    expect(body).toContain("**Batch 1 of 2.** Manager looks mostly fine.");
    expect(body).toContain("**Batch 2 of 2.** Guide fine.");
    // Total spent is 0.30 + 0.10 + 0.20, in the footer built from the provider's label.
    expect(body).toContain("<sub>Fake Model 1 via Fake CLI 0.1 · 2 batches · $0.60</sub>");
    expect(posted.review?.comments).toHaveLength(1);
    expect(posted.review?.comments[0]).toMatchObject({ path: MANAGER, line: 2 });
  });

  test("a complete review writes the new marker", () => {
    const posted: { review?: { body: string; comments: unknown[] } } = {};
    const provider = new FakeProvider([
      () => ({
        costUsd: 0.1,
        structuredOutput: out({ files_reviewed: [MANAGER, STORE, GUIDE], files_skipped: [], summary: "ok" }),
      }),
    ]);
    const gh = fakeGh(posted);
    const deps: Deps = {
      gh: (args, input) =>
        args.join(" ").includes("/pulls/7/files")
          ? prFiles
              .filter((f) => f.patch)
              .map((f) => JSON.stringify(f))
              .join("\n")
          : gh(args, input),
      provider,
      config: loadConfig({}),
      log: () => {},
      warn: () => {},
    };
    review(deps, "o/r", 7, []);
    expect(posted.review?.body).toContain("<!-- agent-review sha=head1234567 -->");
  });

  test("refuses to post text the provider flags as a credential", () => {
    const posted: { review?: { body: string; comments: unknown[] } } = {};
    const provider = new FakeProvider([
      () => ({
        structuredOutput: out({ files_reviewed: [MANAGER, STORE, GUIDE, LOGO], summary: "SECRET" }),
      }),
    ]);
    const deps: Deps = {
      gh: fakeGh(posted),
      provider,
      config: loadConfig({}),
      log: () => {},
      warn: () => {},
    };
    expect(() => review(deps, "o/r", 7, [])).toThrow("credential");
    expect(posted.review).toBeUndefined();
  });
});

describe("comment", () => {
  test("ignores a comment by someone who is not the operator, and one with no mention", () => {
    const provider = new FakeProvider([]);
    const deps: Deps = {
      gh: () => {
        throw new Error("must not call GitHub");
      },
      provider,
      config: loadConfig({ AGENT_REVIEW_OPERATOR: "Boss" }),
      log: () => {},
      warn: () => {},
    };
    comment(deps, "o/r", 7, "@agent-review review", "stranger");
    comment(deps, "o/r", 7, "no mention here", "boss");
    expect(provider.requests).toHaveLength(0);
  });
});
