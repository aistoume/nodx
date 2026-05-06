import { describe, expect, it } from 'vitest';
import {
  DOCUMENT_DRAFT_PROMPT_MODEL,
  REFINE_SELECTION_PROMPT_MODEL,
  buildDocumentDraftPrompt,
  buildRefineSelectionPrompt,
} from './document.js';

describe('buildDocumentDraftPrompt', () => {
  it('embeds question, factors, and decomposed sub-questions', () => {
    const out = buildDocumentDraftPrompt({
      question: '要不要 ALL IN AI？',
      selectedFactors: ['资源押注程度', '时机窗口判断'],
      decomposed: [
        {
          title: '资源押注程度',
          essence: '投入比例与退路',
          sub_questions: [
            { question: '可调配资源总量？', can_be_atomic: true },
            { question: '哪些是不可逆的？', can_be_atomic: false },
          ],
        },
      ],
    });
    expect(out).toContain('要不要 ALL IN AI？');
    expect(out).toContain('资源押注程度、时机窗口判断');
    expect(out).toContain('可调配资源总量？');
    expect(out).toContain('哪些是不可逆的？');
    expect(out).toContain('## 下一步');
  });

  it('asks for plain markdown without fenced code', () => {
    const out = buildDocumentDraftPrompt({
      question: 'q',
      selectedFactors: ['f1'],
      decomposed: [],
    });
    expect(out).toContain('Markdown');
    expect(out).toMatch(/不要.*代码块/);
  });
});

describe('buildRefineSelectionPrompt', () => {
  it('passes through document, selection, and question', () => {
    const out = buildRefineSelectionPrompt({
      fullDocument: '# 主题\n正文。',
      selection: '正文。',
      userQuestion: '能更具体吗？',
    });
    expect(out).toContain('# 主题');
    expect(out).toContain('能更具体吗？');
    expect(out).toContain('选中部分');
  });
});

describe('document prompt metadata', () => {
  it('routes both to sonnet (reasoning-heavy)', () => {
    expect(DOCUMENT_DRAFT_PROMPT_MODEL).toContain('sonnet');
    expect(REFINE_SELECTION_PROMPT_MODEL).toContain('sonnet');
  });
});
