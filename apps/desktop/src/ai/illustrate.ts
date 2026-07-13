/**
 * 选段配图 — turn a selected passage of the thinking document into an
 * explanatory illustration:
 *
 *   1. Sonnet reads the passage (+ topic title for context) and writes ONE
 *      concise English image prompt for a clean, diagram-like illustration.
 *   2. POST /v1/generate-image on the in-proc gateway → Gemini image model →
 *      saved into the media dir → `{ file }`.
 *
 * The caller embeds the returned file via `mediaImageHtml()`.
 */

import { MODELS } from '@nodx/ai';
import { ai, getGatewayConfig } from './gateway.js';
import { friendlierAiError } from './explain.js';

export interface IllustrationResult {
  /** Media filename (serve via mediaUrl / embed via mediaImageHtml). */
  file: string;
  /** The image prompt Sonnet wrote — kept for the caption / regeneration. */
  prompt: string;
}

export async function illustrateSelection(
  selection: string,
  topicTitle: string,
): Promise<IllustrationResult> {
  try {
    // 1) Sonnet writes the image prompt — diagram-like, not decorative.
    const promptWriter = `你是视觉化助手。下面是一份决策思考文档里被选中的段落（主题：「${topicTitle}」）。请为它写一条**英文**图像生成 prompt，生成一张帮助理解这段逻辑的示意插图。

要求：
- 图的风格：clean minimal business illustration / conceptual diagram，白底，少量配色，无文字标注（模型写字容易错）
- 传达段落的核心关系或概念，不要装饰性场景
- 只输出 prompt 本身，一段话，不要引号、不要解释

【选中段落】
${selection.slice(0, 2000)}`;

    const w = await ai.completeText({
      prompt: promptWriter,
      model: MODELS.sonnet,
      maxTokens: 300,
    });
    const imagePrompt = w.text.trim();

    // 2) Gateway → Gemini image → media file.
    const config = await getGatewayConfig();
    const res = await fetch(`${config.endpoint}/v1/generate-image`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${config.clientToken}`,
      },
      body: JSON.stringify({ prompt: imagePrompt }),
    });
    if (!res.ok) {
      let detail = `HTTP ${res.status}`;
      try {
        const j = (await res.json()) as { error?: string };
        if (j.error) detail = j.error;
      } catch {
        /* keep status */
      }
      throw new Error(`出图失败: ${detail}`);
    }
    const j = (await res.json()) as { file: string };
    return { file: j.file, prompt: imagePrompt };
  } catch (err) {
    throw friendlierAiError(err);
  }
}
