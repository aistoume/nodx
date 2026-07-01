import { z } from 'zod';
import { IdSchema, TimestampSchema } from './common.js';

/**
 * 素材 (Material) — a reusable piece of thinking the user can pull into the
 * network graph. Two sources, unified under one "素材" umbrella:
 *
 *   solution    — 方案素材: an AbstractedCase (a Topic that reached a Local
 *                 Maximum and was abstracted into the 案例库 / CBR store).
 *   inspiration — 灵感素材: an Attention (a snippet captured from outside
 *                 nodx via Lens / manual paste — the 灵感池).
 *
 * The `kind` discriminator is persisted per source table (migration v12:
 * `abstracted_cases.material_kind` / `attentions.material_kind`) so a row's
 * material identity is explicit, and surfaced on this unified model.
 */
export const MaterialKindSchema = z.enum(['solution', 'inspiration']);
export type MaterialKind = z.infer<typeof MaterialKindSchema>;

/**
 * A lightweight, source-agnostic handle to one 素材 — enough to render a
 * graph node or a picker row without knowing which table it came from.
 */
export const MaterialRefSchema = z
  .object({
    /** The source row id (abstracted_cases.id or attentions.id). */
    id: IdSchema,
    kind: MaterialKindSchema,
    /** Primary label (case signature / attention text). */
    title: z.string().min(1),
    /** Secondary label (domain · decisionType, or source title). */
    subtitle: z.string().optional(),
    /** Longer body for the node (solution structure / explanation / snippet). */
    body: z.string().optional(),
    createdAt: TimestampSchema,
  })
  .strict();
export type MaterialRef = z.infer<typeof MaterialRefSchema>;

/** Display metadata per kind — used by the graph node + library badges. */
export const MATERIAL_KIND_META: Record<
  MaterialKind,
  { label: string; emoji: string }
> = {
  solution: { label: '方案', emoji: '🧩' },
  inspiration: { label: '灵感', emoji: '💡' },
};
