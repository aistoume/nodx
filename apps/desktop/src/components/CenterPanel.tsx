import { useCallback, useEffect, useRef, useState } from 'react';
import type { SurveyFactor } from '@nodx/ai';
import type { Message, Topic } from '@nodx/models';
import { askCoach } from '../ai/chat.js';
import { isAiConfigured } from '../ai/gateway.js';
import { decomposeSelected, generateSurvey } from '../ai/survey.js';
import {
  createAiMessage,
  createFactorListMessage,
  createSurveyMessage,
  createUserMessage,
  listMessages,
  parseSurveyContent,
  parseFactorListContent,
  updateMessageContent,
} from '../db/messages.js';
import { createTopic } from '../db/topics.js';
import { FactorListCard } from './FactorListCard.js';
import { SurveyCard } from './SurveyCard.js';

interface CenterPanelProps {
  topic: Topic | null;
  onMutated: () => void;
  onSelectTopic: (id: string) => void;
}

export function CenterPanel({
  topic,
  onMutated,
  onSelectTopic,
}: CenterPanelProps) {
  if (!topic) {
    return (
      <main className="flex items-center justify-center text-ink-muted">
        <div className="text-center max-w-sm">
          <p className="text-sm">从左栏选择一个对话开始</p>
          <p className="text-xs mt-2 opacity-70">
            或新建一个：输入模糊问题，AI 会先弹 Survey 拆维度
          </p>
        </div>
      </main>
    );
  }

  return (
    <Conversation
      topic={topic}
      onMutated={onMutated}
      onSelectTopic={onSelectTopic}
    />
  );
}

function Conversation({
  topic,
  onMutated,
  onSelectTopic,
}: {
  topic: Topic;
  onMutated: () => void;
  onSelectTopic: (id: string) => void;
}) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [aiThinking, setAiThinking] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [decomposingFor, setDecomposingFor] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  // Per-session guard so we don't double-fire auto-survey across rerenders.
  // Cleared on error so the user gets a retry by leaving and re-entering.
  const autoSurveyFiredFor = useRef<Set<string>>(new Set());

  const refresh = useCallback(async (): Promise<Message[]> => {
    try {
      const list = await listMessages(topic.id);
      setMessages(list);
      setLoadError(null);
      return list;
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : String(err));
      return [];
    }
  }, [topic.id]);

  // On topic enter: load messages, and if the conversation is empty
  // auto-fire Survey based on the topic's title (PRD §2.1 — the question
  // *is* the topic title). Skipped if AI isn't configured; caller can also
  // retrigger by sending a first message (handleSent has the same check).
  useEffect(() => {
    setAiError(null);
    void (async () => {
      const list = await refresh();
      if (
        list.length === 0 &&
        isAiConfigured() &&
        !autoSurveyFiredFor.current.has(topic.id)
      ) {
        autoSurveyFiredFor.current.add(topic.id);
        setAiThinking(true);
        try {
          const survey = await generateSurvey(topic.title);
          await createSurveyMessage(topic.id, survey.factors);
          await refresh();
          onMutated();
        } catch (err) {
          autoSurveyFiredFor.current.delete(topic.id);
          setAiError(err instanceof Error ? err.message : String(err));
        } finally {
          setAiThinking(false);
        }
      }
    })();
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
      const isFirstUserMessage =
        history.length === 1 && history[0]?.role === 'user';
      if (isFirstUserMessage) {
        // First message — Survey instead of plain coaching reply (PRD §2.1).
        const survey = await generateSurvey(topic.title);
        await createSurveyMessage(topic.id, survey.factors);
      } else {
        const reply = await askCoach(history);
        await createAiMessage(topic.id, reply.text);
      }
      await refresh();
      onMutated();
    } catch (err) {
      setAiError(err instanceof Error ? err.message : String(err));
    } finally {
      setAiThinking(false);
    }
  };

  const handleSurveyPick = async (
    surveyMessage: Message,
    selectedFactors: SurveyFactor[],
  ) => {
    setDecomposingFor(surveyMessage.id);
    setAiError(null);
    try {
      // Mark the survey card as completed.
      const data = parseSurveyContent(surveyMessage.content);
      data.selectedIds = selectedFactors.map((f) => f.id);
      await updateMessageContent(
        surveyMessage.id,
        JSON.stringify(data),
      );

      // Fire decompose for the picked factors.
      const decomposed = await decomposeSelected(
        topic.title,
        selectedFactors.map((f) => f.title),
      );
      await createFactorListMessage(
        topic.id,
        selectedFactors.map((f) => f.title),
        decomposed.factors,
      );
      await refresh();
      onMutated();
    } catch (err) {
      setAiError(err instanceof Error ? err.message : String(err));
    } finally {
      setDecomposingFor(null);
    }
  };

  const handleDeepDive = async (
    factorListMessage: Message,
    factorIdx: number,
    questionIdx: number,
    subQuestion: string,
  ) => {
    const child = await createTopic({
      title: subQuestion,
      parentId: topic.id,
    });
    // Persist mapping so the parent factor_list shows "已深入 ✓" next time.
    const data = parseFactorListContent(factorListMessage.content);
    data.spawned[`${factorIdx}_${questionIdx}`] = child.id;
    await updateMessageContent(
      factorListMessage.id,
      JSON.stringify(data),
    );
    await refresh();
    onMutated();
    onSelectTopic(child.id);
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
              还没有消息。在下方输入第一条信息，AI 会先弹 Survey 帮你拆出关注维度。
            </p>
          )}
          <ul className="flex flex-col gap-3">
            {messages.map((m) => (
              <MessageRow
                key={m.id}
                message={m}
                decomposing={decomposingFor === m.id}
                onSurveyPick={(picked) => handleSurveyPick(m, picked)}
                onDeepDive={(fIdx, qIdx, sub) =>
                  handleDeepDive(m, fIdx, qIdx, sub)
                }
              />
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
        disabled={aiThinking || decomposingFor !== null}
        onSent={async () => {
          const history = await refresh();
          await handleSent(history);
        }}
      />
    </main>
  );
}

function MessageRow({
  message,
  decomposing,
  onSurveyPick,
  onDeepDive,
}: {
  message: Message;
  decomposing: boolean;
  onSurveyPick: (picked: SurveyFactor[]) => Promise<void> | void;
  onDeepDive: (
    factorIdx: number,
    questionIdx: number,
    subQuestion: string,
  ) => Promise<void>;
}) {
  if (message.type === 'survey') {
    return (
      <SurveyCard
        message={message}
        decomposing={decomposing}
        onPick={onSurveyPick}
      />
    );
  }
  if (message.type === 'factor_list') {
    return <FactorListCard message={message} onDeepDive={onDeepDive} />;
  }
  // type='text' (and 'explanation' if it ever lands as a message)
  return <TextBubble message={message} />;
}

function TextBubble({ message }: { message: Message }) {
  const isUser = message.role === 'user';
  return (
    <li className={'flex ' + (isUser ? 'justify-end' : 'justify-start')}>
      <div
        data-message-id={message.id}
        className={
          'max-w-[80%] rounded-lg px-4 py-2.5 text-sm whitespace-pre-wrap break-words selection:bg-yellow-200 selection:text-ink ' +
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

function ConversationHeader({ topic }: { topic: Topic }) {
  return (
    <header className="border-b border-border px-8 py-4 bg-surface shrink-0">
      <div className="max-w-3xl mx-auto">
        <p className="text-[11px] uppercase tracking-wider text-ink-muted">
          对话{topic.parentId ? ' · 子' : ''}
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
                ? 'AI 处理中…'
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
