import { describe, expect, it } from 'vitest';
import {
  AtomicDataSchema,
  CommentSchema,
  type Comment,
} from './comment.js';

const baseNote: Comment = {
  id: 'cmt_1',
  topicId: 'topic_1',
  anchorId: 'anchor_a',
  type: 'note',
  content: '这里需要再核实',
  createdAt: 1_700_000_000_000,
};

const validAtomic = {
  who: 'LaoMo',
  what: '完成竞品调研',
  when: '2026-05-10',
  deliverable: '竞品调研报告.md',
  isComplete: false,
};

describe('AtomicDataSchema', () => {
  it('accepts complete atomic data', () => {
    expect(AtomicDataSchema.parse(validAtomic)).toEqual(validAtomic);
  });

  it('rejects missing fields', () => {
    expect(() =>
      AtomicDataSchema.parse({ ...validAtomic, who: '' }),
    ).toThrow();
  });
});

describe('CommentSchema', () => {
  it('accepts a yellow note with anchor', () => {
    expect(CommentSchema.parse(baseNote)).toEqual(baseNote);
  });

  it('accepts unanchored explanation', () => {
    const explain: Comment = {
      ...baseNote,
      id: 'cmt_2',
      anchorId: null,
      type: 'explanation',
    };
    expect(CommentSchema.parse(explain)).toEqual(explain);
  });

  it('accepts atomic comment with atomicData', () => {
    const atomic: Comment = {
      ...baseNote,
      id: 'cmt_3',
      type: 'atomic',
      atomicData: validAtomic,
    };
    expect(CommentSchema.parse(atomic)).toEqual(atomic);
  });

  it('rejects atomic comment without atomicData', () => {
    expect(() =>
      CommentSchema.parse({ ...baseNote, type: 'atomic' }),
    ).toThrow(/atomicData is required/);
  });

  it('rejects non-atomic comment carrying atomicData', () => {
    expect(() =>
      CommentSchema.parse({
        ...baseNote,
        type: 'note',
        atomicData: validAtomic,
      }),
    ).toThrow(/only allowed when type is/);
  });
});
