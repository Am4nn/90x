import "server-only";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createDeepSeek } from "@ai-sdk/deepseek";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { LanguageModel } from "ai";

// One place that decides which provider and models the app uses.
// Switching provider is an env change: AI_PROVIDER, AI_API_KEY, AI_BASE_URL, AI_MODEL_*.

function env(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set. See .env.example.`);
  return value;
}

function createProvider(): (modelId: string) => LanguageModel {
  const provider = env("AI_PROVIDER");
  const apiKey = env("AI_API_KEY");
  const baseURL = process.env.AI_BASE_URL || undefined;

  switch (provider) {
    case "deepseek":
      return createDeepSeek({ apiKey, baseURL });
    case "anthropic":
      return createAnthropic({ apiKey, baseURL });
    case "openai-compatible":
      return createOpenAICompatible({ name: "custom", apiKey, baseURL: env("AI_BASE_URL"), includeUsage: true });
    default:
      throw new Error(`Unknown AI_PROVIDER "${provider}". Use deepseek, anthropic or openai-compatible.`);
  }
}

let provider: ((modelId: string) => LanguageModel) | undefined;

function model(envName: string): LanguageModel {
  provider ??= createProvider();
  return provider(env(envName));
}

/** Cheap and fast: answer grading, quizzes, short generations. */
export const fastModel = () => model("AI_MODEL_FAST");

/** Stronger reasoning: mock interviewer follow-ups and scoring. */
export const smartModel = () => model("AI_MODEL_SMART");
