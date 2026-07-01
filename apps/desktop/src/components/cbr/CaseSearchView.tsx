import { useEffect, useState } from 'react';
import type { AdaptedSolution } from '@nodx/models';
import type { FusionReport } from '@nodx/ai';
import {
  retrieveCases,
  fuseCases,
  adaptCase,
  type RetrievalResult,
  type RetrievedCase,
} from '../../ai/cbr.js';
import { isAiConfigured } from '../../ai/gateway.js';
import { createTopic } from '../../db/topics.js';
import { upsertDocument } from '../../db/documents.js';
import { insertPanelSeed } from '../../db/panels.js';
import { listCasesBrief, type CaseBrief } from '../../db/cases.js';
import { markdownToHtml, markdownToInlineHtml } from '../../lib/markdown.js';

interface CaseSearchViewProps {
  /** Open a (newly created) topic in dialog view — used by the panel handoff. */
  onOpenTopic: (topicId: string) => void;
  /** Deep-link from a 素材 graph node: scroll to + highlight this case id. */
  focusId?: string;
  onFocusConsumed?: () => void;
}

/**
 * CBR retrieval surface (PRD §3.16 ③④). Type a new question → recall Top-K
 * similar past cases → optional Sonnet fusion report → pick a case to adapt
 * into the new context → optional expert-panel handoff on the diff.
 *
 * NOTE the Sonnet steps are slow (fusion ~60–90s, adapt ~30–60s); each action
 * shows its own pending state.
 */
export function CaseSearchView({
  onOpenTopic,
  focusId,
  onFocusConsumed,
}: CaseSearchViewProps) {
  const [query, setQuery] = useState('');
  const [retrieval, setRetrieval] = useState<RetrievalResult | null>(null);
  const [report, setReport] = useState<FusionReport | null>(null);
  const [adaptations, setAdaptations] = useState<Record<string, AdaptedSolution>>(
    {},
  );
  const [busy, setBusy] = useState<string | null>(null); // phase label or null
  const [error, setError] = useState<string | null>(null);
  // Library preview (browse what's available before typing a query).
  const [briefs, setBriefs] = useState<CaseBrief[]>([]);
  const [highlightId, setHighlightId] = useState<string | null>(null);

  useEffect(() => {
    void listCasesBrief().then(setBriefs).catch(() => setBriefs([]));
  }, []);

  // Deep-link focus: once briefs are loaded, scroll to + highlight the target.
  useEffect(() => {
    if (!focusId || briefs.length === 0) return;
    if (!briefs.some((b) => b.id === focusId)) {
      onFocusConsumed?.();
      return;
    }
    const el = document.getElementById(`mat-case-${focusId}`);
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setHighlightId(focusId);
    onFocusConsumed?.();
    const t = window.setTimeout(() => setHighlightId(null), 2600);
    return () => window.clearTimeout(t);
  }, [focusId, briefs, onFocusConsumed]);

  const run = async (label: string, fn: () => Promise<void>) => {
    setBusy(label);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  };

  const runSearch = (raw: string) => {
    const q = raw.trim();
    if (!q || busy) return;
    setQuery(q);
    setReport(null);
    setAdaptations({});
    void run('检索中…', async () => {
      setRetrieval(await retrieveCases(q));
    });
  };

  const handleSearch = () => runSearch(query);

  const handleFuse = () =>
    run('生成参考报告中（Sonnet，约 1 分钟）…', async () => {
      if (!retrieval) return;
      setReport(await fuseCases(retrieval.query, retrieval.results));
    });

  const handleAdapt = (caseId: string) =>
    run('适配改写中（Sonnet，约半分钟）…', async () => {
      if (!retrieval) return;
      const sol = await adaptCase(retrieval.query, caseId);
      setAdaptations((prev) => ({ ...prev, [caseId]: sol }));
    });

  const handlePanelHandoff = async (sol: AdaptedSolution) => {
    if (!retrieval) return;
    await run('新建话题（带差异点种子）…', async () => {
      const topic = await createTopic({
        title: retrieval.query,
        status: 'exploring',
      });
      // Pre-fill the doc so the new topic skips auto-Survey and carries the
      // adapted solution as readable content.
      await upsertDocument(topic.id, markdownToHtml(adaptationToMarkdown(sol)));
      // Seed the panel so its surface offers a *scoped* debate on the diffs.
      await insertPanelSeed({
        topicId: topic.id,
        sourceCaseId: sol.sourceCaseId,
        inheritedStructure: sol.inheritedStructure,
        levers: sol.contextualizedLevers,
        rediscussDirections: sol.rediscussDirections,
      });
      onOpenTopic(topic.id);
    });
  };

  return (
    <main className="flex flex-col h-full bg-canvas overflow-hidden">
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-8 py-6 flex flex-col gap-5">
          <header>
            <h1 className="text-xl font-semibold">案例库 · 复用检索</h1>
            <p className="text-xs text-ink-muted mt-1 leading-relaxed">
              输入一个新决策问题，从你过去达成结论的案例里找出相似的，借鉴而非照搬。
            </p>
          </header>

          {!isAiConfigured() && (
            <p className="text-sm text-ink-muted italic">
              AI 网关未配置，无法检索。请配置 VITE_AI_CLIENT_TOKEN（及 worker 的 GEMINI_API_KEY）。
            </p>
          )}

          {/* Query bar */}
          <div className="flex gap-2">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !busy) handleSearch();
              }}
              placeholder="例如：要不要给一个新加密交易所做市？"
              className="flex-1 px-3 py-2 text-sm rounded-md border border-border bg-surface focus:border-accent outline-none"
            />
            <button
              type="button"
              onClick={handleSearch}
              disabled={!!busy || !query.trim()}
              className="px-4 py-2 text-sm font-medium rounded-md bg-accent text-white hover:opacity-90 disabled:opacity-40 transition"
            >
              检索
            </button>
          </div>

          {busy && <PendingRow label={busy} />}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded p-2">
              <pre className="text-xs text-red-700 whitespace-pre-wrap break-all">
                {error}
              </pre>
            </div>
          )}

          {/* Library preview — browse what's available before searching. */}
          {!retrieval && !busy && (
            <LibraryPreview
              briefs={briefs}
              onPick={runSearch}
              highlightId={highlightId}
            />
          )}

          {retrieval && !busy && retrieval.results.length === 0 && (
            <p className="text-sm text-ink-muted italic">
              案例库里还没有可匹配的案例（先去专家组里达成几个结论，采纳后会自动入库）。
            </p>
          )}

          {/* Sub-intents */}
          {retrieval && retrieval.subIntents.length > 0 && (
            <div className="text-xs text-ink-muted">
              拆解的子意图：
              {retrieval.subIntents.map((s, i) => (
                <span
                  key={i}
                  className="ml-1 px-1.5 py-0.5 rounded bg-accent-soft border border-accent/30 text-accent"
                >
                  {s}
                </span>
              ))}
            </div>
          )}

          {/* Results */}
          {retrieval && retrieval.results.length > 0 && (
            <section className="flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <h2 className="text-xs font-semibold uppercase tracking-wider text-accent">
                  相似案例 Top {retrieval.results.length}
                </h2>
                <button
                  type="button"
                  onClick={handleFuse}
                  disabled={!!busy}
                  className="ml-auto px-2.5 py-1 text-xs font-medium rounded border border-accent text-accent hover:bg-accent hover:text-white disabled:opacity-40 transition"
                >
                  生成参考报告
                </button>
              </div>
              {retrieval.results.map((c) => (
                <CaseResultCard
                  key={c.id}
                  c={c}
                  busy={!!busy}
                  adaptation={adaptations[c.id]}
                  onAdapt={() => handleAdapt(c.id)}
                  onPanelHandoff={handlePanelHandoff}
                />
              ))}
            </section>
          )}

          {/* Fusion report */}
          {report && <FusionReportCard report={report} />}
        </div>
      </div>
    </main>
  );
}

const DECISION_TYPE_LABEL: Record<string, string> = {
  go_no_go: '做/不做',
  allocation: '资源分配',
  sequencing: '先后顺序',
  tradeoff: '多选权衡',
};

function LibraryPreview({
  briefs,
  onPick,
  highlightId,
}: {
  briefs: CaseBrief[];
  onPick: (query: string) => void;
  highlightId?: string | null;
}) {
  if (briefs.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-surface p-4 text-sm text-ink-muted leading-relaxed">
        案例库还是空的。先去 <span className="text-accent">🎙 专家组</span>{' '}
        达成一个结论并「采纳」，它会自动抽象、入库，之后就能在这里检索复用了。
      </div>
    );
  }
  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-baseline gap-2">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-accent">
          案例库（{briefs.length}）
        </h2>
        <span className="text-[11px] text-ink-muted">
          点任意一个看看能检索到什么，或在上方输入你自己的新问题
        </span>
      </div>
      <ul className="flex flex-col gap-2">
        {briefs.map((c) => (
          <li key={c.id} id={`mat-case-${c.id}`}>
            <button
              type="button"
              onClick={() => onPick(c.domain)}
              className={
                'w-full text-left rounded-lg border bg-surface p-3 transition flex flex-col gap-1 ' +
                (highlightId === c.id
                  ? 'border-amber-400 ring-2 ring-amber-300/60 bg-amber-50/40'
                  : 'border-border hover:border-accent hover:bg-accent-soft/40')
              }
            >
              <div className="flex items-center gap-2">
                <span
                  className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 border border-amber-300 text-amber-700"
                  title="素材 · 方案（可从网络图「加载素材」拉到画布上）"
                >
                  🧩 素材·方案
                </span>
                <span className="text-sm font-medium text-ink">{c.domain}</span>
                <span className="text-[10px] text-ink-muted">
                  {DECISION_TYPE_LABEL[c.decisionType] ?? c.decisionType}
                </span>
                <span className="ml-auto text-[11px] px-1.5 py-0.5 rounded-full bg-accent-soft border border-accent/30 text-accent">
                  质量 {c.qualityScore.toFixed(2)}
                </span>
              </div>
              <p className="text-xs text-ink-muted leading-relaxed line-clamp-2">
                {c.signatureText}
              </p>
              <span className="text-[11px] text-accent">↳ 用它试搜相似案例</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Render an AdaptedSolution as the new topic's starting document. */
function adaptationToMarkdown(sol: AdaptedSolution): string {
  const bullets = (items: string[]) =>
    items.length ? items.map((s) => `- ${s}`).join('\n') : '（无）';
  return [
    '## 复用适配方案',
    '',
    `**可迁移骨架**：${sol.inheritedStructure}`,
    '',
    '**新语境下的关键杠杆**',
    bullets(sol.contextualizedLevers),
    '',
    '**新增风险缓解**',
    bullets(sol.newRiskMitigations),
    ...(sol.requiresExpertPanel
      ? ['', '**待专家组就以下差异点辩论**', bullets(sol.rediscussDirections)]
      : []),
  ].join('\n');
}

function CaseResultCard({
  c,
  busy,
  adaptation,
  onAdapt,
  onPanelHandoff,
}: {
  c: RetrievedCase;
  busy: boolean;
  adaptation?: AdaptedSolution;
  onAdapt: () => void;
  onPanelHandoff: (sol: AdaptedSolution) => void;
}) {
  return (
    <div className="rounded-lg border border-border bg-surface p-3 flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium text-ink">{c.domain}</span>
        <span className="text-[10px] text-ink-muted">{c.decisionType}</span>
        <span className="ml-auto text-[11px] px-1.5 py-0.5 rounded-full bg-accent-soft border border-accent/30 text-accent">
          score {c.score.toFixed(2)}
        </span>
      </div>
      <ScoreBar breakdown={c.breakdown} />
      <p className="text-xs text-ink-muted leading-relaxed whitespace-pre-wrap">
        {c.signatureText}
      </p>
      {!adaptation && (
        <button
          type="button"
          onClick={onAdapt}
          disabled={busy}
          className="self-start px-2.5 py-1 text-xs font-medium rounded-md bg-accent text-white hover:opacity-90 disabled:opacity-40 transition"
        >
          采用并适配到新问题
        </button>
      )}
      {adaptation && (
        <AdaptedSolutionCard sol={adaptation} onPanelHandoff={onPanelHandoff} />
      )}
    </div>
  );
}

function ScoreBar({
  breakdown,
}: {
  breakdown: { semantic: number; keyword: number; freshness: number };
}) {
  const seg = (label: string, v: number) => (
    <span className="flex items-center gap-1">
      <span className="text-ink-muted">{label}</span>
      <span className="text-ink tabular-nums">{v.toFixed(2)}</span>
    </span>
  );
  return (
    <div className="flex gap-3 text-[10px]">
      {seg('语义', breakdown.semantic)}
      {seg('关键词', breakdown.keyword)}
      {seg('时效', breakdown.freshness)}
    </div>
  );
}

function AdaptedSolutionCard({
  sol,
  onPanelHandoff,
}: {
  sol: AdaptedSolution;
  onPanelHandoff: (sol: AdaptedSolution) => void;
}) {
  return (
    <div className="mt-1 rounded-md border border-accent/30 bg-accent-soft p-3 flex flex-col gap-2">
      <span className="text-[10px] uppercase tracking-wider text-accent font-semibold">
        适配方案（已改写到新语境）
      </span>
      <Field title="可迁移骨架">
        <p className="text-xs text-ink leading-relaxed">{sol.inheritedStructure}</p>
      </Field>
      <Field title="新语境下的关键杠杆">
        <Bullets items={sol.contextualizedLevers} />
      </Field>
      <Field title="新增风险缓解">
        <Bullets items={sol.newRiskMitigations} />
      </Field>
      {sol.requiresExpertPanel && (
        <div className="rounded border border-amber-300 bg-note-yellow/60 p-2 flex flex-col gap-1.5">
          <p className="text-[11px] font-semibold text-amber-800">
            ⚠ 语境差异较大，建议就这些差异点重新辩论：
          </p>
          <Bullets items={sol.rediscussDirections} />
          <button
            type="button"
            onClick={() => onPanelHandoff(sol)}
            className="self-start mt-1 px-2.5 py-1 text-xs font-medium rounded-md bg-accent text-white hover:opacity-90 transition"
          >
            用这些差异点新建话题（去组建专家组）
          </button>
        </div>
      )}
    </div>
  );
}

function FusionReportCard({ report }: { report: FusionReport }) {
  return (
    <section className="rounded-lg border border-accent/30 bg-accent-soft p-4 flex flex-col gap-3">
      <span className="text-[10px] uppercase tracking-wider text-accent font-semibold">
        融合参考报告
      </span>
      {report.coreBorrows.length > 0 && (
        <Field title="核心借鉴">
          <ul className="flex flex-col gap-1">
            {report.coreBorrows.map((b, i) => (
              <li key={i} className="text-xs text-ink leading-relaxed">
                <span className="text-ink-muted">[{b.caseRef}]</span>{' '}
                <Inline text={b.insight} />
              </li>
            ))}
          </ul>
        </Field>
      )}
      {report.contrastCases.length > 0 && (
        <Field title="对照案例">
          <ul className="flex flex-col gap-1">
            {report.contrastCases.map((b, i) => (
              <li key={i} className="text-xs text-ink leading-relaxed">
                <span className="text-ink-muted">[{b.caseRef}]</span>{' '}
                <Inline text={b.insight} />
              </li>
            ))}
          </ul>
        </Field>
      )}
      {report.crossPatterns.length > 0 && (
        <Field title="跨案例模式">
          <Bullets items={report.crossPatterns} />
        </Field>
      )}
      {report.contextWarnings.length > 0 && (
        <Field title="语境警示（不可照搬）">
          <Bullets items={report.contextWarnings} />
        </Field>
      )}
    </section>
  );
}

function Field({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[11px] font-semibold text-ink-muted mb-1">{title}</p>
      {children}
    </div>
  );
}

function Bullets({ items }: { items: string[] }) {
  return (
    <ul className="list-disc pl-5 flex flex-col gap-0.5">
      {items.map((s, i) => (
        <li key={i} className="text-xs text-ink leading-relaxed">
          <Inline text={s} />
        </li>
      ))}
    </ul>
  );
}

function Inline({ text }: { text: string }) {
  return <span dangerouslySetInnerHTML={{ __html: markdownToInlineHtml(text) }} />;
}

function PendingRow({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 text-sm text-ink-muted">
      <span className="flex gap-1">
        <Dot delay="0s" />
        <Dot delay="0.15s" />
        <Dot delay="0.3s" />
      </span>
      <span className="text-xs">{label}</span>
    </div>
  );
}

function Dot({ delay }: { delay: string }) {
  return (
    <span
      className="inline-block w-1.5 h-1.5 rounded-full bg-ink-muted/60 animate-bounce"
      style={{ animationDelay: delay }}
    />
  );
}
