import { z } from 'zod';
import { IdSchema, TimestampSchema } from './common.js';

export const TopicStatusSchema = z.enum([
  'exploring',
  'summarized',
  'atomic',
  'ghost',
]);
export type TopicStatus = z.infer<typeof TopicStatusSchema>;

/**
 * A Topic is one of two node kinds (feature: 思考/执行 拆分):
 *   thinking  — deliberation: the exploratory reasoning (the default; all
 *               pre-existing topics are thinking nodes).
 *   execution — a concrete action plan split out of a thinking node via
 *               「拆出执行」. Holds a structured 行动清单 (who/what/when/
 *               deliverable), typically status='atomic'.
 */
export const TopicNodeKindSchema = z.enum(['thinking', 'execution']);
export type TopicNodeKind = z.infer<typeof TopicNodeKindSchema>;

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
  /**
   * 自动递进引擎 (PRD §3.19) lineage — set only on Topics spawned by a run:
   * which AutoRecursionRun created this Topic (for rollback / path tree),
   * how deep it sits within that run, and which NextMovePlan picked it.
   */
  generatedByAutoRecursionRunId: IdSchema.optional(),
  autoRecursionDepth: z.number().int().nonnegative().optional(),
  parentNextMovePlanId: IdSchema.optional(),
  /**
   * 思考 vs 执行 node kind (default 'thinking'; DB column DEFAULT 'thinking'
   * backfills every existing row). Execution nodes are split out of a
   * thinking node's action plan via 「拆出执行」.
   */
  nodeKind: TopicNodeKindSchema.default('thinking'),
});
export type Topic = z.infer<typeof TopicSchema>;
