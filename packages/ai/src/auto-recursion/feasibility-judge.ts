import {
  FeasibilityBreakdownSchema,
  type FeasibilityBreakdown,
} from '@nodx/models';
import { buildFeasibilityJudgePrompt } from '../prompts/auto-recursion/feasibility-judge.js';

/**
 * One model call for the 评分员 — returns the *parsed JSON* (unknown; this
 * module validates). The desktop layer wires this to the gateway (Haiku);
 * tests pass a fake. Same dependency-injection style as run-panel's
 * PanelSteps — packages/ai stays network-free.
 */
export type FeasibilityJudgeCall = (
  prompt: string,
  signal?: AbortSignal,
) => Promise<unknown>;

/**
 * Composite feasibility from the 5-dim breakdown (PRD §3.19):
 * cost/time/risk count inverted (lower is better) at 0.2/0.2/0.3,
 * value counts directly at 0.3. Clamped for float-sum safety so it
 * always satisfies ChildCandidateSchema's 0–1 bound.
 */
export function computeFeasibilityScore(b: FeasibilityBreakdown): number {
  const score =
    (1 - b.resourceCost) * 0.2 +
    (1 - b.timeToResolve) * 0.2 +
    (1 - b.decisionRisk) * 0.3 +
    b.value * 0.3;
  return Math.min(1, Math.max(0, score));
}

/**
 * Score one candidate child topic: build the tight Haiku prompt, run the
 * injected judge call, validate the breakdown against the models schema.
 */
export async function scoreFeasibility(
  candidateTitle: string,
  topicContext: { topicTitle: string; localMaxBest: string },
  judge: FeasibilityJudgeCall,
  signal?: AbortSignal,
): Promise<FeasibilityBreakdown> {
  const raw = await judge(
    buildFeasibilityJudgePrompt({
      candidateTitle,
      topicTitle: topicContext.topicTitle,
      localMaxBest: topicContext.localMaxBest,
    }),
    signal,
  );
  const parsed = FeasibilityBreakdownSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(
      `评分员输出不符合 FeasibilityBreakdown（候选「${candidateTitle}」）：${parsed.error.message}`,
    );
  }
  return parsed.data;
}
