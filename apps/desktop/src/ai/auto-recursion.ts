import {
  FEASIBILITY_JUDGE_PROMPT_MODEL,
  PM_PROMPT_MODEL,
  PmOutputSchema,
  RESEARCHER_PROMPT_MODEL,
  RESEARCH_VERDICT_PROMPT_MODEL,
  ResearchVerdictSchema,
  buildResearcherPrompt,
  buildResearchVerdictPrompt,
  generateNextMovePlan,
  type AutoRecursionSteps,
} from '@nodx/ai';
import {
  FeasibilityBreakdownSchema,
  type AutoRecursionMode,
  type AutoRecursionRun,
  type LocalMaximumResult,
  type NextMovePlan,
  type Topic,
} from '@nodx/models';
import { ai, onAiUsage } from './gateway.js';
import { estimateUsd } from './pricing.js';
import {
  resolvePickedCandidate,
  resolveStopAfterPlan,
  resolveStopBeforeSpawn,
  type TerminalStatus,
} from './auto-recursion-policy.js';
import { planToMarkdown, planTraceLine } from './plan-record.js';
import {
  addInterruption,
  addRunSpend,
  createRun,
  finishRun,
  getRun,
  insertNextMovePlan,
  recordSpawnedTopic,
  setTopicAutoRecursionLineage,
} from '../db/auto-recursion.js';
import { appendReasoningTrace, archiveTopic, createTopic } from '../db/topics.js';
import { appendToDocument, getDocument } from '../db/documents.js';
import { createOpenQuestion } from '../db/comments.js';
import { markdownToHtml } from '../lib/markdown.js';
import { acceptLocalMaximum, runPanelForTopic } from './panel.js';

// ──────────────────────────────────────────────────────────────────────
// 自动递进引擎 run loop (PRD §3.19, Sprint B).
//
//   accepted Local Max → PM evaluates → plan persisted → path preview
//   (user decides) → spawn topPick child (+lineage) → expert panel debates
//   it → auto-accept its Local Max → recurse … until a stop condition.
//
// Modes this sprint: pilot (PM proposes, user picks spawns, no auto debate)
// and auto_step (spawn topPick + debate, ONE layer per user confirm).
// auto_run is Sprint C (needs 3s-dismiss preview + rollback).
//
// Budget metering: real token usage via the gateway tap (ai/gateway.ts
// onAiUsage) priced through ai/pricing.ts — covers PM, judges, and the
// whole child panel debate. CBR ingestion of auto-accepted Local Maxes is
// deferred to Sprint C (keeps per-layer cost lean and predictable).
// ──────────────────────────────────────────────────────────────────────

/** What the user chose on a path-preview card. */
export type LayerDecision =
  | { kind: 'continue'; pickTitle?: string }
  | { kind: 'spawn_selected'; titles: string[] }
  | { kind: 'rollback' }
  | { kind: 'stop' };

export interface PlanView {
  run: AutoRecursionRun;
  depth: number;
  /** Root → current topic titles (推理链快照). */
  chain: string[];
  topic: Topic;
  plan: NextMovePlan;
  /** Live spend so far, USD. */
  spentUsd: number;
  /** The run's mode — drives the modal's auto-proceed (auto_run) vs wait. */
  mode: AutoRecursionMode;
  /** True when there's a parent layer to roll back to (打回上一层). */
  canRollback: boolean;
  /** Candidate titles already tried at this layer then rolled back (greyed). */
  excludedTitles: string[];
}

/** Shown when the run is about to terminate abnormally (卡点/暂停/封顶). */
export interface StopRecordView {
  topic: Topic;
  plan: NextMovePlan;
  stopStatus: TerminalStatus;
  depth: number;
  /** 卡点 entries that would be created (real-world stops only). */
  blockers: string[];
  /** True when web-research findings would be saved along. */
  hasResearch: boolean;
}

export interface RunController {
  /** Streaming status line ("第 2 层：专家组辩论中…"). */
  onPhase?(text: string): void;
  /** 路径预览: resolve with the user's decision for this layer. */
  onPlanReady(view: PlanView): Promise<LayerDecision>;
  /**
   * Abnormal stop: ask whether to save the layer record (doc 节 + trace +
   * 卡点) onto the node. Resolve false to skip — the plan row in
   * next_move_plans is kept either way. Omitted ⇒ always save.
   * (`completed` stops save silently without asking.)
   */
  onStopRecord?(view: StopRecordView): Promise<boolean>;
  /** Fired whenever run accounting (spend / spawned) changes. */
  onRunUpdate?(run: AutoRecursionRun): void;
}

export interface StartRunInput {
  rootTopic: Topic;
  /** The accepted Local Max that triggered 「采纳并推进」. */
  localMax: LocalMaximumResult;
  /** pilot / auto_step / auto_run (the modal gates auto_run behind a confirm). */
  mode: AutoRecursionMode;
  budgetUsd: number;
  depthLimit: number;
  /**
   * needs_real_world_data 时先网络搜索核实缺口，确实查不到才停
   * (PRD §3.19 改进). Default true in the UI.
   */
  webResearch: boolean;
}

/**
 * One layer's research pass: findings markdown + the resolved verdict. The
 * judge returns gap *numbers* (tiny output, no truncation); we map them back
 * to the full gap strings here so 卡点 / docs keep the detailed text.
 */
interface ResolvedVerdict {
  resolvedGaps: string[];
  stillMissing: string[];
  verdict: 'resolved_enough' | 'still_blocked';
}
interface ResearchResult {
  markdown: string;
  verdict: ResolvedVerdict;
}

/** 研究员: web-search the PM's data gaps, then judge what's still missing. */
async function runWebResearch(
  topicTitle: string,
  bestAnswer: string,
  gaps: string[],
): Promise<ResearchResult> {
  const findings = await ai.completeTextUntilDone({
    prompt: buildResearcherPrompt({ topicTitle, bestAnswer, gaps }),
    model: RESEARCHER_PROMPT_MODEL,
    maxTokens: 4000,
    maxContinuations: 2,
    temperature: 0.3,
    enableWebSearch: true,
  });
  const verdict = await ai.complete({
    prompt: buildResearchVerdictPrompt({
      gaps,
      findingsMarkdown: findings.text,
    }),
    model: RESEARCH_VERDICT_PROMPT_MODEL,
    maxTokens: 600,
    schema: ResearchVerdictSchema,
    temperature: 0.1,
  });
  // Map 1-based gap numbers → full gap text (ignore out-of-range / dupes).
  const toGaps = (nums: number[]): string[] => {
    const seen = new Set<number>();
    const out: string[] = [];
    for (const n of nums) {
      if (n >= 1 && n <= gaps.length && !seen.has(n)) {
        seen.add(n);
        out.push(gaps[n - 1]!);
      }
    }
    return out;
  };
  return {
    markdown: findings.text.trim(),
    verdict: {
      resolvedGaps: toGaps(verdict.data.resolvedGaps),
      stillMissing: toGaps(verdict.data.stillMissing),
      verdict: verdict.data.verdict,
    },
  };
}

/**
 * Persist one layer's PM evaluation onto its Topic node so nothing is lost
 * when the run stops (PRD §3.19 改进):
 *   - reasoningTrace gets a compact line (思路复现 picks it up)
 *   - the thinking document gets the full record — appended when the doc
 *     exists; CREATED when the run terminates here (the record is then the
 *     node's most relevant content). Mid-run docless children skip the doc
 *     so the focused-doc auto-generation on first open stays intact.
 *   - a real-world stop turns the remaining gaps into 卡点 (open_question
 *     comments → red cards in the right panel + global badge)
 */
async function recordPlanAtNode(
  topic: Topic,
  plan: NextMovePlan,
  opts: {
    depth: number;
    stopStatus?: TerminalStatus;
    research?: ResearchResult | null;
    /** Override the 卡点 list (e.g. the picked external-action candidate). */
    blockers?: string[];
  },
): Promise<void> {
  const stillMissing = opts.blockers ?? opts.research?.verdict.stillMissing;
  await appendReasoningTrace(
    topic.id,
    planTraceLine(plan, { depth: opts.depth, stopStatus: opts.stopStatus }),
  );

  const doc = await getDocument(topic.id);
  if (doc || opts.stopStatus) {
    const md = planToMarkdown(plan, {
      depth: opts.depth,
      ...(opts.stopStatus ? { stopStatus: opts.stopStatus } : {}),
      ...(opts.research ? { researchMarkdown: opts.research.markdown } : {}),
      ...(stillMissing ? { stillMissing } : {}),
    });
    await appendToDocument(topic.id, markdownToHtml(md));
  }

  if (opts.stopStatus === 'hit_real_world_block') {
    const gaps = (stillMissing ?? plan.whatsMissing).slice(0, 8);
    for (const g of gaps) {
      await createOpenQuestion({
        topicId: topic.id,
        anchorId: null,
        question: g,
        blockedReason: '自动递进：需要真实世界数据，AI 无法推演',
      });
    }
  }
}

/** Real gateway wiring for the Sprint-A engine's DI steps. */
const steps: AutoRecursionSteps = {
  runPm: (prompt) =>
    ai
      .complete({
        prompt,
        model: PM_PROMPT_MODEL,
        maxTokens: 2500,
        schema: PmOutputSchema,
        temperature: 0.3,
      })
      .then((r) => r.data),
  runFeasibilityJudge: (prompt) =>
    ai
      .complete({
        prompt,
        model: FEASIBILITY_JUDGE_PROMPT_MODEL,
        maxTokens: 400,
        schema: FeasibilityBreakdownSchema,
        temperature: 0.2,
      })
      .then((r) => r.data),
};

/**
 * Drive one auto-recursion run to a terminal status. Returns the final
 * hydrated run row. Throws only on unexpected failures (AI/DB errors);
 * every *policy* outcome ends gracefully via `finishRun`.
 */
export async function startAutoRecursionRun(
  input: StartRunInput,
  controller: RunController,
): Promise<AutoRecursionRun> {
  const run = await createRun({
    rootTopicId: input.rootTopic.id,
    mode: input.mode,
    budgetUsd: input.budgetUsd,
    depthLimit: input.depthLimit,
  });

  // Meter every AI call made while this run is active (PM + judges + the
  // child panels). Spend lands on the run row AND a local mirror so the
  // budget gate doesn't need a DB roundtrip per check.
  let spentUsd = 0;
  const unsubscribe = onAiUsage((model, usage) => {
    const usd = estimateUsd(model, usage);
    spentUsd += usd;
    void addRunSpend(run.id, usd);
  });

  const phase = (t: string) => controller.onPhase?.(t);
  const finish = async (status: TerminalStatus): Promise<AutoRecursionRun> => {
    await finishRun(run.id, status);
    const final = await getRun(run.id);
    if (!final) throw new Error(`run ${run.id} vanished`);
    controller.onRunUpdate?.(final);
    return final;
  };

  /**
   * Terminal stop: for abnormal stops ask the user whether to persist the
   * layer record onto the node (改进: 手动选择保存); `completed` saves
   * silently. Declining keeps the plan row only — node untouched.
   */
  const stopAndRecord = async (
    topic: Topic,
    plan: NextMovePlan,
    opts: {
      depth: number;
      stopStatus: TerminalStatus;
      research?: ResearchResult | null;
      blockers?: string[];
    },
  ): Promise<AutoRecursionRun> => {
    const blockers =
      opts.blockers ??
      opts.research?.verdict.stillMissing ??
      (opts.stopStatus === 'hit_real_world_block' ? plan.whatsMissing : []);
    const save =
      opts.stopStatus === 'completed'
        ? true
        : ((await controller.onStopRecord?.({
            topic,
            plan,
            stopStatus: opts.stopStatus,
            depth: opts.depth,
            blockers: blockers.slice(0, 8),
            hasResearch: !!opts.research,
          })) ?? true);
    if (save) await recordPlanAtNode(topic, plan, opts);
    return finish(opts.stopStatus);
  };

  // One evaluated layer. `excluded` accumulates candidates tried then rolled
  // back; `spawnedFromTitle` is the parent's pick that led here (for rollback).
  interface DescentFrame {
    topic: Topic;
    localMax: LocalMaximumResult;
    depth: number;
    chain: string[];
    plan: NextMovePlan;
    research: ResearchResult | null;
    excluded: Set<string>;
    spawnedFromTitle?: string;
  }

  /** PM-evaluate a layer (+ optional web research). null ⇒ a planStop fired. */
  const evaluateLayer = async (
    topic: Topic,
    localMax: LocalMaximumResult,
    depth: number,
    chain: string[],
    spawnedFromTitle?: string,
  ): Promise<DescentFrame | { stop: TerminalStatus; topic: Topic; depth: number; plan: NextMovePlan; research: ResearchResult | null }> => {
    phase(`第 ${depth} 层「${topic.title}」：PM 评估原子度…`);
    const parentContext =
      depth > 0 ? { depth, ancestorTopicTitles: chain.slice(0, -1) } : undefined;
    let plan = await generateNextMovePlan(topic, localMax, steps, {
      ...(parentContext ? { parentContext } : {}),
    });
    await insertNextMovePlan(plan);
    controller.onRunUpdate?.((await getRun(run.id)) ?? run);

    // 改进②: real-world verdict → one web-research pass, then re-triage.
    let research: ResearchResult | null = null;
    if (plan.status === 'needs_real_world_data' && input.webResearch) {
      phase(`🌐 第 ${depth} 层：网络搜索核实 ${plan.whatsMissing.length} 个数据缺口…`);
      research = await runWebResearch(topic.title, localMax.bestAnswer, plan.whatsMissing);
      controller.onRunUpdate?.((await getRun(run.id)) ?? run);
      if (research.verdict.verdict === 'resolved_enough') {
        phase(`🌐 搜索补齐 ${research.verdict.resolvedGaps.length} 个缺口，PM 重新评估…`);
        plan = await generateNextMovePlan(topic, localMax, steps, {
          ...(parentContext ? { parentContext } : {}),
          researchFindings: research.markdown,
        });
        await insertNextMovePlan(plan);
        controller.onRunUpdate?.((await getRun(run.id)) ?? run);
      }
    }

    const planStop = resolveStopAfterPlan(plan);
    if (planStop) return { stop: planStop, topic, depth, plan, research };
    return {
      topic,
      localMax,
      depth,
      chain,
      plan,
      research,
      excluded: new Set(),
      ...(spawnedFromTitle ? { spawnedFromTitle } : {}),
    };
  };

  try {
    const stack: DescentFrame[] = [];
    let evald = await evaluateLayer(
      input.rootTopic,
      input.localMax,
      0,
      [input.rootTopic.title],
    );

    for (;;) {
      // A planStop at this layer ends the run (records onto the node).
      if ('stop' in evald) {
        return await stopAndRecord(evald.topic, evald.plan, {
          depth: evald.depth,
          stopStatus: evald.stop,
          research: evald.research,
        });
      }
      const frame = evald;

      const decision = await controller.onPlanReady({
        run,
        depth: frame.depth,
        chain: [...frame.chain],
        topic: frame.topic,
        plan: frame.plan,
        spentUsd,
        mode: input.mode,
        canRollback: stack.length > 0,
        excludedTitles: [...frame.excluded],
      });

      if (decision.kind === 'stop') {
        await addInterruption(run.id, {
          topicId: frame.topic.id,
          action: 'paused',
          at: Date.now(),
        });
        return await stopAndRecord(frame.topic, frame.plan, {
          depth: frame.depth,
          stopStatus: 'paused_by_user',
          research: frame.research,
        });
      }

      // 打回上一层 (auto_run guardrail, PRD §3.19): archive the just-spawned
      // child, return to the parent layer, exclude the candidate that led
      // here, and re-show the parent preview so the user picks differently.
      if (decision.kind === 'rollback') {
        if (stack.length === 0) continue; // nothing above; re-show (UI hides btn)
        phase(`↩ 打回上一层，撤销「${frame.topic.title}」…`);
        await archiveTopic(frame.topic.id);
        await addInterruption(run.id, {
          topicId: frame.topic.id,
          action: 'rolled_back',
          at: Date.now(),
        });
        const parent = stack.pop()!;
        if (frame.spawnedFromTitle) parent.excluded.add(frame.spawnedFromTitle);
        controller.onRunUpdate?.((await getRun(run.id)) ?? run);
        evald = parent;
        continue;
      }

      // Pilot: spawn the user's picks (no auto debates), then the run is done.
      if (decision.kind === 'spawn_selected') {
        for (const title of decision.titles) {
          phase(`spawn 子话题「${title}」…`);
          const child = await createTopic({ title, parentId: frame.topic.id });
          await setTopicAutoRecursionLineage(child.id, {
            runId: run.id,
            depth: frame.depth + 1,
            planId: frame.plan.id,
          });
          await recordSpawnedTopic(run.id, child.id, frame.depth + 1);
        }
        return await stopAndRecord(frame.topic, frame.plan, {
          depth: frame.depth,
          stopStatus: 'completed',
          research: frame.research,
        });
      }

      // continue —
      const picked = resolvePickedCandidate(
        frame.plan,
        decision.pickTitle,
        frame.excluded,
      );
      if (!picked) {
        return await stopAndRecord(frame.topic, frame.plan, {
          depth: frame.depth,
          stopStatus: 'completed',
          research: frame.research,
        });
      }
      if (picked.recommendedAction === 'flag_as_real_world_action') {
        return await stopAndRecord(frame.topic, frame.plan, {
          depth: frame.depth,
          stopStatus: 'hit_real_world_block',
          research: frame.research,
          blockers: [picked.sourceOpenQuestion ?? picked.title],
        });
      }

      const capStop = resolveStopBeforeSpawn({
        spentUsd,
        budgetUsd: run.budgetUsd,
        nextDepth: frame.depth + 1,
        depthLimit: run.depthLimit,
      });
      if (capStop) {
        return await stopAndRecord(frame.topic, frame.plan, {
          depth: frame.depth,
          stopStatus: capStop,
          research: frame.research,
        });
      }

      // Record this layer onto its node before descending (改进①).
      await recordPlanAtNode(frame.topic, frame.plan, {
        depth: frame.depth,
        research: frame.research,
      });

      phase(`spawn 子话题「${picked.title}」…`);
      const child = await createTopic({
        title: picked.title,
        parentId: frame.topic.id,
      });
      await setTopicAutoRecursionLineage(child.id, {
        runId: run.id,
        depth: frame.depth + 1,
        planId: frame.plan.id,
      });
      await recordSpawnedTopic(run.id, child.id, frame.depth + 1);
      controller.onRunUpdate?.((await getRun(run.id)) ?? run);

      phase(
        `第 ${frame.depth + 1} 层「${picked.title}」：专家组辩论中（多轮并行，约数分钟）…`,
      );
      const panel = await runPanelForTopic(child, frame.localMax.bestAnswer);
      if (!panel.localMaximum) {
        throw new Error(`子话题「${picked.title}」的专家组未产出 Local Maximum`);
      }
      await acceptLocalMaximum(panel.id);

      stack.push(frame);
      evald = await evaluateLayer(
        child,
        panel.localMaximum,
        frame.depth + 1,
        [...frame.chain, child.title],
        picked.title,
      );
    }
  } finally {
    unsubscribe();
  }
}
