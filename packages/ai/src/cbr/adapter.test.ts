import { describe, expect, it } from 'vitest';
import { MODELS } from '../models.js';
import {
  ADAPTER_PROMPT_MODEL,
  AdapterOutputSchema,
  buildAdapterPrompt,
} from './adapter.js';

describe('buildAdapterPrompt', () => {
  const out = buildAdapterPrompt({
    query: '要不要给新加密交易所做市',
    newContext: '加密市场，团队 15 人',
    sourceCase: {
      id: 'case_a',
      domain: '受监管做市系统',
      decisionType: 'sequencing',
      signatureText: '风控独立性 vs 延迟',
      solutionText: '热路径静态规则 + Kill Switch',
      frameworks: ['约束理论'],
    },
  });

  it('binds query, new context, and the chosen case', () => {
    expect(out).toContain('要不要给新加密交易所做市');
    expect(out).toContain('加密市场，团队 15 人');
    expect(out).toContain('受监管做市系统');
    expect(out).toContain('热路径静态规则 + Kill Switch');
    expect(out).toContain('约束理论');
  });

  it('enforces the no-replay rule', () => {
    expect(out).toContain('绝不照搬');
  });
});

describe('AdapterOutputSchema', () => {
  const valid = {
    inheritedStructure: '分阶段试点骨架',
    contextualizedLevers: ['加密合规前置'],
    newRiskMitigations: ['监管牌照风险'],
    requiresExpertPanel: true,
    rediscussDirections: ['加密监管差异'],
  };
  it('accepts a valid adaptation', () => {
    expect(AdapterOutputSchema.parse(valid)).toEqual(valid);
  });
  it('accepts no-panel with empty rediscuss', () => {
    expect(
      AdapterOutputSchema.parse({
        ...valid,
        requiresExpertPanel: false,
        rediscussDirections: [],
      }),
    ).toBeTruthy();
  });
  it('rejects empty inheritedStructure', () => {
    expect(() =>
      AdapterOutputSchema.parse({ ...valid, inheritedStructure: '' }),
    ).toThrow();
  });
});

describe('adapter metadata', () => {
  it('routes to sonnet', () => {
    expect(ADAPTER_PROMPT_MODEL).toBe(MODELS.sonnet);
  });
});
