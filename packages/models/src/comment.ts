import { z } from 'zod';
import { IdSchema, TimestampSchema } from './common.js';

export const CommentTypeSchema = z.enum([
  'note',
  'explanation',
  'atomic',
  'reference',
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

export const CommentSchema = z
  .object({
    id: IdSchema,
    topicId: IdSchema,
    anchorId: IdSchema.nullable(),
    type: CommentTypeSchema,
    content: z.string(),
    atomicData: AtomicDataSchema.optional(),
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
  });
export type Comment = z.infer<typeof CommentSchema>;
