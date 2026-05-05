import { useMemo, useState } from 'react';
import type { SurveyFactor } from '@nodx/ai';
import type { Message } from '@nodx/models';
import { parseSurveyContent } from '../db/messages.js';

interface SurveyCardProps {
  message: Message;
  onPick: (selected: SurveyFactor[]) => Promise<void> | void;
  /** True while the parent is firing the decompose call. */
  decomposing: boolean;
}

const MIN_PICK = 3;
const MAX_PICK = 5;

export function SurveyCard({
  message,
  onPick,
  decomposing,
}: SurveyCardProps) {
  const data = useMemo(() => parseSurveyContent(message.content), [
    message.content,
  ]);
  const isCompleted = data.selectedIds !== null;
  const initialPicked = new Set<string>(data.selectedIds ?? []);
  const [picked, setPicked] = useState<Set<string>>(initialPicked);

  const toggle = (id: string) => {
    if (isCompleted || decomposing) return;
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleContinue = () => {
    if (picked.size < MIN_PICK || picked.size > MAX_PICK) return;
    if (decomposing) return;
    const selectedFactors = data.factors.filter((f) => picked.has(f.id));
    void onPick(selectedFactors);
  };

  const continueDisabled =
    picked.size < MIN_PICK || picked.size > MAX_PICK || decomposing;

  return (
    <li className="flex justify-start">
      <div className="w-full max-w-[640px] rounded-lg border border-accent/30 bg-accent-soft p-4">
        <header className="flex items-baseline gap-2 mb-3">
          <span className="text-[10px] uppercase tracking-wider text-accent font-semibold">
            Survey
          </span>
          <h3 className="text-sm font-medium text-ink">
            {isCompleted
              ? '已选定的关注维度'
              : `选 ${MIN_PICK}–${MAX_PICK} 个最关心的维度`}
          </h3>
        </header>

        <ul className="flex flex-col gap-1.5">
          {data.factors.map((f) => {
            const checked = picked.has(f.id);
            const dimmed = isCompleted && !checked;
            return (
              <li key={f.id}>
                <label
                  className={
                    'flex items-start gap-2.5 px-2.5 py-2 rounded-md text-sm cursor-pointer transition ' +
                    (dimmed
                      ? 'opacity-40'
                      : checked
                        ? 'bg-accent text-white'
                        : 'bg-surface hover:bg-canvas')
                  }
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggle(f.id)}
                    disabled={isCompleted || decomposing}
                    className="mt-0.5 shrink-0 accent-accent"
                  />
                  <span className="flex-1 leading-snug">
                    <span className="font-medium">{f.title}</span>
                    {f.hint && (
                      <span
                        className={
                          'block text-xs mt-0.5 ' +
                          (checked ? 'text-white/80' : 'text-ink-muted')
                        }
                      >
                        {f.hint}
                      </span>
                    )}
                  </span>
                </label>
              </li>
            );
          })}
        </ul>

        {!isCompleted && (
          <footer className="mt-3 flex items-center justify-between gap-3">
            <span className="text-xs text-ink-muted">
              已选 {picked.size} / 需要 {MIN_PICK}–{MAX_PICK}
            </span>
            <button
              type="button"
              onClick={handleContinue}
              disabled={continueDisabled}
              className="px-3 py-1.5 text-xs font-medium rounded-md bg-accent text-white hover:opacity-90 disabled:opacity-40 transition"
            >
              {decomposing ? '拆解中…' : '继续 →'}
            </button>
          </footer>
        )}

        {isCompleted && (
          <p className="mt-3 text-xs text-ink-muted">
            未选项暂保留为候选，后续可在这里重启。
          </p>
        )}
      </div>
    </li>
  );
}
