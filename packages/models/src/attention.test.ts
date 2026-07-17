import { describe, expect, it } from 'vitest';
import { AttentionSchema } from './attention.js';

const BASE = {
  id: 'att-1',
  text: 'first-principles thinking',
  sourceUrl: 'https://example.com/post',
  sourceTitle: 'Example post',
  sourceKind: 'lens-chrome' as const,
  kind: 'explain' as const,
  tags: [],
  capturedAt: 1_700_000_000_000,
  ingestedAt: 1_700_000_001_000,
};

describe('AttentionSchema', () => {
  it('accepts a minimal explain-flavoured attention with explanation', () => {
    const a = { ...BASE, explanation: 'It means reasoning from axioms.' };
    expect(AttentionSchema.parse(a)).toMatchObject(a);
  });

  it('accepts a quick-flavoured attention without explanation', () => {
    const a = { ...BASE, kind: 'quick' as const };
    const parsed = AttentionSchema.parse(a);
    expect(parsed.explanation).toBeUndefined();
    expect(parsed.kind).toBe('quick');
  });

  it('accepts a custom-instruction capture (v15) and keeps instruction optional', () => {
    const a = {
      ...BASE,
      instruction: '翻译成法语',
      explanation: 'La pensée par premiers principes',
    };
    expect(AttentionSchema.parse(a)).toMatchObject(a);
    expect(AttentionSchema.parse(BASE).instruction).toBeUndefined();
  });

  it('accepts empty text (image-only captures carry no selection)', () => {
    expect(() => AttentionSchema.parse({ ...BASE, text: '' })).not.toThrow();
  });

  it('rejects unknown sourceKind', () => {
    expect(() =>
      AttentionSchema.parse({ ...BASE, sourceKind: 'random-tool' }),
    ).toThrow();
  });

  it('accepts an empty-string sourceUrl (for manual pastes without source)', () => {
    const a = { ...BASE, sourceUrl: '', sourceKind: 'manual' as const };
    expect(() => AttentionSchema.parse(a)).not.toThrow();
  });

  it('persists promotedToTopicId when set', () => {
    const a = {
      ...BASE,
      promotedToTopicId: 'topic-99',
    };
    expect(AttentionSchema.parse(a).promotedToTopicId).toBe('topic-99');
  });

  it('allows arbitrary string tags', () => {
    const a = { ...BASE, tags: ['ai-product', 'competitor-research'] };
    expect(AttentionSchema.parse(a).tags).toEqual([
      'ai-product',
      'competitor-research',
    ]);
  });
});
