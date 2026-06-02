import { z } from 'zod';
import { IdSchema } from './common.js';
import { PanelExchangeSchema } from './panel-exchange.js';

/**
 * The four canonical rounds of the §3.14 debate protocol.
 *   initial   — closed-book first take per expert
 *   critique  — each expert reads the others' Round 1
 *   refined   — each expert updates their stance
 *   synthesis — independent moderator outputs LocalMaximum
 *
 * `roundNumber` may exceed 4 only when the user rejects a Local Max
 * and forces another full pass (hard cap = 5; see PRD §3.14).
 */
export const PanelRoundTypeSchema = z.enum([
  'initial',
  'critique',
  'refined',
  'synthesis',
]);
export type PanelRoundType = z.infer<typeof PanelRoundTypeSchema>;

/**
 * Reasons the convergence judge halts a debate (PRD §8.9). A round
 * may hit more than one; any single hit is enough to advance to
 * synthesis.
 */
export const PanelStopSignalSchema = z.enum([
  'semantic_convergence',
  'marginal_decay',
  'max_rounds',
]);
export type PanelStopSignal = z.infer<typeof PanelStopSignalSchema>;

export const PanelRoundNumberSchema = z.union([
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(4),
  z.literal(5),
]);
export type PanelRoundNumber = z.infer<typeof PanelRoundNumberSchema>;

/**
 * One round of the panel debate.
 *
 * Note: PRD §5 omits `id` (PanelRound is nested under
 * `ExpertPanel.rounds`). We carry one for the normalised
 * `panel_rounds` SQL table.
 */
export const PanelRoundSchema = z
  .object({
    id: IdSchema,
    roundNumber: PanelRoundNumberSchema,
    type: PanelRoundTypeSchema,
    exchanges: z.array(PanelExchangeSchema),
    stopSignalsHit: z.array(PanelStopSignalSchema).optional(),
  })
  .strict();
export type PanelRound = z.infer<typeof PanelRoundSchema>;
