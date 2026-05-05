/**
 * Model registry for nodx AI calls.
 *
 * Per PRD §5.4 we run two Claude tiers. Sonnet handles structured reasoning
 * (the AI's "苏格拉底追问者" + "收尾整理者" roles). Haiku is for cheap, low-latency
 * tasks like explaining a selected term or running the atomic checker on a
 * single sentence.
 *
 * Model IDs are kept here so the AI gateway worker (workers/ai-gateway) and
 * the desktop client agree on which model is invoked for a given prompt — and
 * so we can swap a model without grepping every prompt file.
 */
export const MODELS = {
  sonnet: 'claude-sonnet-4-6',
  haiku: 'claude-haiku-4-5',
  embedding: 'gemini-embedding-2',
} as const;

export type ModelTier = keyof typeof MODELS;
export type ModelId = (typeof MODELS)[ModelTier];
