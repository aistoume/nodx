import type { NextMovePlan } from '@nodx/models';
import type { TerminalStatus } from './auto-recursion-policy.js';

// ──────────────────────────────────────────────────────────────────────
// Pure renderers for persisting a PM evaluation onto its Topic node
// (PRD §3.19 改进: 卡点前的推理不丢失). The run loop writes:
//   - planToMarkdown  → appended to the topic's thinking document
//   - planTraceLine   → appended to topic.reasoningTrace (思路复现)
// Kept free of DB/AI so they're unit-testable.
// ──────────────────────────────────────────────────────────────────────

const PLAN_STATUS_LABELS: Record<NextMovePlan['status'], string> = {
  atomic_complete: '✅ 已够原子',
  needs_deepening: '🔁 还需深挖',
  needs_real_world_data: '🌍 需真实世界数据',
  multi_path_choice: '🔀 多路径需择一',
};

const STOP_LABELS: Record<TerminalStatus, string> = {
  completed: '✅ 推进在此完成',
  paused_by_user: '⏸ 你在此层暂停了推进',
  budget_exhausted: '💸 预算耗尽，推进在此停止',
  depth_exhausted: '🪜 深度耗尽，推进在此停止',
  hit_real_world_block: '🌍 需要真实世界数据，推进在此诚实停止',
};

const ACTION_LABELS: Record<string, string> = {
  spawn_and_run: '深挖',
  spawn_only: '仅建话题',
  skip: '可跳过',
  flag_as_real_world_action: '外部行动',
};

export interface PlanRecordOptions {
  depth: number;
  /** Present when the run terminated at this layer. */
  stopStatus?: TerminalStatus;
  /** 研究员 web-search findings markdown, when a search ran this layer. */
  researchMarkdown?: string;
  /** Gaps still missing after research (becomes the 卡点 list shown). */
  stillMissing?: string[];
}

/**
 * Render one PM evaluation as a Markdown section for the topic's thinking
 * document — the durable "这层 AI 是怎么判断的" record.
 */
export function planToMarkdown(
  plan: NextMovePlan,
  opts: PlanRecordOptions,
): string {
  const parts: string[] = [
    `## 🤖 自动递进 · PM 评估（第 ${opts.depth} 层）`,
    `> ${PLAN_STATUS_LABELS[plan.status]} · 原子度 ${Math.round(plan.atomicityScore * 100)}%`,
  ];

  if (plan.whatsMissing.length > 0) {
    parts.push(
      '### 还缺什么才算原子',
      plan.whatsMissing.map((w) => `- ${w}`).join('\n'),
    );
  }

  if (plan.childCandidates.length > 0) {
    parts.push(
      '### 候选子话题（按可行性降序）',
      plan.childCandidates
        .map((c, i) => {
          const score = Math.round(c.feasibilityScore * 100);
          const deps = c.breakdown.dependencies.length
            ? `（依赖：${c.breakdown.dependencies.join('；')}）`
            : '';
          return `${i + 1}. **${c.title}** — ${score} 分 · ${ACTION_LABELS[c.recommendedAction] ?? c.recommendedAction}${deps}`;
        })
        .join('\n'),
    );
  }

  if (plan.topPick) {
    parts.push(
      `**PM 推荐**：${plan.topPick}${plan.topPickReasoning ? ` —— ${plan.topPickReasoning}` : ''}`,
    );
  }

  if (opts.researchMarkdown) {
    parts.push('### 🌐 网络搜索核实', opts.researchMarkdown.trim());
  }

  if (opts.stopStatus) {
    parts.push(`### ${STOP_LABELS[opts.stopStatus]}`);
    if (
      opts.stopStatus === 'hit_real_world_block' &&
      (opts.stillMissing?.length ?? 0) > 0
    ) {
      parts.push(
        '仍缺的真实世界数据（已登记为卡点）：',
        opts.stillMissing!.map((g) => `- 📍 ${g}`).join('\n'),
      );
    }
  }

  return parts.join('\n\n');
}

/** One compact reasoningTrace line per evaluation (思路复现 reads this). */
export function planTraceLine(
  plan: NextMovePlan,
  opts: Pick<PlanRecordOptions, 'depth' | 'stopStatus'>,
): string {
  const bits = [
    `[自动递进·第${opts.depth}层]`,
    `PM:${plan.status}`,
    `原子度${Math.round(plan.atomicityScore * 100)}%`,
  ];
  if (plan.topPick) bits.push(`推荐「${plan.topPick}」`);
  if (opts.stopStatus) bits.push(STOP_LABELS[opts.stopStatus]);
  return bits.join(' ');
}
