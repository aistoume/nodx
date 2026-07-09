import type {
  ExpertAgent,
  PanelRound,
  PanelStopSignal,
} from '@nodx/models';
import { markdownToHtml } from '../../lib/markdown.js';
import { roleStyle } from './roles.js';
import { useT } from '../../i18n/index.js';
import type { StringKey } from '../../i18n/index.js';

interface PanelTranscriptProps {
  rounds: PanelRound[];
  members: ExpertAgent[];
  /** A round currently streaming in (no exchanges yet) shows a pending hint. */
  activeRoundId?: string | null;
}

const ROUND_LABEL_KEY: Record<PanelRound['type'], StringKey> = {
  initial: 'transcript.round.initial',
  critique: 'transcript.round.critique',
  refined: 'transcript.round.refined',
  synthesis: 'transcript.round.synthesis',
};

const STOP_SIGNAL_KEY: Record<PanelStopSignal, StringKey> = {
  semantic_convergence: 'transcript.stop.semantic',
  marginal_decay: 'transcript.stop.decay',
  max_rounds: 'transcript.stop.maxRounds',
};

/**
 * The debate transcript: rounds top-to-bottom, each exchange tagged with its
 * speaker's role colour. The synthesis round carries no member utterances
 * (the moderator's output is the Local Max, shown separately), so it renders
 * as a slim marker pointing downstream.
 */
export function PanelTranscript({
  rounds,
  members,
  activeRoundId,
}: PanelTranscriptProps) {
  const { t } = useT();
  const byId = new Map(members.map((m) => [m.id, m]));
  return (
    <ol className="flex flex-col gap-5">
      {rounds.map((round) => (
        <li key={round.id}>
          <div className="flex items-center gap-2 mb-2">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-accent">
              {t(ROUND_LABEL_KEY[round.type])}
            </h3>
            {round.stopSignalsHit?.map((sig) => (
              <span
                key={sig}
                className="text-[10px] px-1.5 py-0.5 rounded-full bg-accent-soft border border-accent/30 text-accent"
                title={t('transcript.stop.tip')}
              >
                {t(STOP_SIGNAL_KEY[sig])}
              </span>
            ))}
          </div>

          {round.type === 'synthesis' ? (
            <p className="text-xs text-ink-muted italic pl-3">
              {t('transcript.synthDone')}
            </p>
          ) : round.exchanges.length === 0 ? (
            <p className="text-xs text-ink-muted italic pl-3">
              {activeRoundId === round.id ? t('transcript.streaming') : t('transcript.empty')}
            </p>
          ) : (
            <ul className="flex flex-col gap-3">
              {round.exchanges.map((ex) => {
                const member = byId.get(ex.agentId);
                const style = member ? roleStyle(member.role) : null;
                return (
                  <li
                    key={ex.id}
                    className={`rounded-md border border-border bg-surface px-3 py-2 ${
                      style ? `border-l-4 ${style.accent}` : ''
                    }`}
                  >
                    <div className="flex items-center gap-1.5 mb-1">
                      {style && <span className="text-[11px]">{style.emoji}</span>}
                      <span className="text-xs font-medium text-ink">
                        {member?.displayName ?? ex.agentId}
                      </span>
                      {style && (
                        <span className="text-[10px] text-ink-muted">
                          {style.label}
                        </span>
                      )}
                    </div>
                    <div
                      className="prose-doc text-sm text-ink"
                      dangerouslySetInnerHTML={{
                        __html: markdownToHtml(ex.content),
                      }}
                    />
                  </li>
                );
              })}
            </ul>
          )}
        </li>
      ))}
    </ol>
  );
}
