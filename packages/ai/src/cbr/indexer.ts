import type { ProblemSignature, SolutionPattern } from '@nodx/models';

/**
 * Indexer text-ification (PRD §3.16 step ①→②). The structured signature /
 * solution blocks are flattened into deterministic text that is then (a)
 * embedded into `problemEmb` / `solutionEmb`, and (b) stored as
 * `signature_text` / `solution_text` for full-text recall.
 *
 * Deterministic (no AI) so the same case always produces the same index
 * text — re-indexing is reproducible.
 */

export function signatureToText(sig: ProblemSignature): string {
  return [
    `领域：${sig.domain}`,
    `决策类型：${sig.decisionType}`,
    `关键维度：${sig.keyDimensions.join('、') || '—'}`,
    `约束：${sig.constraints.join('、') || '—'}`,
  ].join('\n');
}

export function solutionToText(sol: SolutionPattern): string {
  return [
    `结构：${sol.structure}`,
    `关键杠杆：${sol.keyLevers.join('、') || '—'}`,
    `风险缓解：${sol.riskMitigations.join('、') || '—'}`,
  ].join('\n');
}

/**
 * Embedding ↔ storage codec. We persist a vector as base64 of its Float32
 * little-endian bytes in the BLOB column: compact (≈4 KB vs ~7 KB JSON),
 * faithful to the binary form, and a plain string so it round-trips reliably
 * through the Tauri SQL plugin. The Postgres/pgvector port (M3) decodes this
 * back to a real vector. Pure + deterministic so it's unit-testable here
 * rather than in the (test-less) desktop DB layer.
 */
export function embeddingToBase64(emb: number[]): string {
  const buf = new ArrayBuffer(emb.length * 4);
  const dv = new DataView(buf);
  for (let i = 0; i < emb.length; i++) dv.setFloat32(i * 4, emb[i]!, true);
  const u8 = new Uint8Array(buf);
  let bin = '';
  for (let i = 0; i < u8.length; i++) bin += String.fromCharCode(u8[i]!);
  return btoa(bin);
}

export function base64ToEmbedding(b64: string): number[] {
  const bin = atob(b64);
  const u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  const dv = new DataView(u8.buffer);
  const out: number[] = [];
  for (let i = 0; i + 4 <= u8.length; i += 4) out.push(dv.getFloat32(i, true));
  return out;
}
