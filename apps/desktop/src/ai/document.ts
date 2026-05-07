import {
  DOCUMENT_DRAFT_PROMPT_MODEL,
  REFINE_SELECTION_PROMPT_MODEL,
  buildDocumentDraftPrompt,
  buildRefineSelectionPrompt,
  type DecomposedFactor,
} from '@nodx/ai';
import { ai } from './gateway.js';

export interface GenerateDocumentInput {
  question: string;
  selectedFactors: string[];
  decomposed: DecomposedFactor[];
}

export interface GenerateDocumentResult {
  /** Raw markdown from the model — caller converts to HTML for the editor. */
  markdown: string;
  inputTokens: number;
  outputTokens: number;
}

export async function generateInitialDocument(
  input: GenerateDocumentInput,
): Promise<GenerateDocumentResult> {
  const r = await ai.completeText({
    prompt: buildDocumentDraftPrompt(input),
    model: DOCUMENT_DRAFT_PROMPT_MODEL,
    // Sonnet writing a full thinking doc with 3-5 H2 sections in Chinese
    // can easily run 2-4k output tokens. Pad to the worker's 8k cap.
    maxTokens: 8000,
    temperature: 0.6,
    // Doc draft routinely cites current data (prices, market sizing, recent
    // policy moves). Without web search the model is bounded by its training
    // cutoff and ends up speaking in 2024/2025 tense.
    enableWebSearch: true,
  });
  return {
    markdown: r.text.trim(),
    inputTokens: r.usage.inputTokens,
    outputTokens: r.usage.outputTokens,
  };
}

export interface RefineSelectionResult {
  markdown: string;
  inputTokens: number;
  outputTokens: number;
}

export async function refineSelection(
  fullDocument: string,
  selection: string,
  userQuestion: string,
): Promise<RefineSelectionResult> {
  const r = await ai.completeText({
    prompt: buildRefineSelectionPrompt({
      fullDocument,
      selection,
      userQuestion,
    }),
    model: REFINE_SELECTION_PROMPT_MODEL,
    maxTokens: 4000,
    temperature: 0.5,
    enableWebSearch: true,
  });
  return {
    markdown: r.text.trim(),
    inputTokens: r.usage.inputTokens,
    outputTokens: r.usage.outputTokens,
  };
}
