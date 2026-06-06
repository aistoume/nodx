import { describe, expect, it } from 'vitest';
import {
  DOMAIN_DETECT_PROMPT_MODEL,
  DomainDetectOutputSchema,
  buildDomainDetectPrompt,
} from './domain-detect.js';

describe('buildDomainDetectPrompt', () => {
  it('binds title and context', () => {
    const out = buildDomainDetectPrompt({
      topicTitle: '要不要现在出海东南亚',
      parentContext: '主决策：明年增长引擎选择',
    });
    expect(out).toContain('要不要现在出海东南亚');
    expect(out).toContain('主决策：明年增长引擎选择');
  });

  it('falls back to a placeholder when context is empty', () => {
    const out = buildDomainDetectPrompt({ topicTitle: 'q', parentContext: '' });
    expect(out).toContain('无上下文');
  });
});

describe('DomainDetectOutputSchema', () => {
  it('accepts valid output', () => {
    const valid = { domain: '跨境电商战略', confidence: 0.8 };
    expect(DomainDetectOutputSchema.parse(valid)).toEqual(valid);
  });

  it('rejects confidence out of range', () => {
    expect(() =>
      DomainDetectOutputSchema.parse({ domain: 'x', confidence: 1.5 }),
    ).toThrow();
  });

  it('rejects empty domain', () => {
    expect(() =>
      DomainDetectOutputSchema.parse({ domain: '', confidence: 0.5 }),
    ).toThrow();
  });
});

describe('domain-detect metadata', () => {
  it('routes to haiku (cheap classifier)', () => {
    expect(DOMAIN_DETECT_PROMPT_MODEL).toContain('haiku');
  });
});
