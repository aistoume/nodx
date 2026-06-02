import { z } from 'zod';
import { TimestampSchema } from './common.js';

/**
 * One point on which experts disagreed, paired with the precondition
 * that would flip the call. e.g. point="6 个月时间窗是否合理",
 * conditions="若 Q3 末现金流低于 X 美元则窗口仍合理".
 */
export const DivergenceItemSchema = z
  .object({
    point: z.string().min(1),
    conditions: z.string().min(1),
  })
  .strict();
export type DivergenceItem = z.infer<typeof DivergenceItemSchema>;

/**
 * Output of the synthesis round — the panel's "Local Maximum" answer
 * for one direction. `bestAnswer` flows back into the Topic's
 * `aiSummary`; `openQuestions` becomes `Comment.type='open_question'`
 * entries (PRD §3.14 → §3.12 wiring).
 *
 * Persisted by flattening into the `expert_panels` row (only one
 * Local Max per panel, so a sub-table is overkill).
 */
export const LocalMaximumResultSchema = z
  .object({
    consensus: z.array(z.string().min(1)),
    divergence: z.array(DivergenceItemSchema),
    openQuestions: z.array(z.string().min(1)),
    bestAnswer: z.string().min(1),
    confidence: z.number().min(0).max(1),
    acceptedByUser: z.boolean(),
    acceptedAt: TimestampSchema.optional(),
  })
  .strict();
export type LocalMaximumResult = z.infer<typeof LocalMaximumResultSchema>;
