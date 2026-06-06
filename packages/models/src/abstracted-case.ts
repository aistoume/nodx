import { z } from 'zod';
import { IdSchema, TimestampSchema } from './common.js';

/**
 * CBR pipeline (PRD §3.16). An AbstractedCase is the de-identified,
 * structured distillation of a Topic that reached `localMaximum` — the
 * reusable unit the case-based-reasoning retrieval works over.
 *
 * Produced by: 抽象师 (Sonnet) → problemSignature / reasoningPath /
 * solutionPattern / outcome; 索引器 then computes two embeddings (problem,
 * solution) and persists. Retrieval is NOT part of V1 Week 1.
 */

/** Embedding dimensionality — Gemini Embedding 2, MRL-truncated to 768. */
export const EMBEDDING_DIM = 768;

/** A single 768-dim embedding vector. */
export const EmbeddingSchema = z.array(z.number()).length(EMBEDDING_DIM);
export type Embedding = z.infer<typeof EmbeddingSchema>;

/**
 * The four canonical decision shapes a case can have (PRD §5 / §3.16).
 *   go_no_go   — do X or not
 *   allocation — how to split a finite resource
 *   sequencing — what order to do things in
 *   tradeoff   — pick among competing options
 */
export const DecisionTypeSchema = z.enum([
  'go_no_go',
  'allocation',
  'sequencing',
  'tradeoff',
]);
export type DecisionType = z.infer<typeof DecisionTypeSchema>;

/** Visibility tiers for a case (PRD §3.15 privacy layers). Default `private`. */
export const CaseVisibilitySchema = z.enum([
  'private',
  'team',
  'public_anonymous',
]);
export type CaseVisibility = z.infer<typeof CaseVisibilitySchema>;

/**
 * The "problem scene" — text-ified and embedded into `problemEmb`. This is
 * what a new query is matched against during semantic recall.
 */
export const ProblemSignatureSchema = z
  .object({
    domain: z.string().min(1),
    decisionType: DecisionTypeSchema,
    keyDimensions: z.array(z.string().min(1)),
    constraints: z.array(z.string().min(1)),
  })
  .strict();
export type ProblemSignature = z.infer<typeof ProblemSignatureSchema>;

/** How the decision was reasoned through — the transferable "method". */
export const ReasoningPathSchema = z
  .object({
    frameworks: z.array(z.string().min(1)),
    keyQuestions: z.array(z.string().min(1)),
    pivotalDecisions: z.array(z.string().min(1)),
  })
  .strict();
export type ReasoningPath = z.infer<typeof ReasoningPathSchema>;

/** The shape of the answer — text-ified and embedded into `solutionEmb`. */
export const SolutionPatternSchema = z
  .object({
    structure: z.string().min(1),
    keyLevers: z.array(z.string().min(1)),
    riskMitigations: z.array(z.string().min(1)),
  })
  .strict();
export type SolutionPattern = z.infer<typeof SolutionPatternSchema>;

/** How the case turned out — feeds reranking + quality gating. */
export const CaseOutcomeSchema = z
  .object({
    qualityScore: z.number().min(0).max(1),
    userFeedback: z.string().optional(),
  })
  .strict();
export type CaseOutcome = z.infer<typeof CaseOutcomeSchema>;

export const AbstractedCaseSchema = z
  .object({
    id: IdSchema,
    sourceTopicId: IdSchema,
    problemSignature: ProblemSignatureSchema,
    reasoningPath: ReasoningPathSchema,
    solutionPattern: SolutionPatternSchema,
    outcome: CaseOutcomeSchema,
    problemEmb: EmbeddingSchema,
    solutionEmb: EmbeddingSchema,
    visibility: CaseVisibilitySchema,
    freshnessDate: TimestampSchema,
    createdAt: TimestampSchema,
  })
  .strict();
export type AbstractedCase = z.infer<typeof AbstractedCaseSchema>;
