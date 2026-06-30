/**
 * Attention — a captured "thinking token" that arrived from outside nodx.
 *
 * Two flavours mirror the Lens extension's `SavedSnippet.kind`:
 *   - 'explain' — user clicked 🔍, paid for an AI explanation, then chose to save
 *   - 'quick'   — user clicked 💾 directly, no AI call, just attention worth
 *                 keeping. Can be "upgraded" later by attaching an explanation.
 *
 * Lifecycle:
 *   captured (lens / lens-mac / manual paste) → sits in Attention Inbox
 *   → user reviews, tags, optionally adds explanation
 *   → "promote to topic" creates a Topic and links it (promotedToTopicId)
 *
 * Persisted to SQLite table `attentions` (migration v11). The deep link
 * `nodx://capture?...` from Lens populates one row per click.
 */

import { z } from 'zod';
import { IdSchema, TimestampSchema } from './common.js';

export const AttentionKindSchema = z.enum(['explain', 'quick']);
export type AttentionKind = z.infer<typeof AttentionKindSchema>;

export const AttentionSourceSchema = z.enum([
  'lens-chrome', // Chrome / Edge / Brave Lens extension
  'lens-mac',    // macOS native Lens app
  'manual',      // pasted directly inside nodx
]);
export type AttentionSource = z.infer<typeof AttentionSourceSchema>;

export const AttentionSchema = z.object({
  id: IdSchema,
  /** The highlighted text the user saved. */
  text: z.string().min(1, 'attention text must not be empty'),
  /** AI explanation. Optional — bare 'quick' captures have none. */
  explanation: z.string().optional(),
  /** Source page / document URL. */
  sourceUrl: z.string().url().or(z.string().length(0)),
  /** Source page title (for display). */
  sourceTitle: z.string(),
  /** Where the capture came from (which client). */
  sourceKind: AttentionSourceSchema,
  /** Whether the user paid for an AI call when capturing. */
  kind: AttentionKindSchema,
  /** User-applied tags (manual or AI-suggested). */
  tags: z.array(z.string().min(1)),
  /**
   * If the user "promoted" this attention into a full nodx topic, the
   * resulting topic id is stored here. Null/undefined = still in inbox.
   */
  promotedToTopicId: IdSchema.optional(),
  /** When the snippet was captured on the source side (Lens). */
  capturedAt: TimestampSchema,
  /** When the row was inserted into nodx's DB. */
  ingestedAt: TimestampSchema,
});
export type Attention = z.infer<typeof AttentionSchema>;
