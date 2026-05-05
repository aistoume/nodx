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
});
