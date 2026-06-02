import { describe, expect, it } from 'vitest';
import {
  PanelExchangeSchema,
  type PanelExchange,
} from './panel-exchange.js';

const validExchange: PanelExchange = {
  id: 'ex_1',
  agentId: 'agent_anna',
  content: '初判：法律风险集中在数据跨境合规一块。',
  createdAt: 1_700_000_000_000,
};

describe('PanelExchangeSchema', () => {
  it('accepts a minimal valid exchange', () => {
    expect(PanelExchangeSchema.parse(validExchange)).toEqual(validExchange);
  });

  it('accepts an exchange with citations', () => {
    const withCitations: PanelExchange = {
      ...validExchange,
      citations: ['doc:gdpr-art-44', 'doc:china-data-law-2021'],
    };
    expect(PanelExchangeSchema.parse(withCitations)).toEqual(withCitations);
  });

  it('rejects empty content', () => {
    expect(() =>
      PanelExchangeSchema.parse({ ...validExchange, content: '' }),
    ).toThrow();
  });

  it('rejects missing agentId', () => {
    const { agentId: _drop, ...rest } = validExchange;
    expect(() => PanelExchangeSchema.parse(rest)).toThrow();
  });

  it('rejects createdAt as a string', () => {
    expect(() =>
      PanelExchangeSchema.parse({ ...validExchange, createdAt: 'now' }),
    ).toThrow();
  });

  it('rejects negative createdAt', () => {
    expect(() =>
      PanelExchangeSchema.parse({ ...validExchange, createdAt: -1 }),
    ).toThrow();
  });

  it('rejects citations containing an empty string', () => {
    expect(() =>
      PanelExchangeSchema.parse({ ...validExchange, citations: [''] }),
    ).toThrow();
  });

  it('rejects unknown extra fields (strict)', () => {
    expect(() =>
      PanelExchangeSchema.parse({ ...validExchange, mood: 'crisp' }),
    ).toThrow();
  });
});
