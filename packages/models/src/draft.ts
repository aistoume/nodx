import { z } from 'zod';
import { IdSchema, TimestampSchema } from './common.js';

export const DraftSourceSchema = z.object({
  topicId: IdSchema,
  messageId: IdSchema.optional(),
});
export type DraftSource = z.infer<typeof DraftSourceSchema>;

export const DraftItemSchema = z.object({
  id: IdSchema,
  source: DraftSourceSchema.nullable(),
  content: z.string().min(1, 'draft content must not be empty'),
  createdAt: TimestampSchema,
});
export type DraftItem = z.infer<typeof DraftItemSchema>;
