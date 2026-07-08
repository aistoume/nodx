import { useEffect, useRef, useState } from 'react';
import { useT } from '../i18n/index.js';

type View = 'dialog' | 'graph' | 'cases' | 'attention' | 'settings';

export interface OpenQuestionItem {
  id: string;
  topicId: string;
  topicTitle: string;
  question: string;
}

interface HeaderProps {
  view: View;
  onViewChange: (view: View) => void;
  /** Global unresolved 卡点 (PRD §3.12), newest first. */
  openQuestions: OpenQuestionItem[];
  /** Jump to a topic (used from the 卡点 dropdown). */
  onJumpToTopic: (topicId: string) => void;
}

export function Header({
  view,
  onViewChange,
  openQuestions,
  onJumpToTopic,
}: HeaderProps) {
  const { t } = useT();
  return (
    <header className="h-14 bg-surface border-b border-border flex items-center px-6 gap-4 shrink-0">
      <div className="flex items-baseline gap-2">
        <span className="font-bold text-lg text-accent">{t('app.name')}</span>
        <span className="text-xs text-ink-muted">{t('app.tagline')}</span>
      </div>
      <nav className="ml-auto flex gap-1">
        <ViewTab
          label={t('header.tab.dialog')}
          active={view === 'dialog'}
          onClick={() => onViewChange('dialog')}
        />
        <ViewTab
          label={t('header.tab.graph')}
          active={view === 'graph'}
          onClick={() => onViewChange('graph')}
        />
        <ViewTab
          label={t('header.tab.cases')}
          active={view === 'cases'}
          onClick={() => onViewChange('cases')}
        />
        <ViewTab
          label={t('header.tab.attention')}
          active={view === 'attention'}
          onClick={() => onViewChange('attention')}
        />
        <ViewTab
          label={t('header.tab.settings')}
          active={view === 'settings'}
          onClick={() => onViewChange('settings')}
        />
      </nav>
      <OpenQuestionsBadge
        items={openQuestions}
        onJump={(id) => onJumpToTopic(id)}
      />
      <button
        type="button"
        className="px-3 py-1.5 text-sm rounded-md border border-border bg-surface text-ink-muted hover:bg-canvas hover:text-ink transition"
      >
        {t('header.drafts')}
      </button>
    </header>
  );
}

function OpenQuestionsBadge({
  items,
  onJump,
}: {
  items: OpenQuestionItem[];
  onJump: (topicId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    window.addEventListener('mousedown', onClick);
    return () => window.removeEventListener('mousedown', onClick);
  }, [open]);

  const count = items.length;
  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title="全局卡点清单"
        className={
          'px-3 py-1.5 text-sm rounded-md border transition flex items-center gap-1.5 ' +
          (count > 0
            ? 'border-red-300 bg-red-50 text-red-700 hover:bg-red-100'
            : 'border-border bg-surface text-ink-muted hover:bg-canvas hover:text-ink')
        }
      >
        <span>📍 卡点</span>
        {count > 0 && (
          <span className="min-w-4 h-4 px-1 rounded-full bg-red-600 text-white text-[10px] flex items-center justify-center">
            {count}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 w-80 max-h-96 overflow-y-auto bg-surface border border-border rounded-md shadow-lg z-50 p-1">
          {count === 0 ? (
            <p className="text-xs text-ink-muted p-3 text-center">
              暂无未解决的卡点。选中文字 →「📍 卡点」可标记。
            </p>
          ) : (
            <ul className="flex flex-col">
              {items.map((q) => (
                <li key={q.id}>
                  <button
                    type="button"
                    onClick={() => {
                      onJump(q.topicId);
                      setOpen(false);
                    }}
                    className="w-full text-left px-2.5 py-2 rounded hover:bg-canvas transition flex flex-col gap-0.5"
                  >
                    <span className="text-xs text-ink leading-snug line-clamp-2">
                      {q.question}
                    </span>
                    <span className="text-[10px] text-ink-muted truncate">
                      {q.topicTitle}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function ViewTab({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        active
          ? 'px-3.5 py-1.5 text-sm rounded-md bg-accent text-white'
          : 'px-3.5 py-1.5 text-sm rounded-md text-ink-muted hover:bg-canvas hover:text-ink transition'
      }
    >
      {label}
    </button>
  );
}
