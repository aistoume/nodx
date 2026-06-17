import { describe, expect, it } from 'vitest';
import type { NextMovePlan } from '@nodx/models';
import { planToMarkdown, planTraceLine } from './plan-record.js';

const plan: NextMovePlan = {
  id: 'p1',
  topicId: 't1',
  status: 'multi_path_choice',
  atomicityScore: 0.38,
  whatsMissing: ['未指定负责人', '三个前提问题未回答'],
  childCandidates: [
    {
      title: '前置三问收敛',
      feasibilityScore: 0.92,
      breakdown: {
        resourceCost: 0.1,
        timeToResolve: 0.15,
        decisionRisk: 0.05,
        value: 0.95,
        dependencies: [],
      },
      recommendedAction: 'spawn_and_run',
    },
    {
      title: 'Polygon 能力核查',
      feasibilityScore: 0.5,
      breakdown: {
        resourceCost: 0.3,
        timeToResolve: 0.4,
        decisionRisk: 0.7,
        value: 0.5,
        dependencies: ['已确认主数据源'],
      },
      recommendedAction: 'flag_as_real_world_action',
    },
  ],
  topPick: '前置三问收敛',
  topPickReasoning: '最低成本的解锁动作',
  createdAt: 1,
};

describe('planToMarkdown', () => {
  it('renders status / atomicity / gaps / ranked candidates / topPick', () => {
    const md = planToMarkdown(plan, { depth: 1 });
    expect(md).toContain('## 🤖 自动递进 · PM 评估（第 1 层）');
    expect(md).toContain('🔀 多路径需择一 · 原子度 38%');
    expect(md).toContain('- 未指定负责人');
    expect(md).toContain('1. **前置三问收敛** — 92 分 · 深挖');
    expect(md).toContain('2. **Polygon 能力核查** — 50 分 · 外部行动（依赖：已确认主数据源）');
    expect(md).toContain('**PM 推荐**：前置三问收敛 —— 最低成本的解锁动作');
    expect(md).not.toContain('### 🌐');
    expect(md).not.toContain('推进在此');
  });

  it('appends the research findings section when a search ran', () => {
    const md = planToMarkdown(plan, {
      depth: 2,
      researchMarkdown: '### 缺口 1\nSEC 官网：BD 注册平均 180 天',
    });
    expect(md).toContain('### 🌐 网络搜索核实');
    expect(md).toContain('BD 注册平均 180 天');
  });

  it('renders a real-world stop with the remaining gaps marked as 卡点', () => {
    const md = planToMarkdown(
      { ...plan, status: 'needs_real_world_data', childCandidates: [], topPick: undefined, topPickReasoning: undefined },
      {
        depth: 3,
        stopStatus: 'hit_real_world_block',
        stillMissing: ['内部交易量基线'],
      },
    );
    expect(md).toContain('🌍 需要真实世界数据，推进在此诚实停止');
    expect(md).toContain('- 📍 内部交易量基线');
    expect(md).not.toContain('**PM 推荐**');
  });

  it('renders the other stop reasons without a 卡点 list', () => {
    const md = planToMarkdown(plan, { depth: 1, stopStatus: 'budget_exhausted' });
    expect(md).toContain('💸 预算耗尽，推进在此停止');
    expect(md).not.toContain('📍');
  });

  it('omits empty sections (no gaps / no candidates)', () => {
    const md = planToMarkdown(
      {
        ...plan,
        status: 'atomic_complete',
        whatsMissing: [],
        childCandidates: [],
        topPick: undefined,
        topPickReasoning: undefined,
      },
      { depth: 0, stopStatus: 'completed' },
    );
    expect(md).not.toContain('还缺什么');
    expect(md).not.toContain('候选子话题');
    expect(md).toContain('✅ 推进在此完成');
  });
});

describe('planTraceLine', () => {
  it('packs status / atomicity / pick / stop into one line', () => {
    const line = planTraceLine(plan, {
      depth: 2,
      stopStatus: 'paused_by_user',
    });
    expect(line).toBe(
      '[自动递进·第2层] PM:multi_path_choice 原子度38% 推荐「前置三问收敛」 ⏸ 你在此层暂停了推进',
    );
  });

  it('omits pick and stop when absent', () => {
    const line = planTraceLine(
      { ...plan, topPick: undefined },
      { depth: 0 },
    );
    expect(line).toBe('[自动递进·第0层] PM:multi_path_choice 原子度38%');
  });
});
