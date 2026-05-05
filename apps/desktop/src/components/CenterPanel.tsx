import { useEffect, useRef, useState } from 'react';
import type { Message, Topic } from '@nodx/models';
import { createUserMessage, listMessages } from '../db/messages.js';

interface CenterPanelProps {
  topic: Topic | null;
  onMutated: () => void;
}

export function CenterPanel({ topic, onMutated }: CenterPanelProps) {
  if (!topic) {
    return (
      <main className="flex items-center justify-center text-ink-muted">
        <div className="text-center max-w-sm">
          <p className="text-sm">从左栏选择一个对话开始</p>
          <p className="text-xs mt-2 opacity-70">
            或新建一个：输入模糊问题，AI 会引导你拆解
          </p>
        </div>
      </main>
    );
  }

  return <Conversation topic={topic} onMutated={onMutated} />;
}

function Conversation({
  topic,
  onMutated,
}: {
  topic: Topic;
  onMutated: () => void;
}) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const refresh = async () => {
    try {
      setMessages(await listMessages(topic.id));
      setLoadError(null);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : String(err));
    }
  };

  useEffect(() => {
    void refresh();
    // refresh when switching to a different topic
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topic.id]);

  useEffect(() => {
    // scroll to bottom on new messages
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  return (
    <main className="flex flex-col bg-canvas min-h-0">
      <ConversationHeader topic={topic} />

      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-8 py-6">
          {loadError && (
            <pre className="text-xs text-red-600 bg-red-50 p-2 rounded whitespace-pre-wrap mb-4">
              {loadError}
            </pre>
          )}
          {messages.length === 0 && !loadError && (
            <p className="text-sm text-ink-muted italic">
              还没有消息。Survey 卡片 / 第一性原理拆解会在后续接入；
              先用下方输入框记录你的初步思路。
            </p>
          )}
          <ul className="flex flex-col gap-3">
            {messages.map((m) => (
              <MessageBubble key={m.id} message={m} />
            ))}
          </ul>
        </div>
      </div>

      <Composer
        topicId={topic.id}
        onSent={async () => {
          await refresh();
          onMutated();
        }}
      />
    </main>
  );
}

function ConversationHeader({ topic }: { topic: Topic }) {
  return (
    <header className="border-b border-border px-8 py-4 bg-surface shrink-0">
      <div className="max-w-3xl mx-auto">
        <p className="text-[11px] uppercase tracking-wider text-ink-muted">
          对话
        </p>
        <h1 className="text-xl font-semibold leading-tight mt-0.5">
          {topic.title}
        </h1>
        <div className="mt-2 flex items-center gap-3 text-xs text-ink-muted">
          <span>status: {topic.status}</span>
          <span>·</span>
          <span>{topic.meta.messageCount} 条消息</span>
          <span>·</span>
          <span>
            {topic.meta.childCount > 0
              ? `${topic.meta.childCount} 个子对话`
              : '无子对话'}
          </span>
        </div>
      </div>
    </header>
  );
}

function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === 'user';
  return (
    <li
      className={
        'flex ' + (isUser ? 'justify-end' : 'justify-start')
      }
    >
      <div
        className={
          'max-w-[80%] rounded-lg px-4 py-2.5 text-sm whitespace-pre-wrap break-words ' +
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

function Composer({
  topicId,
  onSent,
}: {
  topicId: string;
  onSent: () => void | Promise<void>;
}) {
  const [draft, setDraft] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const send = async () => {
    if (!draft.trim() || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await createUserMessage(topicId, draft);
      setDraft('');
      await onSent();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      void send();
    }
  };

  return (
    <div className="border-t border-border bg-surface shrink-0">
      <div className="max-w-3xl mx-auto px-8 py-3">
        {error && <p className="text-xs text-red-600 mb-2">{error}</p>}
        <div className="flex gap-2 items-end">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="输入消息…  Cmd/Ctrl + Enter 发送"
            disabled={submitting}
            rows={3}
            className="flex-1 resize-none px-3 py-2 text-sm border border-border rounded-md bg-canvas focus:outline-none focus:border-accent focus:bg-surface transition font-sans"
          />
          <button
            type="button"
            onClick={() => void send()}
            disabled={submitting || !draft.trim()}
            className="px-4 py-2 text-sm font-medium rounded-md bg-accent text-white hover:opacity-90 disabled:opacity-40 transition shrink-0"
          >
            {submitting ? '…' : '发送'}
          </button>
        </div>
      </div>
    </div>
  );
}
