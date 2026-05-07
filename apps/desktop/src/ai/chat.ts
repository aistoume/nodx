import { MODELS } from '@nodx/ai';
import type { Message } from '@nodx/models';
import { ai } from './gateway.js';

const COACH_SYSTEM = `你是 nodx 的对话陪练，帮助管理层用第一性原理把模糊问题拆清楚。

风格要求：
1. 用中文，2-4 句话之内回复，不要长篇大论。
2. 不要直接给答案。先复述你听到的核心问题（一句话），再提出 1-2 个能让用户深挖的反问。
3. 反问要直击假设、约束、成本，而不是泛泛而谈。
4. 不要列条目，自然成段。
5. 如果上下文里给了"思考文档"，**不要重复文档已经写过的观点**——你的任务是基于文档帮用户继续往前推。`;

export interface ChatReply {
  text: string;
  inputTokens: number;
  outputTokens: number;
}

/**
 * Send the recent conversation (and optionally the current thinking doc) to
 * the AI and return a single coaching reply. The doc is included so the
 * coach knows what's already been worked through.
 */
export async function askCoach(
  history: Message[],
  docContext?: string,
): Promise<ChatReply> {
  // Survey/factor_list/explanation messages carry JSON or are anchored to
  // the right panel — feeding them in as-is confuses the model. Keep the
  // transcript text-only.
  const recent = history.filter((m) => m.type === 'text').slice(-10);
  const transcript = recent
    .map((m) => `${m.role === 'user' ? '用户' : 'AI'}: ${m.content}`)
    .join('\n\n');

  const docBlock =
    docContext && docContext.trim()
      ? `【当前思考文档】\n${docContext.trim()}\n\n`
      : '';

  const transcriptBlock = transcript
    ? `【对话记录】\n${transcript}\n\n`
    : '【对话记录】\n（用户刚开始追问）\n\n';

  const prompt = `${docBlock}${transcriptBlock}请以陪练身份回应用户最后这条消息。直接回复，不要写"AI:"前缀。`;

  const r = await ai.completeText({
    prompt,
    model: MODELS.haiku,
    maxTokens: 800,
    system: COACH_SYSTEM,
    temperature: 0.7,
    enableWebSearch: true,
  });

  return {
    text: r.text.trim(),
    inputTokens: r.usage.inputTokens,
    outputTokens: r.usage.outputTokens,
  };
}
