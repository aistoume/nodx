import { z } from 'zod';
import { IdSchema, TimestampSchema } from './common.js';

export const MessageRoleSchema = z.enum(['user', 'ai']);
export type MessageRole = z.infer<typeof MessageRoleSchema>;

export const MessageTypeSchema = z.enum([
  'text',
  'survey',
  'factor_list',
  'explanation',
]);
export type MessageType = z.infer<typeof MessageTypeSchema>;

export const MessageSchema = z.object({
  id: IdSchema,
  topicId: IdSchema,
  role: MessageRoleSchema,
  type: MessageTypeSchema,
  content: z.string(),
  anchors: z.array(IdSchema).optional(),
  mentions: z.array(IdSchema).optional(),
  createdAt: TimestampSchema,
});
export type Message = z.infer<typeof MessageSchema>;
