type View = 'dialog' | 'graph';

interface HeaderProps {
  view: View;
  onViewChange: (view: View) => void;
}

export function Header({ view, onViewChange }: HeaderProps) {
  return (
    <header className="h-14 bg-surface border-b border-border flex items-center px-6 gap-4 shrink-0">
      <div className="flex items-baseline gap-2">
        <span className="font-bold text-lg text-accent">nodx</span>
        <span className="text-xs text-ink-muted">AI 决策思考工作台</span>
      </div>
      <nav className="ml-auto flex gap-1">
        <ViewTab
          label="对话"
          active={view === 'dialog'}
          onClick={() => onViewChange('dialog')}
        />
        <ViewTab
          label="网络图"
          active={view === 'graph'}
          onClick={() => onViewChange('graph')}
        />
      </nav>
      <button
        type="button"
        className="ml-2 px-3 py-1.5 text-sm rounded-md border border-border bg-surface text-ink-muted hover:bg-canvas hover:text-ink transition"
      >
        草稿区
      </button>
    </header>
  );
}

function ViewTab({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        active
          ? 'px-3.5 py-1.5 text-sm rounded-md bg-accent text-white'
          : 'px-3.5 py-1.5 text-sm rounded-md text-ink-muted hover:bg-canvas hover:text-ink transition'
      }
    >
      {label}
    </button>
  );
}
