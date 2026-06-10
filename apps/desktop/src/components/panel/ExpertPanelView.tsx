import { useCallback, useEffect, useRef, useState } from 'react';
import type { ExpertPanel, PanelRound, Topic } from '@nodx/models';
import { DEFAULT_MAX_ROUNDS, MAX_DEBATE_ROUNDS } from '@nodx/ai';
import {
  formPanel,
  runDebate,
  acceptLocalMaximum,
  getPanelByTopic,
  generatePanelMerge,
  type PanelProgress,
} from '../../ai/panel.js';
import { appendToDocument, upsertDocument } from '../../db/documents.js';
import { markdownToHtml } from '../../lib/markdown.js';
import { MergePreviewModal } from './MergePreviewModal.js';
import { localMaxToMarkdown } from './local-max-markdown.js';
import {
  clearPanelRounds,
  deletePanel,
  deletePanelSeed,
  getPanelSeed,
  updatePanelStatus,
  type PanelSeed,
} from '../../db/panels.js';
import { ingestAcceptedPanel } from '../../ai/cbr.js';
import { listTopics } from '../../db/topics.js';
import { isAiConfigured } from '../../ai/gateway.js';
import { PanelMembers } from './PanelMembers.js';
import { PanelTranscript } from './PanelTranscript.js';
import { LocalMaxCard } from './LocalMaxCard.js';

interface ExpertPanelViewProps {
  topic: Topic;
  /** Bumped after accept (Topic.aiSummary changes) so the rest of the app refreshes. */
  onMutated: () => void;
  /** Called after the panel conclusion is folded into the document — the
   *  parent switches the center view back to 文档 and reloads it. */
  onMergedToDoc?: () => void;
}

/** Direction topics thread the parent's summary in as debate context. */
async function resolveParentContext(topic: Topic): Promise<string> {
  if (!topic.parentId) return '';
  const all = await listTopics({ includeArchived: true });
  const parent = all.find((t) => t.id === topic.parentId);
  return parent?.aiSummary ?? parent?.title ?? '';
}

export function ExpertPanelView({
  topic,
  onMutated,
  onMergedToDoc,
}: ExpertPanelViewProps) {
  const [panel, setPanel] = useState<ExpertPanel | null>(null);
  // Diff-scoped seed from a CBR adaptation handoff (PRD §3.16 ④), if any.
  const [seed, setSeed] = useState<PanelSeed | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState('');
  const [error, setError] = useState<string | null>(null);
  // Debate round cap (excludes synthesis). User picks it before starting.
  const [maxRounds, setMaxRounds] = useState<number>(DEFAULT_MAX_ROUNDS);

  // Live transcript while a debate streams in (separate from the persisted
  // panel.rounds so we can show exchanges the instant they resolve).
  const [running, setRunning] = useState(false);
  const [liveRounds, setLiveRounds] = useState<PanelRound[]>([]);
  const [activeRoundId, setActiveRoundId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [p, s] = await Promise.all([
        getPanelByTopic(topic.id),
        getPanelSeed(topic.id),
      ]);
      setPanel(p);
      setSeed(s);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [topic.id]);

  useEffect(() => {
    setRunning(false);
    setLiveRounds([]);
    void load();
  }, [load]);

  // Keep the newest streamed exchange in view.
  useEffect(() => {
    if (running && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [liveRounds, running]);

  const progress: PanelProgress = {
    onRoundStart: (round) => {
      setLiveRounds((prev) => [...prev, { ...round, exchanges: [] }]);
      setActiveRoundId(round.id);
    },
    onExchange: (roundId, exchange) => {
      setLiveRounds((prev) =>
        prev.map((r) =>
          r.id === roundId
            ? { ...r, exchanges: [...r.exchanges, exchange] }
            : r,
        ),
      );
    },
    onRoundComplete: (round) => {
      setLiveRounds((prev) => prev.map((r) => (r.id === round.id ? round : r)));
    },
  };

  const runAction = async (
    label: string,
    fn: () => Promise<void>,
  ): Promise<void> => {
    setBusy(true);
    setPhase(label);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
      setPhase('');
    }
  };

  const handleForm = () =>
    runAction('识别领域 + 组建专家组…', async () => {
      const ctx = await resolveParentContext(topic);
      const { panel: formed } = await formPanel(topic, ctx);
      setPanel(formed);
    });

  const handleRegenerate = () =>
    runAction('重新组建专家组…', async () => {
      if (panel) await deletePanel(panel.id);
      setPanel(null);
      const ctx = await resolveParentContext(topic);
      const { panel: formed } = await formPanel(topic, ctx);
      setPanel(formed);
    });

  const startDebate = async (
    existing: ExpertPanel,
    framing?: { question: string; context: string },
  ) => {
    setRunning(true);
    setLiveRounds([]);
    setActiveRoundId(null);
    try {
      const f = framing ?? {
        question: topic.title,
        context: await resolveParentContext(topic),
      };
      const hydrated = await runDebate(
        { panel: existing, question: f.question, context: f.context },
        { maxRounds, progress },
      );
      setPanel(hydrated);
    } finally {
      setRunning(false);
      setActiveRoundId(null);
    }
  };

  // CBR diff-scoped handoff (PRD §3.16 ④): form the panel and immediately run a
  // debate framed to ONLY the differing points — the inherited structure is
  // given as a settled premise, so the panel runs the diff, not the whole thing.
  const handleScopedForm = () =>
    runAction('组建专家组并就差异点辩论…', async () => {
      if (!seed) return;
      const { panel: formed } = await formPanel(topic);
      setPanel(formed);
      await startDebate(formed, buildScopedFraming(seed, topic.title));
      await deletePanelSeed(topic.id);
      setSeed(null);
    });

  const handleStartDebate = () =>
    runAction('辩论进行中（每轮多位专家并行，约数分钟）…', async () => {
      if (panel) await startDebate(panel);
    });

  const handleRerun = () =>
    runAction('清空旧辩论，重新开打…', async () => {
      if (!panel) return;
      await clearPanelRounds(panel.id);
      await startDebate({ ...panel, status: 'forming', rounds: [] });
    });

  const handleAccept = () =>
    runAction('采纳中…', async () => {
      if (!panel) return;
      await acceptLocalMaximum(panel.id);
      const accepted = panel;
      setPanel(await getPanelByTopic(topic.id));
      onMutated();
      // CBR hook (PRD §3.16): a converged+accepted Topic reaches localMaximum →
      // abstract it into a reusable case. Fire-and-forget: slow + needs the
      // Gemini key, and must not block / break the accept UX.
      void resolveParentContext(topic).then((ctx) =>
        ingestAcceptedPanel(accepted, topic, ctx),
      );
    });

  const handleReject = () =>
    runAction('拒绝中…', async () => {
      if (!panel) return;
      await updatePanelStatus(panel.id, 'rejected_by_user');
      setPanel(await getPanelByTopic(topic.id));
    });

  // 归纳进文档 (PRD §8.7): Sonnet 收尾整理 → editable preview → append to doc.
  const [merging, setMerging] = useState(false);
  const [mergeMarkdown, setMergeMarkdown] = useState<string | null>(null);

  const handleStartMerge = async () => {
    if (!panel) return;
    setError(null);
    setMerging(true);
    try {
      const md = await generatePanelMerge(topic, panel);
      setMergeMarkdown(md);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setMerging(false);
    }
  };

  const handleConfirmMerge = (markdown: string) =>
    runAction('插入文档…', async () => {
      await appendToDocument(topic.id, markdownToHtml(markdown));
      setMergeMarkdown(null);
      onMutated();
      onMergedToDoc?.();
    });

  // 直接替换文档: no AI rewrite — render the Local Max fields verbatim as
  // Markdown and OVERWRITE the whole document (upsert, not append). Instant.
  const handleReplaceDoc = () =>
    runAction('替换文档…', async () => {
      if (!panel?.localMaximum) return;
      const md = localMaxToMarkdown(panel.localMaximum);
      await upsertDocument(topic.id, markdownToHtml(md));
      onMutated();
      onMergedToDoc?.();
    });

  const displayRounds = running ? liveRounds : (panel?.rounds ?? []);

  return (
    <div className="flex flex-col h-full bg-canvas overflow-hidden">
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-8 py-6 flex flex-col gap-5">
          {error && (
            <div className="bg-red-50 border border-red-200 rounded p-2">
              <pre className="text-xs text-red-700 whitespace-pre-wrap break-all">
                {error}
              </pre>
            </div>
          )}

          {!isAiConfigured() && (
            <p className="text-sm text-ink-muted italic">
              AI 网关未配置，无法运行专家组。请配置 VITE_AI_CLIENT_TOKEN。
            </p>
          )}

          {loading ? (
            <p className="text-sm text-ink-muted italic">加载专家组…</p>
          ) : (
            <>
              {/* No panel yet → formation CTA (scoped if a CBR seed exists) */}
              {!panel &&
                !running &&
                (seed ? (
                  <ScopedFormCTA
                    seed={seed}
                    busy={busy}
                    phase={phase}
                    onForm={handleScopedForm}
                  />
                ) : (
                  <EmptyState busy={busy} phase={phase} onForm={handleForm} />
                ))}

              {/* Members roster (forming / debating / converged / rejected) */}
              {panel && (
                <section className="flex flex-col gap-2">
                  <SectionHeader
                    title="专家组"
                    note={panel.domain ? `领域：${panel.domain}` : undefined}
                  />
                  <PanelMembers members={panel.members} />
                </section>
              )}

              {/* Forming → choose round cap, start / regenerate */}
              {panel && panel.status === 'forming' && !running && (
                <div className="flex items-center gap-3 flex-wrap">
                  <RoundCapSelector
                    value={maxRounds}
                    onChange={setMaxRounds}
                    disabled={busy}
                  />
                  <button
                    type="button"
                    onClick={handleStartDebate}
                    disabled={busy}
                    className="px-3 py-1.5 text-xs font-medium rounded-md bg-accent text-white hover:opacity-90 disabled:opacity-40 transition"
                  >
                    开始辩论
                  </button>
                  <button
                    type="button"
                    onClick={handleRegenerate}
                    disabled={busy}
                    className="px-2.5 py-1 text-xs font-medium rounded border border-border text-ink-muted hover:text-ink hover:border-ink-muted disabled:opacity-40 transition"
                  >
                    重新组建
                  </button>
                </div>
              )}

              {/* Transcript (live or persisted) */}
              {displayRounds.length > 0 && panel && (
                <section className="flex flex-col gap-2">
                  <SectionHeader title="辩论记录" />
                  <PanelTranscript
                    rounds={displayRounds}
                    members={panel.members}
                    activeRoundId={activeRoundId}
                  />
                </section>
              )}

              {running && (
                <p className="text-sm text-ink-muted italic">
                  {phase || '辩论进行中…'}
                </p>
              )}

              {/* Converged → Local Max + accept/reject + 归纳进文档 */}
              {!running && panel?.status === 'converged' && panel.localMaximum && (
                <>
                  <LocalMaxCard
                    result={panel.localMaximum}
                    busy={busy}
                    onAccept={handleAccept}
                    onReject={handleReject}
                  />
                  <div className="flex items-center gap-3 flex-wrap">
                    <button
                      type="button"
                      onClick={handleStartMerge}
                      disabled={busy || merging}
                      className={
                        'px-3 py-1.5 text-xs font-medium rounded-md bg-accent text-white hover:opacity-90 disabled:opacity-40 transition' +
                        (merging ? ' animate-pulse' : '')
                      }
                    >
                      {merging
                        ? '📄 归纳进文档（Sonnet 整理中，约 30 秒，请等待预览…）'
                        : '📄 归纳进文档'}
                    </button>
                    <ReplaceDocButton
                      busy={busy || merging}
                      onConfirm={handleReplaceDoc}
                    />
                    {!merging && (
                      <span className="text-[11px] text-ink-muted">
                        归纳 = Sonnet 整理成一节追加；替换 = 原文直接覆盖全文
                      </span>
                    )}
                    {merging && (
                      <span className="text-[11px] text-ink-muted">
                        整理完成后会弹出可编辑预览，请勿离开本页
                      </span>
                    )}
                  </div>
                </>
              )}

              {/* Interrupted (debating, never converged) or rejected → rerun */}
              {!running &&
                panel &&
                (panel.status === 'debating' ||
                  panel.status === 'rejected_by_user') && (
                  <div className="flex flex-col gap-2">
                    {panel.status === 'rejected_by_user' && (
                      <p className="text-xs text-ink-muted">
                        你拒绝了上一次的结论。可以让同一组专家重新辩论一轮。
                      </p>
                    )}
                    <div className="flex items-center gap-3 flex-wrap">
                      <RoundCapSelector
                        value={maxRounds}
                        onChange={setMaxRounds}
                        disabled={busy}
                      />
                      <button
                        type="button"
                        onClick={handleRerun}
                        disabled={busy}
                        className="px-3 py-1.5 text-xs font-medium rounded-md bg-accent text-white hover:opacity-90 disabled:opacity-40 transition"
                      >
                        重新辩论
                      </button>
                    </div>
                  </div>
                )}
            </>
          )}
        </div>
      </div>

      {mergeMarkdown !== null && (
        <MergePreviewModal
          initialMarkdown={mergeMarkdown}
          busy={busy}
          onConfirm={handleConfirmMerge}
          onClose={() => setMergeMarkdown(null)}
        />
      )}
    </div>
  );
}

/**
 * Two-step confirm for the destructive "replace whole document" action:
 * first click stages, second click within 3s commits. Mirrors LeftPanel's
 * DeleteAction — window.confirm() is documented there as unreliable in the
 * Tauri 2 macOS webview, so we don't use it.
 */
function ReplaceDocButton({
  busy,
  onConfirm,
}: {
  busy: boolean;
  onConfirm: () => void;
}) {
  const [pending, setPending] = useState(false);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current != null) window.clearTimeout(timerRef.current);
    };
  }, []);

  const handleClick = () => {
    if (pending) {
      if (timerRef.current != null) window.clearTimeout(timerRef.current);
      timerRef.current = null;
      setPending(false);
      onConfirm();
    } else {
      setPending(true);
      timerRef.current = window.setTimeout(() => {
        setPending(false);
        timerRef.current = null;
      }, 3000);
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={busy}
      title="不走 AI 改写，把 Local Max 原文直接覆盖文档"
      className={
        'px-3 py-1.5 text-xs font-medium rounded-md border transition disabled:opacity-40 ' +
        (pending
          ? 'bg-red-600 text-white border-red-600 hover:bg-red-700'
          : 'border-border text-ink-muted hover:border-accent hover:text-accent')
      }
    >
      {pending ? '⚠️ 会清掉当前文档内容，再点确认' : '📋 直接替换文档'}
    </button>
  );
}

/** Round-cap options, clamped to the engine's debate ceiling. */
const ROUND_CAP_OPTIONS = [3, 5, 8, 10].filter((n) => n <= MAX_DEBATE_ROUNDS);

function RoundCapSelector({
  value,
  onChange,
  disabled,
}: {
  value: number;
  onChange: (n: number) => void;
  disabled?: boolean;
}) {
  return (
    <label className="flex items-center gap-1.5 text-xs text-ink-muted">
      轮数上限
      <select
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        className="rounded border border-border bg-surface px-1.5 py-1 text-xs text-ink disabled:opacity-50"
        title="辩论最多跑多少轮（不含主持人综合）。越高越深入，但 token / 时间成本越大；提前收敛会自动停。"
      >
        {ROUND_CAP_OPTIONS.map((n) => (
          <option key={n} value={n}>
            {n} 轮
          </option>
        ))}
      </select>
    </label>
  );
}

function SectionHeader({ title, note }: { title: string; note?: string }) {
  return (
    <div className="flex items-baseline gap-2">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-accent">
        {title}
      </h2>
      {note && <span className="text-[11px] text-ink-muted">{note}</span>}
    </div>
  );
}

/** Frame a debate to focus on only the differing points (PRD §3.16 ④). */
function buildScopedFraming(
  seed: PanelSeed,
  originalQuestion: string,
): { question: string; context: string } {
  const diffs = seed.rediscussDirections.map((d) => `- ${d}`).join('\n');
  const levers = seed.levers.map((l) => `- ${l}`).join('\n');
  return {
    question:
      '这是一次"复用适配"后的聚焦辩论：已有一个可复用的方案骨架（见背景，视为基本确定）。' +
      '请**只就以下因新语境产生的差异点**做判断与决策，不要重新论证已确定的骨架：\n' +
      diffs,
    context:
      `原始问题：${originalQuestion}\n\n` +
      `【已确定的方案骨架（来自历史案例复用，作为前提，不要推翻）】\n${seed.inheritedStructure}\n\n` +
      `【已适配到新语境的关键杠杆】\n${levers || '（无）'}`,
  };
}

function ScopedFormCTA({
  seed,
  busy,
  phase,
  onForm,
}: {
  seed: PanelSeed;
  busy: boolean;
  phase: string;
  onForm: () => void;
}) {
  return (
    <div className="rounded-lg border border-accent/30 bg-accent-soft p-5 flex flex-col gap-3">
      <div>
        <p className="text-sm font-medium text-ink">
          来自复用适配 · 专家组只就差异点辩论
        </p>
        <p className="text-xs text-ink-muted mt-1 leading-relaxed">
          已有一个可复用的方案骨架被视为前提，专家组**不会从头辩论**，只聚焦下面这些因新语境产生的差异点：
        </p>
      </div>
      <div className="rounded-md border border-border bg-surface p-3">
        <p className="text-[11px] font-semibold text-ink-muted mb-1">
          已确定的方案骨架
        </p>
        <p className="text-xs text-ink leading-relaxed">
          {seed.inheritedStructure}
        </p>
      </div>
      <div>
        <p className="text-[11px] font-semibold text-ink-muted mb-1">
          只辩论这些差异点
        </p>
        <ul className="list-disc pl-5 flex flex-col gap-0.5">
          {seed.rediscussDirections.map((d, i) => (
            <li key={i} className="text-xs text-ink leading-relaxed">
              {d}
            </li>
          ))}
        </ul>
      </div>
      <button
        type="button"
        onClick={onForm}
        disabled={busy}
        className="self-start px-3 py-1.5 text-xs font-medium rounded-md bg-accent text-white hover:opacity-90 disabled:opacity-40 transition"
      >
        {busy ? phase || '进行中…' : '组建专家组并就差异辩论'}
      </button>
    </div>
  );
}

function EmptyState({
  busy,
  phase,
  onForm,
}: {
  busy: boolean;
  phase: string;
  onForm: () => void;
}) {
  return (
    <div className="rounded-lg border border-accent/30 bg-accent-soft p-5 flex flex-col gap-3">
      <div>
        <p className="text-sm font-medium text-ink">组建专家组深挖这个方向</p>
        <p className="text-xs text-ink-muted mt-1 leading-relaxed">
          AI 会针对这个方向组建 3–5 位互补的专家（含一位必备的「魔鬼代言人」），
          跑「独立首发 → 交叉质疑 → 修正立场 → 主持人综合」四轮结构化辩论，
          收敛出一个 Local Maximum 结论供你采纳。
        </p>
      </div>
      <button
        type="button"
        onClick={onForm}
        disabled={busy}
        className="self-start px-3 py-1.5 text-xs font-medium rounded-md bg-accent text-white hover:opacity-90 disabled:opacity-40 transition"
      >
        {busy ? phase || '组建中…' : '组建专家组'}
      </button>
    </div>
  );
}
