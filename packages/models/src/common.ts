import { z } from 'zod';

export const IdSchema = z.string().min(1, 'id must not be empty');
export const TimestampSchema = z.number().int().nonnegative();

export type Id = z.infer<typeof IdSchema>;
export type Timestamp = z.infer<typeof TimestampSchema>;
