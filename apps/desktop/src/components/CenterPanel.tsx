import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { SurveyFactor } from '@nodx/ai';
import type { Message, Topic, TopicDocument } from '@nodx/models';
import { askCoach } from '../ai/chat.js';
import {
  generateFocusedDocument,
  generateInitialDocument,
  stripHtml,
} from '../ai/document.js';
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
import { createTopic } from '../db/topics.js';
import { markdownToHtml } from '../lib/markdown.js';
import { ChatComposer, ChatThread } from './ChatThread.js';
import { DocumentView } from './DocumentView.js';
import { ExpertPanelView } from './panel/ExpertPanelView.js';
import { onTopicOpened, type RecapOutput } from '../ai/replay.js';
import { SpawnChildButton } from './SpawnChildButton.js';
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
  onSelectTopic,
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
      onSelectTopic={onSelectTopic}
    />
  );
}

function Conversation({
  topic,
  comments,
  onMutated,
  onSelectTopic,
}: {
  topic: Topic;
  comments: import('@nodx/models').Comment[];
  onMutated: () => void;
  onSelectTopic: (id: string) => void;
}) {
  // Center surface: the per-topic thinking document vs the expert-panel
  // debate. They coexist on the same topic; the user toggles between them.
  const [centerMode, setCenterMode] = useState<'doc' | 'panel'>('doc');
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

  // 思路复现 (PRD §3.11): hide the replay card once dismissed; guard so the
  // open-hook (close stale sessions + maybe make a replay card) fires once.
  const [replayDismissed, setReplayDismissed] = useState(false);
  const replayFiredFor = useRef<Set<string>>(new Set());

  // Bumping retryNonce re-runs the auto-fire effect from scratch, after
  // clearing the once-per-topic guard. Used by the "重试" button when
  // the auto Survey / focused-doc call fails (rate limit, network, etc.).
  const [retryNonce, setRetryNonce] = useState(0);

  // If the survey-pick stage (decompose + doc gen) fails, we stash what
  // would have been retried so the "重试" button can fire it again with
  // the same selection.
  const [retrySurveyPick, setRetrySurveyPick] = useState<{
    surveyMessage: Message;
    selectedFactors: SurveyFactor[];
  } | null>(null);

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

  // 思路复现 hook (PRD §3.11 / §8.8): on opening a topic, close idle sessions
  // (Haiku → recap + trace) and, if it was reopened after a >24h gap, generate
  // the "上次回顾" card. Best-effort + background; refresh to show the card.
  useEffect(() => {
    setReplayDismissed(false);
    if (replayFiredFor.current.has(topic.id)) return;
    replayFiredFor.current.add(topic.id);
    const t = topic;
    void onTopicOpened(t).then((recap) => {
      if (recap) void refreshAll();
    });
  }, [topic, refreshAll]);

  // On topic enter: load and, if the conversation is empty, auto-fire the
  // appropriate AI flow.
  //   - Top-level topic → Survey (5–7 factors → user picks → decompose → doc).
  //   - Child topic    → focused doc directly on the child's title, seeded
  //                       with the parent doc as context. No Survey.
  useEffect(() => {
    setAiError(null);
    setAiPhase('');
    // A retry click clears the once-per-topic guard so the effect can
    // re-fire the same flow from scratch.
    if (retryNonce > 0) {
      autoSurveyFiredFor.current.delete(topic.id);
    }
    void (async () => {
      const { msgs, doc } = await refreshAll();
      if (doc) return;
      if (msgs.length > 0) return;
      if (!isAiConfigured()) return;
      if (autoSurveyFiredFor.current.has(topic.id)) return;
      autoSurveyFiredFor.current.add(topic.id);

      if (topic.parentId) {
        // Child topic — focused doc, no Survey.
        setAiThinking(true);
        setAiPhase('围绕子话题生成思考文档…');
        try {
          const parentDoc = await getDocument(topic.parentId);
          const parentText = parentDoc ? stripHtml(parentDoc.content) : '';
          const result = await generateFocusedDocument(
            topic.title,
            parentText,
          );
          const html = markdownToHtml(result.markdown);
          await upsertDocument(topic.id, html);
          await refreshAll();
          onMutated();
        } catch (err) {
          autoSurveyFiredFor.current.delete(topic.id);
          setAiError(err instanceof Error ? err.message : String(err));
        } finally {
          setAiThinking(false);
          setAiPhase('');
        }
        return;
      }

      // Top-level topic — Survey flow.
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
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topic.id, retryNonce]);

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
    // Stash the context so the retry button can re-fire with the same
    // selection if anything below blows up (rate limit, model error).
    setRetrySurveyPick({ surveyMessage, selectedFactors });
    try {
      // Lock the survey card.
      const data = parseSurveyContent(surveyMessage.content);
      data.selectedIds = selectedFactors.map((f) => f.id);
      await updateMessageContent(surveyMessage.id, JSON.stringify(data));

      // Spawn a child topic per picked factor as an empty placeholder.
      // We DON'T pre-generate their docs here — that would stack N
      // additional Sonnet calls behind decompose+doc and instantly
      // blow Anthropic's rate limit. Each child's focused doc fires
      // lazily the first time the user enters that child topic.
      setAiPhase(`派生 ${selectedFactors.length} 个子话题…`);
      for (const factor of selectedFactors) {
        await createTopic({
          title: factor.title,
          parentId: topic.id,
        });
      }

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
      // Success — clear the retry context so the button disappears.
      setRetrySurveyPick(null);
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

  // DocumentView mutates messages (chat) and comments (note / explanation
  // / refine) — it needs both the local refresh (so chatMessages /
  // anchorableComments props re-flow) and the App-level refresh (so the
  // left-panel topic counters + right-panel anchor list stay in sync).
  const handleDocViewMutated = () => {
    void refreshAll();
    onMutated();
  };

  // The most recent "上次回顾" card (replay_card message), parsed for display.
  const replayCard = useMemo<RecapOutput | null>(() => {
    if (replayDismissed) return null;
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i]!.type === 'replay_card') {
        try {
          return JSON.parse(messages[i]!.content) as RecapOutput;
        } catch {
          return null;
        }
      }
    }
    return null;
  }, [messages, replayDismissed]);

  // Prefer doc view whenever a doc exists — and offer the expert-panel
  // surface alongside it via the mode toggle.
  if (document) {
    const chatMessages = messages.filter((m) => m.type === 'text');
    const anchorableComments = comments.filter(
      (c) => c.type === 'note' || c.type === 'explanation',
    );
    return (
      <div className="flex flex-col h-full overflow-hidden">
        <CenterModeTabs mode={centerMode} onChange={setCenterMode} />
        <div className="flex-1 min-h-0">
          {centerMode === 'panel' ? (
            <ExpertPanelView
              topic={topic}
              onMutated={handleDocViewMutated}
              onMergedToDoc={() => {
                setCenterMode('doc');
                void refreshAll();
                onMutated();
              }}
            />
          ) : (
            <DocumentView
              topic={topic}
              initialHtml={document.content}
              chatMessages={chatMessages}
              anchorableComments={anchorableComments}
              onMutated={handleDocViewMutated}
              onSelectTopic={onSelectTopic}
              replayCard={replayCard}
              onDismissReplay={() => setReplayDismissed(true)}
            />
          )}
        </div>
      </div>
    );
  }

  // Fallback: pre-doc state. Show Survey + status + any error.
  const surveyMsg = messages.find((m) => m.type === 'survey');
  return (
    <main className="flex flex-col bg-canvas min-h-0">
      <header className="border-b border-border px-8 py-4 bg-surface shrink-0">
        <div className="max-w-3xl mx-auto">
          <p className="text-[11px] uppercase tracking-wider text-ink-muted">
            {topic.parentId ? '子话题' : '起步'}
          </p>
          <h1 className="text-xl font-semibold leading-tight mt-0.5">
            {topic.title}
          </h1>
          <p className="text-xs text-ink-muted mt-2">
            {topic.parentId
              ? 'AI 正基于父话题上下文生成聚焦文档（不会再做 Survey）。'
              : '选完关注维度后，AI 会生成完整的思考文档替换这里。'}
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
              {topic.parentId
                ? '稍等，AI 正在围绕子话题写文档…'
                : '等待 AI 生成 Survey…（如果一直没出现，检查 worker 是否在跑）'}
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
            <div className="mt-3 bg-red-50 border border-red-200 rounded p-2 flex items-start gap-2">
              <pre className="flex-1 text-xs text-red-700 whitespace-pre-wrap break-all">
                AI 调用失败: {aiError}
              </pre>
              <button
                type="button"
                onClick={() => {
                  setAiError(null);
                  if (retrySurveyPick) {
                    const { surveyMessage, selectedFactors } = retrySurveyPick;
                    void handleSurveyPick(surveyMessage, selectedFactors);
                  } else {
                    setRetryNonce((n) => n + 1);
                  }
                }}
                disabled={aiThinking || decomposingFor !== null}
                className="shrink-0 px-2.5 py-1 text-xs font-medium rounded border border-red-300 text-red-700 hover:bg-red-100 disabled:opacity-50 transition"
              >
                重试
              </button>
            </div>
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
        topSlot={
          <SpawnChildButton
            parentTopicId={topic.id}
            disabled={
              chatThinking || aiThinking || decomposingFor !== null
            }
            onCreated={(childId) => {
              onMutated();
              onSelectTopic(childId);
            }}
          />
        }
      />
    </main>
  );
}

function CenterModeTabs({
  mode,
  onChange,
}: {
  mode: 'doc' | 'panel';
  onChange: (m: 'doc' | 'panel') => void;
}) {
  const tab = (key: 'doc' | 'panel', label: string) => (
    <button
      type="button"
      onClick={() => onChange(key)}
      className={
        'px-3 py-1 text-xs font-medium rounded-md transition ' +
        (mode === key
          ? 'bg-accent text-white'
          : 'text-ink-muted hover:text-ink')
      }
    >
      {label}
    </button>
  );
  return (
    <div className="shrink-0 border-b border-border bg-surface px-8 py-2">
      <div className="max-w-3xl mx-auto flex items-center gap-1">
        {tab('doc', '📄 文档')}
        {tab('panel', '🎙 专家组')}
      </div>
    </div>
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
