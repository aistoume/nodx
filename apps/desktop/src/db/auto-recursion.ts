import {
  AutoRecursionRunSchema,
  NextMovePlanSchema,
  type AutoRecursionMode,
  type AutoRecursionRun,
  type AutoRecursionStatus,
  type NextMovePlan,
  type RunInterruption,
} from '@nodx/models';
import { getDb } from './client.js';

// ──────────────────────────────────────────────────────────────────────
// 自动递进引擎 persistence (PRD §3.19, Sprint B) — migration v10 tables.
// Row↔model translation per db/topics.ts conventions: snake_case rows,
// *_json TEXT columns JSON.parse'd, schemas validate on hydrate.
// ──────────────────────────────────────────────────────────────────────

/** PRD §3.19 hard-cap defaults (Settings-tunable later). */
export const DEFAULT_BUDGET_USD = 5.0;
export const DEFAULT_DEPTH_LIMIT = 4;

// ── next_move_plans ───────────────────────────────────────────────────

interface PlanRow {
  id: string;
  topic_id: string;
  status: string;
  atomicity_score: number;
  whats_missing_json: string;
  child_candidates_json: string;
  top_pick: string | null;
  top_pick_reasoning: string | null;
  created_at: number;
}

const PLAN_COLUMNS =
  'id, topic_id, status, atomicity_score, whats_missing_json, child_candidates_json, top_pick, top_pick_reasoning, created_at';

function rowToPlan(r: PlanRow): NextMovePlan {
  return NextMovePlanSchema.parse({
    id: r.id,
    topicId: r.topic_id,
    status: r.status,
    atomicityScore: r.atomicity_score,
    whatsMissing: JSON.parse(r.whats_missing_json),
    childCandidates: JSON.parse(r.child_candidates_json),
    ...(r.top_pick != null ? { topPick: r.top_pick } : {}),
    ...(r.top_pick_reasoning != null
      ? { topPickReasoning: r.top_pick_reasoning }
      : {}),
    createdAt: r.created_at,
  });
}

export async function insertNextMovePlan(plan: NextMovePlan): Promise<void> {
  const db = await getDb();
  await db.execute(
    `INSERT INTO next_move_plans (${PLAN_COLUMNS})
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      plan.id,
      plan.topicId,
      plan.status,
      plan.atomicityScore,
      JSON.stringify(plan.whatsMissing),
      JSON.stringify(plan.childCandidates),
      plan.topPick ?? null,
      plan.topPickReasoning ?? null,
      plan.createdAt,
    ],
  );
}

/** Most recent PM plan for a topic (uses idx_nmp_topic), or null. */
export async function getLatestPlanForTopic(
  topicId: string,
): Promise<NextMovePlan | null> {
  const db = await getDb();
  const rows = await db.select<PlanRow[]>(
    `SELECT ${PLAN_COLUMNS} FROM next_move_plans
     WHERE topic_id = $1 ORDER BY created_at DESC LIMIT 1`,
    [topicId],
  );
  return rows[0] ? rowToPlan(rows[0]) : null;
}

// ── auto_recursion_runs ───────────────────────────────────────────────

interface RunRow {
  id: string;
  root_topic_id: string;
  mode: string;
  budget_usd: number;
  depth_limit: number;
  started_at: number;
  ended_at: number | null;
  status: string;
  total_spent_usd: number;
  max_depth_reached: number;
  spawned_topic_ids_json: string;
  interruptions_json: string;
}

const RUN_COLUMNS =
  'id, root_topic_id, mode, budget_usd, depth_limit, started_at, ended_at, status, total_spent_usd, max_depth_reached, spawned_topic_ids_json, interruptions_json';

function rowToRun(r: RunRow): AutoRecursionRun {
  return AutoRecursionRunSchema.parse({
    id: r.id,
    rootTopicId: r.root_topic_id,
    mode: r.mode,
    budgetUsd: r.budget_usd,
    depthLimit: r.depth_limit,
    startedAt: r.started_at,
    ...(r.ended_at != null ? { endedAt: r.ended_at } : {}),
    status: r.status,
    totalSpentUsd: r.total_spent_usd,
    maxDepthReached: r.max_depth_reached,
    spawnedTopicIds: JSON.parse(r.spawned_topic_ids_json),
    interruptions: JSON.parse(r.interruptions_json),
  });
}

export interface CreateRunInput {
  rootTopicId: string;
  mode: AutoRecursionMode;
  budgetUsd?: number;
  depthLimit?: number;
}

export async function createRun(
  input: CreateRunInput,
): Promise<AutoRecursionRun> {
  const run: AutoRecursionRun = AutoRecursionRunSchema.parse({
    id: crypto.randomUUID(),
    rootTopicId: input.rootTopicId,
    mode: input.mode,
    budgetUsd: input.budgetUsd ?? DEFAULT_BUDGET_USD,
    depthLimit: input.depthLimit ?? DEFAULT_DEPTH_LIMIT,
    startedAt: Date.now(),
    status: 'running',
    totalSpentUsd: 0,
    maxDepthReached: 0,
    spawnedTopicIds: [],
    interruptions: [],
  });
  const db = await getDb();
  await db.execute(
    `INSERT INTO auto_recursion_runs (${RUN_COLUMNS})
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
    [
      run.id,
      run.rootTopicId,
      run.mode,
      run.budgetUsd,
      run.depthLimit,
      run.startedAt,
      null,
      run.status,
      run.totalSpentUsd,
      run.maxDepthReached,
      '[]',
      '[]',
    ],
  );
  return run;
}

export async function getRun(id: string): Promise<AutoRecursionRun | null> {
  const db = await getDb();
  const rows = await db.select<RunRow[]>(
    `SELECT ${RUN_COLUMNS} FROM auto_recursion_runs WHERE id = $1`,
    [id],
  );
  return rows[0] ? rowToRun(rows[0]) : null;
}

/** Runs for a root topic, newest first (uses idx_arr_root). */
export async function listRunsForRoot(
  rootTopicId: string,
): Promise<AutoRecursionRun[]> {
  const db = await getDb();
  const rows = await db.select<RunRow[]>(
    `SELECT ${RUN_COLUMNS} FROM auto_recursion_runs
     WHERE root_topic_id = $1 ORDER BY started_at DESC`,
    [rootTopicId],
  );
  return rows.map(rowToRun);
}

/** Terminal transition: set status + ended_at (every non-'running' status ends the run in V1). */
export async function finishRun(
  id: string,
  status: Exclude<AutoRecursionStatus, 'running'>,
): Promise<void> {
  const db = await getDb();
  await db.execute(
    'UPDATE auto_recursion_runs SET status = $1, ended_at = $2 WHERE id = $3',
    [status, Date.now(), id],
  );
}

/** Accumulate live spend (PM/judge/panel calls) onto the run. */
export async function addRunSpend(id: string, usd: number): Promise<void> {
  if (usd <= 0) return;
  const db = await getDb();
  await db.execute(
    'UPDATE auto_recursion_runs SET total_spent_usd = total_spent_usd + $1 WHERE id = $2',
    [usd, id],
  );
}

/** Record a spawned child + bump max depth (read-modify-write; runs are single-writer). */
export async function recordSpawnedTopic(
  runId: string,
  topicId: string,
  depth: number,
): Promise<void> {
  const run = await getRun(runId);
  if (!run) throw new Error(`run not found: ${runId}`);
  const db = await getDb();
  await db.execute(
    `UPDATE auto_recursion_runs
     SET spawned_topic_ids_json = $1, max_depth_reached = MAX(max_depth_reached, $2)
     WHERE id = $3`,
    [JSON.stringify([...run.spawnedTopicIds, topicId]), depth, runId],
  );
}

/** Log a Chair intervention (pause / redirect / rollback). */
export async function addInterruption(
  runId: string,
  interruption: RunInterruption,
): Promise<void> {
  const run = await getRun(runId);
  if (!run) throw new Error(`run not found: ${runId}`);
  const db = await getDb();
  await db.execute(
    'UPDATE auto_recursion_runs SET interruptions_json = $1 WHERE id = $2',
    [JSON.stringify([...run.interruptions, interruption]), runId],
  );
}

// ── topics lineage (the 3 v10 columns) ────────────────────────────────

/** Stamp a spawned child with its run / depth / originating plan. */
export async function setTopicAutoRecursionLineage(
  topicId: string,
  lineage: { runId: string; depth: number; planId: string },
): Promise<void> {
  const db = await getDb();
  await db.execute(
    `UPDATE topics
     SET generated_by_auto_recursion_run_id = $1,
         auto_recursion_depth = $2,
         parent_next_move_plan_id = $3
     WHERE id = $4`,
    [lineage.runId, lineage.depth, lineage.planId, topicId],
  );
}
