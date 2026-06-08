import { describe, expect, it } from 'vitest';
import type { Message } from '@nodx/models';
import {
  TRACE_PROMPT_MODEL,
  TraceOutputSchema,
  buildTracePrompt,
  toTraceInput,
} from './reasoning-trace.js';

const msgs = [
  { id: 'm1', topicId: 't1', sessionId: 's1', role: 'user', type: 'text', content: '我担心现金流', createdAt: 1 },
  { id: 'm2', topicId: 't1', sessionId: 's1', role: 'ai', type: 'text', content: '先看 runway', createdAt: 2 },
  { id: 'm3', topicId: 't1', sessionId: 's1', role: 'ai', type: 'survey', content: '{}', createdAt: 3 }, // non-text → skipped
] as unknown as Message[];

describe('toTraceInput', () => {
  it('keeps only text messages, prefixed by role', () => {
    const input = toTraceInput({
      question: '要不要出海',
      previousTrace: '上一步',
      sessionMessages: msgs,
    });
    expect(input.sessionMessages).toEqual(['我：我担心现金流', 'AI：先看 runway']);
    expect(input.previousTrace).toBe('上一步');
  });

  it('omits previousTrace when absent', () => {
    const input = toTraceInput({ question: 'q', sessionMessages: [] });
    expect(input.previousTrace).toBeUndefined();
    expect(input.sessionMessages).toEqual([]);
  });
});

describe('buildTracePrompt + schema', () => {
  it('binds trace + messages', () => {
    const out = buildTracePrompt(
      toTraceInput({ question: '要不要出海', previousTrace: '旧路径', sessionMessages: msgs }),
    );
    expect(out).toContain('要不要出海');
    expect(out).toContain('旧路径');
    expect(out).toContain('我担心现金流');
  });
  it('validates { trace, sessionRecap }', () => {
    const valid = { trace: '新路径', sessionRecap: '本轮看了现金流' };
    expect(TraceOutputSchema.parse(valid)).toEqual(valid);
    expect(() => TraceOutputSchema.parse({ trace: '', sessionRecap: 'x' })).toThrow();
  });
  it('routes to haiku', () => {
    expect(TRACE_PROMPT_MODEL).toContain('haiku');
  });
});
