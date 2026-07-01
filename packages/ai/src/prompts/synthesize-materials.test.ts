import { describe, expect, it } from 'vitest';
import { MODELS } from '../models.js';
import {
  SYNTHESIZE_MATERIALS_PROMPT_MODEL,
  buildSynthesizeMaterialsPrompt,
} from './synthesize-materials.js';

describe('buildSynthesizeMaterialsPrompt', () => {
  it('routes to Sonnet and embeds question + materials by title', () => {
    expect(SYNTHESIZE_MATERIALS_PROMPT_MODEL).toBe(MODELS.sonnet);
    const p = buildSynthesizeMaterialsPrompt({
      topicTitle: '要不要进入东南亚市场？',
      question: '结合过去的经验，先做哪个国家？',
      materials: [
        { kindLabel: '方案', title: '印度市场进入的三阶段打法', subtitle: '市场进入 · sequencing' },
        { kindLabel: '灵感', title: '一篇讲越南电商增速的报道' },
      ],
    });
    expect(p).toContain('要不要进入东南亚市场？');
    expect(p).toContain('先做哪个国家？');
    expect(p).toContain('印度市场进入的三阶段打法');
    expect(p).toContain('越南电商增速');
    expect(p).toContain('## 素材综合');
    expect(p).toContain('不要编造');
  });

  it('handles no linked materials + empty question gracefully', () => {
    const p = buildSynthesizeMaterialsPrompt({
      topicTitle: 't',
      question: '',
      materials: [],
    });
    expect(p).toContain('（没有连入的素材）');
    expect(p).toContain('未填写具体问题');
  });

  it('folds in existing doc when present, truncated', () => {
    const p = buildSynthesizeMaterialsPrompt({
      topicTitle: 't',
      question: 'q',
      materials: [{ kindLabel: '方案', title: 'x' }],
      existingDoc: 'A'.repeat(9000),
    });
    expect(p).toContain('这个节点已有的内容');
    expect(p.length).toBeLessThan(8000);
  });
});
