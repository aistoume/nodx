import type { LocalMaximumResult } from '@nodx/models';

/**
 * Render a panel's Local Maximum verbatim as a standalone Markdown document —
 * no AI rewriting. Used by the「📋 直接替换文档」action: the structured fields
 * become the document, replacing whatever was there.
 *
 * Sections with no content (empty consensus / divergence / openQuestions)
 * are omitted entirely rather than rendered as empty headings.
 */
export function localMaxToMarkdown(lm: LocalMaximumResult): string {
  const pct = Math.round(lm.confidence * 100);
  const parts: string[] = [
    `# ${firstSentence(lm.bestAnswer)}`,
    `> 把握度：${pct}%`,
  ];

  if (lm.consensus.length > 0) {
    parts.push('## 共识点', lm.consensus.map((c) => `- ${c}`).join('\n'));
  }
  if (lm.divergence.length > 0) {
    parts.push(
      '## 分歧与权衡',
      lm.divergence
        .map((d) => `- **${d.point}** —— 在 ${d.conditions} 条件下成立`)
        .join('\n'),
    );
  }
  if (lm.openQuestions.length > 0) {
    parts.push('## 待解问题', lm.openQuestions.map((q) => `- ${q}`).join('\n'));
  }

  parts.push('---', '## 结论详述', lm.bestAnswer.trim());
  return parts.join('\n\n');
}

/** Headline = bestAnswer up to its first 句号 or newline (whichever first). */
function firstSentence(text: string): string {
  const t = text.trim();
  const cut = t.search(/[。\n]/);
  return cut === -1 ? t : t.slice(0, cut);
}
