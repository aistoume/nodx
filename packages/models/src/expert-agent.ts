import { z } from 'zod';
import { IdSchema } from './common.js';
import { PersonaRoleSchema } from './persona-template.js';

/**
 * A single panel member, instantiated from a `PersonaTemplate`.
 * `systemPrompt` may be the template's prompt verbatim, or one with
 * topic-specific context injected by the panel-recommender (PRD §8.9
 * step 2).
 */
export const ExpertAgentSchema = z
  .object({
    id: IdSchema,
    personaTemplateId: IdSchema,
    displayName: z.string().min(1),
    role: PersonaRoleSchema,
    systemPrompt: z.string().min(1),
  })
  .strict();
export type ExpertAgent = z.infer<typeof ExpertAgentSchema>;
