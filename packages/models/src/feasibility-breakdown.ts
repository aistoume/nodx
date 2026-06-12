import { z } from 'zod';

/**
 * 可行性评分员 (Haiku) 5-dimension breakdown for one child-topic candidate
 * (PRD §3.19 / §4 自动递进). All scalar dimensions are 0–1; for
 * `resourceCost` / `timeToResolve` / `decisionRisk` LOWER is better, for
 * `value` HIGHER is better — the composite `feasibilityScore` on
 * ChildCandidate folds them accordingly.
 */
export const FeasibilityBreakdownSchema = z
  .object({
    resourceCost: z.number().min(0).max(1),
    timeToResolve: z.number().min(0).max(1),
    decisionRisk: z.number().min(0).max(1),
    value: z.number().min(0).max(1),
    /** What this candidate depends on (short phrases). */
    dependencies: z.array(z.string().min(1)),
  })
  .strict();
export type FeasibilityBreakdown = z.infer<typeof FeasibilityBreakdownSchema>;
