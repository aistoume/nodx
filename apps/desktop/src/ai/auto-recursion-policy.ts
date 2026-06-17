import type { NextMovePlan } from '@nodx/models';

/**
 * Pure stop-condition policy for the auto-recursion state machine
 * (PRD §3.19 硬封顶). Kept free of DB/AI so it's unit-testable; the run
 * loop in ai/auto-recursion.ts is the only caller.
 */

export type TerminalStatus =
  | 'completed'
  | 'paused_by_user'
  | 'budget_exhausted'
  | 'depth_exhausted'
  | 'hit_real_world_block';

/**
 * After a PM plan lands: does the plan itself end the run?
 *   atomic_complete        → completed（够原子，目标达成）
 *   needs_real_world_data  → hit_real_world_block（标外部动作，停）
 *   no candidates          → completed（无路可走的退化情形，按完成收束）
 */
export function resolveStopAfterPlan(plan: NextMovePlan): TerminalStatus | null {
  if (plan.status === 'atomic_complete') return 'completed';
  if (plan.status === 'needs_real_world_data') return 'hit_real_world_block';
  if (plan.childCandidates.length === 0) return 'completed';
  return null;
}

export interface SpawnGateInput {
  spentUsd: number;
  budgetUsd: number;
  /** Depth the about-to-spawn child would sit at (current + 1). */
  nextDepth: number;
  depthLimit: number;
}

/**
 * Before spending on a spawn + debate: do the hard caps fire?
 * Budget is checked first — it's the contract users care most about.
 */
export function resolveStopBeforeSpawn(
  g: SpawnGateInput,
): TerminalStatus | null {
  if (g.spentUsd >= g.budgetUsd) return 'budget_exhausted';
  if (g.nextDepth > g.depthLimit) return 'depth_exhausted';
  return null;
}

/**
 * Resolve which candidate a 'continue' decision spawns: an explicit pick
 * wins, else the plan's topPick, else the highest-scoring candidate.
 * `excluded` titles (already tried then rolled back) are filtered out first.
 * Returns null when no eligible candidate remains.
 */
export function resolvePickedCandidate(
  plan: NextMovePlan,
  pickTitle?: string,
  excluded?: ReadonlySet<string>,
): NextMovePlan['childCandidates'][number] | null {
  const list = excluded
    ? plan.childCandidates.filter((c) => !excluded.has(c.title))
    : plan.childCandidates;
  if (list.length === 0) return null;
  if (pickTitle) {
    const hit = list.find((c) => c.title === pickTitle);
    if (hit) return hit;
  }
  if (plan.topPick) {
    const hit = list.find((c) => c.title === plan.topPick);
    if (hit) return hit;
  }
  return list[0]!;
}
