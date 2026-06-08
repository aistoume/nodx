import { describe, expect, it } from 'vitest';
import type { Comment, ThinkingSession, Topic } from '@nodx/models';
import {
  RECAP_PROMPT_MODEL,
  RecapOutputSchema,
  buildRecapPrompt,
  toRecapInput,
} from './recap-card.js';

const topic = {
  id: 't1',
  title: '要不要出海东南亚',
  reasoningTrace: '从市场规模出发 → 拆成现金流/合规两维',
  hasOpenQuestions: true,
} as unknown as Topic;

const sessions: ThinkingSession[] = [
  { id: 's1', topicId: 't1', startedAt: 100, endedAt: 200, messageCount: 3, aiRecap: '厘清现金流约束' },
  { id: 's2', topicId: 't1', startedAt: 300, endedAt: 400, messageCount: 2, aiRecap: '评估合规壁垒' },
  { id: 's3', topicId: 't1', startedAt: 50, endedAt: 60, messageCount: 1 }, // no recap → skipped
];

const openQuestions = [
  {
    id: 'c1',
    topicId: 't1',
    anchorId: null,
    type: 'open_question',
    content: '',
    openQuestionData: { question: '6 个月窗口是否合理' },
    createdAt: 1,
  },
  {
    id: 'c2',
    topicId: 't1',
    anchorId: null,
    type: 'open_question',
    content: '',
    openQuestionData: { question: '已解决的', resolvedAt: 999 }, // resolved → skipped
    createdAt: 2,
  },
] as unknown as Comment[];

describe('toRecapInput', () => {
  it('maps topic + recapped sessions (newest first) + unresolved 卡点', () => {
    const input = toRecapInput({ topic, sessions, openQuestions });
    expect(input.question).toBe('要不要出海东南亚');
    expect(input.reasoningTrace).toContain('现金流');
    // s2 (startedAt 300) before s1 (100); s3 has no recap → excluded
    expect(input.sessionRecaps).toEqual(['评估合规壁垒', '厘清现金流约束']);
    // resolved 卡点 excluded
    expect(input.openQuestions).toEqual(['6 个月窗口是否合理']);
  });

  it('omits reasoningTrace when absent', () => {
    const input = toRecapInput({
      topic: { ...topic, reasoningTrace: undefined },
      sessions: [],
      openQuestions: [],
    });
    expect(input.reasoningTrace).toBeUndefined();
    expect(input.sessionRecaps).toEqual([]);
  });
});

describe('buildRecapPrompt + schema', () => {
  it('binds inputs', () => {
    const out = buildRecapPrompt(toRecapInput({ topic, sessions, openQuestions }));
    expect(out).toContain('要不要出海东南亚');
    expect(out).toContain('评估合规壁垒');
    expect(out).toContain('6 个月窗口是否合理');
  });
  it('validates a recap; rejects empty startingPoint', () => {
    const valid = {
      startingPoint: '从该不该出海出发',
      path: ['看市场', '看现金流'],
      stuckPoints: ['窗口期'],
      newProgress: [],
    };
    expect(RecapOutputSchema.parse(valid)).toEqual(valid);
    expect(() =>
      RecapOutputSchema.parse({ ...valid, startingPoint: '' }),
    ).toThrow();
  });
  it('routes to sonnet', () => {
    expect(RECAP_PROMPT_MODEL).toContain('sonnet');
  });
});
