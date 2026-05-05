import { useEffect, useRef, useState } from 'react';
import type { Message, Topic } from '@nodx/models';
import { askCoach } from '../ai/chat.js';
import { isAiConfigured } from '../ai/gateway.js';
import {
  createAiMessage,
  createUserMessage,
  listMessages,
} from '../db/messages.js';

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
  const [aiThinking, setAiThinking] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const refresh = async (): Promise<Message[]> => {
    try {
      const list = await listMessages(topic.id);
      setMessages(list);
      setLoadError(null);
      return list;
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : String(err));
      return [];
    }
  };

  useEffect(() => {
    setAiError(null);
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topic.id]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length, aiThinking]);

  const handleSent = async (history: Message[]) => {
    onMutated();
    if (!isAiConfigured()) {
      setAiError(
        'AI 网关未配置，跳过 AI 回复。复制 apps/desktop/.env.example → .env.local 并填入 token，然后重启 desktop。',
      );
      return;
    }
    setAiError(null);
    setAiThinking(true);
    try {
      const reply = await askCoach(history);
      await createAiMessage(topic.id, reply.text);
      await refresh();
      onMutated();
    } catch (err) {
      setAiError(err instanceof Error ? err.message : String(err));
    } finally {
      setAiThinking(false);
    }
  };

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
              还没有消息。在下方输入你的问题或想法，AI 会以思考陪练的身份回应。
            </p>
          )}
          <ul className="flex flex-col gap-3">
            {messages.map((m) => (
              <MessageBubble key={m.id} message={m} />
            ))}
            {aiThinking && <ThinkingBubble />}
          </ul>
          {aiError && (
            <pre className="mt-3 text-xs text-red-600 bg-red-50 p-2 rounded whitespace-pre-wrap">
              AI 调用失败: {aiError}
            </pre>
          )}
        </div>
      </div>

      <Composer
        topicId={topic.id}
        disabled={aiThinking}
        onSent={async () => {
          const history = await refresh();
          await handleSent(history);
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
    <li className={'flex ' + (isUser ? 'justify-end' : 'justify-start')}>
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

function ThinkingBubble() {
  return (
    <li className="flex justify-start">
      <div className="rounded-lg px-4 py-3 bg-surface border border-border text-ink-muted text-sm flex items-center gap-2">
        <span className="flex gap-1">
          <Dot delay="0s" />
          <Dot delay="0.15s" />
          <Dot delay="0.3s" />
        </span>
        <span className="text-xs">AI 思考中…</span>
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

function Composer({
  topicId,
  disabled,
  onSent,
}: {
  topicId: string;
  disabled: boolean;
  onSent: () => void | Promise<void>;
}) {
  const [draft, setDraft] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const send = async () => {
    if (!draft.trim() || submitting || disabled) return;
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

  const blocked = submitting || disabled;

  return (
    <div className="border-t border-border bg-surface shrink-0">
      <div className="max-w-3xl mx-auto px-8 py-3">
        {error && <p className="text-xs text-red-600 mb-2">{error}</p>}
        <div className="flex gap-2 items-end">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              disabled
                ? 'AI 回复中…'
                : '输入消息…  Cmd/Ctrl + Enter 发送'
            }
            disabled={blocked}
            rows={3}
            className="flex-1 resize-none px-3 py-2 text-sm border border-border rounded-md bg-canvas focus:outline-none focus:border-accent focus:bg-surface transition font-sans disabled:opacity-60"
          />
          <button
            type="button"
            onClick={() => void send()}
            disabled={blocked || !draft.trim()}
            className="px-4 py-2 text-sm font-medium rounded-md bg-accent text-white hover:opacity-90 disabled:opacity-40 transition shrink-0"
          >
            {submitting ? '…' : '发送'}
          </button>
        </div>
      </div>
    </div>
  );
}
