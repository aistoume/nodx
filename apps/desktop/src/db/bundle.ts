import { getDb } from './client.js';
import { listTopics } from './topics.js';

// ──────────────────────────────────────────────────────────────────────
// .nodx bundle — verbatim export / import of a whole topic subtree (PRD
// §3.10 "原封不动保存"). NOT an AI summary: it captures every node's full
// content + all relationships across every table, as a portable JSON file
// that loads cleanly on another machine.
//
// On import all primary keys are remapped to fresh UUIDs (and every foreign
// reference rewired), so a bundle never collides with existing data — it
// always materialises as a fresh copy. The format is versioned for forward
// compat.
// ──────────────────────────────────────────────────────────────────────

export const BUNDLE_FORMAT = 'nodx-bundle';
export const BUNDLE_VERSION = 1;

type Row = Record<string, unknown>;

/** Tables captured, in FK-safe insertion order (parents before children). */
const TABLES = [
  'topics',
  'topic_documents',
  'thinking_sessions',
  'messages',
  'comments',
  'draft_items',
  'expert_panels',
  'panel_rounds',
  'panel_exchanges',
  'topic_panel_seeds',
  'abstracted_cases',
  'case_relations',
  'edges',
] as const;
type TableName = (typeof TABLES)[number];

export interface NodxBundle {
  format: typeof BUNDLE_FORMAT;
  version: number;
  app: 'nodx';
  exportedAt: number;
  rootTopicId: string;
  rootTitle: string;
  tables: Record<TableName, Row[]>;
}

/** SQL-quoted id list for `IN (...)`. ids are app UUIDs; quotes escaped anyway. */
function idList(ids: string[]): string {
  if (ids.length === 0) return "('')";
  return '(' + ids.map((i) => `'${String(i).replace(/'/g, "''")}'`).join(',') + ')';
}

// ── Export ────────────────────────────────────────────────────────────

export async function exportTopicBundle(rootTopicId: string): Promise<string> {
  const db = await getDb();
  const all = await listTopics({ includeArchived: true });
  const root = all.find((t) => t.id === rootTopicId);
  if (!root) throw new Error(`topic not found: ${rootTopicId}`);

  // BFS the subtree (parents before children).
  const childrenOf = new Map<string, string[]>();
  for (const t of all) {
    if (t.parentId) {
      const list = childrenOf.get(t.parentId) ?? [];
      list.push(t.id);
      childrenOf.set(t.parentId, list);
    }
  }
  const subtree: string[] = [];
  const queue = [rootTopicId];
  while (queue.length) {
    const id = queue.shift()!;
    subtree.push(id);
    queue.push(...(childrenOf.get(id) ?? []));
  }
  const tIn = idList(subtree);
  const order = new Map(subtree.map((id, i) => [id, i]));

  const sel = (sql: string) => db.select<Row[]>(sql);

  const topics = (await sel(`SELECT * FROM topics WHERE id IN ${tIn}`)).sort(
    (a, b) =>
      (order.get(a.id as string) ?? 0) - (order.get(b.id as string) ?? 0),
  );
  const panels = await sel(`SELECT * FROM expert_panels WHERE topic_id IN ${tIn}`);
  const pIn = idList(panels.map((p) => p.id as string));
  const rounds = await sel(`SELECT * FROM panel_rounds WHERE panel_id IN ${pIn}`);
  const rIn = idList(rounds.map((r) => r.id as string));
  const cases = await sel(`SELECT * FROM abstracted_cases WHERE source_topic_id IN ${tIn}`);
  const cIn = idList(cases.map((c) => c.id as string));

  const tables: Record<TableName, Row[]> = {
    topics,
    topic_documents: await sel(`SELECT * FROM topic_documents WHERE topic_id IN ${tIn}`),
    thinking_sessions: await sel(`SELECT * FROM thinking_sessions WHERE topic_id IN ${tIn}`),
    messages: await sel(`SELECT * FROM messages WHERE topic_id IN ${tIn}`),
    comments: await sel(`SELECT * FROM comments WHERE topic_id IN ${tIn}`),
    draft_items: await sel(`SELECT * FROM draft_items WHERE source_topic_id IN ${tIn}`),
    expert_panels: panels,
    panel_rounds: rounds,
    panel_exchanges: await sel(`SELECT * FROM panel_exchanges WHERE round_id IN ${rIn}`),
    topic_panel_seeds: await sel(`SELECT * FROM topic_panel_seeds WHERE topic_id IN ${tIn}`),
    abstracted_cases: cases,
    // only relations fully inside the exported case set
    case_relations: await sel(
      `SELECT * FROM case_relations WHERE source_case_id IN ${cIn} AND target_case_id IN ${cIn}`,
    ),
    // only edges fully inside the subtree
    edges: await sel(
      `SELECT * FROM edges WHERE source_id IN ${tIn} AND target_id IN ${tIn}`,
    ),
  };

  const bundle: NodxBundle = {
    format: BUNDLE_FORMAT,
    version: BUNDLE_VERSION,
    app: 'nodx',
    exportedAt: Date.now(),
    rootTopicId,
    rootTitle: root.title,
    tables,
  };
  return JSON.stringify(bundle, null, 2);
}

// ── Import ────────────────────────────────────────────────────────────

/** Allocate a new id for each value the map will need; returns old→new. */
function buildMap(rows: Row[], idCol: string): Map<string, string> {
  const m = new Map<string, string>();
  for (const r of rows) {
    const old = r[idCol];
    if (typeof old === 'string') m.set(old, crypto.randomUUID());
  }
  return m;
}

function remapJsonTopicIds(raw: unknown, topicMap: Map<string, string>): string {
  if (typeof raw !== 'string') return '[]';
  let arr: unknown;
  try {
    arr = JSON.parse(raw);
  } catch {
    return raw;
  }
  if (!Array.isArray(arr)) return raw;
  const mapped = arr
    .map((x) => (typeof x === 'string' ? topicMap.get(x) : undefined))
    .filter((x): x is string => !!x);
  return JSON.stringify(mapped);
}

async function insertRow(table: string, row: Row): Promise<void> {
  const db = await getDb();
  const cols = Object.keys(row);
  const placeholders = cols.map((_, i) => `$${i + 1}`).join(', ');
  await db.execute(
    `INSERT INTO ${table} (${cols.join(', ')}) VALUES (${placeholders})`,
    cols.map((c) => row[c] ?? null),
  );
}

export interface ImportResult {
  rootTopicId: string;
  topicCount: number;
}

/**
 * Import a .nodx bundle as a fresh copy. Returns the new root topic id so the
 * caller can navigate to it.
 */
export async function importTopicBundle(json: string): Promise<ImportResult> {
  let bundle: NodxBundle;
  try {
    bundle = JSON.parse(json) as NodxBundle;
  } catch {
    throw new Error('文件不是合法的 JSON');
  }
  if (bundle.format !== BUNDLE_FORMAT) {
    throw new Error('不是 nodx 数据包文件');
  }
  if (bundle.version > BUNDLE_VERSION) {
    throw new Error(
      `数据包版本 ${bundle.version} 比当前 app 支持的 ${BUNDLE_VERSION} 新，请升级 app`,
    );
  }
  const t = bundle.tables;

  // Allocate fresh ids for every primary key.
  const topicMap = buildMap(t.topics, 'id');
  const sessionMap = buildMap(t.thinking_sessions, 'id');
  const messageMap = buildMap(t.messages, 'id');
  const panelMap = buildMap(t.expert_panels, 'id');
  const roundMap = buildMap(t.panel_rounds, 'id');
  const caseMap = buildMap(t.abstracted_cases, 'id');

  const map = (m: Map<string, string>, v: unknown): string | null =>
    typeof v === 'string' ? (m.get(v) ?? null) : null;

  // topics — parents before children (export order), parent → null if outside.
  for (const r of t.topics) {
    await insertRow('topics', {
      ...r,
      id: topicMap.get(r.id as string),
      parent_id: r.parent_id ? map(topicMap, r.parent_id) : null,
    });
  }
  for (const r of t.topic_documents) {
    await insertRow('topic_documents', { ...r, topic_id: map(topicMap, r.topic_id) });
  }
  for (const r of t.thinking_sessions) {
    await insertRow('thinking_sessions', {
      ...r,
      id: sessionMap.get(r.id as string),
      topic_id: map(topicMap, r.topic_id),
    });
  }
  for (const r of t.messages) {
    await insertRow('messages', {
      ...r,
      id: messageMap.get(r.id as string),
      topic_id: map(topicMap, r.topic_id),
      // session_id has no FK; remap if known (else keep, e.g. 'legacy').
      session_id:
        typeof r.session_id === 'string'
          ? (sessionMap.get(r.session_id) ?? r.session_id)
          : null,
      mentions_json: remapJsonTopicIds(r.mentions_json, topicMap),
    });
  }
  for (const r of t.comments) {
    await insertRow('comments', {
      ...r,
      id: crypto.randomUUID(),
      topic_id: map(topicMap, r.topic_id),
      // anchor_id is a doc-internal anchor (not a topic/message id) — keep.
    });
  }
  for (const r of t.draft_items ?? []) {
    await insertRow('draft_items', {
      ...r,
      id: crypto.randomUUID(),
      source_topic_id: r.source_topic_id ? map(topicMap, r.source_topic_id) : null,
      source_message_id:
        typeof r.source_message_id === 'string'
          ? (messageMap.get(r.source_message_id) ?? null)
          : null,
    });
  }
  for (const r of t.expert_panels) {
    await insertRow('expert_panels', {
      ...r,
      id: panelMap.get(r.id as string),
      topic_id: map(topicMap, r.topic_id),
    });
  }
  for (const r of t.panel_rounds) {
    await insertRow('panel_rounds', {
      ...r,
      id: roundMap.get(r.id as string),
      panel_id: map(panelMap, r.panel_id),
    });
  }
  for (const r of t.panel_exchanges) {
    await insertRow('panel_exchanges', {
      ...r,
      id: crypto.randomUUID(),
      round_id: map(roundMap, r.round_id),
    });
  }
  for (const r of t.topic_panel_seeds) {
    await insertRow('topic_panel_seeds', {
      ...r,
      topic_id: map(topicMap, r.topic_id),
      source_case_id:
        typeof r.source_case_id === 'string'
          ? (caseMap.get(r.source_case_id) ?? r.source_case_id)
          : r.source_case_id,
    });
  }
  for (const r of t.abstracted_cases) {
    await insertRow('abstracted_cases', {
      ...r,
      id: caseMap.get(r.id as string),
      source_topic_id: map(topicMap, r.source_topic_id),
    });
  }
  for (const r of t.case_relations) {
    await insertRow('case_relations', {
      ...r,
      id: crypto.randomUUID(),
      source_case_id: map(caseMap, r.source_case_id),
      target_case_id: map(caseMap, r.target_case_id),
    });
  }
  for (const r of t.edges) {
    await insertRow('edges', {
      ...r,
      id: crypto.randomUUID(),
      source_id: map(topicMap, r.source_id),
      target_id: map(topicMap, r.target_id),
    });
  }

  // Inserting messages fires the AFTER-INSERT trigger that bumps
  // topics.message_count and overwrites last_activity/updated_at. Restore each
  // topic's original counters/timestamps so the imported copy matches the
  // source verbatim.
  const db = await getDb();
  for (const r of t.topics) {
    const newId = topicMap.get(r.id as string);
    if (!newId) continue;
    await db.execute(
      `UPDATE topics SET message_count = $1, last_activity = $2, updated_at = $3 WHERE id = $4`,
      [r.message_count ?? 0, r.last_activity ?? 0, r.updated_at ?? 0, newId],
    );
  }

  const newRoot = topicMap.get(bundle.rootTopicId);
  if (!newRoot) throw new Error('数据包缺少根话题');
  return { rootTopicId: newRoot, topicCount: t.topics.length };
}
