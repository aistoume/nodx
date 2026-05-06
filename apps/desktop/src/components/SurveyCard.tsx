import { useEffect, useMemo, useState } from 'react';
import type { SurveyFactor } from '@nodx/ai';
import type { Message } from '@nodx/models';
import { parseSurveyContent } from '../db/messages.js';

interface SurveyCardProps {
  message: Message;
  onPick: (selected: SurveyFactor[]) => Promise<void> | void;
  /**
   * Called when the user types a custom dimension and hits add. Parent
   * persists the new factor onto the message and returns its id so the
   * card can auto-check it (the user clearly wants it counted).
   */
  onAddCustom: (title: string) => Promise<string>;
  /** True while the parent is firing the decompose call. */
  decomposing: boolean;
}

const MIN_PICK = 3;
const MAX_PICK = 5;
const CUSTOM_ID_PREFIX = 'custom_';
const MAX_CUSTOM_TITLE_LEN = 24;

export function SurveyCard({
  message,
  onPick,
  onAddCustom,
  decomposing,
}: SurveyCardProps) {
  const data = useMemo(() => parseSurveyContent(message.content), [
    message.content,
  ]);
  const isCompleted = data.selectedIds !== null;
  const initialPicked = new Set<string>(data.selectedIds ?? []);
  const [picked, setPicked] = useState<Set<string>>(initialPicked);

  // Re-seed picked from incoming data when message id changes (different topic).
  useEffect(() => {
    setPicked(new Set(data.selectedIds ?? []));
  }, [message.id]);  // eslint-disable-line react-hooks/exhaustive-deps

  const [customTitle, setCustomTitle] = useState('');
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  const toggle = (id: string) => {
    if (isCompleted || decomposing) return;
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleAddCustom = async () => {
    if (isCompleted || decomposing || adding) return;
    const t = customTitle.trim();
    if (!t) return;
    if (t.length > MAX_CUSTOM_TITLE_LEN) {
      setAddError(`标题请控制在 ${MAX_CUSTOM_TITLE_LEN} 字以内`);
      return;
    }
    const dup = data.factors.some(
      (f) => f.title.trim().toLowerCase() === t.toLowerCase(),
    );
    if (dup) {
      setAddError('已经有同名维度');
      return;
    }
    setAdding(true);
    setAddError(null);
    try {
      const newId = await onAddCustom(t);
      setCustomTitle('');
      setPicked((prev) => {
        const next = new Set(prev);
        next.add(newId);
        return next;
      });
    } catch (err) {
      setAddError(err instanceof Error ? err.message : String(err));
    } finally {
      setAdding(false);
    }
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
            const isCustom = f.id.startsWith(CUSTOM_ID_PREFIX);
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
                    {isCustom && (
                      <span
                        className={
                          'ml-2 text-[9px] uppercase tracking-wider px-1 py-px rounded border align-middle ' +
                          (checked
                            ? 'border-white/40 text-white/80'
                            : 'border-accent/40 text-accent')
                        }
                      >
                        自定义
                      </span>
                    )}
                    {f.hint && !isCustom && (
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
          <div className="mt-3 pt-3 border-t border-accent/20">
            <div className="flex gap-2 items-center">
              <input
                type="text"
                value={customTitle}
                onChange={(e) => {
                  setCustomTitle(e.target.value);
                  if (addError) setAddError(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    void handleAddCustom();
                  }
                }}
                placeholder="自己补一个 AI 没列出的维度…"
                maxLength={MAX_CUSTOM_TITLE_LEN}
                disabled={adding || decomposing}
                className="flex-1 px-2.5 py-1.5 text-sm border border-border rounded-md bg-surface focus:outline-none focus:border-accent transition"
              />
              <button
                type="button"
                onClick={() => void handleAddCustom()}
                disabled={!customTitle.trim() || adding || decomposing}
                className="px-3 py-1.5 text-xs font-medium rounded-md border border-accent text-accent hover:bg-accent hover:text-white disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-accent transition"
              >
                {adding ? '…' : '+ 添加'}
              </button>
            </div>
            {addError && (
              <p className="mt-1 text-xs text-red-600">{addError}</p>
            )}
          </div>
        )}

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
