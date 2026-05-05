import type { Topic } from '@nodx/models';

interface CenterPanelProps {
  topic: Topic | null;
}

export function CenterPanel({ topic }: CenterPanelProps) {
  if (!topic) {
    return (
      <main className="flex items-center justify-center text-ink-muted">
        <div className="text-center max-w-sm">
          <p className="text-sm">从左栏选择一个对话开始</p>
          <p className="text-xs mt-2 opacity-70">
            或新建一个：输入模糊问题，AI 会引导你拆解
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="overflow-y-auto bg-canvas">
      <div className="max-w-3xl mx-auto px-8 py-8">
        <header className="border-b border-border pb-6 mb-6">
          <p className="text-xs text-ink-muted mb-1">对话</p>
          <h1 className="text-2xl font-semibold leading-tight">
            {topic.title}
          </h1>
          <div className="mt-3 flex items-center gap-3 text-xs text-ink-muted">
            <span>status: {topic.status}</span>
            <span>·</span>
            <span>{topic.meta.messageCount} 条消息</span>
            <span>·</span>
            <span>
              {topic.meta.childCount > 0
                ? `${topic.meta.childCount} 个子对话`
                : '无子对话'}
            </span>
          </div>
        </header>

        <div className="text-sm text-ink-muted italic">
          对话流尚未接入 — Survey 卡片 / 第一性原理拆解 / @ 引用胶囊
          会在 Week 2 后续上线。
        </div>
      </div>
    </main>
  );
}
