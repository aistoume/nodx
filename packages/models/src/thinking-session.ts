import { z } from 'zod';
import { IdSchema, TimestampSchema } from './common.js';

/**
 * A single continuous stretch of thinking on a Topic (PRD §3.13). Messages
 * belong to a session via `Message.sessionId`. A session is "active" while
 * the user keeps interacting; after a quiet gap it's closed and Haiku writes
 * an `aiRecap`. Recaps + the Topic's reasoningTrace feed the "上次回顾" replay
 * card (§3.11).
 *
 * Note on `endedAt`: it's always present (PRD §5). For an open session it
 * tracks the last activity time and is finalised when the session closes;
 * the desktop treats "no aiRecap" as the open marker.
 */
export const ThinkingSessionSchema = z
  .object({
    id: IdSchema,
    topicId: IdSchema,
    startedAt: TimestampSchema,
    endedAt: TimestampSchema,
    messageCount: z.number().int().nonnegative(),
    /** AI summary written when the session closes (absent while open). */
    aiRecap: z.string().optional(),
  })
  .strict();
export type ThinkingSession = z.infer<typeof ThinkingSessionSchema>;
