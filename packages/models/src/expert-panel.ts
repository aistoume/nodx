import { z } from 'zod';
import { IdSchema, TimestampSchema } from './common.js';
import { ExpertAgentSchema } from './expert-agent.js';
import { LocalMaximumResultSchema } from './local-maximum.js';
import { PanelRoundSchema } from './panel-round.js';

/**
 * Lifecycle of a panel:
 *   forming           — recommender proposed members, awaiting user confirm
 *   debating          — Rounds 1..N running
 *   converged         — synthesis emitted + (optionally) user-accepted
 *   rejected_by_user  — user discarded the Local Max, panel archived
 */
export const ExpertPanelStatusSchema = z.enum([
  'forming',
  'debating',
  'converged',
  'rejected_by_user',
]);
export type ExpertPanelStatus = z.infer<typeof ExpertPanelStatusSchema>;

/**
 * A panel is the structured-debate scaffold for one direction Topic.
 * One Topic ↔ one ExpertPanel (1:1). The panel owns its member list,
 * round transcripts, and the synthesised Local Max once it converges.
 *
 * At least one member is required so we can't kick off a debate of
 * zero — `min(1)` here mirrors the recommender's lower bound of 3
 * loosely; the strict 3–5 range is enforced upstream by the
 * recommender's prompt + UI.
 */
export const ExpertPanelSchema = z
  .object({
    id: IdSchema,
    topicId: IdSchema,
    domain: z.string().min(1),
    members: z.array(ExpertAgentSchema).min(1),
    status: ExpertPanelStatusSchema,
    rounds: z.array(PanelRoundSchema),
    localMaximum: LocalMaximumResultSchema.optional(),
    createdAt: TimestampSchema,
    updatedAt: TimestampSchema,
  })
  .strict();
export type ExpertPanel = z.infer<typeof ExpertPanelSchema>;
