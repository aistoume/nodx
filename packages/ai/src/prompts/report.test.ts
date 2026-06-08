import { describe, expect, it } from 'vitest';
import {
  REPORT_PROMPT_MODEL,
  ReportOutputSchema,
  buildReportPrompt,
  reportToMarkdown,
  type ReportOutput,
} from './report.js';

const input = {
  rootQuestion: '要不要明年推出企业版',
  nodes: [
    {
      title: '定价策略',
      content: '建议按席位订阅',
      atomicActions: ['市场调研 3 家竞品定价'],
      openQuestions: ['免费额度给多少'],
    },
    {
      title: '工程投入',
      content: '需 SSO + 审计日志',
      atomicActions: [],
      openQuestions: [],
    },
  ],
};

describe('buildReportPrompt', () => {
  it('binds the root question + node material', () => {
    const out = buildReportPrompt(input);
    expect(out).toContain('要不要明年推出企业版');
    expect(out).toContain('定价策略');
    expect(out).toContain('市场调研 3 家竞品定价');
    expect(out).toContain('免费额度给多少');
  });
});

describe('ReportOutputSchema', () => {
  const valid: ReportOutput = {
    summary: '建议推出，按席位订阅，先做合规基建。',
    actionItems: [
      { who: 'LaoMo', what: '竞品定价调研', when: '2026-Q1', deliverable: '调研.md' },
      { what: '上线 SSO' },
    ],
    openQuestions: ['免费额度', '定价锚点'],
  };
  it('accepts a valid report', () => {
    expect(ReportOutputSchema.parse(valid)).toEqual(valid);
  });
  it('requires what in action items', () => {
    expect(() =>
      ReportOutputSchema.parse({ ...valid, actionItems: [{ who: 'x' }] }),
    ).toThrow();
  });
  it('accepts empty action list', () => {
    expect(
      ReportOutputSchema.parse({ ...valid, actionItems: [] }),
    ).toBeTruthy();
  });
});

describe('reportToMarkdown', () => {
  const report: ReportOutput = {
    summary: '建议推出。',
    actionItems: [{ who: 'LaoMo', what: '定价调研', when: 'Q1', deliverable: '报告' }],
    openQuestions: ['免费额度'],
  };
  it('renders title, summary, action table, open questions', () => {
    const md = reportToMarkdown(report, '要不要推企业版');
    expect(md).toContain('# 决策汇报：要不要推企业版');
    expect(md).toContain('## 决策摘要');
    expect(md).toContain('| 谁 | 做什么 | 何时 | 产出 |');
    expect(md).toContain('| LaoMo | 定价调研 | Q1 | 报告 |');
    expect(md).toContain('## 未解问题');
    expect(md).toContain('- 免费额度');
  });
  it('shows 暂无 for empty sections + escapes pipes', () => {
    const md = reportToMarkdown(
      { summary: 's', actionItems: [{ what: 'a|b' }], openQuestions: [] },
      'q',
    );
    expect(md).toContain('a\\|b');
    expect(md).toMatch(/## 未解问题\n（暂无）/);
  });
});

describe('report metadata', () => {
  it('routes to sonnet', () => {
    expect(REPORT_PROMPT_MODEL).toContain('sonnet');
  });
});
