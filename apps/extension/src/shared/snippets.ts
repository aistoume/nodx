/**
 * Saved snippets — the "attention token" representation of a captured
 * highlight (with or without AI explanation), persisted to chrome.storage.local.
 *
 * Two flavours:
 *   - Explained snippet:  user clicked 🔍 → got AI explanation → saved.
 *   - Bare snippet:       user clicked 💾 directly → no API call, no explanation.
 *                         Can be "upgraded" later by adding an explanation in nodx.
 *
 * Today this storage is consumed by:
 *   - The popup (a "Saved" tab listing the most recent snippets)
 *   - The deep link to nodx://capture?... when the desktop app is installed
 *
 * Later: synced to nodx desktop's Attention Inbox / CBR case library.
 */

export interface SavedSnippet {
  id: string;
  text: string;                  // user's highlighted text
  explanation?: string;          // AI explanation — optional (bare snippet has none)
  sourceUrl: string;
  sourceTitle: string;
  capturedAt: number;
  /** Capture path. 'explain' = went through AI; 'quick' = bare save, no API. */
  kind: 'explain' | 'quick';
}

const MAX_SNIPPETS = 100;

export async function saveSnippet(
  partial: Omit<SavedSnippet, 'id'>,
): Promise<SavedSnippet> {
  const list = await getSnippets();
  const snippet: SavedSnippet = {
    id: crypto.randomUUID(),
    ...partial,
  };
  list.unshift(snippet);
  await chrome.storage.local.set({
    snippets: list.slice(0, MAX_SNIPPETS),
  });
  return snippet;
}

export async function getSnippets(): Promise<SavedSnippet[]> {
  const data = await chrome.storage.local.get('snippets');
  const raw = (data.snippets as Partial<SavedSnippet>[] | undefined) ?? [];
  // Migrate old (pre-0.4) records that don't have `kind` — they were always
  // explain-flow saves.
  return raw.map((s) => ({
    id: s.id ?? crypto.randomUUID(),
    text: s.text ?? '',
    explanation: s.explanation,
    sourceUrl: s.sourceUrl ?? '',
    sourceTitle: s.sourceTitle ?? '',
    capturedAt: s.capturedAt ?? Date.now(),
    kind: s.kind ?? 'explain',
  })) as SavedSnippet[];
}

export async function clearSnippets(): Promise<void> {
  await chrome.storage.local.remove('snippets');
}

export function snippetToMarkdown(s: SavedSnippet): string {
  const date = new Date(s.capturedAt).toISOString().split('T')[0];
  const lines = [
    `> ${s.text.replace(/\n/g, '\n> ')}`,
    '',
  ];
  if (s.explanation && s.explanation.trim()) {
    lines.push(s.explanation, '');
  }
  lines.push(`— [${s.sourceTitle}](${s.sourceUrl})  · ${date}`);
  return lines.join('\n');
}

export function buildNodxDeepLink(s: SavedSnippet): string {
  const u = new URL('nodx://capture');
  u.searchParams.set('id', s.id);
  u.searchParams.set('text', s.text);
  if (s.explanation) u.searchParams.set('explanation', s.explanation);
  u.searchParams.set('url', s.sourceUrl);
  u.searchParams.set('title', s.sourceTitle);
  u.searchParams.set('capturedAt', String(s.capturedAt));
  u.searchParams.set('kind', s.kind);
  return u.toString();
}
