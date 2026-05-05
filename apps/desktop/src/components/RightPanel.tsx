import type { Topic } from '@nodx/models';

interface RightPanelProps {
  topic: Topic | null;
}

export function RightPanel({ topic }: RightPanelProps) {
  return (
    <aside className="border-l border-border bg-surface overflow-y-auto p-4 flex flex-col gap-4">
      <h3 className="text-[11px] uppercase tracking-wider text-ink-muted font-medium">
        备注
      </h3>

      {!topic && (
        <p className="text-xs text-ink-muted italic">
          选中对话后这里会出现四色备注：
        </p>
      )}

      <ul className="flex flex-col gap-2 text-xs">
        <LegendRow color="bg-note-yellow border-note-yellow-edge" label="便签 — 自由想法" />
        <LegendRow color="bg-note-blue border-note-blue-edge" label="解释 — AI 名词解释" />
        <LegendRow color="bg-note-green border-note-green-edge" label="原子动作 — 谁/做什么/何时/产出" />
        <LegendRow color="bg-note-purple border-note-purple-edge" label="引用 — @ 跨对话" />
      </ul>

      {topic && (
        <p className="text-xs text-ink-muted italic mt-2">
          锚定逻辑（虚线连接段落 ↔ 备注）将在选中文字后接入。
        </p>
      )}
    </aside>
  );
}

function LegendRow({ color, label }: { color: string; label: string }) {
  return (
    <li className="flex items-start gap-2">
      <span
        className={`mt-0.5 inline-block w-3 h-3 rounded-sm border ${color}`}
      />
      <span className="text-ink-muted">{label}</span>
    </li>
  );
}
