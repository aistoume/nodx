import { describe, expect, it } from 'vitest';
import {
  base64ToEmbedding,
  embeddingToBase64,
  signatureToText,
  solutionToText,
} from './indexer.js';

describe('signatureToText', () => {
  it('flattens every field deterministically', () => {
    const t = signatureToText({
      domain: '跨境电商战略',
      decisionType: 'go_no_go',
      keyDimensions: ['现金流', '渠道'],
      constraints: ['6 个月窗口'],
    });
    expect(t).toContain('领域：跨境电商战略');
    expect(t).toContain('go_no_go');
    expect(t).toContain('现金流、渠道');
    expect(t).toContain('6 个月窗口');
    // deterministic
    expect(
      signatureToText({
        domain: '跨境电商战略',
        decisionType: 'go_no_go',
        keyDimensions: ['现金流', '渠道'],
        constraints: ['6 个月窗口'],
      }),
    ).toBe(t);
  });

  it('uses a placeholder for empty arrays', () => {
    const t = signatureToText({
      domain: 'd',
      decisionType: 'tradeoff',
      keyDimensions: [],
      constraints: [],
    });
    expect(t).toContain('关键维度：—');
  });
});

describe('solutionToText', () => {
  it('flattens structure + levers + mitigations', () => {
    const t = solutionToText({
      structure: '分阶段试点',
      keyLevers: ['本地化运营'],
      riskMitigations: ['Q3 复盘止损'],
    });
    expect(t).toContain('结构：分阶段试点');
    expect(t).toContain('本地化运营');
    expect(t).toContain('Q3 复盘止损');
  });
});

describe('embedding base64 codec', () => {
  it('round-trips a vector through base64 (Float32 precision)', () => {
    const emb = [0, 1, -0.5, 0.123456, 768, -42.25];
    const restored = base64ToEmbedding(embeddingToBase64(emb));
    expect(restored).toHaveLength(emb.length);
    restored.forEach((v, i) => expect(v).toBeCloseTo(emb[i]!, 5));
  });

  it('preserves length for a 768-dim vector', () => {
    const emb = Array.from({ length: 768 }, (_, i) => i / 1000);
    expect(base64ToEmbedding(embeddingToBase64(emb))).toHaveLength(768);
  });
});
