import { z } from 'zod';
import { FeasibilityBreakdownSchema } from './feasibility-breakdown.js';

/**
 * What the PM recommends doing with a candidate (PRD §3.19):
 *   spawn_and_run             — spawn the child topic AND run its expert panel
 *   spawn_only                — spawn but leave the debate to the user
 *   skip                      — not worth pursuing now
 *   flag_as_real_world_action — needs real-world data, mark as external
 *                               atomic action instead of thinking deeper
 */
export const RecommendedActionSchema = z.enum([
  'spawn_and_run',
  'spawn_only',
  'skip',
  'flag_as_real_world_action',
]);
export type RecommendedAction = z.infer<typeof RecommendedActionSchema>;

/**
 * One candidate child topic in a NextMovePlan. Exactly one of
 * `sourceOpenQuestion` / `sourceOptionChoice` is *typically* set (derived
 * from a 卡点 or a fork choice respectively) but the PRD keeps both
 * optional — a candidate can also come from the PM's own gap analysis.
 */
export const ChildCandidateSchema = z
  .object({
    title: z.string().min(1),
    /** Which open question (卡点) this candidate derives from, if any. */
    sourceOpenQuestion: z.string().optional(),
    /** Which fork/option choice this candidate derives from, if any. */
    sourceOptionChoice: z.string().optional(),
    /** Composite feasibility (0–1), computed from `breakdown` by the orchestrator. */
    feasibilityScore: z.number().min(0).max(1),
    breakdown: FeasibilityBreakdownSchema,
    recommendedAction: RecommendedActionSchema,
  })
  .strict();
export type ChildCandidate = z.infer<typeof ChildCandidateSchema>;
