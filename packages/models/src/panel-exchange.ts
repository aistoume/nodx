import { z } from 'zod';
import { IdSchema, TimestampSchema } from './common.js';

/**
 * A single utterance from one expert in one round.
 *
 * Note: PRD §5 omits the `id` field (PanelExchange is nested under
 * `PanelRound.exchanges`). We carry an explicit id so the normalised
 * `panel_exchanges` SQL table has a primary key and so client code
 * can address individual exchanges (delete, edit, anchor citations).
 */
export const PanelExchangeSchema = z
  .object({
    id: IdSchema,
    agentId: IdSchema,
    content: z.string().min(1),
    citations: z.array(z.string().min(1)).optional(),
    createdAt: TimestampSchema,
  })
  .strict();
export type PanelExchange = z.infer<typeof PanelExchangeSchema>;
