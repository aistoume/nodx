/**
 * Model registry for nodx AI calls.
 *
 * Per PRD §5.4 we run two Claude tiers. The "sonnet" tier handles
 * structured reasoning (the AI's "苏格拉底追问者" + "收尾整理者" roles,
 * expert-panel debate, auto-recursion PM, CBR fusion, doc generation).
 * The "haiku" tier is for cheap, low-latency tasks like explaining a
 * selected term or running the atomic checker on a single sentence.
 *
 * ─── History ─────────────────────────────────────────────────────────
 *   pre-2026-07-08 : sonnet = claude-sonnet-4-6
 *   2026-07-08 →   : sonnet = claude-opus-4-8   (5x cost, quality bump)
 *
 * The key stays literally "sonnet" even though its value is now Opus —
 * renaming the type would touch every prompt module in the repo. The
 * key name is a semantic tier tag, not a literal model family.
 *
 * Model IDs are kept here so the AI gateway worker (workers/ai-gateway) and
 * the desktop client agree on which model is invoked for a given prompt — and
 * so we can swap a model without grepping every prompt file.
 */
export const MODELS = {
  /** Structured-reasoning tier. As of 2026-07-08: Claude Opus 4.8. */
  sonnet: 'claude-opus-4-8',
  /** Cheap fast tier. Haiku 4.5 is still the newest as of 2026-07-08. */
  haiku: 'claude-haiku-4-5',
  embedding: 'gemini-embedding-2',
} as const;

export type ModelTier = keyof typeof MODELS;
export type ModelId = (typeof MODELS)[ModelTier];
