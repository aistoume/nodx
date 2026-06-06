import type { PersonaRole } from '@nodx/models';

/**
 * Display metadata for the five panel roles (PRD §3.14). Colours reuse the
 * theme's note palette so the panel feels of-a-piece with the four-colour
 * annotation system; `critic` is the one role with no note token, so it
 * borrows Tailwind's red utilities to stay visually distinct as the
 * mandatory devil's advocate.
 */
export interface RoleStyle {
  emoji: string;
  label: string;
  /** Badge classes: background + border + text. */
  badge: string;
  /** Left accent border for the member/exchange card. */
  accent: string;
}

const STYLES: Record<PersonaRole, RoleStyle> = {
  proposer: {
    emoji: '🔵',
    label: '正方主推',
    badge: 'bg-note-blue border-note-blue-edge/40 text-blue-800',
    accent: 'border-l-note-blue-edge',
  },
  critic: {
    emoji: '🔴',
    label: '魔鬼代言人',
    badge: 'bg-red-50 border-red-300 text-red-700',
    accent: 'border-l-red-400',
  },
  practitioner: {
    emoji: '🟢',
    label: '实操经验',
    badge: 'bg-note-green border-note-green-edge/40 text-green-800',
    accent: 'border-l-note-green-edge',
  },
  constraint: {
    emoji: '🟡',
    label: '外部约束',
    badge: 'bg-note-yellow border-note-yellow-edge/50 text-amber-800',
    accent: 'border-l-note-yellow-edge',
  },
  user_proxy: {
    emoji: '🟣',
    label: '用户自带',
    badge: 'bg-note-purple border-note-purple-edge/40 text-purple-800',
    accent: 'border-l-note-purple-edge',
  },
};

export function roleStyle(role: PersonaRole): RoleStyle {
  return STYLES[role];
}
