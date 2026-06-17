import {
  NextMovePlanSchema,
  type ChildCandidate,
  type LocalMaximumResult,
  type NextMovePlan,
  type Topic,
} from '@nodx/models';
import {
  PmOutputSchema,
  buildPmPrompt,
} from '../prompts/auto-recursion/pm.js';
import {
  computeFeasibilityScore,
  scoreFeasibility,
  type FeasibilityJudgeCall,
} from './feasibility-judge.js';

/**
 * Model-calling primitives for the PM evaluation, dependency-injected like
 * run-panel's PanelSteps: both return *parsed JSON* (unknown) and this
 * module validates. The desktop layer wires them to the gateway
 * (PM → Sonnet, judge → Haiku); tests pass fakes.
 */
export interface AutoRecursionSteps {
  runPm(prompt: string, signal?: AbortSignal): Promise<unknown>;
  runFeasibilityJudge: FeasibilityJudgeCall;
}

export interface PmParentContext {
  /** This evaluation's depth within the run (root = 0). */
  depth: number;
  /** Root → parent titles, so the PM avoids re-proposing ancestors. */
  ancestorTopicTitles: string[];
}

export interface GeneratePlanOptions {
  parentContext?: PmParentContext;
  /**
   * 研究员 findings to re-triage with after a needs_real_world_data verdict
   * (PRD §3.19 改进: search the web before honouring a real-world stop).
   */
  researchFindings?: string;
  signal?: AbortSignal;
}

/**
 * 项目经理 PM evaluation of one accepted Local Maximum (PRD §3.19, Sprint A):
 *
 *   1. PM (Sonnet) — status / atomicityScore / whatsMissing + candidate
 *      titles with a *qualitative* topPick draft (no numbers)
 *   2. 评分员 (Haiku) — one parallel call per candidate → 5-dim breakdown,
 *      composite feasibilityScore computed here
 *   3. Candidates sorted by score; topPick reset to the highest scorer
 *      (annotating the reasoning when that overrides the PM's draft)
 *   4. Validated NextMovePlan returned — NOT persisted (Sprint B owns
 *      the DB write and the spawn/orchestration state machine)
 *
 * Defensive guarantee: childCandidates only survive for needs_deepening /
 * multi_path_choice — for atomic_complete / needs_real_world_data any
 * stray PM candidates are dropped and no judge calls are spent.
 */
export async function generateNextMovePlan(
  topic: Topic,
  localMax: LocalMaximumResult,
  steps: AutoRecursionSteps,
  opts: GeneratePlanOptions = {},
): Promise<NextMovePlan> {
  const { parentContext, researchFindings, signal } = opts;
  const pmRaw = await steps.runPm(
    buildPmPrompt({
      topicTitle: topic.title,
      bestAnswer: localMax.bestAnswer,
      consensus: localMax.consensus,
      divergence: localMax.divergence,
      openQuestions: localMax.openQuestions,
      confidence: localMax.confidence,
      ...(parentContext ? { parentContext } : {}),
      ...(researchFindings ? { researchFindings } : {}),
    }),
    signal,
  );
  const pmParsed = PmOutputSchema.safeParse(pmRaw);
  if (!pmParsed.success) {
    throw new Error(`PM 输出不符合 PmOutputSchema：${pmParsed.error.message}`);
  }
  const pm = pmParsed.data;

  // Only deepening / fork statuses warrant candidates (PRD §3.19 分流);
  // anything the PM emitted for the stop statuses is dropped unscored.
  const allowChildren =
    pm.status === 'needs_deepening' || pm.status === 'multi_path_choice';
  const pmCandidates = allowChildren ? pm.childCandidates : [];

  const ctx = { topicTitle: topic.title, localMaxBest: localMax.bestAnswer };
  const scored: ChildCandidate[] = await Promise.all(
    pmCandidates.map(async (c) => {
      const breakdown = await scoreFeasibility(
        c.title,
        ctx,
        steps.runFeasibilityJudge,
        signal,
      );
      return {
        ...c,
        breakdown,
        feasibilityScore: computeFeasibilityScore(breakdown),
      };
    }),
  );
  scored.sort((a, b) => b.feasibilityScore - a.feasibilityScore);

  // topPick = highest feasibility; the PM's draft is qualitative only.
  let topPick: string | undefined;
  let topPickReasoning: string | undefined;
  const winner = scored[0];
  if (winner) {
    topPick = winner.title;
    topPickReasoning = pm.topPickReasoning;
    if (pm.topPick && pm.topPick !== winner.title) {
      const note = `[PM 原推荐：${pm.topPick}，被评分员分流改为 ${winner.title}]`;
      topPickReasoning = topPickReasoning
        ? `${topPickReasoning}\n${note}`
        : note;
    }
  }

  return NextMovePlanSchema.parse({
    id: crypto.randomUUID(),
    topicId: topic.id,
    status: pm.status,
    atomicityScore: pm.atomicityScore,
    whatsMissing: pm.whatsMissing,
    childCandidates: scored,
    ...(topPick !== undefined ? { topPick } : {}),
    ...(topPickReasoning !== undefined ? { topPickReasoning } : {}),
    createdAt: Date.now(),
  });
}
