import { z } from 'zod';
import { IdSchema, TimestampSchema } from './common.js';

export const TopicStatusSchema = z.enum([
  'exploring',
  'summarized',
  'atomic',
  'ghost',
]);
export type TopicStatus = z.infer<typeof TopicStatusSchema>;

export const TopicMetaSchema = z.object({
  messageCount: z.number().int().nonnegative(),
  childCount: z.number().int().nonnegative(),
  lastActivity: TimestampSchema,
});
export type TopicMeta = z.infer<typeof TopicMetaSchema>;

export const TopicSchema = z.object({
  id: IdSchema,
  parentId: IdSchema.nullable(),
  title: z.string().min(1, 'title must not be empty'),
  status: TopicStatusSchema,
  isPinned: z.boolean(),
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
  meta: TopicMetaSchema,
  aiSummary: z.string().optional(),
});
export type Topic = z.infer<typeof TopicSchema>;
