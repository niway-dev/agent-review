import { describe, expect, test } from "bun:test";
import { chmodSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  buildClaudeArgs,
  ClaudeCodeProvider,
  findEngineSettings,
  leaksKey,
  prettyModel,
  toolNames,
} from "./claude-code";
import { getProvider, PROVIDER_NAMES, UnknownProviderError } from "./index";

describe("buildClaudeArgs", () => {
  const args = buildClaudeArgs({
    addDirs: ["/d"],
    budgetUsd: 0.6,
    model: "m",
    settings: "/s/claude-code.settings.json",
    tools: ["read", "glob", "grep"],
    schema: { type: "object" },
  });
  const after = (flag: string) => args[args.indexOf(flag) + 1];

  test("hardens the invocation and keeps the read-only tool rules", () => {
    expect(args).toContain("--restricted");
    expect(args).toContain("--strict-mcp-config");
    expect(after("--tools")).toBe("Read,Glob,Grep");
    expect(after("--settings")).toBe("/s/claude-code.settings.json");
    expect(after("--add-dir")).toBe("/d");
    expect(after("--allowedTools")).toBe("Read,Glob,Grep");
    expect(after("--disallowedTools")).toContain("Bash");
    expect(after("--disallowedTools")).toContain("Read(//proc/**)");
    expect(after("--max-budget-usd")).toBe("0.6");
    expect(after("--output-format")).toBe("json");
    expect(after("--json-schema")).toBe('{"type":"object"}');
  });

  test("leaves the prompt to stdin: no prompt argument follows -p", () => {
    expect(args[0]).toBe("-p");
    expect(args[1]).toBe("--model");
    expect(args.at(-1)).toBe('{"type":"object"}');
  });

  test("appends the prompt as an argument only when asked", () => {
    const withPrompt = buildClaudeArgs({
      addDirs: [],
      budgetUsd: 1,
      model: "m",
      settings: "s",
      tools: ["read"],
      prompt: "hello",
    });
    expect(withPrompt.at(-1)).toBe("hello");
    expect(withPrompt).not.toContain("--add-dir");
  });
});

describe("toolNames", () => {
  test("maps the neutral names to Claude Code's", () => {
    expect(toolNames(["grep", "read"])).toBe("Grep,Read");
    expect(() => toolNames(["shell" as never])).toThrow("Unknown tool");
  });
});

describe("findEngineSettings", () => {
  test("finds the settings shipped with the adapter and refuses to run without them", () => {
    expect(findEngineSettings(import.meta.dir)).toEndWith("claude-code.settings.json");
    expect(() => findEngineSettings("/nonexistent/dir")).toThrow("claude-code.settings.json");
  });
});

describe("leaksKey", () => {
  const key = "sk-ant-api03-SyntheticSyntheticSynthetic0123";

  test("catches the job's own key anywhere in the output", () => {
    expect(leaksKey(["fine", `oops ${key}`], key)).toBe(true);
  });

  test("catches any string shaped like an Anthropic key", () => {
    expect(leaksKey(["sk-ant-admin01-AnotherSyntheticValue_0123456789"], key)).toBe(true);
  });

  test("lets a review that only quotes the prefix through", () => {
    expect(leaksKey(["the guard matches `sk-ant-` literally"], key)).toBe(false);
  });
});

describe("modelLabel", () => {
  test("names the model prettily", () => {
    expect(prettyModel("claude-sonnet-5-5")).toBe("Claude Sonnet 5.5");
    expect(prettyModel("claude-opus-5")).toBe("Claude Opus 5");
    expect(prettyModel("something-else")).toBe("something-else");
  });

  test("omits the CLI version until preflight has read it", () => {
    const provider = new ClaudeCodeProvider({ model: "claude-sonnet-5-5", requireApiKey: false });
    expect(provider.modelLabel()).toBe("Claude Sonnet 5.5 via Claude Code");
  });
});

/** A stand-in for the `claude` binary: a shell script, so nothing leaves the machine. */
function stubBinary(body: string) {
  const dir = mkdtempSync(join(tmpdir(), "stub-claude-"));
  const path = join(dir, "claude");
  writeFileSync(path, `#!/bin/sh\n${body}\n`);
  chmodSync(path, 0o755);
  return path;
}

describe("ClaudeCodeProvider with a stub binary", () => {
  const request = {
    prompt: "the prompt",
    cwd: process.cwd(),
    addDirs: [],
    allowedTools: ["read" as const],
    maxBudgetUsd: 0.5,
    promptViaStdin: true,
  };

  test("preflight reads the version for the footer; run maps the result and strips GitHub tokens", () => {
    const binary = stubBinary(`
if [ "$1" = "--version" ]; then echo "2.1.304 (Claude Code)"; exit 0; fi
stdin=$(cat)
printf '{"is_error":false,"subtype":"success","num_turns":3,"total_cost_usd":0.12,"duration_ms":50,"result":"stdin=%s token=[%s]","structured_output":{"ok":true}}' "$stdin" "$GH_TOKEN"`);
    process.env.GH_TOKEN = "must-not-reach-the-child";
    const provider = new ClaudeCodeProvider({ model: "claude-sonnet-5-5", requireApiKey: false, binary });
    provider.preflight();
    expect(provider.modelLabel()).toBe("Claude Sonnet 5.5 via Claude Code 2.1.304");
    const result = provider.run(request);
    expect(result).toMatchObject({
      structuredOutput: { ok: true },
      costUsd: 0.12,
      turns: 3,
      durationMs: 50,
      terminalReason: "success",
      isError: false,
    });
    expect(result.text).toBe("stdin=the prompt token=[]");
    delete process.env.GH_TOKEN;
  });

  test("a spend-cap ending is reported as budget", () => {
    const binary = stubBinary(
      `cat >/dev/null; echo '{"is_error":true,"subtype":"error_max_budget_usd","num_turns":9,"total_cost_usd":0.5}'`,
    );
    const provider = new ClaudeCodeProvider({ model: "m", requireApiKey: false, binary });
    expect(provider.run(request)).toMatchObject({ terminalReason: "budget", isError: true });
  });

  test("preflight fails fast on a missing binary or credential", () => {
    const missing = new ClaudeCodeProvider({
      model: "m",
      requireApiKey: false,
      binary: "/nonexistent/claude",
    });
    expect(() => missing.preflight()).toThrow("did not run");
    const binary = stubBinary('echo "2.1.304"');
    const saved = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    expect(() => new ClaudeCodeProvider({ model: "m", requireApiKey: true, binary }).preflight()).toThrow(
      "ANTHROPIC_API_KEY",
    );
    if (saved !== undefined) process.env.ANTHROPIC_API_KEY = saved;
  });
});

describe("getProvider", () => {
  test("returns the Claude Code adapter", () => {
    expect(getProvider("claude-code", { model: "m", dryRun: true }).name).toBe("claude-code");
  });

  test("an unknown name is a usage error that lists the accepted values", () => {
    expect(() => getProvider("gpt", { model: "m", dryRun: false })).toThrow(UnknownProviderError);
    expect(() => getProvider("gpt", { model: "m", dryRun: false })).toThrow(PROVIDER_NAMES.join(", "));
  });
});
