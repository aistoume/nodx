import { z } from 'zod';
import { IdSchema, TimestampSchema } from './common.js';
import { ChildCandidateSchema } from './child-candidate.js';

/**
 * PM's triage of a freshly-accepted Local Maximum (PRD §3.19):
 *   atomic_complete       — conclusion is atomic enough (who/what/when/
 *                           deliverable all present), stop here
 *   needs_deepening       — still needs digging (卡点 / forks identified)
 *   needs_real_world_data — thinking harder won't help; mark as external
 *                           atomic action and stop ("不是逃避，是诚实标记")
 *   multi_path_choice     — several parallel options need a pick
 */
export const NextMovePlanStatusSchema = z.enum([
  'atomic_complete',
  'needs_deepening',
  'needs_real_world_data',
  'multi_path_choice',
]);
export type NextMovePlanStatus = z.infer<typeof NextMovePlanStatusSchema>;

/**
 * The 项目经理 PM's output for one evaluated Topic: how atomic the current
 * conclusion is, what's missing, and (when deepening is warranted) up to 5
 * candidate child topics ranked by feasibility. `topPick` names the
 * highest-feasibility candidate's title; the orchestrator computes it from
 * the 评分员's breakdowns — the PM only drafts a qualitative pick.
 */
export const NextMovePlanSchema = z
  .object({
    id: IdSchema,
    /** The Topic whose Local Max was evaluated. */
    topicId: IdSchema,
    status: NextMovePlanStatusSchema,
    atomicityScore: z.number().min(0).max(1),
    /** What's missing before the conclusion counts as atomic. */
    whatsMissing: z.array(z.string().min(1)),
    /** Ranked candidates; only populated for needs_deepening / multi_path_choice. */
    childCandidates: z.array(ChildCandidateSchema).max(5),
    /** Title of the recommended candidate (highest feasibilityScore). */
    topPick: z.string().optional(),
    topPickReasoning: z.string().optional(),
    createdAt: TimestampSchema,
  })
  .strict();
export type NextMovePlan = z.infer<typeof NextMovePlanSchema>;
