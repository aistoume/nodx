import { describe, expect, it } from 'vitest';
import {
  ATOMIC_CHECK_PROMPT_MODEL,
  AtomicCheckOutputSchema,
  buildAtomicCheckPrompt,
} from './atomic-check.js';

describe('buildAtomicCheckPrompt', () => {
  it('embeds the candidate text', () => {
    const out = buildAtomicCheckPrompt({ text: '把竞品调研发给老板' });
    expect(out).toContain('把竞品调研发给老板');
    expect(out).toContain('原子任务');
    expect(out).toContain('谁');
    expect(out).toContain('做什么');
    expect(out).toContain('何时');
    expect(out).toContain('产出物');
  });
});

describe('AtomicCheckOutputSchema', () => {
  it('accepts a fully-atomic verdict', () => {
    const v = {
      is_atomic: true,
      missing: [],
      suggestion: '已具备 4 要素',
    };
    expect(AtomicCheckOutputSchema.parse(v)).toEqual(v);
  });

  it('accepts a non-atomic verdict listing missing fields', () => {
    const v = {
      is_atomic: false,
      missing: ['when', 'deliverable'],
      suggestion: '请补充时间和产出物',
    };
    expect(AtomicCheckOutputSchema.parse(v)).toEqual(v);
  });

  it('rejects unknown missing-field labels', () => {
    expect(() =>
      AtomicCheckOutputSchema.parse({
        is_atomic: false,
        missing: ['budget'],
        suggestion: 'x',
      }),
    ).toThrow();
  });
});

describe('atomic-check metadata', () => {
  it('routes to haiku (cheap, frequent)', () => {
    expect(ATOMIC_CHECK_PROMPT_MODEL).toContain('haiku');
  });
});
