import { describe, expect, test } from "bun:test";
import { join } from "node:path";

const cli = join(import.meta.dir, "cli.ts");
const run = (args: string[], env: Record<string, string> = {}) => {
  const out = Bun.spawnSync([process.execPath, cli, ...args], {
    env: { PATH: process.env.PATH ?? "", ...env },
  });
  return { code: out.exitCode, stdout: out.stdout.toString(), stderr: out.stderr.toString() };
};

describe("cli", () => {
  test("--help prints the usage and exits 0", () => {
    const out = run(["--help"]);
    expect(out.code).toBe(0);
    expect(out.stdout).toContain("agent-review review <pr>");
  });

  test("--version prints the package version", () => {
    const out = run(["--version"]);
    expect(out.code).toBe(0);
    expect(out.stdout.trim()).toBe(require("../package.json").version);
  });

  test("usage errors exit 2", () => {
    expect(run(["review"]).code).toBe(2);
    expect(run(["review", "abc"]).code).toBe(2);
    expect(run(["frobnicate", "1"]).code).toBe(2);
    expect(run([]).code).toBe(2);
    expect(run(["review", "1"]).code).toBe(2); // GH_TOKEN is not set
    expect(run(["comment", "1"], { GH_TOKEN: "x", GITHUB_REPOSITORY: "o/r" }).code).toBe(2); // no REQUEST
  });

  test("an unknown provider is a usage error naming the accepted values", () => {
    const out = run(["review", "1"], { AGENT_REVIEW_PROVIDER: "other" });
    expect(out.code).toBe(2);
    expect(out.stderr).toContain("claude-code");
  });

  test("a missing agent binary is an engine error, before anything is posted", () => {
    const out = run(["review", "1"], {
      GH_TOKEN: "x",
      GITHUB_REPOSITORY: "o/r",
      AGENT_REVIEW_DRY_RUN: "1",
      PATH: "/nonexistent",
    });
    expect(out.code).toBe(1);
    expect(out.stderr).toContain("did not run");
  });
});
