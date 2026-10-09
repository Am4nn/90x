import "server-only";
import { type LanguageModel, NoObjectGeneratedError } from "ai";
import { logError } from "@/lib/log";
import { billedTokens } from "./cost";
import { recordUsage } from "./usage";

/**
 * Meter a call that failed after the model answered. A reply that misses the schema throws
 * NoObjectGeneratedError, which carries the tokens the provider billed; without this they
 * never reach ai_usage and the spend guard undercounts (and a retry loop doubles it).
 * Call it in the catch, then carry on as before: it records nothing for other errors and
 * never throws.
 */
export async function trackFailedUsage(userId: string | null, route: string, model: LanguageModel, error: unknown): Promise<void> {
  if (!NoObjectGeneratedError.isInstance(error) || !error.usage) return;
  try {
    await recordUsage({
      userId,
      route,
      model: typeof model === "string" ? model : model.modelId,
      ...billedTokens([{ usage: error.usage }]),
    });
  } catch (e) {
    logError("failed ai call not metered", e);
  }
}
