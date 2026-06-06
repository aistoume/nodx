import { describe, expect, it } from 'vitest';
import {
  BRAIN_HUB_PROMPT_MODEL,
  BrainHubOutputSchema,
  MAX_SUB_INTENTS,
  buildBrainHubPrompt,
} from './brain-hub.js';

describe('buildBrainHubPrompt', () => {
  it('binds the query and states the cap', () => {
    const out = buildBrainHubPrompt({ query: '要不要现在出海东南亚' });
    expect(out).toContain('要不要现在出海东南亚');
    expect(out).toContain(String(MAX_SUB_INTENTS));
  });
});

describe('BrainHubOutputSchema', () => {
  it('accepts 1 sub-intent', () => {
    expect(BrainHubOutputSchema.parse({ subIntents: ['出海决策'] })).toEqual({
      subIntents: ['出海决策'],
    });
  });
  it('accepts up to MAX_SUB_INTENTS', () => {
    const arr = Array.from({ length: MAX_SUB_INTENTS }, (_, i) => `i${i}`);
    expect(BrainHubOutputSchema.parse({ subIntents: arr }).subIntents).toHaveLength(
      MAX_SUB_INTENTS,
    );
  });
  it('rejects an empty list', () => {
    expect(() => BrainHubOutputSchema.parse({ subIntents: [] })).toThrow();
  });
  it('rejects more than MAX_SUB_INTENTS', () => {
    const arr = Array.from({ length: MAX_SUB_INTENTS + 1 }, (_, i) => `i${i}`);
    expect(() => BrainHubOutputSchema.parse({ subIntents: arr })).toThrow();
  });
});

describe('brain-hub metadata', () => {
  it('routes to haiku', () => {
    expect(BRAIN_HUB_PROMPT_MODEL).toContain('haiku');
  });
});
