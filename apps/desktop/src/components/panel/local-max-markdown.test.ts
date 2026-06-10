import { describe, expect, it } from 'vitest';
import type { LocalMaximumResult } from '@nodx/models';
import { localMaxToMarkdown } from './local-max-markdown.js';

function lm(overrides: Partial<LocalMaximumResult> = {}): LocalMaximumResult {
  return {
    bestAnswer: '先做合规基线。然后分三阶段推进，每阶段验收后再进入下一阶段。',
    confidence: 0.82,
    consensus: ['合规是硬前提', '分阶段降低风险'],
    divergence: [{ point: '时间窗', conditions: 'Q3 现金流低于阈值' }],
    openQuestions: ['预算上限是多少？'],
    acceptedByUser: false,
    ...overrides,
  };
}

describe('localMaxToMarkdown', () => {
  it('renders the full structure: headline / 把握度 / all sections / 结论详述', () => {
    const md = localMaxToMarkdown(lm());
    // headline = first sentence of bestAnswer, cut before the 句号
    expect(md.startsWith('# 先做合规基线\n')).toBe(true);
    expect(md).toContain('> 把握度：82%');
    expect(md).toContain('## 共识点');
    expect(md).toContain('- 合规是硬前提');
    expect(md).toContain('## 分歧与权衡');
    expect(md).toContain('- **时间窗** —— 在 Q3 现金流低于阈值 条件下成立');
    expect(md).toContain('## 待解问题');
    expect(md).toContain('- 预算上限是多少？');
    expect(md).toContain('---');
    expect(md).toContain('## 结论详述');
    // full bestAnswer present at the end
    expect(md).toContain('每阶段验收后再进入下一阶段。');
  });

  it('omits 共识点 when consensus is empty', () => {
    const md = localMaxToMarkdown(lm({ consensus: [] }));
    expect(md).not.toContain('## 共识点');
    expect(md).toContain('## 分歧与权衡');
    expect(md).toContain('## 待解问题');
  });

  it('omits 分歧与权衡 when divergence is empty', () => {
    const md = localMaxToMarkdown(lm({ divergence: [] }));
    expect(md).not.toContain('## 分歧与权衡');
    expect(md).toContain('## 共识点');
    expect(md).toContain('## 待解问题');
  });

  it('omits 待解问题 when openQuestions is empty', () => {
    const md = localMaxToMarkdown(lm({ openQuestions: [] }));
    expect(md).not.toContain('## 待解问题');
    expect(md).toContain('## 共识点');
    expect(md).toContain('## 分歧与权衡');
  });

  it('cuts the headline at the first newline when it precedes the 句号', () => {
    const md = localMaxToMarkdown(
      lm({ bestAnswer: '分两步走\n第一步：做 X。第二步：做 Y。' }),
    );
    expect(md.startsWith('# 分两步走\n')).toBe(true);
  });

  it('uses the whole bestAnswer as headline when it has no 句号 or newline', () => {
    const md = localMaxToMarkdown(lm({ bestAnswer: '直接采用方案 B' }));
    expect(md.startsWith('# 直接采用方案 B\n')).toBe(true);
    expect(md).toContain('## 结论详述\n\n直接采用方案 B');
  });
});
