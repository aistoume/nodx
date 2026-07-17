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
  /**
   * The highlighted text the user saved. May be an empty string ONLY when
   * `imagePath` is set (an image-only capture) — the DB layer enforces this
   * invariant. For text-only or explain captures, must be non-empty.
   */
  text: z.string(),
  /** AI explanation. Optional — bare 'quick' captures have none. */
  explanation: z.string().optional(),
  /**
   * The user's ✏️ custom instruction (v15+), when the capture came from
   * Lens's custom-instruction flow — records WHAT was asked of this text
   * (e.g. "翻译成法语"), so the inbox shows the question, not just the
   * snippet. `explanation` then holds the AI's answer to it.
   */
  instruction: z.string().optional(),
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
  /**
   * ── Image capture (v14+) ───────────────────────────────────────────
   *
   * When set, the attention represents a screenshot/image the user framed
   * from the source page. The image bytes live in the app-data `media/`
   * folder; `imagePath` is a filesystem path (not a URL). Frontend reads
   * it via Tauri's `convertFileSrc` to render a thumbnail.
   *
   * `text` MAY be empty for image-only captures (user just clipped a
   * region with no text). `explanation` still applies — AI vision fills
   * it if the user clicks "explain this image".
   */
  imagePath: z.string().optional(),
  imageMime: z.string().optional(),
  imageWidth: z.number().int().positive().optional(),
  imageHeight: z.number().int().positive().optional(),
  /** When the snippet was captured on the source side (Lens). */
  capturedAt: TimestampSchema,
  /** When the row was inserted into nodx's DB. */
  ingestedAt: TimestampSchema,
});
export type Attention = z.infer<typeof AttentionSchema>;

/**
 * True for image-carrying attentions — a screenshot / clipped region from
 * the source page. Text-only attentions return false. Used by the UI to
 * pick the image-card renderer vs. the text-card renderer.
 */
export function isImageAttention(a: Attention): boolean {
  return typeof a.imagePath === 'string' && a.imagePath.length > 0;
}
