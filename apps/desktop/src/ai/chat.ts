import { MODELS } from '@nodx/ai';
import type { Message } from '@nodx/models';
import { ai } from './gateway.js';

const COACH_SYSTEM = `你是 nodx 的对话陪练，帮助管理层用第一性原理把模糊问题拆清楚。

风格要求：
1. 用中文，2-4 句话之内回复，不要长篇大论。
2. 不要直接给答案。先复述你听到的核心问题（一句话），再提出 1-2 个能让用户深挖的反问。
3. 反问要直击假设、约束、成本，而不是泛泛而谈。
4. 不要列条目，自然成段。`;

export interface ChatReply {
  text: string;
  inputTokens: number;
  outputTokens: number;
}

/**
 * Send the recent conversation to the AI and return a single coaching reply.
 * For now we flatten the history into a single prompt rather than using the
 * Anthropic Messages role array — the gateway accepts a string prompt and
 * adding a multi-turn passthrough is a follow-up.
 */
export async function askCoach(history: Message[]): Promise<ChatReply> {
  const recent = history.slice(-10);
  const transcript = recent
    .map((m) => `${m.role === 'user' ? '用户' : 'AI'}: ${m.content}`)
    .join('\n\n');

  const prompt = `这是当前对话的最近记录，最后一条是用户刚发的消息。请以第一性原理思考陪练的身份回应最后这条消息。

${transcript}

请直接以陪练身份回复（不要写"AI:"前缀）：`;

  const r = await ai.completeText({
    prompt,
    model: MODELS.haiku,
    maxTokens: 600,
    system: COACH_SYSTEM,
    temperature: 0.7,
  });

  return {
    text: r.text.trim(),
    inputTokens: r.usage.inputTokens,
    outputTokens: r.usage.outputTokens,
  };
}
