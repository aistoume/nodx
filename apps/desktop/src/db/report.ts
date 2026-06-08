import type { Comment, Topic } from '@nodx/models';
import type { ReportInput, ReportNode } from '@nodx/ai';
import { listTopics } from './topics.js';
import { getDocument } from './documents.js';
import { listComments } from './comments.js';

// ──────────────────────────────────────────────────────────────────────
// Decision-report data gathering (PRD §8.7): BFS the topic subtree and
// collect each node's substance (aiSummary or a doc excerpt) + its atomic
// actions + open questions, into the ReportInput the 收尾整理者 consumes.
// ──────────────────────────────────────────────────────────────────────

const DOC_EXCERPT_CHARS = 800;

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function formatAtomic(c: Comment): string {
  const a = c.atomicData;
  if (!a) return c.content;
  const parts = [
    a.who && `谁：${a.who}`,
    `做：${a.what}`,
    a.when && `何时：${a.when}`,
    a.deliverable && `产出：${a.deliverable}`,
  ].filter(Boolean);
  return parts.join('　');
}

/** Collect the subtree rooted at `rootTopicId` into the report input. */
export async function gatherReportData(
  rootTopicId: string,
): Promise<ReportInput> {
  const all = await listTopics({ includeArchived: true });
  const byId = new Map(all.map((t) => [t.id, t]));
  const root = byId.get(rootTopicId);
  if (!root) throw new Error(`topic not found: ${rootTopicId}`);

  // BFS the subtree (root first).
  const childrenOf = new Map<string, Topic[]>();
  for (const t of all) {
    if (t.parentId) {
      const list = childrenOf.get(t.parentId) ?? [];
      list.push(t);
      childrenOf.set(t.parentId, list);
    }
  }
  const ordered: Topic[] = [];
  const queue: Topic[] = [root];
  while (queue.length) {
    const t = queue.shift()!;
    ordered.push(t);
    const kids = (childrenOf.get(t.id) ?? []).sort(
      (a, b) => a.createdAt - b.createdAt,
    );
    queue.push(...kids);
  }

  const nodes: ReportNode[] = await Promise.all(
    ordered.map(async (t) => {
      const comments = await listComments(t.id);
      const atomicActions = comments
        .filter((c) => c.type === 'atomic')
        .map(formatAtomic);
      const openQuestions = comments
        .filter(
          (c) =>
            c.type === 'open_question' && !c.openQuestionData?.resolvedAt,
        )
        .map((c) => c.openQuestionData?.question ?? c.content)
        .filter((q): q is string => !!q);

      let content = t.aiSummary ?? '';
      if (!content) {
        const doc = await getDocument(t.id);
        if (doc) content = stripHtml(doc.content).slice(0, DOC_EXCERPT_CHARS);
      }
      return { title: t.title, content, atomicActions, openQuestions };
    }),
  );

  return { rootQuestion: root.title, nodes };
}
