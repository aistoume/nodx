import { z } from 'zod';
import { IdSchema } from './common.js';

/**
 * The five panel roles required by the §3.14 protocol. Every panel
 * composition must include `critic` (devil's advocate) — enforced
 * upstream by the panel-recommender, not by this schema.
 */
export const PersonaRoleSchema = z.enum([
  'proposer',
  'critic',
  'practitioner',
  'constraint',
  'user_proxy',
]);
export type PersonaRole = z.infer<typeof PersonaRoleSchema>;

/**
 * Reusable persona definition lifted from the persona library.
 * Instances of this template become `ExpertAgent`s inside an
 * `ExpertPanel`.
 */
export const PersonaTemplateSchema = z
  .object({
    id: IdSchema,
    domain: z.array(z.string().min(1)),
    role: PersonaRoleSchema,
    displayName: z.string().min(1),
    systemPrompt: z.string().min(1),
    frameworks: z.array(z.string().min(1)),
    evalScore: z.number().min(0).max(1).optional(),
  })
  .strict();
export type PersonaTemplate = z.infer<typeof PersonaTemplateSchema>;
