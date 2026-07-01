import {
  EXTRACT_EXECUTION_PROMPT_MODEL,
  ExecutionPlanOutputSchema,
  buildExtractExecutionPrompt,
  executionToMarkdown,
  type ExecutionPlanOutput,
} from '@nodx/ai';
import { ai } from './gateway.js';
import { getDocument } from '../db/documents.js';
import { listComments } from '../db/comments.js';
import { stripHtml } from './document.js';

export { executionToMarkdown };
export type { ExecutionPlanOutput };

/**
 * 拆出执行 (feature: 思考/执行 拆分): read a thinking topic's document + its
 * pinned atomic actions, and extract the concrete execution plan (a
 * verifiable 谁/做什么/何时/产出 checklist + prerequisites). Extraction only —
 * the prompt is told not to invent owners/dates.
 */
export async function extractExecutionPlan(
  topicId: string,
  topicTitle: string,
): Promise<ExecutionPlanOutput> {
  const doc = await getDocument(topicId);
  const documentText = doc ? stripHtml(doc.content) : '';

  const comments = await listComments(topicId);
  const atomicActions = comments
    .filter((c) => c.type === 'atomic' && c.atomicData)
    .map((c) => ({
      who: c.atomicData!.who,
      what: c.atomicData!.what,
      when: c.atomicData!.when,
      deliverable: c.atomicData!.deliverable,
      isComplete: c.atomicData!.isComplete,
    }));

  const r = await ai.completeUntilDone({
    prompt: buildExtractExecutionPrompt({
      topicTitle,
      documentText,
      atomicActions,
    }),
    model: EXTRACT_EXECUTION_PROMPT_MODEL,
    maxTokens: 2500,
    maxContinuations: 2,
    schema: ExecutionPlanOutputSchema,
    temperature: 0.3,
  });
  return r.data;
}
