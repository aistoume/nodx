import { z } from 'zod';
import { IdSchema, TimestampSchema } from './common.js';

/**
 * The "thinking document" attached to a Topic. Replaces the chat-bubble
 * conversation surface with a single editable artefact (PRD pivot 2026-05).
 *
 * `format` is locked to 'html' for now — TipTap editor reads/writes HTML and
 * markdown is converted at the boundary. Adding 'tiptap-json' or 'markdown'
 * later is non-breaking.
 */
export const TopicDocumentFormatSchema = z.enum(['html']);
export type TopicDocumentFormat = z.infer<typeof TopicDocumentFormatSchema>;

export const TopicDocumentSchema = z.object({
  topicId: IdSchema,
  content: z.string(),
  format: TopicDocumentFormatSchema,
  updatedAt: TimestampSchema,
});
export type TopicDocument = z.infer<typeof TopicDocumentSchema>;
