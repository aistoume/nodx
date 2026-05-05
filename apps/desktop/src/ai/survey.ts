import {
  DECOMPOSE_PROMPT_MODEL,
  DecomposeOutputSchema,
  SURVEY_PROMPT_MODEL,
  SurveyOutputSchema,
  buildDecomposePrompt,
  buildSurveyPrompt,
  type DecomposeOutput,
  type SurveyOutput,
} from '@nodx/ai';
import { ai } from './gateway.js';

/**
 * Generate the 5–7 candidate dimensions Survey shows on a brand-new topic
 * (PRD §2.1). The Zod schema in @nodx/ai enforces the count + structure,
 * so a model that returns "here are some thoughts: …" gets caught here
 * rather than rendering as a broken card.
 */
export async function generateSurvey(question: string): Promise<SurveyOutput> {
  const r = await ai.complete({
    prompt: buildSurveyPrompt({ question }),
    model: SURVEY_PROMPT_MODEL,
    maxTokens: 1500,
    schema: SurveyOutputSchema,
    temperature: 0.5,
  });
  return r.data;
}

/**
 * After the user picks 3–5 factors, fire the first-principles decomposition
 * (PRD §7.2). `context` lets us thread parent-topic summary in once we have
 * one — for the M1 baseline we pass empty string.
 */
export async function decomposeSelected(
  question: string,
  selectedFactorTitles: string[],
  context = '',
): Promise<DecomposeOutput> {
  const r = await ai.complete({
    prompt: buildDecomposePrompt({
      question,
      selectedFactors: selectedFactorTitles,
      context,
    }),
    model: DECOMPOSE_PROMPT_MODEL,
    maxTokens: 3000,
    schema: DecomposeOutputSchema,
    temperature: 0.4,
  });
  return r.data;
}
