import { useCallback, useEffect, useRef, useState } from 'react';
import type { SurveyFactor } from '@nodx/ai';
import type { Message, Topic, TopicDocument } from '@nodx/models';
import { askCoach } from '../ai/chat.js';
import { generateInitialDocument } from '../ai/document.js';
import { isAiConfigured } from '../ai/gateway.js';
import { decomposeSelected, generateSurvey } from '../ai/survey.js';
import {
  createAiMessage,
  createSurveyMessage,
  createUserMessage,
  listMessages,
  parseSurveyContent,
  updateMessageContent,
} from '../db/messages.js';
import { getDocument, upsertDocument } from '../db/documents.js';
import { markdownToHtml } from '../lib/markdown.js';
import { ChatComposer, ChatThread } from './ChatThread.js';
import { DocumentView } from './DocumentView.js';
import { SurveyCard } from './SurveyCard.js';

interface CenterPanelProps {
  topic: Topic | null;
  comments: import('@nodx/models').Comment[];
  onMutated: () => void;
  onSelectTopic: (id: string) => void;
}

export function CenterPanel({
  topic,
  comments,
  onMutated,
  onSelectTopic: _onSelectTopic,
}: CenterPanelProps) {
  if (!topic) {
    return (
      <main className="flex items-center justify-center text-ink-muted">
        <div className="text-center max-w-sm">
          <p className="text-sm">从左栏选择一个对话开始</p>
          <p className="text-xs mt-2 opacity-70">
            或新建一个：输入模糊问题，AI 会先弹 Survey 拆维度，然后生成思考文档
          </p>
        </div>
      </main>
    );
  }

  return (
    <Conversation
      topic={topic}
      comments={comments}
      onMutated={onMutated}
    />
  );
}

function Conversation({
  topic,
  comments,
  onMutated,
}: {
  topic: Topic;
  comments: import('@nodx/models').Comment[];
  onMutated: () => void;
}) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [document, setDocument] = useState<TopicDocument | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [aiThinking, setAiThinking] = useState(false);
  const [aiPhase, setAiPhase] = useState<string>(''); // human-readable status
  const [aiError, setAiError] = useState<string | null>(null);
  const [decomposingFor, setDecomposingFor] = useState<string | null>(null);

  // Per-session guard so we don't double-fire auto-survey across rerenders.
  const autoSurveyFiredFor = useRef<Set<string>>(new Set());

  // Chat state for pre-doc free-form conversation.
  const [chatThinking, setChatThinking] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);

  const refreshAll = useCallback(async () => {
    setLoading(true);
    try {
      const [msgs, doc] = await Promise.all([
        listMessages(topic.id),
        getDocument(topic.id),
      ]);
      setMessages(msgs);
      setDocument(doc);
      setLoadError(null);
      return { msgs, doc };
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : String(err));
      return { msgs: [] as Message[], doc: null };
    } finally {
      setLoading(false);
    }
  }, [topic.id]);

  // On topic enter: load + auto-fire Survey if conversation is empty.
  useEffect(() => {
    setAiError(null);
    setAiPhase('');
    void (async () => {
      const { msgs, doc } = await refreshAll();
      // If a doc already exists, the user already passed the Survey stage
      // — nothing more to do.
      if (doc) return;
      if (
        msgs.length === 0 &&
        isAiConfigured() &&
        !autoSurveyFiredFor.current.has(topic.id)
      ) {
        autoSurveyFiredFor.current.add(topic.id);
        setAiThinking(true);
        setAiPhase('生成 Survey…');
        try {
          const survey = await generateSurvey(topic.title);
          await createSurveyMessage(topic.id, survey.factors);
          await refreshAll();
          onMutated();
        } catch (err) {
          autoSurveyFiredFor.current.delete(topic.id);
          setAiError(err instanceof Error ? err.message : String(err));
        } finally {
          setAiThinking(false);
          setAiPhase('');
        }
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topic.id]);

  /**
   * User typed a custom factor on the Survey card. Append to the message
   * payload and return its id so the card can auto-check it.
   */
  const handleAddCustomFactor = async (
    surveyMessage: Message,
    title: string,
  ): Promise<string> => {
    const data = parseSurveyContent(surveyMessage.content);
    const newId = `custom_${Date.now().toString(36)}_${Math.random()
      .toString(36)
      .slice(2, 8)}`;
    data.factors = [
      ...data.factors,
      { id: newId, title, hint: '用户自定义' },
    ];
    await updateMessageContent(surveyMessage.id, JSON.stringify(data));
    await refreshAll();
    onMutated();
    return newId;
  };

  /** Survey → decompose → generate doc. Replaces old factor_list flow. */
  const handleSurveyPick = async (
    surveyMessage: Message,
    selectedFactors: SurveyFactor[],
  ) => {
    setDecomposingFor(surveyMessage.id);
    setAiError(null);
    try {
      // Lock the survey card.
      const data = parseSurveyContent(surveyMessage.content);
      data.selectedIds = selectedFactors.map((f) => f.id);
      await updateMessageContent(surveyMessage.id, JSON.stringify(data));

      setAiPhase('第一性原理拆解…');
      const decomposed = await decomposeSelected(
        topic.title,
        selectedFactors.map((f) => f.title),
      );

      setAiPhase('生成思考文档…');
      const doc = await generateInitialDocument({
        question: topic.title,
        selectedFactors: selectedFactors.map((f) => f.title),
        decomposed: decomposed.factors,
      });
      const html = markdownToHtml(doc.markdown);
      await upsertDocument(topic.id, html);

      await refreshAll();
      onMutated();
    } catch (err) {
      setAiError(err instanceof Error ? err.message : String(err));
    } finally {
      setDecomposingFor(null);
      setAiPhase('');
    }
  };

  /** Free-form chat in pre-doc state — same shape as DocumentView's. */
  const handlePreDocChatSend = async (content: string) => {
    setChatError(null);
    try {
      await createUserMessage(topic.id, content);
      const fresh = await listMessages(topic.id);
      setMessages(fresh);
      onMutated();
      if (!isAiConfigured()) {
        setChatError('AI 网关未配置，跳过 AI 回复。');
        return;
      }
      setChatThinking(true);
      const reply = await askCoach(fresh);
      await createAiMessage(topic.id, reply.text);
      const after = await listMessages(topic.id);
      setMessages(after);
      onMutated();
    } catch (err) {
      setChatError(err instanceof Error ? err.message : String(err));
    } finally {
      setChatThinking(false);
    }
  };

  // Prefer doc view whenever a doc exists.
  if (document) {
    const chatMessages = messages.filter((m) => m.type === 'text');
    const anchorableComments = comments.filter(
      (c) => c.type === 'note' || c.type === 'explanation',
    );
    return (
      <DocumentView
        topic={topic}
        initialHtml={document.content}
        chatMessages={chatMessages}
        anchorableComments={anchorableComments}
        onMutated={onMutated}
      />
    );
  }

  // Fallback: pre-doc state. Show Survey + status + any error.
  const surveyMsg = messages.find((m) => m.type === 'survey');
  return (
    <main className="flex flex-col bg-canvas min-h-0">
      <header className="border-b border-border px-8 py-4 bg-surface shrink-0">
        <div className="max-w-3xl mx-auto">
          <p className="text-[11px] uppercase tracking-wider text-ink-muted">
            起步{topic.parentId ? ' · 子' : ''}
          </p>
          <h1 className="text-xl font-semibold leading-tight mt-0.5">
            {topic.title}
          </h1>
          <p className="text-xs text-ink-muted mt-2">
            选完关注维度后，AI 会生成完整的思考文档替换这里。
          </p>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-8 py-6">
          {loadError && (
            <pre className="text-xs text-red-600 bg-red-50 p-2 rounded whitespace-pre-wrap mb-4">
              {loadError}
            </pre>
          )}

          {loading && !aiThinking && (
            <p className="text-sm text-ink-muted italic">加载中…</p>
          )}

          {!loading && !surveyMsg && !aiThinking && !aiError && (
            <p className="text-sm text-ink-muted italic">
              等待 AI 生成 Survey…（如果一直没出现，检查 worker 是否在跑）
            </p>
          )}

          {aiThinking && (
            <PendingBubble label={aiPhase || 'AI 思考中…'} />
          )}

          {surveyMsg && (
            <ul className="flex flex-col gap-3">
              <SurveyCard
                message={surveyMsg}
                decomposing={decomposingFor === surveyMsg.id}
                onPick={(picked) => handleSurveyPick(surveyMsg, picked)}
                onAddCustom={(title) =>
                  handleAddCustomFactor(surveyMsg, title)
                }
              />
              {decomposingFor === surveyMsg.id && (
                <PendingBubble label={aiPhase || 'AI 生成中…'} />
              )}
            </ul>
          )}

          {aiError && (
            <pre className="mt-3 text-xs text-red-600 bg-red-50 p-2 rounded whitespace-pre-wrap">
              AI 调用失败: {aiError}
            </pre>
          )}

          <ChatThread
            messages={messages.filter((m) => m.type === 'text')}
            thinking={chatThinking}
            error={chatError}
          />
        </div>
      </div>

      <ChatComposer
        onSend={handlePreDocChatSend}
        disabled={chatThinking || aiThinking || decomposingFor !== null}
      />
    </main>
  );
}

function PendingBubble({ label }: { label: string }) {
  return (
    <li className="flex justify-start">
      <div className="rounded-lg px-4 py-3 bg-surface border border-border text-ink-muted text-sm flex items-center gap-2">
        <span className="flex gap-1">
          <Dot delay="0s" />
          <Dot delay="0.15s" />
          <Dot delay="0.3s" />
        </span>
        <span className="text-xs">{label}</span>
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
