import { describe, expect, it } from 'vitest';
import { TopicDocumentSchema, type TopicDocument } from './document.js';

const valid: TopicDocument = {
  topicId: 'topic_1',
  content: '<h1>问题</h1><p>正文</p>',
  format: 'html',
  updatedAt: 1_700_000_000_000,
};

describe('TopicDocumentSchema', () => {
  it('accepts a minimal HTML document', () => {
    expect(TopicDocumentSchema.parse(valid)).toEqual(valid);
  });

  it('rejects unknown format', () => {
    expect(() =>
      TopicDocumentSchema.parse({ ...valid, format: 'docx' }),
    ).toThrow();
  });

  it('rejects empty topicId', () => {
    expect(() =>
      TopicDocumentSchema.parse({ ...valid, topicId: '' }),
    ).toThrow();
  });

  it('allows empty content (a doc starts blank when AI generation pending)', () => {
    expect(
      TopicDocumentSchema.parse({ ...valid, content: '' }),
    ).toMatchObject({ content: '' });
  });
});
