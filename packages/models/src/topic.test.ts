import { describe, expect, it } from 'vitest';
import {
  TopicMetaSchema,
  TopicSchema,
  TopicStatusSchema,
  type Topic,
} from './topic.js';

const validTopic: Topic = {
  id: 'topic_1',
  parentId: null,
  title: '要不要 ALL IN AI？',
  status: 'exploring',
  isPinned: false,
  isArchived: false,
  createdAt: 1_700_000_000_000,
  updatedAt: 1_700_000_001_000,
  meta: { messageCount: 3, childCount: 1, lastActivity: 1_700_000_001_000 },
  hasOpenQuestions: false,
  nodeKind: 'thinking',
};

describe('TopicStatusSchema', () => {
  it('accepts the four documented statuses', () => {
    for (const s of ['exploring', 'summarized', 'atomic', 'ghost'] as const) {
      expect(TopicStatusSchema.parse(s)).toBe(s);
    }
  });

  it('rejects unknown statuses', () => {
    expect(() => TopicStatusSchema.parse('done')).toThrow();
  });
});

describe('TopicMetaSchema', () => {
  it('accepts valid meta', () => {
    expect(
      TopicMetaSchema.parse({ messageCount: 0, childCount: 0, lastActivity: 0 }),
    ).toEqual({ messageCount: 0, childCount: 0, lastActivity: 0 });
  });

  it('rejects negative counts', () => {
    expect(() =>
      TopicMetaSchema.parse({ messageCount: -1, childCount: 0, lastActivity: 0 }),
    ).toThrow();
  });
});

describe('TopicSchema', () => {
  it('accepts a root topic', () => {
    expect(TopicSchema.parse(validTopic)).toEqual(validTopic);
  });

  it('accepts a child topic with aiSummary', () => {
    const child: Topic = {
      ...validTopic,
      id: 'topic_2',
      parentId: 'topic_1',
      status: 'summarized',
      aiSummary: '该子对话的核心结论',
    };
    expect(TopicSchema.parse(child)).toEqual(child);
  });

  it('rejects empty title', () => {
    expect(() => TopicSchema.parse({ ...validTopic, title: '' })).toThrow();
  });

  it('rejects missing meta', () => {
    const { meta: _meta, ...rest } = validTopic;
    expect(() => TopicSchema.parse(rest)).toThrow();
  });

  it('rejects missing isArchived flag', () => {
    const { isArchived: _isArchived, ...rest } = validTopic;
    expect(() => TopicSchema.parse(rest)).toThrow();
  });

  it('accepts archived topic', () => {
    expect(
      TopicSchema.parse({ ...validTopic, isArchived: true }),
    ).toMatchObject({ isArchived: true });
  });

  it('defaults hasOpenQuestions to false when omitted (old rows)', () => {
    const { hasOpenQuestions: _drop, ...rest } = validTopic;
    expect(TopicSchema.parse(rest).hasOpenQuestions).toBe(false);
  });

  it('accepts reasoningTrace + hasOpenQuestions', () => {
    const t = TopicSchema.parse({
      ...validTopic,
      reasoningTrace: '从「该不该做」出发 → 拆成现金流/团队两维',
      hasOpenQuestions: true,
    });
    expect(t.reasoningTrace).toContain('现金流');
    expect(t.hasOpenQuestions).toBe(true);
  });

  it('accepts the auto-recursion lineage fields (PRD §3.19)', () => {
    const t = TopicSchema.parse({
      ...validTopic,
      generatedByAutoRecursionRunId: 'run_1',
      autoRecursionDepth: 2,
      parentNextMovePlanId: 'nmp_1',
    });
    expect(t.generatedByAutoRecursionRunId).toBe('run_1');
    expect(t.autoRecursionDepth).toBe(2);
    expect(t.parentNextMovePlanId).toBe('nmp_1');
  });

  it('treats all three auto-recursion fields as optional (old rows)', () => {
    const t = TopicSchema.parse(validTopic);
    expect(t.generatedByAutoRecursionRunId).toBeUndefined();
    expect(t.autoRecursionDepth).toBeUndefined();
    expect(t.parentNextMovePlanId).toBeUndefined();
  });

  it('defaults nodeKind to thinking when omitted (old rows)', () => {
    expect(TopicSchema.parse(validTopic).nodeKind).toBe('thinking');
  });

  it('accepts an execution node kind', () => {
    const t = TopicSchema.parse({ ...validTopic, nodeKind: 'execution' });
    expect(t.nodeKind).toBe('execution');
  });

  it('rejects an unknown nodeKind', () => {
    expect(() =>
      TopicSchema.parse({ ...validTopic, nodeKind: 'action' }),
    ).toThrow();
  });

  it('rejects wrong-typed auto-recursion fields', () => {
    expect(() =>
      TopicSchema.parse({ ...validTopic, generatedByAutoRecursionRunId: 7 }),
    ).toThrow();
    expect(() =>
      TopicSchema.parse({ ...validTopic, autoRecursionDepth: -1 }),
    ).toThrow();
    expect(() =>
      TopicSchema.parse({ ...validTopic, autoRecursionDepth: 1.5 }),
    ).toThrow();
    expect(() =>
      TopicSchema.parse({ ...validTopic, parentNextMovePlanId: '' }),
    ).toThrow();
  });
});
