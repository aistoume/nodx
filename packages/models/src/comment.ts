import { z } from 'zod';
import { IdSchema, TimestampSchema } from './common.js';

export const CommentTypeSchema = z.enum([
  'note',
  'explanation',
  'atomic',
  'reference',
  // 卡点 / stuck point (PRD §3.12) — a structured "I'm stuck here" marker.
  'open_question',
]);
export type CommentType = z.infer<typeof CommentTypeSchema>;

export const AtomicDataSchema = z.object({
  who: z.string().min(1),
  what: z.string().min(1),
  when: z.string().min(1),
  deliverable: z.string().min(1),
  isComplete: z.boolean(),
});
export type AtomicData = z.infer<typeof AtomicDataSchema>;

/** Structured payload for a 卡点 (PRD §3.12). */
export const OpenQuestionDataSchema = z.object({
  /** The unresolved question. */
  question: z.string().min(1),
  /** Why it's stuck (缺数据 / 缺判断 / 缺共识 …). */
  blockedReason: z.string().optional(),
  /** When resolved (absent = still open). */
  resolvedAt: TimestampSchema.optional(),
});
export type OpenQuestionData = z.infer<typeof OpenQuestionDataSchema>;

export const CommentSchema = z
  .object({
    id: IdSchema,
    topicId: IdSchema,
    anchorId: IdSchema.nullable(),
    type: CommentTypeSchema,
    content: z.string(),
    atomicData: AtomicDataSchema.optional(),
    openQuestionData: OpenQuestionDataSchema.optional(),
    createdAt: TimestampSchema,
  })
  .superRefine((value, ctx) => {
    if (value.type === 'atomic' && !value.atomicData) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'atomicData is required when type is "atomic"',
        path: ['atomicData'],
      });
    }
    if (value.type !== 'atomic' && value.atomicData) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'atomicData is only allowed when type is "atomic"',
        path: ['atomicData'],
      });
    }
    if (value.type === 'open_question' && !value.openQuestionData) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'openQuestionData is required when type is "open_question"',
        path: ['openQuestionData'],
      });
    }
    if (value.type !== 'open_question' && value.openQuestionData) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'openQuestionData is only allowed when type is "open_question"',
        path: ['openQuestionData'],
      });
    }
  });
export type Comment = z.infer<typeof CommentSchema>;
