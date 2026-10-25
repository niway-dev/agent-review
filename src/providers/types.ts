/**
 * The boundary between the engine and the agent CLI that does the reading.
 *
 * One interface, one method. Filtering, risk, batches, retries, coverage, budgets, posting and
 * threads stay in the engine and call only `run`. Hardening (what the agent may read or run, what
 * it inherits from the environment) belongs to the adapter and is documented per adapter in
 * `docs/providers/`.
 *
 * Non-goals: a plugin system, and a second provider before a consumer needs one. A second adapter
 * must bring its own sandbox story, its own structured-output path and its own cost accounting.
 * This shape is drawn from one example; if a second adapter does not fit, redraw it.
 */

/** Tool names the engine may ask for. Each adapter maps them to its own names. */
export type NeutralTool = "read" | "glob" | "grep";

export interface ProviderRequest {
  /** The full prompt text. */
  prompt: string;
  /** The directory the agent works in: the checked-out head of the pull request. */
  cwd: string;
  /** Extra directories the agent may read (the scratch folder holding `pr.json`, `threads.json`). */
  addDirs: string[];
  allowedTools: NeutralTool[];
  /** The most this call may spend, in USD. A soft cap: a provider may overshoot it. */
  maxBudgetUsd: number;
  /** JSON schema for the structured answer. Omit it to get free text in `text`. */
  outputSchema?: object;
  /** Send the prompt through stdin instead of an argument (a large diff would exceed argv limits). */
  promptViaStdin: boolean;
}

export interface ProviderResult {
  /** The answer parsed against `outputSchema`, when one was given and the call succeeded. */
  structuredOutput?: unknown;
  /** The free-text answer. */
  text?: string;
  costUsd: number;
  turns: number;
  durationMs: number;
  /** `success`, `budget` (the spend cap ended the call) or `error`; a provider may add more. */
  terminalReason: string;
  isError: boolean;
  /** The provider's own result, kept for debugging. Never posted. */
  raw: unknown;
}

export interface ProviderAdapter {
  /** The value of `AGENT_REVIEW_PROVIDER` that selects it. */
  readonly name: string;
  /** Throws when the call would fail anyway: missing binary, settings file or credential. */
  preflight(): void;
  /** For the review footer, e.g. "Claude Sonnet 5.5 via Claude Code 2.1.304". */
  modelLabel(): string;
  /**
   * True when any text contains a credential of this provider (the exact key in the environment
   * or anything shaped like one). The engine refuses to post such text.
   */
  leaksSecret(texts: string[]): boolean;
  /** Runs one call to completion. Throws when the call produced no result at all. */
  run(request: ProviderRequest): ProviderResult;
}
