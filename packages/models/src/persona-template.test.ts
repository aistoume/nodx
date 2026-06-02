import { describe, expect, it } from 'vitest';
import {
  PersonaRoleSchema,
  PersonaTemplateSchema,
  type PersonaTemplate,
} from './persona-template.js';

const validTemplate: PersonaTemplate = {
  id: 'tpl_anna',
  domain: ['m&a', 'market-entry'],
  role: 'critic',
  displayName: '资深 M&A 律师 · Anna',
  systemPrompt: '你是资深 M&A 律师，对每一份方案的法律可行性挑刺。',
  frameworks: ['SWOT', 'Porter 5'],
  evalScore: 0.82,
};

describe('PersonaRoleSchema', () => {
  it('accepts the five documented roles', () => {
    for (const r of [
      'proposer',
      'critic',
      'practitioner',
      'constraint',
      'user_proxy',
    ] as const) {
      expect(PersonaRoleSchema.parse(r)).toBe(r);
    }
  });

  it('rejects an unknown role', () => {
    expect(() => PersonaRoleSchema.parse('moderator')).toThrow();
  });
});

describe('PersonaTemplateSchema', () => {
  it('accepts a fully-populated template', () => {
    expect(PersonaTemplateSchema.parse(validTemplate)).toEqual(validTemplate);
  });

  it('accepts a template without evalScore', () => {
    const { evalScore: _drop, ...withoutScore } = validTemplate;
    expect(PersonaTemplateSchema.parse(withoutScore)).toEqual(withoutScore);
  });

  it('rejects an empty displayName', () => {
    expect(() =>
      PersonaTemplateSchema.parse({ ...validTemplate, displayName: '' }),
    ).toThrow();
  });

  it('rejects missing systemPrompt', () => {
    const { systemPrompt: _drop, ...rest } = validTemplate;
    expect(() => PersonaTemplateSchema.parse(rest)).toThrow();
  });

  it('rejects domain passed as a string instead of an array', () => {
    expect(() =>
      PersonaTemplateSchema.parse({ ...validTemplate, domain: 'm&a' }),
    ).toThrow();
  });

  it('rejects an unknown role enum value', () => {
    expect(() =>
      PersonaTemplateSchema.parse({ ...validTemplate, role: 'devil' }),
    ).toThrow();
  });

  it('rejects evalScore above 1', () => {
    expect(() =>
      PersonaTemplateSchema.parse({ ...validTemplate, evalScore: 1.2 }),
    ).toThrow();
  });

  it('rejects evalScore below 0', () => {
    expect(() =>
      PersonaTemplateSchema.parse({ ...validTemplate, evalScore: -0.1 }),
    ).toThrow();
  });

  it('rejects unknown extra fields (strict)', () => {
    expect(() =>
      PersonaTemplateSchema.parse({ ...validTemplate, mystery: 'value' }),
    ).toThrow();
  });
});
