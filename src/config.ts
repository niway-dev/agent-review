/** The `AGENT_REVIEW_*` settings, read once, with the old `CLAUDE_REVIEW_*` names as a fallback. */
import { DEFAULT_MODELS } from "./providers";

export class UsageError extends Error {}

export interface EngineConfig {
  /** Total per pull request, USD. */
  budgetUsd: number;
  batchBudgetUsd: number;
  answerBudgetUsd: number;
  batchLines: number;
  batchChars: number;
  dryRun: boolean;
  /** The provider's default (`DEFAULT_MODELS`) when unset. */
  model: string;
  provider: string;
  /** `AGENT_REVIEW_PRICE_PER_MTOK`: "input,cached_input,output" USD per million tokens, for a Codex model without a built-in price. */
  pricePerMTok?: string;
  /** `AGENT_REVIEW_REASONING_EFFORT`: passed to Codex as `model_reasoning_effort`; unset keeps the model's default. */
  reasoningEffort?: string;
  mention: string;
  /** Login allowed to command the tool. `comment` refuses to run when it is empty or a placeholder. */
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
  const provider = get("PROVIDER") ?? "claude-code";
  return {
    budgetUsd: number("BUDGET_USD", 3),
    batchBudgetUsd: number("BATCH_BUDGET_USD", 0.75),
    answerBudgetUsd: number("ANSWER_BUDGET_USD", 1),
    batchLines: number("BATCH_LINES", 1000, true),
    batchChars: number("BATCH_CHARS", 140000, true),
    dryRun: get("DRY_RUN") === "1",
    model: get("MODEL") ?? DEFAULT_MODELS[provider as keyof typeof DEFAULT_MODELS] ?? DEFAULT_MODELS["claude-code"],
    provider,
    pricePerMTok: get("PRICE_PER_MTOK"),
    reasoningEffort: get("REASONING_EFFORT"),
    mention: get("MENTION") ?? "@wachi",
    operator: get("OPERATOR") ?? "",
    exclude: (get("EXCLUDE") ?? "").split(",").filter(Boolean),
  };
}

/** Template values that look like a login but belong to nobody the consumer chose. */
const PLACEHOLDER_OPERATORS = ["your-github-login"];

/**
 * Why `operator` cannot be trusted as the operator's login, or undefined when it can. The
 * templates ship placeholders that are valid, possibly registrable logins: whoever registered one
 * would become the operator of every repository that forgot to edit it.
 */
export function operatorProblem(operator: string | undefined): string | undefined {
  const login = (operator ?? "").trim();
  if (login === "") return "The operator login is empty. Set `operator` (AGENT_REVIEW_OPERATOR) to your GitHub login.";
  const lower = login.toLowerCase();
  if (lower.startsWith("edit") || PLACEHOLDER_OPERATORS.includes(lower)) {
    return `The operator login is still the template placeholder "${login}". Set \`operator\` (AGENT_REVIEW_OPERATOR) to your GitHub login.`;
  }
  return undefined;
}
