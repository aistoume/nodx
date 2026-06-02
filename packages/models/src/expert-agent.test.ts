import { describe, expect, it } from 'vitest';
import { ExpertAgentSchema, type ExpertAgent } from './expert-agent.js';

const validAgent: ExpertAgent = {
  id: 'agent_anna',
  personaTemplateId: 'tpl_anna',
  displayName: 'Anna · M&A 律师',
  role: 'critic',
  systemPrompt: '你是资深 M&A 律师 ...（含话题上下文注入）',
};

describe('ExpertAgentSchema', () => {
  it('accepts a fully-populated agent', () => {
    expect(ExpertAgentSchema.parse(validAgent)).toEqual(validAgent);
  });

  it('rejects missing personaTemplateId', () => {
    const { personaTemplateId: _drop, ...rest } = validAgent;
    expect(() => ExpertAgentSchema.parse(rest)).toThrow();
  });

  it('rejects empty systemPrompt', () => {
    expect(() =>
      ExpertAgentSchema.parse({ ...validAgent, systemPrompt: '' }),
    ).toThrow();
  });

  it('rejects empty displayName', () => {
    expect(() =>
      ExpertAgentSchema.parse({ ...validAgent, displayName: '' }),
    ).toThrow();
  });

  it('rejects an unknown role enum value', () => {
    expect(() =>
      ExpertAgentSchema.parse({ ...validAgent, role: 'judge' }),
    ).toThrow();
  });

  it('rejects systemPrompt being non-string', () => {
    expect(() =>
      ExpertAgentSchema.parse({ ...validAgent, systemPrompt: 123 }),
    ).toThrow();
  });

  it('rejects unknown extra fields (strict)', () => {
    expect(() =>
      ExpertAgentSchema.parse({ ...validAgent, mystery: 1 }),
    ).toThrow();
  });
});
