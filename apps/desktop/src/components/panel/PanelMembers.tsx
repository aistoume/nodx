import { useState } from 'react';
import type { ExpertAgent } from '@nodx/models';
import { roleStyle } from './roles.js';

interface PanelMembersProps {
  members: ExpertAgent[];
}

/**
 * Role-coloured roster of the proposed/active panel. Each card shows the
 * member's role badge + name, with the (often long) systemPrompt collapsed
 * behind a toggle so the roster stays scannable.
 */
export function PanelMembers({ members }: PanelMembersProps) {
  return (
    <ul className="flex flex-col gap-2">
      {members.map((m) => (
        <MemberCard key={m.id} member={m} />
      ))}
    </ul>
  );
}

function MemberCard({ member }: { member: ExpertAgent }) {
  const [open, setOpen] = useState(false);
  const style = roleStyle(member.role);
  return (
    <li
      className={`rounded-md border border-border border-l-4 ${style.accent} bg-surface px-3 py-2`}
    >
      <div className="flex items-center gap-2">
        <span
          className={`inline-flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded border ${style.badge}`}
        >
          {style.emoji} {style.label}
        </span>
        <span className="text-sm font-medium text-ink">
          {member.displayName}
        </span>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="ml-auto text-[11px] text-ink-muted hover:text-accent transition"
        >
          {open ? '收起设定' : '查看设定'}
        </button>
      </div>
      {open && (
        <p className="mt-2 text-xs text-ink-muted leading-relaxed whitespace-pre-wrap">
          {member.systemPrompt}
        </p>
      )}
    </li>
  );
}
