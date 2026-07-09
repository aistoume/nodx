import { useEffect, useRef, useState } from 'react';
import type { Message } from '@nodx/models';
import { useT } from '../i18n/index.js';

/**
 * Shared chat-thread + composer used by both pre-doc and doc-mode views.
 * The thread renders text-only messages (Survey/factor_list/explanation
 * are filtered out at the call site). The composer is always visible so
 * the user can chat with AI regardless of whether a doc has been generated.
 */
interface ChatThreadProps {
  messages: Message[];
  thinking: boolean;
  error: string | null;
  /** Hidden when 0 messages, no thinking, no error — keeps pre-doc clean. */
  showHeader?: boolean;
}

export function ChatThread({
  messages,
  thinking,
  error,
  showHeader = true,
}: ChatThreadProps) {
  const { t } = useT();
  const anchorRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    anchorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages.length, thinking]);

  if (messages.length === 0 && !thinking && !error) return null;

  return (
    <section className="mt-10 pt-6 border-t border-border">
      {showHeader && (
        <div className="text-[11px] uppercase tracking-wider text-ink-muted font-medium mb-3">
          {t('chat.followupHeader')}
        </div>
      )}
      <ul className="flex flex-col gap-3">
        {messages.map((m) => (
          <ChatBubble key={m.id} message={m} />
        ))}
        {thinking && <ChatThinkingBubble />}
      </ul>
      {error && (
        <pre className="mt-3 text-xs text-red-600 bg-red-50 p-2 rounded whitespace-pre-wrap">
          {error}
        </pre>
      )}
      <div ref={anchorRef} />
    </section>
  );
}

function ChatBubble({ message }: { message: Message }) {
  const isUser = message.role === 'user';
  return (
    <li className={'flex ' + (isUser ? 'justify-end' : 'justify-start')}>
      <div
        className={
          'max-w-[80%] rounded-lg px-3.5 py-2 text-sm whitespace-pre-wrap break-words selection:bg-yellow-200 selection:text-ink ' +
          (isUser
            ? 'bg-accent text-white'
            : 'bg-surface border border-border text-ink')
        }
      >
        {message.content}
      </div>
    </li>
  );
}

function ChatThinkingBubble() {
  const { t } = useT();
  return (
    <li className="flex justify-start">
      <div className="rounded-lg px-3.5 py-2.5 bg-surface border border-border text-ink-muted text-xs flex items-center gap-2">
        <span className="flex gap-1">
          <Dot delay="0s" />
          <Dot delay="0.15s" />
          <Dot delay="0.3s" />
        </span>
        <span>{t('chat.aiThinking')}</span>
      </div>
    </li>
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

interface ChatComposerProps {
  onSend: (content: string) => Promise<void> | void;
  disabled: boolean;
  /** Rendered above the textarea row — used for the spawn-child button. */
  topSlot?: React.ReactNode;
  /** External draft to seed (e.g. "重新推理" pre-fills the 卡点). */
  seedDraft?: string;
  /** Bump to re-apply seedDraft even if its text is unchanged. */
  seedNonce?: number;
}

export function ChatComposer({
  onSend,
  disabled,
  topSlot,
  seedDraft,
  seedNonce,
}: ChatComposerProps) {
  const { t } = useT();
  const [draft, setDraft] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Seed the composer from outside (replay card "重新推理").
  useEffect(() => {
    if (seedNonce && seedDraft) setDraft(seedDraft);
  }, [seedNonce, seedDraft]);

  const send = async () => {
    if (!draft.trim() || submitting || disabled) return;
    setSubmitting(true);
    const content = draft;
    let sentOk = false;
    try {
      await onSend(content);
      sentOk = true;
    } finally {
      setSubmitting(false);
      // Only clear the textarea on success so the user can retry
      // immediately if the AI call failed (rate limit etc.).
      if (sentOk) setDraft('');
    }
  };

  const blocked = submitting || disabled;

  return (
    <div className="border-t border-border bg-surface shrink-0">
      <div className="max-w-3xl mx-auto px-8 py-3 flex flex-col gap-2">
        {topSlot}
        <div className="flex gap-2 items-end">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                e.preventDefault();
                void send();
              }
            }}
            placeholder={
              disabled
                ? t('chat.aiThinking')
                : t('chat.placeholder')
            }
            disabled={blocked}
            rows={2}
            className="flex-1 resize-none px-3 py-2 text-sm border border-border rounded-md bg-canvas focus:outline-none focus:border-accent focus:bg-surface transition font-sans disabled:opacity-60"
          />
          <button
            type="button"
            onClick={() => void send()}
            disabled={blocked || !draft.trim()}
            className="px-4 py-2 text-sm font-medium rounded-md bg-accent text-white hover:opacity-90 disabled:opacity-40 transition shrink-0"
          >
            {submitting ? '…' : t('chat.send')}
          </button>
        </div>
      </div>
    </div>
  );
}
