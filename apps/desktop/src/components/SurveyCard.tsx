import { useEffect, useMemo, useState } from 'react';
import type { SurveyFactor } from '@nodx/ai';
import type { Message } from '@nodx/models';
import { parseSurveyContent } from '../db/messages.js';
import { useT } from '../i18n/index.js';

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

// Suggested range — shown to the user as guidance, not a hard cap. The
// only enforced floor is "at least 1" so we have something to decompose.
const SUGGESTED_MIN = 3;
const SUGGESTED_MAX = 5;
const HARD_MIN = 1;
const CUSTOM_ID_PREFIX = 'custom_';
const MAX_CUSTOM_TITLE_LEN = 24;

export function SurveyCard({
  message,
  onPick,
  onAddCustom,
  decomposing,
}: SurveyCardProps) {
  const { t } = useT();
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
    const title = customTitle.trim();
    if (!title) return;
    if (title.length > MAX_CUSTOM_TITLE_LEN) {
      setAddError(t('survey.errorTooLong', { max: String(MAX_CUSTOM_TITLE_LEN) }));
      return;
    }
    const dup = data.factors.some(
      (f) => f.title.trim().toLowerCase() === title.toLowerCase(),
    );
    if (dup) {
      setAddError(t('survey.errorDuplicate'));
      return;
    }
    setAdding(true);
    setAddError(null);
    try {
      const newId = await onAddCustom(title);
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
    if (picked.size < HARD_MIN) return;
    if (decomposing) return;
    const selectedFactors = data.factors.filter((f) => picked.has(f.id));
    void onPick(selectedFactors);
  };

  const continueDisabled = picked.size < HARD_MIN || decomposing;

  return (
    <li className="flex justify-start">
      <div className="w-full max-w-[640px] rounded-lg border border-accent/30 bg-accent-soft p-4">
        <header className="flex items-baseline gap-2 mb-3">
          <span className="text-[10px] uppercase tracking-wider text-accent font-semibold">
            Survey
          </span>
          <h3 className="text-sm font-medium text-ink">
            {isCompleted
              ? t('survey.titleDone')
              : t('survey.titlePick', {
                  min: String(SUGGESTED_MIN),
                  max: String(SUGGESTED_MAX),
                })}
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
                        {t('survey.customBadge')}
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
                placeholder={t('survey.customPlaceholder')}
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
                {adding ? '…' : t('survey.addBtn')}
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
              {t('survey.picked', { n: String(picked.size) })}
              {picked.size > 0 &&
                (picked.size < SUGGESTED_MIN ||
                  picked.size > SUGGESTED_MAX) && (
                  <span className="ml-1 opacity-70">
                    {t('survey.pickedHint', {
                      min: String(SUGGESTED_MIN),
                      max: String(SUGGESTED_MAX),
                    })}
                  </span>
                )}
            </span>
            <button
              type="button"
              onClick={handleContinue}
              disabled={continueDisabled}
              className="px-3 py-1.5 text-xs font-medium rounded-md bg-accent text-white hover:opacity-90 disabled:opacity-40 transition"
            >
              {decomposing ? t('survey.decomposing') : t('survey.continue')}
            </button>
          </footer>
        )}

        {isCompleted && (
          <p className="mt-3 text-xs text-ink-muted">
            {t('survey.remainderHint')}
          </p>
        )}
      </div>
    </li>
  );
}
