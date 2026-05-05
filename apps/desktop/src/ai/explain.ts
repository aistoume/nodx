import {
  ExplainOutputSchema,
  EXPLAIN_PROMPT_MODEL,
  buildExplainPrompt,
} from '@nodx/ai';
import { ai } from './gateway.js';

export interface ExplainResult {
  explanation: string;
  inputTokens: number;
  outputTokens: number;
}

/**
 * Take a user-selected term/phrase, ask Haiku for a 50–150 char explanation,
 * and return just the validated string. The Zod schema in `@nodx/ai`
 * guards length, so a model that ignores the format gets rejected here
 * rather than landing as junk in the right-panel annotation list.
 */
export async function explainSelection(
  selection: string,
  context?: string,
): Promise<ExplainResult> {
  const r = await ai.complete({
    prompt: buildExplainPrompt({ selection, context }),
    model: EXPLAIN_PROMPT_MODEL,
    maxTokens: 400,
    schema: ExplainOutputSchema,
    temperature: 0.3,
  });
  return {
    explanation: r.data.explanation,
    inputTokens: r.usage.inputTokens,
    outputTokens: r.usage.outputTokens,
  };
}
