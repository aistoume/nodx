/**
 * MaterialNode — a 素材 (Material) node in the nodx network graph.
 *
 * Unlike TopicNode (derived from the topic subtree), a material node is
 * something the user *loads* onto the canvas from the 素材库 (案例库 方案 or
 * 灵感池 灵感). Free-floating, amber-themed, with a ✕ to unload it. It never
 * participates in the parent/child topic edges — it's reference material the
 * user drags where it helps.
 */

import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { MATERIAL_KIND_META, type MaterialKind } from '@nodx/models';

export interface MaterialNodeData extends Record<string, unknown> {
  /** Source material id (case / attention). */
  materialId: string;
  kind: MaterialKind;
  title: string;
  subtitle?: string;
  body?: string;
  isSelected: boolean;
  /** Unload this material from the canvas. */
  onRemove: (materialId: string) => void;
}

const KIND_STYLE: Record<
  MaterialKind,
  { ring: string; tint: string; chip: string; dot: string }
> = {
  solution: {
    ring: 'shadow-[0_0_0_2px_rgba(245,158,11,0.4)]',
    tint: 'from-amber-500/15 to-amber-500/0',
    chip: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
    dot: 'bg-amber-400',
  },
  inspiration: {
    ring: 'shadow-[0_0_0_2px_rgba(234,179,8,0.4)]',
    tint: 'from-yellow-500/15 to-yellow-500/0',
    chip: 'bg-yellow-500/20 text-yellow-200 border-yellow-500/30',
    dot: 'bg-yellow-300',
  },
};

function MaterialNodeInner({ data }: NodeProps) {
  const d = data as MaterialNodeData;
  const meta = MATERIAL_KIND_META[d.kind];
  const style = KIND_STYLE[d.kind];
  return (
    <div
      className={
        'group relative rounded-xl border bg-zinc-900 text-zinc-100 ' +
        'w-[240px] select-none cursor-pointer transition-all ' +
        (d.isSelected
          ? 'border-amber-400 ' + style.ring + ' scale-[1.02]'
          : 'border-amber-700/50 hover:border-amber-500/70 hover:shadow-lg')
      }
    >
      <div
        className={
          'absolute inset-0 rounded-xl pointer-events-none bg-gradient-to-br ' +
          style.tint
        }
      />

      {/* Header — 素材 badge + kind + unload */}
      <div className="relative flex items-center gap-2 px-3 py-2 border-b border-amber-700/30">
        <span className={'w-2 h-2 rounded-full flex-shrink-0 ' + style.dot} />
        <span
          className={
            'text-[10px] px-1.5 py-0.5 rounded border font-medium flex-shrink-0 ' +
            style.chip
          }
          title={`素材 · ${meta.label}`}
        >
          {meta.emoji} 素材·{meta.label}
        </span>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            d.onRemove(d.materialId);
          }}
          title="从画布移除（不删除素材本身）"
          className="ml-auto text-zinc-500 hover:text-rose-400 text-xs opacity-0 group-hover:opacity-100 transition"
        >
          ✕
        </button>
      </div>

      {/* Title */}
      <div className="relative px-3 pt-2">
        <div
          className="text-[12.5px] font-semibold leading-snug line-clamp-2"
          title={d.title}
        >
          {d.title}
        </div>
        {d.subtitle && (
          <div className="text-[10.5px] text-amber-300/70 mt-0.5 truncate">
            {d.subtitle}
          </div>
        )}
      </div>

      {/* Body snippet */}
      <div className="relative px-3 py-2 min-h-[36px]">
        {d.body ? (
          <div
            className="text-[11px] text-zinc-400 leading-snug line-clamp-3"
            title={d.body}
          >
            {d.body}
          </div>
        ) : (
          <div className="text-[10.5px] text-zinc-600 italic">
            （无摘要）
          </div>
        )}
      </div>

      {/* Footer hint */}
      <div className="relative px-3 py-1 border-t border-amber-700/20 text-[10px] text-zinc-500 flex">
        <span className="ml-auto opacity-0 group-hover:opacity-100 transition">
          双击去{d.kind === 'solution' ? '案例库' : '灵感池'}看详情
        </span>
      </div>

      {/* Optional manual-connect handles (dim — no auto edges). */}
      <Handle
        type="target"
        position={Position.Left}
        className="!w-2 !h-2 !bg-amber-600/60 !border-2 !border-zinc-900"
      />
      <Handle
        type="source"
        position={Position.Right}
        className="!w-2 !h-2 !bg-amber-600/60 !border-2 !border-zinc-900"
      />
    </div>
  );
}

export const MaterialNode = memo(MaterialNodeInner);
