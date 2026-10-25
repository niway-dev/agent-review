/** The `AGENT_REVIEW_*` settings, read once, with the old `CLAUDE_REVIEW_*` names as a fallback. */

export class UsageError extends Error {}

export interface EngineConfig {
  /** Total per pull request, USD. */
  budgetUsd: number;
  batchBudgetUsd: number;
  answerBudgetUsd: number;
  batchLines: number;
  batchChars: number;
  dryRun: boolean;
  model: string;
  provider: string;
  mention: string;
  /** Login allowed to command the tool; empty when the workflow is the only check. */
  operator: string;
  /** Extra exclude globs on top of the built-in ones. */
  exclude: string[];
}

type Env = Record<string, string | undefined>;

/**
 * `AGENT_REVIEW_<name>`, else the deprecated `CLAUDE_REVIEW_<name>` (with a one-line notice on
 * stderr), else undefined. An empty value counts as unset.
 */
export function readSetting(env: Env, name: string, warn: (line: string) => void) {
  const current = env[`AGENT_REVIEW_${name}`];
  if (current !== undefined && current !== "") return current;
  const old = env[`CLAUDE_REVIEW_${name}`];
  if (old !== undefined && old !== "") {
    warn(`CLAUDE_REVIEW_${name} is deprecated; use AGENT_REVIEW_${name}.`);
    return old;
  }
  return undefined;
}

export function loadConfig(env: Env, warn: (line: string) => void = console.error): EngineConfig {
  const get = (name: string) => readSetting(env, name, warn);
  const number = (name: string, fallback: number, integer = false) => {
    const raw = get(name);
    if (raw === undefined) return fallback;
    const value = Number(raw);
    if (!Number.isFinite(value) || value <= 0 || (integer && !Number.isInteger(value))) {
      throw new UsageError(`AGENT_REVIEW_${name} must be a positive ${integer ? "integer" : "number"}, got "${raw}".`);
    }
    return value;
  };
  return {
    budgetUsd: number("BUDGET_USD", 3),
    batchBudgetUsd: number("BATCH_BUDGET_USD", 0.75),
    answerBudgetUsd: number("ANSWER_BUDGET_USD", 1),
    batchLines: number("BATCH_LINES", 1000, true),
    batchChars: number("BATCH_CHARS", 140000, true),
    dryRun: get("DRY_RUN") === "1",
    model: get("MODEL") ?? "claude-sonnet-5-5",
    provider: get("PROVIDER") ?? "claude-code",
    mention: get("MENTION") ?? "@agent-review",
    operator: get("OPERATOR") ?? "",
    exclude: (get("EXCLUDE") ?? "").split(",").filter(Boolean),
  };
}
