import {
  SYNTHESIZE_MATERIALS_PROMPT_MODEL,
  buildSynthesizeMaterialsPrompt,
  type SynthesisMaterialInput,
} from '@nodx/ai';
import { MATERIAL_KIND_META, type MaterialRef } from '@nodx/models';
import { ai } from './gateway.js';
import { getDocument } from '../db/documents.js';
import { stripHtml } from './document.js';

/**
 * 素材综合 (feature: materials → thinking node): the user linked several
 * materials to a thinking node and asked a question. Synthesise the linked
 * materials + question into fresh Markdown thinking. Returns the raw Markdown
 * for the caller to append to the node's document.
 */
export async function synthesizeMaterials(
  topicId: string,
  topicTitle: string,
  question: string,
  materials: MaterialRef[],
): Promise<string> {
  const doc = await getDocument(topicId);
  const existingDoc = doc ? stripHtml(doc.content) : '';

  const inputs: SynthesisMaterialInput[] = materials.map((m) => ({
    kindLabel: MATERIAL_KIND_META[m.kind].label,
    title: m.title,
    ...(m.subtitle ? { subtitle: m.subtitle } : {}),
    ...(m.body ? { body: m.body } : {}),
  }));

  const r = await ai.completeTextUntilDone({
    prompt: buildSynthesizeMaterialsPrompt({
      topicTitle,
      question,
      materials: inputs,
      existingDoc,
    }),
    model: SYNTHESIZE_MATERIALS_PROMPT_MODEL,
    maxTokens: 4000,
    maxContinuations: 2,
    temperature: 0.5,
  });
  return r.text.trim();
}
