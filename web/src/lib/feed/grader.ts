import "server-only";
import { generateText, Output } from "ai";
import { z } from "zod";
import { fastModel, NO_THINKING } from "@/lib/ai";
import { billedTokens } from "@/lib/ai/cost";
import { recordUsage } from "@/lib/ai/usage";

// AI half of grading: which saved key points does the answer
// cover? The score is computed from the hits by the caller. Invalid output is
// retried once; after that the user marks it themselves.

const SYSTEM = `You grade short answers in a software-engineering interview practice app.
For each numbered key point, decide whether the candidate's answer clearly covers it.
Be fair: accept paraphrases, synonyms and correct extra detail; don't require exact wording.
Don't give credit for a key point that is only hinted at, contradicted, or wrong.
Return one boolean per key point, in order.`;

const MAX_ANSWER_CHARS = 4000;

export type AiGrade = { hits: boolean[] } | { selfMark: true };

export async function gradeWithAi(input: {
  userId: string | null;
  prompt: string;
  answer: string;
  referenceAnswer: string;
  keyPoints: string[];
}): Promise<AiGrade> {
  const n = input.keyPoints.length;
  if (!n) return { selfMark: true };
  const schema = z.object({ hits: z.array(z.boolean()).length(n) });
  const prompt = [
    `Question:\n${input.prompt}`,
    `Reference answer:\n${input.referenceAnswer}`,
    `Key points:\n${input.keyPoints.map((k, i) => `${i + 1}. ${k}`).join("\n")}`,
    `Candidate's answer:\n${input.answer.slice(0, MAX_ANSWER_CHARS)}`,
  ].join("\n\n");

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const model = fastModel();
      const result = await generateText({
        model,
        system: SYSTEM,
        prompt,
        output: Output.object({ schema }),
        temperature: 0,
        providerOptions: NO_THINKING,
      });
      await recordUsage({
        userId: input.userId,
        route: "feed.grade",
        model: typeof model === "string" ? model : model.modelId,
        ...billedTokens(result.steps),
      });
      return { hits: result.output.hits };
    } catch (e) {
      console.error(`grading attempt ${attempt + 1} failed`, e);
    }
  }
  return { selfMark: true };
}
