import { z } from 'zod';
import { IdSchema, TimestampSchema } from './common.js';

export const MessageRoleSchema = z.enum(['user', 'ai']);
export type MessageRole = z.infer<typeof MessageRoleSchema>;

export const MessageTypeSchema = z.enum([
  'text',
  'survey',
  'factor_list',
  'explanation',
  // "上次回顾"卡片（PRD §3.11）— a special message pinned to the top of the
  // conversation; content holds the structured replay JSON.
  'replay_card',
]);
export type MessageType = z.infer<typeof MessageTypeSchema>;

export const MessageSchema = z.object({
  id: IdSchema,
  topicId: IdSchema,
  /**
   * The ThinkingSession this message belongs to (PRD §3.13 / 思路复现).
   * Old rows pre-date sessions; the desktop coalesces a NULL column to a
   * `'legacy'` sentinel on read so this stays a non-empty string.
   */
  sessionId: IdSchema,
  role: MessageRoleSchema,
  type: MessageTypeSchema,
  content: z.string(),
  anchors: z.array(IdSchema).optional(),
  mentions: z.array(IdSchema).optional(),
  createdAt: TimestampSchema,
});
export type Message = z.infer<typeof MessageSchema>;
