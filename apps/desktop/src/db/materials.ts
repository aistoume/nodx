import { MaterialRefSchema, type MaterialRef } from '@nodx/models';
import { getDb } from './client.js';

// ──────────────────────────────────────────────────────────────────────
// 素材 (Material) unified read (migration v12) — the network graph loads
// these as nodes. Two sources under one umbrella:
//   solution    ← abstracted_cases (案例库 / 方案素材)
//   inspiration ← attentions        (灵感池 / 灵感素材)
// Each row carries an explicit `material_kind`, but the source table also
// implies it; we read the column and fall back to the table default.
// ──────────────────────────────────────────────────────────────────────

interface CaseMaterialRow {
  id: string;
  domain: string;
  decision_type: string;
  signature_text: string;
  solution_text: string | null;
  material_kind: string | null;
  created_at: number;
}

interface AttentionMaterialRow {
  id: string;
  text: string;
  explanation: string | null;
  source_title: string;
  source_kind: string;
  material_kind: string | null;
  ingested_at: number;
}

function truncate(s: string, n: number): string {
  const t = s.trim();
  return t.length > n ? t.slice(0, n - 1) + '…' : t;
}

/**
 * List every 素材 (cases + captured inspirations), newest first, as uniform
 * MaterialRefs the graph picker + MaterialNode can render without knowing
 * the source table.
 */
export async function listMaterials(limit = 200): Promise<MaterialRef[]> {
  const db = await getDb();

  const cases = await db.select<CaseMaterialRow[]>(
    `SELECT id, domain, decision_type, signature_text, solution_text,
            material_kind, created_at
     FROM abstracted_cases ORDER BY created_at DESC LIMIT ${limit}`,
  );
  const attentions = await db.select<AttentionMaterialRow[]>(
    `SELECT id, text, explanation, source_title, source_kind,
            material_kind, ingested_at
     FROM attentions ORDER BY ingested_at DESC LIMIT ${limit}`,
  );

  const solutions: MaterialRef[] = cases.map((r) =>
    MaterialRefSchema.parse({
      id: r.id,
      kind: r.material_kind === 'inspiration' ? 'inspiration' : 'solution',
      title: truncate(r.signature_text || r.domain || '（无标题方案）', 80),
      subtitle: `${r.domain} · ${r.decision_type}`,
      ...(r.solution_text ? { body: truncate(r.solution_text, 240) } : {}),
      createdAt: r.created_at,
    }),
  );

  const inspirations: MaterialRef[] = attentions.map((r) =>
    MaterialRefSchema.parse({
      id: r.id,
      kind: r.material_kind === 'solution' ? 'solution' : 'inspiration',
      title: truncate(r.text || '（空白灵感）', 80),
      subtitle: r.source_title
        ? truncate(r.source_title, 60)
        : r.source_kind,
      ...(r.explanation ? { body: truncate(r.explanation, 240) } : {}),
      createdAt: r.ingested_at,
    }),
  );

  return [...solutions, ...inspirations].sort(
    (a, b) => b.createdAt - a.createdAt,
  );
}
