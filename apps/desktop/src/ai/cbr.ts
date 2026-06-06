import {
  ABSTRACTOR_PROMPT_MODEL,
  AbstractorOutputSchema,
  RELATION_FINDER_PROMPT_MODEL,
  RelationFinderOutputSchema,
  BRAIN_HUB_PROMPT_MODEL,
  BrainHubOutputSchema,
  FUSION_PROMPT_MODEL,
  FusionReportSchema,
  ADAPTER_PROMPT_MODEL,
  AdapterOutputSchema,
  buildAbstractorPrompt,
  buildRelationFinderPrompt,
  buildBrainHubPrompt,
  buildFusionPrompt,
  buildAdapterPrompt,
  cosineSimilarity,
  maxSimByCase,
  rankCases,
  signatureToText,
  solutionToText,
  type FusionCandidate,
  type FusionReport,
  type RankInputCase,
} from '@nodx/ai';
import {
  AbstractedCaseSchema,
  AdaptedSolutionSchema,
  CaseRelationSchema,
  type AbstractedCase,
  type AdaptedSolution,
  type CaseRelation,
  type ExpertPanel,
  type LocalMaximumResult,
  type Topic,
} from '@nodx/models';
import { ai } from './gateway.js';
import { isAiConfigured } from './gateway.js';
import {
  countCases,
  ftsRecall,
  getCaseById,
  getCaseByTopic,
  insertAbstractedCase,
  insertCaseRelations,
  listCaseSummaries,
  listCasesForRecall,
} from '../db/cases.js';
import { listTopics } from '../db/topics.js';
import { getPanelByTopic } from '../db/panels.js';

// ──────────────────────────────────────────────────────────────────────
// CBR ingest pipeline (PRD §3.16 step ① + §3.18), write path only.
//
//   Topic reaches localMaximum (panel accepted)
//     → 抽象师 (Sonnet)  : LocalMax → de-identified AbstractedCase content
//     → 索引器           : text-ify signature/solution + 2 Gemini embeddings
//     → 落库 abstracted_cases
//     → 关系发现者 (Sonnet): edges vs existing cases → case_relations
//
// `@nodx/ai` owns the prompts/schemas/text-ification/embeddings; this file is
// the desktop orchestration that also touches the DB (which @nodx/ai can't).
// Retrieval / Brain Hub / Reranker are NOT here (V1 Week 1 scope).
// ──────────────────────────────────────────────────────────────────────

/** Bound the relation-finder's candidate set (and its prompt cost). */
const RELATION_CANDIDATE_LIMIT = 50;

export interface IngestCaseInput {
  topic: Topic;
  localMaximum: LocalMaximumResult;
  /** Parent-topic summary threaded into the abstractor. */
  parentContext?: string;
}

/**
 * Full ingest for one converged Topic. Idempotent: if the Topic already has a
 * case, returns it without re-spending tokens. Returns the created (or
 * existing) case.
 */
export async function ingestTopicAsCase(
  input: IngestCaseInput,
): Promise<AbstractedCase> {
  const { topic, localMaximum, parentContext = '' } = input;

  const existing = await getCaseByTopic(topic.id);
  if (existing) return existing;

  // ① 抽象 + 去标识化 (Sonnet)
  const abstracted = await ai.complete({
    prompt: buildAbstractorPrompt({
      question: topic.title,
      context: parentContext,
      bestAnswer: localMaximum.bestAnswer,
      consensus: localMaximum.consensus,
      divergence: localMaximum.divergence,
      openQuestions: localMaximum.openQuestions,
      confidence: localMaximum.confidence,
    }),
    model: ABSTRACTOR_PROMPT_MODEL,
    maxTokens: 4000,
    schema: AbstractorOutputSchema,
    temperature: 0.3,
  });

  // ② 文本化 + 2 个 embedding
  const signatureText = signatureToText(abstracted.data.problemSignature);
  const solutionText = solutionToText(abstracted.data.solutionPattern);
  const { embeddings } = await ai.embed({ texts: [signatureText, solutionText] });
  const [problemEmb, solutionEmb] = embeddings;
  if (!problemEmb || !solutionEmb) {
    throw new Error('embed returned fewer than 2 vectors for the case');
  }

  const now = Date.now();
  const theCase: AbstractedCase = AbstractedCaseSchema.parse({
    id: crypto.randomUUID(),
    sourceTopicId: topic.id,
    problemSignature: abstracted.data.problemSignature,
    reasoningPath: abstracted.data.reasoningPath,
    solutionPattern: abstracted.data.solutionPattern,
    outcome: { qualityScore: abstracted.data.qualityScore },
    problemEmb,
    solutionEmb,
    visibility: 'private',
    freshnessDate: now,
    createdAt: now,
  });

  // 落库
  await insertAbstractedCase(theCase, signatureText, solutionText);

  // ③ 关系发现 (Sonnet) — only when there's an existing library to relate to
  const existingCases = await listCaseSummaries({
    excludeTopicId: topic.id,
    limit: RELATION_CANDIDATE_LIMIT,
  });
  if (existingCases.length > 0) {
    const found = await ai.complete({
      prompt: buildRelationFinderPrompt({
        newCase: {
          domain: theCase.problemSignature.domain,
          decisionType: theCase.problemSignature.decisionType,
          frameworks: theCase.reasoningPath.frameworks,
          signatureText,
          solutionText,
        },
        existing: existingCases,
      }),
      model: RELATION_FINDER_PROMPT_MODEL,
      maxTokens: 2000,
      schema: RelationFinderOutputSchema,
      temperature: 0.2,
    });

    const knownIds = new Set(existingCases.map((c) => c.id));
    const relations: CaseRelation[] = found.data.relations
      .filter((r) => knownIds.has(r.targetCaseId)) // drop hallucinated ids
      .map((r) =>
        CaseRelationSchema.parse({
          id: crypto.randomUUID(),
          sourceCaseId: theCase.id,
          targetCaseId: r.targetCaseId,
          relationType: r.relationType,
          weight: r.weight,
          createdAt: Date.now(),
        }),
      );
    await insertCaseRelations(relations);
  }

  return theCase;
}

/**
 * Hook fired when a Topic reaches localMaximum — i.e. its expert panel was
 * accepted. Best-effort + non-blocking: ingest is slow (2 Sonnet calls + 2
 * embeddings) and needs the Gemini key, so callers should fire-and-forget and
 * not let a failure (e.g. embeddings unconfigured) break the accept UX.
 *
 * Returns null (and logs) instead of throwing.
 */
export async function ingestAcceptedPanel(
  panel: ExpertPanel,
  topic: Topic,
  parentContext = '',
): Promise<AbstractedCase | null> {
  if (!isAiConfigured() || !panel.localMaximum) return null;
  try {
    return await ingestTopicAsCase({
      topic,
      localMaximum: panel.localMaximum,
      parentContext,
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[cbr] case ingest failed (non-fatal):', err);
    return null;
  }
}

// ──────────────────────────────────────────────────────────────────────
// CBR retrieval / read path (PRD §3.16 ③ recall+rank, ④ Fusion report).
// No vector index on SQLite → semantic recall is a brute-force cosine scan
// over decoded embeddings; keyword recall is the FTS5 trigram mirror. Brain
// Hub / Adaptation executor / Reranker UI are NOT here.
// ──────────────────────────────────────────────────────────────────────

export interface RetrievedCase {
  id: string;
  domain: string;
  decisionType: string;
  signatureText: string;
  solutionText: string;
  qualityScore: number;
  score: number;
  breakdown: { semantic: number; keyword: number; freshness: number };
}

export interface RetrievalResult {
  query: string;
  subIntents: string[];
  results: RetrievedCase[];
}

/**
 * Retrieve the Top-K most relevant cases for a new question (PRD §3.16 ③):
 * Brain Hub (Haiku) → sub-intents → per-intent dual recall (semantic cosine +
 * FTS keyword) → heuristic weighted ranking.
 */
export async function retrieveCases(
  query: string,
  topK = 5,
): Promise<RetrievalResult> {
  // Brain Hub: query → ≤3 sub-intents
  const hub = await ai.complete({
    prompt: buildBrainHubPrompt({ query }),
    model: BRAIN_HUB_PROMPT_MODEL,
    maxTokens: 500,
    schema: BrainHubOutputSchema,
    temperature: 0.2,
  });
  const subIntents = hub.data.subIntents;

  const cases = await listCasesForRecall();
  if (cases.length === 0) return { query, subIntents, results: [] };

  // Embed all sub-intents in one batch, then cosine vs every case (brute force).
  const { embeddings } = await ai.embed({ texts: subIntents });
  const semHits: Array<{ caseId: string; sim: number }> = [];
  for (const qEmb of embeddings) {
    for (const c of cases) {
      semHits.push({ caseId: c.id, sim: cosineSimilarity(qEmb, c.problemEmb) });
    }
  }
  const maxSem = maxSimByCase(semHits);

  // FTS keyword recall per sub-intent; normalise bm25 → [0.5, 1] so any match
  // is a positive signal (keyword is the secondary, 0.30-weight path).
  const kwHits: Array<{ caseId: string; sim: number }> = [];
  for (const si of subIntents) {
    const fts = await ftsRecall(si, 30);
    if (fts.length === 0) continue;
    const bms = fts.map((h) => h.bm25);
    const best = Math.min(...bms);
    const worst = Math.max(...bms);
    const span = worst - best;
    for (const h of fts) {
      const sim = span > 0 ? 0.5 + 0.5 * ((worst - h.bm25) / span) : 1;
      kwHits.push({ caseId: h.caseId, sim });
    }
  }
  const maxKw = maxSimByCase(kwHits);

  const now = Date.now();
  const rankInput: RankInputCase[] = cases.map((c) => ({
    caseId: c.id,
    semanticSim: maxSem.get(c.id) ?? 0,
    keywordSim: maxKw.get(c.id) ?? 0,
    freshnessDate: c.freshnessDate,
  }));
  const ranked = rankCases(rankInput, { now, topK });

  const byId = new Map(cases.map((c) => [c.id, c]));
  const results: RetrievedCase[] = ranked.map((r) => {
    const c = byId.get(r.caseId)!;
    return {
      id: c.id,
      domain: c.domain,
      decisionType: c.decisionType,
      signatureText: c.signatureText,
      solutionText: c.solutionText,
      qualityScore: c.qualityScore,
      score: r.score,
      breakdown: r.breakdown,
    };
  });
  return { query, subIntents, results };
}

/**
 * Fuse the retrieved Top-K into a reference report (PRD §3.16 ④). Uses
 * completeUntilDone so a rich report isn't truncated.
 */
export async function fuseCases(
  query: string,
  results: RetrievedCase[],
): Promise<FusionReport> {
  const candidates: FusionCandidate[] = results.map((r) => ({
    id: r.id,
    domain: r.domain,
    decisionType: r.decisionType,
    signatureText: r.signatureText,
    solutionText: r.solutionText,
    qualityScore: r.qualityScore,
  }));
  const r = await ai.completeUntilDone({
    prompt: buildFusionPrompt({ query, candidates }),
    model: FUSION_PROMPT_MODEL,
    maxTokens: 8000,
    maxContinuations: 2,
    schema: FusionReportSchema,
    temperature: 0.4,
  });
  return r.data;
}

/**
 * Adapt a chosen case to the new question (PRD §3.16 ④ 适配执行师). Rewrites
 * (never replays) the old solution; flags whether the differences warrant a
 * fresh panel and, if so, names the points to re-debate. completeUntilDone
 * guards against truncation.
 */
export async function adaptCase(
  query: string,
  caseId: string,
  newContext = '',
): Promise<AdaptedSolution> {
  const c = await getCaseById(caseId);
  if (!c) throw new Error(`case not found: ${caseId}`);

  const r = await ai.completeUntilDone({
    prompt: buildAdapterPrompt({
      query,
      newContext,
      sourceCase: {
        id: c.id,
        domain: c.problemSignature.domain,
        decisionType: c.problemSignature.decisionType,
        signatureText: signatureToText(c.problemSignature),
        solutionText: solutionToText(c.solutionPattern),
        frameworks: c.reasoningPath.frameworks,
      },
    }),
    model: ADAPTER_PROMPT_MODEL,
    maxTokens: 4000,
    maxContinuations: 2,
    schema: AdapterOutputSchema,
    temperature: 0.4,
  });

  return AdaptedSolutionSchema.parse({ sourceCaseId: c.id, ...r.data });
}

/** Convenience: retrieve then fuse. Report is null when nothing was recalled. */
export async function retrieveAndFuse(
  query: string,
): Promise<{ retrieval: RetrievalResult; report: FusionReport | null }> {
  const retrieval = await retrieveCases(query);
  if (retrieval.results.length === 0) return { retrieval, report: null };
  const report = await fuseCases(query, retrieval.results);
  return { retrieval, report };
}

/**
 * Dev-only verification entry points (no CBR UI yet). Drive ingest + inspect
 * results from the devtools console. Needs a Topic whose expert panel has
 * converged, plus a `GEMINI_API_KEY` on the worker for the embedding step.
 *   await __nodxIngestCase("<topicId>")  → run the full ingest, returns the case
 *   await __nodxGetCase("<topicId>")     → read back the persisted case
 *   await __nodxCountCases()             → how many cases are in the library
 */
export function registerCbrDevTrigger(): void {
  const w = window as unknown as {
    __nodxIngestCase?: (topicId: string) => Promise<AbstractedCase | null>;
    __nodxGetCase?: (topicId: string) => Promise<AbstractedCase | null>;
    __nodxCountCases?: () => Promise<number>;
    __nodxRetrieve?: (query: string) => Promise<RetrievalResult>;
    __nodxFuse?: (
      query: string,
    ) => Promise<{ retrieval: RetrievalResult; report: FusionReport | null }>;
    __nodxAdapt?: (
      query: string,
      caseId: string,
      newContext?: string,
    ) => Promise<AdaptedSolution>;
  };
  if (w.__nodxIngestCase) return;

  w.__nodxIngestCase = async (topicId: string) => {
    const topic = (await listTopics({ includeArchived: true })).find(
      (t) => t.id === topicId,
    );
    if (!topic) throw new Error(`topic not found: ${topicId}`);
    const panel = await getPanelByTopic(topicId);
    if (!panel?.localMaximum) {
      throw new Error(`topic has no converged panel localMaximum: ${topicId}`);
    }
    // eslint-disable-next-line no-console
    console.log('[cbr] ingesting', topic.title);
    const c = await ingestTopicAsCase({ topic, localMaximum: panel.localMaximum });
    // eslint-disable-next-line no-console
    console.log('[cbr] case →', c);
    return c;
  };

  w.__nodxGetCase = (topicId: string) => getCaseByTopic(topicId);
  w.__nodxCountCases = () => countCases();

  w.__nodxRetrieve = async (query: string) => {
    const r = await retrieveCases(query);
    // eslint-disable-next-line no-console
    console.log('[cbr] sub-intents:', r.subIntents);
    // eslint-disable-next-line no-console
    console.table(
      r.results.map((x) => ({
        domain: x.domain,
        score: +x.score.toFixed(3),
        sem: +x.breakdown.semantic.toFixed(3),
        kw: +x.breakdown.keyword.toFixed(3),
        fresh: +x.breakdown.freshness.toFixed(3),
      })),
    );
    return r;
  };
  w.__nodxFuse = async (query: string) => {
    const out = await retrieveAndFuse(query);
    // eslint-disable-next-line no-console
    console.log('[cbr] fusion report →', out.report);
    return out;
  };
  w.__nodxAdapt = async (query: string, caseId: string, newContext = '') => {
    const out = await adaptCase(query, caseId, newContext);
    // eslint-disable-next-line no-console
    console.log('[cbr] adapted solution →', out);
    return out;
  };
}
