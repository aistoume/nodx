import { z } from 'zod';
import { IdSchema, TimestampSchema } from './common.js';

/**
 * How the engine advances between layers (PRD §3.19):
 *   pilot     — PM proposes, user manually picks what to spawn
 *   auto_step — spawn topPick automatically, but WAIT for user confirm
 *               between layers (the default)
 *   auto_run  — recurse along topPick fully automatically until a stop
 *               condition; never the default, needs explicit opt-in
 */
export const AutoRecursionModeSchema = z.enum([
  'pilot',
  'auto_step',
  'auto_run',
]);
export type AutoRecursionMode = z.infer<typeof AutoRecursionModeSchema>;

/**
 * Terminal states record WHY the run stopped — the hard caps are part of
 * the product contract (PRD §3.19 防失控 / §11 风险表), so they're explicit
 * statuses rather than a generic 'stopped' + reason string.
 */
export const AutoRecursionStatusSchema = z.enum([
  'running',
  'paused_by_user',
  'completed',
  'budget_exhausted',
  'depth_exhausted',
  'hit_real_world_block',
]);
export type AutoRecursionStatus = z.infer<typeof AutoRecursionStatusSchema>;

/**
 * A user (Chair) intervention during a run — the §3.19 anchor that the
 * user can always interrupt / redirect / roll back.
 */
export const RunInterruptionSchema = z
  .object({
    topicId: IdSchema,
    action: z.enum(['redirected', 'paused', 'rolled_back']),
    at: TimestampSchema,
  })
  .strict();
export type RunInterruption = z.infer<typeof RunInterruptionSchema>;

/**
 * One auto-recursion run over a root topic: mode + hard caps going in,
 * spend / depth / spawned-topics accounting coming out. Budget defaults
 * to $5 and depth to 4 (PRD §3.19) — defaults live in the DB layer; the
 * schema just validates shape.
 */
export const AutoRecursionRunSchema = z
  .object({
    id: IdSchema,
    rootTopicId: IdSchema,
    mode: AutoRecursionModeSchema,
    /** Hard budget cap in USD for this run (default 5.0). */
    budgetUsd: z.number().nonnegative(),
    /** Hard depth cap (default 4). */
    depthLimit: z.number().int().positive(),
    startedAt: TimestampSchema,
    endedAt: TimestampSchema.optional(),
    status: AutoRecursionStatusSchema,
    totalSpentUsd: z.number().nonnegative(),
    maxDepthReached: z.number().int().nonnegative(),
    /** Every Topic this run created, for rollback / path visualisation. */
    spawnedTopicIds: z.array(IdSchema),
    interruptions: z.array(RunInterruptionSchema),
  })
  .strict();
export type AutoRecursionRun = z.infer<typeof AutoRecursionRunSchema>;
