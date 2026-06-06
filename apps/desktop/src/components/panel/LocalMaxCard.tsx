import type { LocalMaximumResult } from '@nodx/models';
import { markdownToHtml, markdownToInlineHtml } from '../../lib/markdown.js';

interface LocalMaxCardProps {
  result: LocalMaximumResult;
  /** True while an accept/reject mutation is in flight (disables buttons). */
  busy?: boolean;
  onAccept: () => void;
  onReject: () => void;
}

/**
 * The synthesis payload (PRD §3.14 Round 4). `bestAnswer` is the headline;
 * consensus / divergence / openQuestions give the user the reasoning behind
 * it. Accepting promotes `bestAnswer` into the Topic's summary.
 *
 * NOTE: openQuestions should also seed `Comment.type='open_question'` 卡点
 * (PRD §3.12 wiring) — deferred until the comment-type migration lands;
 * for now they're display-only here.
 */
export function LocalMaxCard({
  result,
  busy,
  onAccept,
  onReject,
}: LocalMaxCardProps) {
  const accepted = result.acceptedByUser;
  const confidencePct = Math.round(result.confidence * 100);
  return (
    <div className="rounded-lg border border-accent/30 bg-accent-soft p-4 flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <span className="text-[10px] uppercase tracking-wider text-accent font-semibold">
          Local Maximum
        </span>
        <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-surface border border-accent/30 text-accent">
          把握 {confidencePct}%
        </span>
        {accepted && (
          <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-note-green border border-note-green-edge/40 text-green-800">
            已采纳
          </span>
        )}
      </div>

      <div
        className="prose-doc text-sm text-ink font-medium"
        dangerouslySetInnerHTML={{ __html: markdownToHtml(result.bestAnswer) }}
      />

      {result.consensus.length > 0 && (
        <Section title="共识">
          <ul className="list-disc pl-5 flex flex-col gap-0.5">
            {result.consensus.map((c, i) => (
              <li key={i} className="text-xs text-ink leading-relaxed">
                <Inline text={c} />
              </li>
            ))}
          </ul>
        </Section>
      )}

      {result.divergence.length > 0 && (
        <Section title="仍存分歧">
          <ul className="flex flex-col gap-1.5">
            {result.divergence.map((d, i) => (
              <li key={i} className="text-xs leading-relaxed">
                <span className="text-ink font-medium">
                  <Inline text={d.point} />
                </span>
                <span className="text-ink-muted">
                  {' — '}
                  <Inline text={d.conditions} />
                </span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {result.openQuestions.length > 0 && (
        <Section title="开放问题（卡点）">
          <ul className="list-disc pl-5 flex flex-col gap-0.5">
            {result.openQuestions.map((q, i) => (
              <li key={i} className="text-xs text-ink leading-relaxed">
                <Inline text={q} />
              </li>
            ))}
          </ul>
        </Section>
      )}

      {!accepted && (
        <div className="flex items-center gap-2 pt-1">
          <button
            type="button"
            onClick={onAccept}
            disabled={busy}
            className="px-3 py-1.5 text-xs font-medium rounded-md bg-accent text-white hover:opacity-90 disabled:opacity-40 transition"
          >
            采纳为方向结论
          </button>
          <button
            type="button"
            onClick={onReject}
            disabled={busy}
            className="px-2.5 py-1 text-xs font-medium rounded border border-border text-ink-muted hover:text-ink hover:border-ink-muted disabled:opacity-40 transition"
          >
            拒绝
          </button>
        </div>
      )}
    </div>
  );
}

/** Render a short string with inline markdown (bold / code), no block wrap. */
function Inline({ text }: { text: string }) {
  return (
    <span
      dangerouslySetInnerHTML={{ __html: markdownToInlineHtml(text) }}
    />
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
    <div>
      <p className="text-[11px] font-semibold text-ink-muted mb-1">{title}</p>
      {children}
    </div>
  );
}
