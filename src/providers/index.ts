import { ClaudeCodeProvider } from "./claude-code";
import type { ProviderAdapter } from "./types";

export type { NeutralTool, ProviderAdapter, ProviderRequest, ProviderResult } from "./types";

export const PROVIDER_NAMES = ["claude-code"] as const;
export const DEFAULT_PROVIDER = "claude-code";

export class UnknownProviderError extends Error {}

export function getProvider(
  name: string,
  options: { model: string; dryRun: boolean },
): ProviderAdapter {
  if (name === "claude-code") {
    return new ClaudeCodeProvider({ model: options.model, requireApiKey: !options.dryRun });
  }
  throw new UnknownProviderError(
    `Unknown provider "${name}". Accepted values: ${PROVIDER_NAMES.join(", ")}.`,
  );
}
