#!/usr/bin/env bun
/**
 * wachi: advisory pull request reviews by an agent CLI.
 *
 *   wachi review <pr> [paths…]   review it; after the first review, only what changed
 *                                       since the last reviewed commit
 *   wachi comment <pr>           route the operator's comment, read from $REQUEST, to a
 *                                       review or an answer
 *
 * Exit codes: 0 posted or nothing to do; 1 engine error (nothing posted); 2 usage error.
 * The settings are documented in docs/cli.md.
 */
import { existsSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { loadConfig, UsageError } from "./config";
import { comment, defaultGh, review, type Deps } from "./engine";
import { getProvider, PROVIDER_NAMES, UnknownProviderError } from "./providers";

export const USAGE = `Usage:
  wachi review <pr> [paths…] [--repo-dir <dir>]   Review a pull request (or only the given paths)
  wachi comment <pr> [--repo-dir <dir>]           Handle the comment in $REQUEST (a review or an answer)
  wachi --help | --version

Options:
  --repo-dir <dir>                   The checked-out pull request head: every file the engine reads
                                     and the agent's working directory. Default: the current directory.

Environment:
  GH_TOKEN, GITHUB_REPOSITORY        required
  ANTHROPIC_API_KEY                  required by the claude-code provider (not in a dry run)
  REQUEST                            the comment text, for \`comment\`
  AGENT_REVIEW_*                     optional settings; see docs/cli.md

Exit codes: 0 posted or nothing to do, 1 engine error, 2 usage error.`;

/** package.json sits one level above src/; in a copied layout it may belong to someone else. */
export function readVersion(dir = import.meta.dir) {
  try {
    const path = join(dir, "..", "package.json");
    if (!existsSync(path)) return "unknown";
    const pkg = JSON.parse(readFileSync(path, "utf8"));
    return pkg.name === "wachi-code-reviewer" ? String(pkg.version) : "unknown";
  } catch {
    return "unknown";
  }
}

/**
 * Takes `--repo-dir <dir>` or `--repo-dir=<dir>` out of the arguments. The directory is the
 * reviewed head, which the engine reads as data; it is not the engine's own working directory.
 */
export function extractRepoDir(argv: string[]) {
  const rest: string[] = [];
  let value: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--repo-dir") {
      value = argv[++i];
      if (value === undefined || value === "") throw new UsageError("--repo-dir needs a directory.");
    } else if (arg.startsWith("--repo-dir=")) {
      value = arg.slice("--repo-dir=".length);
      if (value === "") throw new UsageError("--repo-dir needs a directory.");
    } else {
      rest.push(arg);
    }
  }
  const repoDir = resolve(value ?? ".");
  if (!existsSync(repoDir) || !statSync(repoDir).isDirectory()) {
    throw new UsageError(`--repo-dir ${repoDir} is not a directory.`);
  }
  return { repoDir, rest };
}

function required(env: Record<string, string | undefined>, name: string) {
  const value = env[name];
  if (value === undefined || value === "") throw new UsageError(`${name} is not set`);
  return value;
}

export function main(argv: string[], env: Record<string, string | undefined>): number {
  const mode = argv[0];
  if (mode === "--help" || mode === "-h") {
    console.log(USAGE);
    return 0;
  }
  if (mode === "--version" || mode === "-v") {
    console.log(readVersion());
    return 0;
  }
  try {
    const { repoDir, rest: args } = extractRepoDir(argv);
    const [, prArg, ...rest] = args;
    if (mode !== "review" && mode !== "comment") {
      throw new UsageError(mode ? `Unknown command "${mode}".` : "No command given.");
    }
    const pr = Number(prArg);
    if (!/^\d+$/.test(prArg ?? "") || pr <= 0) {
      throw new UsageError(`${mode} needs a pull request number.`);
    }
    if (mode === "comment" && rest.length > 0) throw new UsageError("comment takes no paths.");
    const config = loadConfig(env);
    const provider = getProvider(config.provider, config);
    required(env, "GH_TOKEN");
    const repo = required(env, "GITHUB_REPOSITORY");
    const request = mode === "comment" ? required(env, "REQUEST") : "";
    const deps: Deps = {
      gh: defaultGh,
      provider,
      config,
      repoDir,
      log: (line) => console.log(line),
      warn: (line) => console.error(line),
    };
    // Before any call is paid for: a missing binary or settings file would fail every batch.
    try {
      provider.preflight();
    } catch (error) {
      console.error(`wachi: ${error instanceof Error ? error.message : error}`);
      return 1;
    }
    if (mode === "review") review(deps, repo, pr, rest);
    else comment(deps, repo, pr, request, env.AGENT_REVIEW_COMMENT_AUTHOR || undefined);
    return 0;
  } catch (error) {
    if (error instanceof UsageError || error instanceof UnknownProviderError) {
      console.error(`wachi: ${error.message}\n\n${USAGE}`);
      return 2;
    }
    console.error(`wachi: ${error instanceof Error ? error.message : error}`);
    return 1;
  }
}

if (import.meta.main) process.exit(main(process.argv.slice(2), process.env));
