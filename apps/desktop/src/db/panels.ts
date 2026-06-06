import {
  ExpertPanelSchema,
  type DivergenceItem,
  type ExpertAgent,
  type ExpertPanel,
  type ExpertPanelStatus,
  type LocalMaximumResult,
  type PanelExchange,
  type PanelRound,
  type PanelRoundType,
  type PanelStopSignal,
} from '@nodx/models';
import { getDb } from './client.js';

// ──────────────────────────────────────────────────────────────────────
// Expert Panel persistence (PRD §3.14 / migration v4).
//
// snake_case in SQL ↔ camelCase in models, `*_json` columns JSON-parsed at
// read time, and the hydrated object is validated through @nodx/models
// before it leaves this module — same contract as db/topics.ts.
//
// The four v4 tables map to one nested ExpertPanel:
//   expert_panels  → the panel + flattened LocalMaximumResult
//   panel_rounds   → ExpertPanel.rounds[]
//   panel_exchanges→ PanelRound.exchanges[]
//   (members live inside expert_panels.members_json, no own table)
// ──────────────────────────────────────────────────────────────────────

interface PanelRow {
  id: string;
  topic_id: string;
  domain: string;
  members_json: string;
  status: string;
  best_answer: string | null;
  confidence: number | null;
  consensus_json: string | null;
  divergence_json: string | null;
  open_questions_json: string | null;
  accepted_by_user: number | null;
  accepted_at: number | null;
  created_at: number;
  updated_at: number;
}

interface RoundRow {
  id: string;
  panel_id: string;
  round_number: number;
  type: string;
  stop_signals_hit_json: string | null;
}

interface ExchangeRow {
  id: string;
  round_id: string;
  agent_id: string;
  content: string;
  citations_json: string | null;
  created_at: number;
}

const PANEL_COLUMNS =
  'id, topic_id, domain, members_json, status, best_answer, confidence, consensus_json, divergence_json, open_questions_json, accepted_by_user, accepted_at, created_at, updated_at';

/**
 * Reassemble the flattened LocalMaximumResult columns. Returns undefined
 * until the panel has converged (best_answer is the NULL/NOT-NULL pivot).
 */
function rowToLocalMaximum(r: PanelRow): LocalMaximumResult | undefined {
  if (r.best_answer == null || r.confidence == null) return undefined;
  return {
    consensus: r.consensus_json
      ? (JSON.parse(r.consensus_json) as string[])
      : [],
    divergence: r.divergence_json
      ? (JSON.parse(r.divergence_json) as DivergenceItem[])
      : [],
    openQuestions: r.open_questions_json
      ? (JSON.parse(r.open_questions_json) as string[])
      : [],
    bestAnswer: r.best_answer,
    confidence: r.confidence,
    acceptedByUser: r.accepted_by_user === 1,
    ...(r.accepted_at != null ? { acceptedAt: r.accepted_at } : {}),
  };
}

function rowToExchange(r: ExchangeRow): PanelExchange {
  const citations = r.citations_json
    ? (JSON.parse(r.citations_json) as string[])
    : undefined;
  return {
    id: r.id,
    agentId: r.agent_id,
    content: r.content,
    ...(citations ? { citations } : {}),
    createdAt: r.created_at,
  };
}

function rowToRound(r: RoundRow, exchanges: PanelExchange[]): PanelRound {
  const stopSignalsHit = r.stop_signals_hit_json
    ? (JSON.parse(r.stop_signals_hit_json) as PanelStopSignal[])
    : undefined;
  return {
    id: r.id,
    roundNumber: r.round_number as PanelRound['roundNumber'],
    type: r.type as PanelRoundType,
    exchanges,
    ...(stopSignalsHit && stopSignalsHit.length > 0 ? { stopSignalsHit } : {}),
  };
}

export interface CreatePanelInput {
  topicId: string;
  domain: string;
  members: ExpertAgent[];
}

/**
 * Open a panel in the `forming` state once the recommender has proposed
 * members. Rounds + Local Max are filled in later by the debate loop.
 */
export async function createPanel(input: CreatePanelInput): Promise<ExpertPanel> {
  const now = Date.now();
  const panel: ExpertPanel = ExpertPanelSchema.parse({
    id: crypto.randomUUID(),
    topicId: input.topicId,
    domain: input.domain,
    members: input.members,
    status: 'forming',
    rounds: [],
    createdAt: now,
    updatedAt: now,
  });

  const db = await getDb();
  await db.execute(
    `INSERT INTO expert_panels (id, topic_id, domain, members_json, status, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      panel.id,
      panel.topicId,
      panel.domain,
      JSON.stringify(panel.members),
      panel.status,
      panel.createdAt,
      panel.updatedAt,
    ],
  );
  return panel;
}

export async function updatePanelStatus(
  panelId: string,
  status: ExpertPanelStatus,
): Promise<void> {
  const db = await getDb();
  await db.execute(
    'UPDATE expert_panels SET status = $1, updated_at = $2 WHERE id = $3',
    [status, Date.now(), panelId],
  );
}

export async function insertRound(
  panelId: string,
  round: Pick<PanelRound, 'id' | 'roundNumber' | 'type' | 'stopSignalsHit'>,
): Promise<void> {
  const db = await getDb();
  await db.execute(
    `INSERT INTO panel_rounds (id, panel_id, round_number, type, stop_signals_hit_json)
     VALUES ($1, $2, $3, $4, $5)`,
    [
      round.id,
      panelId,
      round.roundNumber,
      round.type,
      round.stopSignalsHit ? JSON.stringify(round.stopSignalsHit) : null,
    ],
  );
}

/**
 * Persist the convergence stop-signals once a round completes (they're
 * computed after the round's exchanges land, so the row is updated rather
 * than re-inserted).
 */
export async function updateRoundStopSignals(
  roundId: string,
  stopSignalsHit: PanelStopSignal[] | undefined,
): Promise<void> {
  const db = await getDb();
  await db.execute(
    'UPDATE panel_rounds SET stop_signals_hit_json = $1 WHERE id = $2',
    [stopSignalsHit && stopSignalsHit.length > 0 ? JSON.stringify(stopSignalsHit) : null, roundId],
  );
}

export async function insertExchange(
  roundId: string,
  exchange: PanelExchange,
): Promise<void> {
  const db = await getDb();
  await db.execute(
    `INSERT INTO panel_exchanges (id, round_id, agent_id, content, citations_json, created_at)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      exchange.id,
      roundId,
      exchange.agentId,
      exchange.content,
      exchange.citations ? JSON.stringify(exchange.citations) : null,
      exchange.createdAt,
    ],
  );
}

/**
 * Flatten the synthesised Local Max into the panel row and mark the panel
 * `converged`. `acceptedByUser` stays false here — that's a separate user
 * action (`acceptLocalMaximum`).
 */
export async function saveLocalMaximum(
  panelId: string,
  result: LocalMaximumResult,
): Promise<void> {
  const db = await getDb();
  await db.execute(
    `UPDATE expert_panels
     SET status = 'converged',
         best_answer = $1,
         confidence = $2,
         consensus_json = $3,
         divergence_json = $4,
         open_questions_json = $5,
         accepted_by_user = $6,
         accepted_at = $7,
         updated_at = $8
     WHERE id = $9`,
    [
      result.bestAnswer,
      result.confidence,
      JSON.stringify(result.consensus),
      JSON.stringify(result.divergence),
      JSON.stringify(result.openQuestions),
      result.acceptedByUser ? 1 : 0,
      result.acceptedAt ?? null,
      Date.now(),
      panelId,
    ],
  );
}

/**
 * User accepts the Local Max as this direction's answer: flip the flag and
 * promote `bestAnswer` into the Topic's `ai_summary` (PRD §3.14 wiring —
 * the direction's summary flows up from the panel).
 */
export async function acceptLocalMaximum(panelId: string): Promise<void> {
  const db = await getDb();
  const now = Date.now();
  await db.execute(
    'UPDATE expert_panels SET accepted_by_user = 1, accepted_at = $1, updated_at = $1 WHERE id = $2',
    [now, panelId],
  );
  await db.execute(
    `UPDATE topics
     SET ai_summary = (SELECT best_answer FROM expert_panels WHERE id = $1),
         updated_at = $2
     WHERE id = (SELECT topic_id FROM expert_panels WHERE id = $1)`,
    [panelId, now],
  );
}

/**
 * Drop a panel entirely (members + rounds + exchanges cascade via FK).
 * Used by "重新组建" — the user wants a fresh persona stack.
 */
export async function deletePanel(panelId: string): Promise<void> {
  const db = await getDb();
  await db.execute('DELETE FROM expert_panels WHERE id = $1', [panelId]);
}

/**
 * Wipe a panel's rounds (exchanges cascade) but keep the panel + members.
 * Used by "重新辩论" — same experts, fresh debate. Resets the panel back to
 * `forming` and clears any prior Local Max so the row is clean for a re-run.
 */
export async function clearPanelRounds(panelId: string): Promise<void> {
  const db = await getDb();
  await db.execute('DELETE FROM panel_rounds WHERE panel_id = $1', [panelId]);
  await db.execute(
    `UPDATE expert_panels
     SET status = 'forming',
         best_answer = NULL,
         confidence = NULL,
         consensus_json = NULL,
         divergence_json = NULL,
         open_questions_json = NULL,
         accepted_by_user = NULL,
         accepted_at = NULL,
         updated_at = $1
     WHERE id = $2`,
    [Date.now(), panelId],
  );
}

/**
 * Hydrate the full nested ExpertPanel for a direction Topic, or null if no
 * panel exists yet. Validated through ExpertPanelSchema so a malformed row
 * fails loudly here rather than downstream.
 */
export async function getPanelByTopic(
  topicId: string,
): Promise<ExpertPanel | null> {
  const db = await getDb();
  const panelRows = await db.select<PanelRow[]>(
    `SELECT ${PANEL_COLUMNS} FROM expert_panels WHERE topic_id = $1 ORDER BY created_at DESC LIMIT 1`,
    [topicId],
  );
  const p = panelRows[0];
  if (!p) return null;

  const roundRows = await db.select<RoundRow[]>(
    'SELECT id, panel_id, round_number, type, stop_signals_hit_json FROM panel_rounds WHERE panel_id = $1 ORDER BY round_number ASC',
    [p.id],
  );

  const rounds: PanelRound[] = await Promise.all(
    roundRows.map(async (rr) => {
      const exRows = await db.select<ExchangeRow[]>(
        'SELECT id, round_id, agent_id, content, citations_json, created_at FROM panel_exchanges WHERE round_id = $1 ORDER BY created_at ASC',
        [rr.id],
      );
      return rowToRound(rr, exRows.map(rowToExchange));
    }),
  );

  const localMaximum = rowToLocalMaximum(p);

  return ExpertPanelSchema.parse({
    id: p.id,
    topicId: p.topic_id,
    domain: p.domain,
    members: JSON.parse(p.members_json) as ExpertAgent[],
    status: p.status,
    rounds,
    ...(localMaximum ? { localMaximum } : {}),
    createdAt: p.created_at,
    updatedAt: p.updated_at,
  });
}
