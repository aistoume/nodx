import {
  REPORT_PROMPT_MODEL,
  ReportOutputSchema,
  buildReportPrompt,
  reportToMarkdown,
  type ReportOutput,
} from '@nodx/ai';
import { ai } from './gateway.js';
import { gatherReportData } from '../db/report.js';

export interface DecisionReport {
  rootQuestion: string;
  report: ReportOutput;
  markdown: string;
}

/**
 * Generate a decision report for a topic subtree (PRD §3.10 / §8.7): gather
 * the subtree, run a single 收尾整理者 (Sonnet) call, return the structured
 * report + its Markdown. completeUntilDone guards against truncation on a
 * large subtree.
 */
export async function generateDecisionReport(
  rootTopicId: string,
): Promise<DecisionReport> {
  const input = await gatherReportData(rootTopicId);
  const r = await ai.completeUntilDone({
    prompt: buildReportPrompt(input),
    model: REPORT_PROMPT_MODEL,
    maxTokens: 8000,
    maxContinuations: 2,
    schema: ReportOutputSchema,
    temperature: 0.4,
  });
  return {
    rootQuestion: input.rootQuestion,
    report: r.data,
    markdown: reportToMarkdown(r.data, input.rootQuestion),
  };
}
