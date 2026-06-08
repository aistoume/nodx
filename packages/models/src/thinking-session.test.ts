import { describe, expect, it } from 'vitest';
import {
  ThinkingSessionSchema,
  type ThinkingSession,
} from './thinking-session.js';

const valid: ThinkingSession = {
  id: 'sess_1',
  topicId: 'topic_1',
  startedAt: 1_700_000_000_000,
  endedAt: 1_700_000_600_000,
  messageCount: 4,
};

describe('ThinkingSessionSchema', () => {
  it('accepts an open session (no recap)', () => {
    expect(ThinkingSessionSchema.parse(valid)).toEqual(valid);
  });

  it('accepts a closed session with aiRecap', () => {
    const closed = { ...valid, aiRecap: '本轮厘清了现金流约束' };
    expect(ThinkingSessionSchema.parse(closed)).toEqual(closed);
  });

  it('rejects negative messageCount', () => {
    expect(() =>
      ThinkingSessionSchema.parse({ ...valid, messageCount: -1 }),
    ).toThrow();
  });

  it('rejects unknown extra fields (strict)', () => {
    expect(() =>
      ThinkingSessionSchema.parse({ ...valid, mood: 'tired' }),
    ).toThrow();
  });

  it('rejects missing topicId', () => {
    const { topicId: _drop, ...rest } = valid;
    expect(() => ThinkingSessionSchema.parse(rest)).toThrow();
  });
});
