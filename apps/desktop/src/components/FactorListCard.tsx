import { useMemo, useState } from 'react';
import type { Message } from '@nodx/models';
import { parseFactorListContent } from '../db/messages.js';

interface FactorListCardProps {
  message: Message;
  /**
   * Called when the user clicks "→ 深入讨论" on a sub-question.
   * The parent creates a child Topic with parentId = current topic, persists
   * the spawned mapping into the message, and navigates to the new topic.
   */
  onDeepDive: (
    factorIdx: number,
    questionIdx: number,
    subQuestion: string,
  ) => Promise<void>;
}

export function FactorListCard({ message, onDeepDive }: FactorListCardProps) {
  const data = useMemo(
    () => parseFactorListContent(message.content),
    [message.content],
  );
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleDive = async (
    fIdx: number,
    qIdx: number,
    subQuestion: string,
  ) => {
    const key = `${fIdx}_${qIdx}`;
    if (pendingKey || data.spawned[key]) return;
    setPendingKey(key);
    setError(null);
    try {
      await onDeepDive(fIdx, qIdx, subQuestion);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPendingKey(null);
    }
  };

  return (
    <li className="flex justify-start">
      <div className="w-full max-w-[680px] rounded-lg border border-border bg-surface p-4">
        <header className="flex items-baseline gap-2 mb-1">
          <span className="text-[10px] uppercase tracking-wider text-accent font-semibold">
            第一性原理拆解
          </span>
        </header>
        <p className="text-xs text-ink-muted mb-3">
          基于你选的 {data.selectedFactorTitles.join(' · ')} 展开。
          每个子问题都可以单独"深入讨论"成一个子对话。
        </p>

        <div className="flex flex-col gap-4">
          {data.factors.map((f, fIdx) => (
            <section
              key={fIdx}
              className="border-l-2 border-accent/40 pl-3"
            >
              <h4 className="text-sm font-semibold text-ink">{f.title}</h4>
              <p className="text-xs text-ink-muted italic mt-0.5">
                本质：{f.essence}
              </p>
              <ul className="mt-2 flex flex-col gap-1.5">
                {f.sub_questions.map((sq, qIdx) => {
                  const key = `${fIdx}_${qIdx}`;
                  const spawnedTopicId = data.spawned[key];
                  const isPending = pendingKey === key;
                  return (
                    <li
                      key={qIdx}
                      className="flex items-start gap-2 text-xs"
                    >
                      <span
                        className={
                          'mt-0.5 inline-block w-1.5 h-1.5 rounded-full shrink-0 ' +
                          (sq.can_be_atomic
                            ? 'bg-note-green-edge'
                            : 'bg-ink-muted/50')
                        }
                        title={sq.can_be_atomic ? '可拆到原子级' : '需继续追问'}
                      />
                      <span className="flex-1 leading-snug text-ink">
                        {sq.question}
                      </span>
                      {spawnedTopicId ? (
                        <span className="text-[10px] text-green-700 shrink-0">
                          已深入 ✓
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => void handleDive(fIdx, qIdx, sq.question)}
                          disabled={isPending || pendingKey !== null}
                          className="text-[11px] text-accent hover:underline disabled:opacity-40 shrink-0"
                        >
                          {isPending ? '创建中…' : '→ 深入讨论'}
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>

        {error && (
          <pre className="mt-3 text-xs text-red-600 bg-red-50 p-2 rounded whitespace-pre-wrap">
            {error}
          </pre>
        )}
      </div>
    </li>
  );
}
