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
  isArchived: z.boolean(),
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
  meta: TopicMetaSchema,
  aiSummary: z.string().optional(),
  /**
   * AI-maintained condensed "reasoning path" — the core of 思路复现 (PRD
   * §3.11). Haiku appends/revises it at the end of each ThinkingSession;
   * the "上次回顾" replay card reads it instead of re-reading all history.
   */
  reasoningTrace: z.string().optional(),
  /**
   * Whether the Topic has any unresolved open_question (卡点). Drives the red
   * marker on the network graph (PRD §3.12). Defaults false; the DB column
   * carries DEFAULT 0 and the desktop recomputes it on卡点 create/resolve.
   */
  hasOpenQuestions: z.boolean().default(false),
});
export type Topic = z.infer<typeof TopicSchema>;
