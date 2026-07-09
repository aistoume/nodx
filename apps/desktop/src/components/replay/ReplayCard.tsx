import type { RecapOutput } from '../../ai/replay.js';
import { useT } from '../../i18n/index.js';

interface ReplayCardProps {
  recap: RecapOutput;
  /** "重新推理" — pre-fills the composer with the 卡点 to pick the thread back up. */
  onReplay: () => void;
  /** Hide the card for this view. */
  onDismiss?: () => void;
}

/**
 * "上次回顾" card (PRD §3.11) — a banner at the top of the conversation when a
 * Topic is reopened after a gap. Four fixed sections (§8.8): 起点 / 路径 / 卡点 /
 * 新进展. Uses the .prose-doc / panel-card visual language.
 */
export function ReplayCard({ recap, onReplay, onDismiss }: ReplayCardProps) {
  const { t } = useT();
  return (
    <div className="rounded-lg border border-accent/30 bg-accent-soft p-4 flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <span className="text-[10px] uppercase tracking-wider text-accent font-semibold">
          {t('replay.title')}
        </span>
        {onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            className="ml-auto text-[11px] text-ink-muted hover:text-ink transition"
          >
            {t('common.collapse')}
          </button>
        )}
      </div>

      <Section title={t('replay.section.start')}>
        <p className="text-sm text-ink leading-relaxed">{recap.startingPoint}</p>
      </Section>

      {recap.path.length > 0 && (
        <Section title={t('replay.section.path')}>
          <ol className="list-decimal pl-5 flex flex-col gap-0.5">
            {recap.path.map((s, i) => (
              <li key={i} className="text-xs text-ink leading-relaxed">
                {s}
              </li>
            ))}
          </ol>
        </Section>
      )}

      {recap.stuckPoints.length > 0 && (
        <Section title={t('replay.section.stuck')}>
          <ul className="flex flex-col gap-0.5">
            {recap.stuckPoints.map((s, i) => (
              <li
                key={i}
                className="text-xs text-red-700 leading-relaxed flex gap-1.5"
              >
                <span className="shrink-0">📍</span>
                <span>{s}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {recap.newProgress.length > 0 && (
        <Section title={t('replay.section.progress')}>
          <ul className="list-disc pl-5 flex flex-col gap-0.5">
            {recap.newProgress.map((s, i) => (
              <li key={i} className="text-xs text-ink leading-relaxed">
                {s}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {recap.stuckPoints.length > 0 && (
        <button
          type="button"
          onClick={onReplay}
          className="self-start px-3 py-1.5 text-xs font-medium rounded-md bg-accent text-white hover:opacity-90 transition"
        >
          {t('replay.replayBtn')}
        </button>
      )}
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
    <div>
      <p className="text-[11px] font-semibold text-ink-muted mb-1">{title}</p>
      {children}
    </div>
  );
}
