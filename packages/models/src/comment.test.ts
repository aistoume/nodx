import { describe, expect, it } from 'vitest';
import {
  AtomicDataSchema,
  CommentSchema,
  OpenQuestionDataSchema,
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

  it('accepts an open_question (卡点) with openQuestionData', () => {
    const stuck: Comment = {
      ...baseNote,
      id: 'cmt_q',
      type: 'open_question',
      openQuestionData: { question: '6 个月窗口是否合理', blockedReason: '缺数据' },
    };
    expect(CommentSchema.parse(stuck)).toEqual(stuck);
  });

  it('rejects open_question without openQuestionData', () => {
    expect(() =>
      CommentSchema.parse({ ...baseNote, type: 'open_question' }),
    ).toThrow(/openQuestionData is required/);
  });

  it('rejects non-open_question carrying openQuestionData', () => {
    expect(() =>
      CommentSchema.parse({
        ...baseNote,
        type: 'note',
        openQuestionData: { question: 'x' },
      }),
    ).toThrow(/only allowed when type is/);
  });
});

describe('OpenQuestionDataSchema', () => {
  it('accepts minimal (question only)', () => {
    expect(OpenQuestionDataSchema.parse({ question: '卡在哪' })).toEqual({
      question: '卡在哪',
    });
  });
  it('rejects empty question', () => {
    expect(() => OpenQuestionDataSchema.parse({ question: '' })).toThrow();
  });
});
