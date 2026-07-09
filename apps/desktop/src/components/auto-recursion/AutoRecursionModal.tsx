import { useEffect, useRef, useState } from 'react';
import type {
  AutoRecursionRun,
  ChildCandidate,
  LocalMaximumResult,
  Topic,
} from '@nodx/models';
import {
  startAutoRecursionRun,
  type LayerDecision,
  type PlanView,
  type StopRecordView,
} from '../../ai/auto-recursion.js';
import {
  DEFAULT_BUDGET_USD,
  DEFAULT_DEPTH_LIMIT,
} from '../../db/auto-recursion.js';
import { useT, t as tPure } from '../../i18n/index.js';
import type { StringKey } from '../../i18n/index.js';

interface AutoRecursionModalProps {
  topic: Topic;
  localMax: LocalMaximumResult;
  onClose: () => void;
  /** Refresh the app (left panel subtree etc.) after spawns / terminal. */
  onMutated: () => void;
}

type Stage = 'config' | 'running' | 'plan' | 'stopConfirm' | 'done' | 'error';

const STATUS_LABEL_KEY: Record<AutoRecursionRun['status'], StringKey> = {
  running: 'recur.status.running',
  paused_by_user: 'recur.status.paused',
  completed: 'recur.status.completed',
  budget_exhausted: 'recur.status.budget',
  depth_exhausted: 'recur.status.depth',
  hit_real_world_block: 'recur.status.realWorld',
};

const PLAN_STATUS_LABEL_KEY: Record<string, StringKey> = {
  atomic_complete: 'recur.planStatus.atomic',
  needs_deepening: 'recur.planStatus.deeper',
  needs_real_world_data: 'recur.planStatus.realWorld',
  multi_path_choice: 'recur.planStatus.multi',
};

/**
 * 自动递进 run surface (PRD §3.19, Sprint B): configure mode + hard caps →
 * watch the run stream → review each layer's 路径预览 → terminal report.
 * Auto-Run is greyed out until Sprint C (3s-dismiss preview + rollback).
 */
export function AutoRecursionModal({
  topic,
  localMax,
  onClose,
  onMutated,
}: AutoRecursionModalProps) {
  const { t } = useT();
  const [stage, setStage] = useState<Stage>('config');
  const [mode, setMode] = useState<'auto_step' | 'pilot' | 'auto_run'>(
    'auto_step',
  );
  // auto_run requires an explicit 二次确认 before the run kicks off.
  const [confirmAutoRun, setConfirmAutoRun] = useState(false);
  const [budgetUsd, setBudgetUsd] = useState(DEFAULT_BUDGET_USD);
  const [depthLimit, setDepthLimit] = useState(DEFAULT_DEPTH_LIMIT);
  const [webResearch, setWebResearch] = useState(true);

  const [phase, setPhase] = useState('');
  const [run, setRun] = useState<AutoRecursionRun | null>(null);
  const [view, setView] = useState<PlanView | null>(null);
  const [error, setError] = useState<string | null>(null);
  // auto_step: radio pick; pilot: checkbox picks
  const [picked, setPicked] = useState<string | null>(null);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  // Bumped per path-preview so PathPreview remounts (resets the auto_run countdown).
  const [previewNonce, setPreviewNonce] = useState(0);

  const resolverRef = useRef<((d: LayerDecision) => void) | null>(null);

  // Abnormal-stop save confirmation (改进: 手动选择保存当前记录).
  const [stopView, setStopView] = useState<StopRecordView | null>(null);
  const stopResolverRef = useRef<((save: boolean) => void) | null>(null);

  const start = async () => {
    setStage('running');
    setError(null);
    try {
      const final = await startAutoRecursionRun(
        { rootTopic: topic, localMax, mode, budgetUsd, depthLimit, webResearch },
        {
          onPhase: setPhase,
          onRunUpdate: setRun,
          onPlanReady: (v) =>
            new Promise<LayerDecision>((resolve) => {
              setView(v);
              // Default pick = topPick if eligible, else first non-excluded.
              const excluded = new Set(v.excludedTitles);
              const firstEligible = v.plan.childCandidates.find(
                (c) => !excluded.has(c.title),
              )?.title;
              setPicked(
                v.plan.topPick && !excluded.has(v.plan.topPick)
                  ? v.plan.topPick
                  : (firstEligible ?? null),
              );
              setChecked(new Set());
              setPreviewNonce((n) => n + 1);
              setStage('plan');
              resolverRef.current = resolve;
            }),
          onStopRecord: (v) =>
            new Promise<boolean>((resolve) => {
              setStopView(v);
              setStage('stopConfirm');
              stopResolverRef.current = resolve;
            }),
        },
      );
      setRun(final);
      setStage('done');
      onMutated();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStage('error');
      onMutated();
    }
  };

  const decide = (d: LayerDecision) => {
    resolverRef.current?.(d);
    resolverRef.current = null;
    setStage('running');
    setPhase('');
  };

  // auto_run start gate: first 开始 click on auto_run asks for confirmation.
  const handleStart = () => {
    if (mode === 'auto_run' && !confirmAutoRun) {
      setConfirmAutoRun(true);
      return;
    }
    void start();
  };

  const decideStop = (save: boolean) => {
    stopResolverRef.current?.(save);
    stopResolverRef.current = null;
    setStopView(null);
    setStage('running');
    setPhase(save ? t('recur.phase.saveToNode') : t('recur.phase.finalize'));
  };

  const closable = stage === 'config' || stage === 'done' || stage === 'error';

  return (
    <div
      className="fixed inset-0 z-[100] bg-black/30 flex items-center justify-center p-8"
      onMouseDown={closable ? onClose : undefined}
    >
      <div
        onMouseDown={(e) => e.stopPropagation()}
        className="bg-surface rounded-lg shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col overflow-hidden"
      >
        <header className="px-6 py-3 border-b border-border flex items-center gap-2 shrink-0">
          <span className="text-sm font-semibold text-ink">{t('recur.title')}</span>
          <span className="text-[11px] text-ink-muted truncate">
            {topic.title}
          </span>
          <div className="ml-auto flex items-center gap-3">
            {run && (
              <span className="text-[11px] text-ink-muted">
                {t('recur.spent', {
                  spent: run.totalSpentUsd.toFixed(3),
                  budget: String(run.budgetUsd),
                })}
              </span>
            )}
            {closable ? (
              <button
                type="button"
                onClick={onClose}
                className="px-2.5 py-1 text-xs text-ink-muted hover:text-ink"
              >
                {t('recur.close')}
              </button>
            ) : (
              <span className="text-[11px] text-ink-muted">
                {t('recur.runningHint')}
              </span>
            )}
          </div>
        </header>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          {stage === 'config' && (
            <ConfigForm
              mode={mode}
              onMode={(m) => {
                setMode(m);
                setConfirmAutoRun(false);
              }}
              budgetUsd={budgetUsd}
              onBudget={setBudgetUsd}
              depthLimit={depthLimit}
              onDepth={setDepthLimit}
              webResearch={webResearch}
              onWebResearch={setWebResearch}
              confirmAutoRun={confirmAutoRun}
              onStart={handleStart}
            />
          )}

          {stage === 'running' && (
            <div className="flex items-center gap-2 text-sm text-ink-muted">
              <span className="flex gap-1">
                {[0, 0.15, 0.3].map((d) => (
                  <span
                    key={d}
                    className="inline-block w-1.5 h-1.5 rounded-full bg-ink-muted/60 animate-bounce"
                    style={{ animationDelay: `${d}s` }}
                  />
                ))}
              </span>
              <span className="text-xs">{phase || t('recur.preparing')}</span>
            </div>
          )}

          {stage === 'plan' && view && (
            <PathPreview
              key={previewNonce}
              view={view}
              picked={picked}
              onPick={setPicked}
              checked={checked}
              onToggle={(t) =>
                setChecked((prev) => {
                  const next = new Set(prev);
                  if (next.has(t)) next.delete(t);
                  else next.add(t);
                  return next;
                })
              }
              onDecide={decide}
            />
          )}

          {stage === 'stopConfirm' && stopView && (
            <StopConfirm view={stopView} onDecide={decideStop} />
          )}

          {(stage === 'done' || stage === 'error') && (
            <div className="flex flex-col gap-3">
              {error && (
                <pre className="text-xs text-red-700 bg-red-50 border border-red-200 rounded p-2 whitespace-pre-wrap break-all">
                  {error}
                </pre>
              )}
              {run && <RunSummary run={run} />}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── config ─────────────────────────────────────────────── */

function ConfigForm({
  mode,
  onMode,
  budgetUsd,
  onBudget,
  depthLimit,
  onDepth,
  webResearch,
  onWebResearch,
  confirmAutoRun,
  onStart,
}: {
  mode: 'auto_step' | 'pilot' | 'auto_run';
  onMode: (m: 'auto_step' | 'pilot' | 'auto_run') => void;
  budgetUsd: number;
  onBudget: (n: number) => void;
  depthLimit: number;
  onDepth: (n: number) => void;
  webResearch: boolean;
  onWebResearch: (b: boolean) => void;
  confirmAutoRun: boolean;
  onStart: () => void;
}) {
  const { t } = useT();
  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs text-ink-muted leading-relaxed">
        {t('recur.intro')}
      </p>

      <div className="flex flex-col gap-2">
        <ModeOption
          selected={mode === 'auto_step'}
          onSelect={() => onMode('auto_step')}
          emoji="🟢"
          name={t('recur.mode.auto_step.name')}
          desc={t('recur.mode.auto_step.desc')}
        />
        <ModeOption
          selected={mode === 'pilot'}
          onSelect={() => onMode('pilot')}
          emoji="🔵"
          name={t('recur.mode.pilot.name')}
          desc={t('recur.mode.pilot.desc')}
        />
        <ModeOption
          selected={mode === 'auto_run'}
          onSelect={() => onMode('auto_run')}
          emoji="🟡"
          name={t('recur.mode.auto_run.name')}
          desc={t('recur.mode.auto_run.desc')}
        />
      </div>

      {mode === 'auto_run' && confirmAutoRun && (
        <div className="rounded-md border border-amber-300 bg-amber-50 p-3">
          <p className="text-xs font-medium text-amber-900">
            {t('recur.confirm.title')}
          </p>
          <p className="text-[11px] text-amber-800 mt-1 leading-relaxed">
            {t('recur.confirm.desc', {
              budget: String(budgetUsd),
              depth: String(depthLimit),
            })}
          </p>
        </div>
      )}

      <div className="flex items-center gap-4 flex-wrap">
        <label className="flex items-center gap-1.5 text-xs text-ink-muted">
          {t('recur.budgetLabel')}
          <input
            type="number"
            min={0.5}
            step={0.5}
            value={budgetUsd}
            onChange={(e) => onBudget(Number(e.target.value) || 0.5)}
            className="w-20 rounded border border-border bg-surface px-1.5 py-1 text-xs text-ink"
          />
        </label>
        <label className="flex items-center gap-1.5 text-xs text-ink-muted">
          {t('recur.depthLabel')}
          <select
            value={depthLimit}
            onChange={(e) => onDepth(Number(e.target.value))}
            className="rounded border border-border bg-surface px-1.5 py-1 text-xs text-ink"
          >
            {[1, 2, 3, 4, 5, 6].map((n) => (
              <option key={n} value={n}>
                {t('recur.depthN', { n: String(n) })}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label
        className="flex items-start gap-2 text-xs text-ink cursor-pointer"
        title={t('recur.webResearch.tip')}
      >
        <input
          type="checkbox"
          checked={webResearch}
          onChange={(e) => onWebResearch(e.target.checked)}
          className="mt-0.5"
        />
        <span>
          {t('recur.webResearch.label')}
          <span className="block text-[11px] text-ink-muted">
            {t('recur.webResearch.desc')}
          </span>
        </span>
      </label>

      <button
        type="button"
        onClick={onStart}
        className="self-start px-4 py-2 text-xs font-medium rounded-md bg-accent text-white hover:opacity-90 transition"
      >
        {mode === 'auto_run' && confirmAutoRun
          ? t('recur.startConfirm')
          : t('recur.startBtn')}
      </button>
    </div>
  );
}

function ModeOption({
  selected,
  onSelect,
  emoji,
  name,
  desc,
}: {
  selected: boolean;
  onSelect: () => void;
  emoji: string;
  name: string;
  desc: string;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={
        'text-left rounded-md border p-3 transition ' +
        (selected
          ? 'border-accent bg-accent-soft'
          : 'border-border hover:border-ink-muted')
      }
    >
      <p className="text-xs font-medium text-ink">
        {emoji} {name}
      </p>
      <p className="text-[11px] text-ink-muted mt-0.5">{desc}</p>
    </button>
  );
}

/* ── path preview ───────────────────────────────────────── */

/** Auto-Run 3s preview countdown — auto-proceeds with the current pick unless
 *  the user grabs control (打回上一层 / 暂停 / 立即推进). Returns seconds left,
 *  or null in non-auto_run modes. */
const AUTORUN_PREVIEW_SECONDS = 3;

function PathPreview({
  view,
  picked,
  onPick,
  checked,
  onToggle,
  onDecide,
}: {
  view: PlanView;
  picked: string | null;
  onPick: (t: string) => void;
  checked: Set<string>;
  onToggle: (t: string) => void;
  onDecide: (d: LayerDecision) => void;
}) {
  const { t } = useT();
  const { plan, chain, depth, spentUsd, mode, canRollback, excludedTitles } =
    view;
  const excluded = new Set(excludedTitles);

  // auto_run: tick down and auto-proceed. proceedRef captures the latest pick.
  const [secondsLeft, setSecondsLeft] = useState(AUTORUN_PREVIEW_SECONDS);
  const proceedRef = useRef<() => void>(() => {});
  proceedRef.current = () =>
    onDecide({ kind: 'continue', pickTitle: picked ?? undefined });
  useEffect(() => {
    if (mode !== 'auto_run') return;
    const iv = window.setInterval(
      () => setSecondsLeft((s) => Math.max(0, s - 1)),
      1000,
    );
    const to = window.setTimeout(() => {
      window.clearInterval(iv);
      proceedRef.current();
    }, AUTORUN_PREVIEW_SECONDS * 1000);
    return () => {
      window.clearInterval(iv);
      window.clearTimeout(to);
    };
    // Mount-once: the modal remounts this component per layer (key=previewNonce).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex flex-col gap-4">
      {/* 推理链快照 */}
      <div className="rounded-md border border-accent/30 bg-accent-soft px-3 py-2">
        <p className="text-[10px] uppercase tracking-wider text-accent font-semibold mb-1">
          {t('recur.previewHeader', {
            depth: String(depth),
            spent: spentUsd.toFixed(3),
          })}
          {mode === 'auto_run' && (
            <span className="ml-2 text-amber-700">
              {t('recur.autoRunCountdown', { s: String(secondsLeft) })}
            </span>
          )}
        </p>
        <p className="text-xs text-ink leading-relaxed">
          {chain.map((t, i) => (
            <span key={i}>
              {i > 0 && <span className="text-ink-muted"> → </span>}
              <span className={i === chain.length - 1 ? 'font-medium' : ''}>
                {t}
              </span>
            </span>
          ))}
        </p>
      </div>

      <div className="flex items-center gap-2 text-xs">
        <span className="px-1.5 py-0.5 rounded-full bg-surface border border-border font-medium text-ink">
          {PLAN_STATUS_LABEL_KEY[plan.status]
            ? t(PLAN_STATUS_LABEL_KEY[plan.status]!)
            : plan.status}
        </span>
        <span className="text-ink-muted">
          {t('recur.atomicity', { pct: String(Math.round(plan.atomicityScore * 100)) })}
        </span>
      </div>

      {plan.whatsMissing.length > 0 && (
        <div>
          <p className="text-[11px] font-semibold text-ink-muted mb-1">
            {t('recur.whatsMissing')}
          </p>
          <ul className="list-disc pl-5 flex flex-col gap-0.5">
            {plan.whatsMissing.map((w, i) => (
              <li key={i} className="text-xs text-ink leading-relaxed">
                {w}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div>
        <p className="text-[11px] font-semibold text-ink-muted mb-1.5">
          {t('recur.candidates')}
          {mode === 'pilot' ? t('recur.candidatesPilot') : t('recur.candidatesPick')}
        </p>
        <div className="flex flex-col gap-1.5">
          {plan.childCandidates.map((c) => (
            <CandidateRow
              key={c.title}
              candidate={c}
              isTopPick={plan.topPick === c.title}
              excluded={excluded.has(c.title)}
              selected={
                mode === 'pilot' ? checked.has(c.title) : picked === c.title
              }
              onSelect={() => {
                if (excluded.has(c.title)) return;
                if (mode === 'pilot') onToggle(c.title);
                else onPick(c.title);
              }}
            />
          ))}
        </div>
        {excluded.size > 0 && (
          <p className="text-[11px] text-ink-muted mt-1">
            {t('recur.excludedHint')}
          </p>
        )}
      </div>

      {plan.topPickReasoning && (
        <p className="text-[11px] text-ink-muted leading-relaxed">
          <span className="font-semibold">{t('recur.reasonLabel')}</span>
          {plan.topPickReasoning}
        </p>
      )}

      <div className="flex items-center gap-2 pt-1 flex-wrap">
        {mode === 'pilot' ? (
          <button
            type="button"
            disabled={checked.size === 0}
            onClick={() => onDecide({ kind: 'spawn_selected', titles: [...checked] })}
            className="px-3 py-1.5 text-xs font-medium rounded-md bg-accent text-white hover:opacity-90 disabled:opacity-40 transition"
          >
            {t('recur.spawnN', { n: String(checked.size) })}
          </button>
        ) : (
          <button
            type="button"
            disabled={!picked}
            onClick={() =>
              onDecide({ kind: 'continue', pickTitle: picked ?? undefined })
            }
            className="px-3 py-1.5 text-xs font-medium rounded-md bg-accent text-white hover:opacity-90 disabled:opacity-40 transition"
          >
            {mode === 'auto_run' ? t('recur.advanceNow') : t('recur.advanceAndRun')}
          </button>
        )}
        {canRollback && (
          <button
            type="button"
            onClick={() => onDecide({ kind: 'rollback' })}
            title={t('recur.rollbackTip')}
            className="px-2.5 py-1 text-xs font-medium rounded border border-amber-300 text-amber-800 hover:bg-amber-50 transition"
          >
            {t('recur.rollback')}
          </button>
        )}
        <button
          type="button"
          onClick={() => onDecide({ kind: 'stop' })}
          className="px-2.5 py-1 text-xs font-medium rounded border border-border text-ink-muted hover:text-ink hover:border-ink-muted transition"
        >
          {mode === 'auto_run' ? t('recur.pauseBtn') : t('recur.stopBtn')}
        </button>
      </div>
    </div>
  );
}

const ACTION_LABEL_KEY: Record<ChildCandidate['recommendedAction'], StringKey> = {
  spawn_and_run: 'recur.action.spawnAndRun',
  spawn_only: 'recur.action.spawnOnly',
  skip: 'recur.action.skip',
  flag_as_real_world_action: 'recur.action.realWorld',
};

function CandidateRow({
  candidate: c,
  isTopPick,
  excluded,
  selected,
  onSelect,
}: {
  candidate: ChildCandidate;
  isTopPick: boolean;
  excluded?: boolean;
  selected: boolean;
  onSelect: () => void;
}) {
  const { t } = useT();
  const pct = Math.round(c.feasibilityScore * 100);
  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={excluded}
      className={
        'text-left rounded-md border p-2.5 transition ' +
        (excluded
          ? 'border-border opacity-40 line-through cursor-not-allowed'
          : selected
            ? 'border-accent bg-accent-soft'
            : 'border-border hover:border-ink-muted')
      }
    >
      <div className="flex items-center gap-2">
        <span className="text-xs font-medium text-ink flex-1 min-w-0">
          {c.title}
          {isTopPick && (
            <span className="ml-1.5 text-[10px] px-1 py-0.5 rounded-full bg-note-green border border-note-green-edge/40 text-green-800">
              topPick
            </span>
          )}
        </span>
        <span className="text-[11px] text-ink-muted shrink-0">
          {t(ACTION_LABEL_KEY[c.recommendedAction])}
        </span>
        <span className="text-[11px] font-semibold text-accent shrink-0">
          {pct}
        </span>
      </div>
      <div className="mt-1.5 h-1 rounded-full bg-border/60 overflow-hidden">
        <div
          className="h-full bg-accent/70"
          style={{ width: `${pct}%` }}
        />
      </div>
      {(c.sourceOpenQuestion || c.sourceOptionChoice) && (
        <p className="mt-1 text-[11px] text-ink-muted truncate">
          {t('recur.sourceLabel')}{c.sourceOpenQuestion ?? c.sourceOptionChoice}
        </p>
      )}
      {c.breakdown.dependencies.length > 0 && (
        <p className="mt-0.5 text-[11px] text-ink-muted truncate">
          {t('recur.depsLabel')}{c.breakdown.dependencies.join(tPure('recur.depsSep'))}
        </p>
      )}
    </button>
  );
}

/* ── abnormal-stop save confirmation ────────────────────── */

function StopConfirm({
  view,
  onDecide,
}: {
  view: StopRecordView;
  onDecide: (save: boolean) => void;
}) {
  const { t } = useT();
  const { plan, stopStatus, depth, blockers, hasResearch, topic } = view;
  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-md border border-accent/30 bg-accent-soft px-3 py-2">
        <p className="text-sm font-medium text-ink">
          {t(STATUS_LABEL_KEY[stopStatus])}
        </p>
        <p className="text-xs text-ink-muted mt-0.5">
          {t('recur.stop.depthLine', { depth: String(depth), title: topic.title })}
        </p>
      </div>

      <div>
        <p className="text-xs text-ink leading-relaxed">
          {t('recur.stop.question')}
        </p>
        <ul className="list-disc pl-5 mt-1.5 flex flex-col gap-0.5 text-xs text-ink leading-relaxed">
          <li>
            {t('recur.stop.docSummary', {
              pct: String(Math.round(plan.atomicityScore * 100)),
              gaps: String(plan.whatsMissing.length),
              cands: String(plan.childCandidates.length),
              research: hasResearch ? t('recur.stop.researchTag') : '',
            })}
          </li>
          <li>{t('recur.stop.traceLine')}</li>
          {stopStatus === 'hit_real_world_block' && blockers.length > 0 && (
            <li>
              {t('recur.stop.blockersHead', { n: String(blockers.length) })}
              <ul className="list-[circle] pl-4 mt-0.5">
                {blockers.slice(0, 3).map((b, i) => (
                  <li key={i} className="text-ink-muted truncate">
                    {b}
                  </li>
                ))}
                {blockers.length > 3 && (
                  <li className="text-ink-muted">{t('recur.stop.blockersMore', { n: String(blockers.length) })}</li>
                )}
              </ul>
            </li>
          )}
        </ul>
        <p className="text-[11px] text-ink-muted mt-2">
          {t('recur.stop.noLoss')}
        </p>
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onDecide(true)}
          className="px-3 py-1.5 text-xs font-medium rounded-md bg-accent text-white hover:opacity-90 transition"
        >
          {t('recur.stop.saveBtn')}
        </button>
        <button
          type="button"
          onClick={() => onDecide(false)}
          className="px-2.5 py-1 text-xs font-medium rounded border border-border text-ink-muted hover:text-ink hover:border-ink-muted transition"
        >
          {t('recur.stop.discardBtn')}
        </button>
      </div>
    </div>
  );
}

/* ── terminal report ────────────────────────────────────── */

function RunSummary({ run }: { run: AutoRecursionRun }) {
  const { t } = useT();
  return (
    <div className="rounded-md border border-border p-4 flex flex-col gap-2">
      <p className="text-sm font-medium text-ink">
        {t(STATUS_LABEL_KEY[run.status])}
      </p>
      <div className="text-xs text-ink-muted flex flex-col gap-0.5">
        <span>{t('recur.summary.spent', { spent: run.totalSpentUsd.toFixed(3), budget: String(run.budgetUsd) })}</span>
        <span>{t('recur.summary.depth', { depth: String(run.maxDepthReached), limit: String(run.depthLimit) })}</span>
        <span>{t('recur.summary.spawned', { n: String(run.spawnedTopicIds.length) })}</span>
        {run.interruptions.length > 0 && (
          <span>{t('recur.summary.interruptions', { n: String(run.interruptions.length) })}</span>
        )}
      </div>
    </div>
  );
}
