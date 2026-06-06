import { z } from 'zod';
import { IdSchema } from './common.js';

/**
 * CBR adaptation (PRD §3.16 ④). When the user picks a retrieved case to
 * "采用", the 适配执行师 (Sonnet) rewrites the old solution into the new
 * context — never a verbatim replay. The output is transient (acted on by
 * the user, not persisted in V1).
 *
 * If `requiresExpertPanel` is true, `rediscussDirections` carries the points
 * that genuinely differ and should be re-debated — the §3.14 panel then only
 * needs to run those, not the whole thing.
 */
export const AdaptedSolutionSchema = z
  .object({
    /** The case this was adapted from. */
    sourceCaseId: IdSchema,
    /** The transferable skeleton kept from the old solution. */
    inheritedStructure: z.string().min(1),
    /** Levers re-expressed for the new context. */
    contextualizedLevers: z.array(z.string().min(1)),
    /** Risk mitigations specific to the new situation. */
    newRiskMitigations: z.array(z.string().min(1)),
    /** True when context differs enough that a fresh debate is warranted. */
    requiresExpertPanel: z.boolean(),
    /** If requiresExpertPanel, the differing points to (re)debate. */
    rediscussDirections: z.array(z.string().min(1)),
  })
  .strict();
export type AdaptedSolution = z.infer<typeof AdaptedSolutionSchema>;
