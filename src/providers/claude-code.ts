/**
 * The Claude Code adapter (`claude -p`): everything specific to that CLI lives here. Its
 * hardening is documented in docs/providers/claude-code.md.
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { NeutralTool, ProviderAdapter, ProviderRequest, ProviderResult } from "./types";

const BINARY = "claude";
const SETTINGS_FILE = "claude-code.settings.json";
const KEY_SHAPE = /sk-ant-[a-z0-9]+-[A-Za-z0-9_-]{20,}/;

const TOOL_NAMES: Record<NeutralTool, string> = { read: "Read", glob: "Glob", grep: "Grep" };

export function toolNames(tools: NeutralTool[]): string {
  return tools
    .map((t) => {
      const name = TOOL_NAMES[t];
      if (!name) throw new Error(`Unknown tool "${t}" for the Claude Code adapter.`);
      return name;
    })
    .join(",");
}

/** "claude-sonnet-5-5" becomes "Claude Sonnet 5.5"; a name of another shape is returned as is. */
export function prettyModel(model: string): string {
  const match = model.match(/^claude-([a-z]+)-(\d+(?:-\d+)*)(?:-\d{8})?$/);
  if (!match) return model;
  const family = match[1][0].toUpperCase() + match[1].slice(1);
  return `Claude ${family} ${match[2].replaceAll("-", ".")}`;
}

export function leaksKey(texts: string[], key: string) {
  return texts.some((t) => (key !== "" && t.includes(key)) || KEY_SHAPE.test(t));
}

/**
 * The only variables the agent CLI inherits. An allowlist, not "everything but two names": the
 * parent process holds `GH_TOKEN` and may carry anything a runner or a repository file added
 * (`ANTHROPIC_BASE_URL`, `HTTPS_PROXY`, `NODE_OPTIONS`, `BUN_*`), and any of those could send the
 * API key to another host or run code in the agent.
 */
export const CHILD_ENV_ALLOWLIST = [
  "PATH",
  "HOME",
  "TMPDIR",
  "TERM",
  "LANG",
  "ANTHROPIC_API_KEY",
  "CLAUDE_CONFIG_DIR",
  "CI",
  "GITHUB_ACTIONS",
] as const;

/** `LC_ALL`, `LC_CTYPE`, … along with the exact names above. */
const LOCALE_PREFIX = "LC_";

export function buildChildEnv(env: Record<string, string | undefined>) {
  const child: Record<string, string> = {};
  for (const [name, value] of Object.entries(env)) {
    if (value === undefined) continue;
    if ((CHILD_ENV_ALLOWLIST as readonly string[]).includes(name) || name.startsWith(LOCALE_PREFIX)) {
      child[name] = value;
    }
  }
  return child;
}

/** The adapter's own settings, next to this file. */
export function findEngineSettings(dir: string) {
  const path = join(dir, SETTINGS_FILE);
  // Never run without it: the deny rules and the hardening flags come together.
  if (existsSync(path)) return path;
  throw new Error(`${SETTINGS_FILE} not found in ${dir}`);
}

/**
 * The `claude` arguments; the prompt itself goes through stdin, never as an argument, unless the
 * request says otherwise. `--restricted` drops the code-running tools and ignores the head's user,
 * project and local settings (so its `.claude/` hooks do not load); `--strict-mcp-config` skips
 * MCP servers; `--tools` names the only tools that exist. The `/proc` deny rules are not verified
 * under `--restricted`: it confines file tools to the working directories, which may already
 * exclude `/proc`, but nothing here proves it.
 */
export function buildClaudeArgs(opts: {
  addDirs: string[];
  budgetUsd: number;
  model: string;
  settings: string;
  tools: NeutralTool[];
  schema?: object;
  prompt?: string;
}) {
  const tools = toolNames(opts.tools);
  return [
    "-p",
    "--model",
    opts.model,
    "--max-budget-usd",
    String(opts.budgetUsd),
    "--restricted",
    "--strict-mcp-config",
    "--tools",
    tools,
    "--settings",
    opts.settings,
    ...opts.addDirs.flatMap((d) => ["--add-dir", d]),
    "--allowedTools",
    tools,
    "--disallowedTools",
    "Bash,Read(//proc/**),Grep(//proc/**),Glob(//proc/**)",
    "--output-format",
    "json",
    ...(opts.schema ? ["--json-schema", JSON.stringify(opts.schema)] : []),
    ...(opts.prompt === undefined ? [] : [opts.prompt]),
  ];
}

interface ClaudeResult {
  is_error: boolean;
  subtype: string;
  num_turns: number;
  total_cost_usd: number;
  duration_ms: number;
  result?: string;
  structured_output?: unknown;
}

export class ClaudeCodeProvider implements ProviderAdapter {
  readonly name = "claude-code";
  private version: string | null = null;
  private readonly binary: string;
  private readonly settingsDir: string;

  constructor(
    private readonly opts: {
      model: string;
      requireApiKey: boolean;
      /** For tests: another executable, and another folder for the settings file. */
      binary?: string;
      settingsDir?: string;
    },
  ) {
    this.binary = opts.binary ?? BINARY;
    this.settingsDir = opts.settingsDir ?? import.meta.dir;
  }

  preflight() {
    findEngineSettings(this.settingsDir);
    const probe = spawnSync(this.binary, ["--version"], {
      encoding: "utf8",
      env: buildChildEnv(process.env),
    });
    if (probe.error || probe.status !== 0) {
      throw new Error(
        `The Claude Code binary "${this.binary}" did not run (--version): ${probe.error ?? probe.stderr}`,
      );
    }
    this.version = probe.stdout.match(/\d+\.\d+\.\d+/)?.[0] ?? null;
    if (this.opts.requireApiKey && !process.env.ANTHROPIC_API_KEY) {
      throw new Error("ANTHROPIC_API_KEY is not set");
    }
  }

  modelLabel() {
    return `${prettyModel(this.opts.model)} via Claude Code${this.version ? ` ${this.version}` : ""}`;
  }

  leaksSecret(texts: string[]) {
    return leaksKey(texts, process.env.ANTHROPIC_API_KEY ?? "");
  }

  run(request: ProviderRequest): ProviderResult {
    // The agent never gets a GitHub token, a base URL or a proxy: see CHILD_ENV_ALLOWLIST.
    const childEnv = buildChildEnv(process.env);
    const args = buildClaudeArgs({
      addDirs: request.addDirs,
      budgetUsd: request.maxBudgetUsd,
      model: this.opts.model,
      settings: findEngineSettings(this.settingsDir),
      tools: request.allowedTools,
      schema: request.outputSchema,
      prompt: request.promptViaStdin ? undefined : request.prompt,
    });
    const run = spawnSync(this.binary, args, {
      cwd: request.cwd,
      input: request.promptViaStdin ? request.prompt : undefined,
      env: childEnv,
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
    });
    if (run.error || !run.stdout) {
      throw new Error(`claude did not run (status ${run.status}): ${run.error ?? run.stderr}`);
    }
    const raw = JSON.parse(run.stdout) as ClaudeResult;
    return {
      structuredOutput: raw.structured_output,
      text: raw.result,
      costUsd: raw.total_cost_usd ?? 0,
      turns: raw.num_turns ?? 0,
      durationMs: raw.duration_ms ?? 0,
      terminalReason: /budget/i.test(raw.subtype ?? "")
        ? "budget"
        : raw.subtype === "success" && !raw.is_error
          ? "success"
          : "error",
      isError: Boolean(raw.is_error),
      raw,
    };
  }
}
