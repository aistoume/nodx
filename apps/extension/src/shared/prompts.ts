/**
 * AI prompt templates — bilingual.
 *
 * Caller passes `locale` so the resulting prompt asks the model to respond
 * in the matching language.
 */

import type { Locale } from './i18n.js';

/** Non-zh/en locales ride the English template + an answer-language line. */
const RESPOND_IN: Partial<Record<Locale, string>> = {
  fr: 'Respond in French.',
  ja: 'Respond in Japanese.',
  es: 'Respond in Spanish.',
  de: 'Respond in German.',
  ko: 'Respond in Korean.',
  pt: 'Respond in Portuguese.',
};

export function buildExplainPrompt(text: string, locale: Locale): string {
  if (locale !== 'zh') {
    const langLine = RESPOND_IN[locale] ? `\n8. ${RESPOND_IN[locale]}` : '';
    return `You are nodx Lens, an inline web explanation helper. The user selected a phrase on a webpage and wants a short, clear, context-aware explanation.

Selected text:
"""
${text}
"""

Requirements:
1. Length: strictly 50–150 words.
2. First sentence: state the definition or core idea directly. No filler.
3. If it's a term or acronym: full name + one-line definition + one common usage scenario.
4. If it's a concept: explain it with one concrete example.
5. If it's a person or organization: brief identity + why they matter.
6. Do NOT ask back, do NOT give long history.
7. Output ONLY the explanation text. No "Here is the explanation:" prefix.${langLine}

Begin now:`;
  }

  return `你是 nodx Lens，一个网页内联解释助手。用户在网页上选中了一段文字，希望你给出**简短、清晰、有上下文意识**的解释。

选中文字：
"""
${text}
"""

要求：
1. **长度严格控制**：50–150 字
2. **第一句话**直接给定义或核心解释，不啰嗦
3. 如果是术语 / 缩写 → 给出完整名 + 一句话定义 + 一个常见使用场景
4. 如果是概念 → 用一个具体例子说明
5. 如果是人名 / 机构 → 简介 + 为什么重要
6. **不要**反问、不要给历史背景的长篇大论
7. **直接输出解释正文**，不要加"以下是解释：" 这类废话

立即开始：`;
}

export function buildDeepenPrompt(text: string, locale: Locale): string {
  if (locale !== 'zh') {
    const langLine = RESPOND_IN[locale] ? `\n6. ${RESPOND_IN[locale]}` : '';
    return `You are nodx Lens. The user already saw a short explanation of the text below and now wants a deeper take.

Original text:
"""
${text}
"""

Requirements:
1. Length: 200–400 words.
2. Cover any 2–3 of these as relevant:
   - Core mechanism or principle
   - One concrete example or case
   - Important historical milestone(s)
   - Common misconception(s) or counterexample(s)
   - Comparison with adjacent concept(s)
3. Use clear sub-headings or numbered points so it's scannable.
4. Avoid jargon; an educated non-specialist should follow it.${langLine}
5. Begin the body immediately:`;
  }

  return `你是 nodx Lens，用户刚才看了一段简短解释，现在希望**深入了解**这段文字背后的内容。

原文：
"""
${text}
"""

要求：
1. **长度 200–400 字**
2. 涵盖以下任选 2-3 项（视相关性）：
   - 核心机制 / 原理
   - 一个具体例子或案例
   - 重要的历史发展或里程碑
   - 常见误解 / 反例
   - 与相邻概念的对比
3. 用**清晰的小标题或编号**组织，方便快速扫读
4. 避免过度技术化，**给受过教育的非专业人士也能看懂**
5. 立即开始正文：`;
}
