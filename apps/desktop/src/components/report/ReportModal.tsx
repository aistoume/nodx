import { useEffect, useState } from 'react';
import {
  generateDecisionReport,
  type DecisionReport,
} from '../../ai/report.js';

interface ReportModalProps {
  topicId: string;
  onClose: () => void;
}

/**
 * Decision-report overlay (PRD §3.10). Generates a report for the topic
 * subtree (slow Sonnet call) and shows 摘要 / 行动清单 / 未解问题, with a
 * "复制 Markdown" export (MVP).
 */
export function ReportModal({ topicId, onClose }: ReportModalProps) {
  const [report, setReport] = useState<DecisionReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    generateDecisionReport(topicId)
      .then((r) => {
        if (!cancelled) setReport(r);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      cancelled = true;
    };
  }, [topicId]);

  const copy = async () => {
    if (!report) return;
    try {
      await navigator.clipboard.writeText(report.markdown);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setError('复制失败，可手动选中下方 Markdown。');
    }
  };

  return (
    <div
      className="fixed inset-0 z-[100] bg-black/30 flex items-center justify-center p-8"
      onMouseDown={onClose}
    >
      <div
        onMouseDown={(e) => e.stopPropagation()}
        className="bg-surface rounded-lg shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col overflow-hidden"
      >
        <header className="px-6 py-3 border-b border-border flex items-center gap-2 shrink-0">
          <span className="text-sm font-semibold text-ink">📄 决策汇报</span>
          {report && (
            <span className="text-[11px] text-ink-muted truncate">
              {report.rootQuestion}
            </span>
          )}
          <div className="ml-auto flex items-center gap-2">
            {report && (
              <button
                type="button"
                onClick={copy}
                className="px-2.5 py-1 text-xs font-medium rounded border border-accent text-accent hover:bg-accent hover:text-white transition"
              >
                {copied ? '已复制 ✓' : '复制 Markdown'}
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="px-2.5 py-1 text-xs text-ink-muted hover:text-ink"
            >
              关闭
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          {error && (
            <div className="bg-red-50 border border-red-200 rounded p-2 mb-4">
              <pre className="text-xs text-red-700 whitespace-pre-wrap break-all">
                {error}
              </pre>
            </div>
          )}

          {!report && !error && (
            <div className="flex items-center gap-2 text-sm text-ink-muted">
              <span className="flex gap-1">
                {[0, 0.15, 0.3].map((d) => (
                  <span
                    key={d}
                    className="inline-block w-1.5 h-1.5 rounded-full bg-ink-muted/60 animate-bounce"
                    style={{ animationDelay: `${d}s` }}
                  />
                ))}
              </span>
              <span className="text-xs">
                扫描子树 + 生成汇报中（Sonnet，约 1 分钟）…
              </span>
            </div>
          )}

          {report && (
            <div className="flex flex-col gap-5">
              <Section title="决策摘要">
                <p className="text-sm text-ink leading-relaxed whitespace-pre-wrap">
                  {report.report.summary}
                </p>
              </Section>

              <Section title="行动清单">
                {report.report.actionItems.length === 0 ? (
                  <p className="text-xs text-ink-muted">（暂无）</p>
                ) : (
                  <table className="w-full text-xs border-collapse">
                    <thead>
                      <tr className="text-ink-muted">
                        <Th>谁</Th>
                        <Th>做什么</Th>
                        <Th>何时</Th>
                        <Th>产出</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.report.actionItems.map((a, i) => (
                        <tr key={i} className="border-t border-border align-top">
                          <Td>{a.who ?? '—'}</Td>
                          <Td>{a.what}</Td>
                          <Td>{a.when ?? '—'}</Td>
                          <Td>{a.deliverable ?? '—'}</Td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </Section>

              <Section title="未解问题">
                {report.report.openQuestions.length === 0 ? (
                  <p className="text-xs text-ink-muted">（暂无）</p>
                ) : (
                  <ul className="list-disc pl-5 flex flex-col gap-0.5">
                    {report.report.openQuestions.map((q, i) => (
                      <li key={i} className="text-xs text-ink leading-relaxed">
                        {q}
                      </li>
                    ))}
                  </ul>
                )}
              </Section>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h3 className="text-xs font-semibold uppercase tracking-wider text-accent mb-2">
        {title}
      </h3>
      {children}
    </section>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="text-left font-medium px-2 py-1 border-b border-border">
      {children}
    </th>
  );
}

function Td({ children }: { children: React.ReactNode }) {
  return <td className="px-2 py-1.5 text-ink">{children}</td>;
}
