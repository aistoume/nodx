import { describe, expect, it } from 'vitest';
import { MODELS } from '../models.js';
import {
  EXTRACT_EXECUTION_PROMPT_MODEL,
  ExecutionPlanOutputSchema,
  buildExtractExecutionPrompt,
  executionToMarkdown,
} from './execution.js';

describe('buildExtractExecutionPrompt', () => {
  it('routes to Sonnet and embeds title / atomics / document', () => {
    expect(EXTRACT_EXECUTION_PROMPT_MODEL).toBe(MODELS.sonnet);
    const p = buildExtractExecutionPrompt({
      topicTitle: '要不要自建风控？',
      documentText: '结论：先买后建。下一步：本周对比三家供应商。',
      atomicActions: [
        {
          who: '张三',
          what: '对比三家风控报价',
          when: '本周五',
          deliverable: '对比表',
          isComplete: false,
        },
      ],
    });
    expect(p).toContain('要不要自建风控？');
    expect(p).toContain('对比三家风控报价');
    expect(p).toContain('先买后建');
    expect(p).toContain('只抽取、不发明');
  });

  it('handles no atomic actions', () => {
    const p = buildExtractExecutionPrompt({
      topicTitle: 't',
      documentText: 'd',
      atomicActions: [],
    });
    expect(p).toContain('（无已标记的原子动作）');
  });

  it('truncates an over-long document', () => {
    const p = buildExtractExecutionPrompt({
      topicTitle: 't',
      documentText: 'A'.repeat(20000),
      atomicActions: [],
    });
    expect(p.length).toBeLessThan(11000);
  });
});

describe('ExecutionPlanOutputSchema', () => {
  it('accepts a plan with partial action items + deps', () => {
    const plan = ExecutionPlanOutputSchema.parse({
      title: '落地第三方风控',
      actionItems: [{ what: '接入供应商 API' }, { who: '李四', what: '压测' }],
      dependencies: ['先确认预算上限'],
    });
    expect(plan.actionItems).toHaveLength(2);
  });

  it('rejects empty title / missing what', () => {
    expect(() =>
      ExecutionPlanOutputSchema.parse({ title: '', actionItems: [], dependencies: [] }),
    ).toThrow();
    expect(() =>
      ExecutionPlanOutputSchema.parse({
        title: 'x',
        actionItems: [{ who: 'a' }],
        dependencies: [],
      }),
    ).toThrow();
  });
});

describe('executionToMarkdown', () => {
  it('renders a title heading, action table, and deps', () => {
    const md = executionToMarkdown({
      title: '落地第三方风控',
      actionItems: [
        { who: '张三', what: '对比报价', when: '周五', deliverable: '对比表' },
        { what: '接入 API' },
      ],
      dependencies: ['先确认预算'],
    });
    expect(md).toContain('# ▶ 执行方案：落地第三方风控');
    expect(md).toContain('| 谁 | 做什么 | 何时 | 产出物 |');
    expect(md).toContain('| 张三 | 对比报价 | 周五 | 对比表 |');
    expect(md).toContain('| — | 接入 API | — | — |');
    expect(md).toContain('## 开工前提 / 待决');
    expect(md).toContain('- 先确认预算');
  });

  it('shows a fallback when there are no action items', () => {
    const md = executionToMarkdown({
      title: 't',
      actionItems: [],
      dependencies: [],
    });
    expect(md).toContain('（暂无');
    expect(md).not.toContain('## 开工前提');
  });
});
