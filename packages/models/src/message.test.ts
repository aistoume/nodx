import { describe, expect, it } from 'vitest';
import { MessageSchema, type Message } from './message.js';

const baseMessage: Message = {
  id: 'msg_1',
  topicId: 'topic_1',
  sessionId: 'session_1',
  role: 'user',
  type: 'text',
  content: 'AI 浪潮下要不要重押？',
  createdAt: 1_700_000_000_000,
};

describe('MessageSchema', () => {
  it('accepts a minimal user message', () => {
    expect(MessageSchema.parse(baseMessage)).toEqual(baseMessage);
  });

  it('accepts ai message with anchors and mentions', () => {
    const enriched: Message = {
      ...baseMessage,
      role: 'ai',
      type: 'factor_list',
      anchors: ['anchor_a', 'anchor_b'],
      mentions: ['topic_2'],
    };
    expect(MessageSchema.parse(enriched)).toEqual(enriched);
  });

  it('rejects unknown role', () => {
    expect(() =>
      MessageSchema.parse({ ...baseMessage, role: 'system' }),
    ).toThrow();
  });

  it('rejects unknown type', () => {
    expect(() =>
      MessageSchema.parse({ ...baseMessage, type: 'image' }),
    ).toThrow();
  });

  it('accepts empty content (e.g. survey skeleton)', () => {
    expect(
      MessageSchema.parse({ ...baseMessage, type: 'survey', content: '' }),
    ).toMatchObject({ content: '' });
  });

  it('requires sessionId', () => {
    const { sessionId: _drop, ...rest } = baseMessage;
    expect(() => MessageSchema.parse(rest)).toThrow();
  });

  it('accepts the replay_card type', () => {
    expect(
      MessageSchema.parse({ ...baseMessage, type: 'replay_card' }),
    ).toMatchObject({ type: 'replay_card' });
  });
});
