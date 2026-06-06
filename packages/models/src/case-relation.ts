import { z } from 'zod';
import { IdSchema, TimestampSchema } from './common.js';

/**
 * Simplified GraphRAG (PRD §3.18). Case-to-case edges live in a plain
 * relation table (no graph DB) and are queried with recursive CTEs. Edges
 * are computed once by the 关系发现者 (Sonnet) right after a case is
 * abstracted.
 */
export const CaseRelationTypeSchema = z.enum([
  'shares_framework',
  'shares_domain',
  'contrasts',
  'composed_from',
  'caused_by',
]);
export type CaseRelationType = z.infer<typeof CaseRelationTypeSchema>;

export const CaseRelationSchema = z
  .object({
    id: IdSchema,
    sourceCaseId: IdSchema,
    targetCaseId: IdSchema,
    relationType: CaseRelationTypeSchema,
    weight: z.number().min(0).max(1),
    createdAt: TimestampSchema,
  })
  .strict()
  .refine((r) => r.sourceCaseId !== r.targetCaseId, {
    message: 'a case cannot relate to itself',
  });
export type CaseRelation = z.infer<typeof CaseRelationSchema>;
