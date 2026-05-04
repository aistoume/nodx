import { z } from 'zod';
import { IdSchema } from './common.js';

export const EdgeTypeSchema = z.enum(['parent', 'semantic']);
export type EdgeType = z.infer<typeof EdgeTypeSchema>;

export const EdgeSchema = z
  .object({
    id: IdSchema,
    sourceId: IdSchema,
    targetId: IdSchema,
    type: EdgeTypeSchema,
    isUserConfirmed: z.boolean(),
    weight: z.number().min(0).max(1).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.sourceId === value.targetId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'sourceId and targetId must differ',
        path: ['targetId'],
      });
    }
    if (value.type === 'semantic' && value.weight === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'semantic edges must include a weight',
        path: ['weight'],
      });
    }
  });
export type Edge = z.infer<typeof EdgeSchema>;
