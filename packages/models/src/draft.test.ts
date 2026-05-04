import { describe, expect, it } from 'vitest';
import { DraftItemSchema, type DraftItem } from './draft.js';

const draftFromTopic: DraftItem = {
  id: 'draft_1',
  source: { topicId: 'topic_1' },
  content: '稍后补一个估值模型',
  createdAt: 1_700_000_000_000,
};

describe('DraftItemSchema', () => {
  it('accepts a draft sourced from a topic', () => {
    expect(DraftItemSchema.parse(draftFromTopic)).toEqual(draftFromTopic);
  });

  it('accepts a draft sourced from a specific message', () => {
    const fromMsg: DraftItem = {
      ...draftFromTopic,
      id: 'draft_2',
      source: { topicId: 'topic_1', messageId: 'msg_5' },
    };
    expect(DraftItemSchema.parse(fromMsg)).toEqual(fromMsg);
  });

  it('accepts a free-floating draft', () => {
    const floating: DraftItem = {
      ...draftFromTopic,
      id: 'draft_3',
      source: null,
    };
    expect(DraftItemSchema.parse(floating)).toEqual(floating);
  });

  it('rejects empty content', () => {
    expect(() =>
      DraftItemSchema.parse({ ...draftFromTopic, content: '' }),
    ).toThrow();
  });
});
