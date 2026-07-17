/**
 * Local explanation history — capped to 20 entries.
 */

export interface ExplanationRecord {
  id: string;
  selectedText: string;
  explanation: string;
  sourceUrl: string;
  sourceTitle: string;
  mode: 'short' | 'deep' | 'custom';
  createdAt: number;
}

const HISTORY_CAP = 20;

export async function getHistory(): Promise<ExplanationRecord[]> {
  const stored = await chrome.storage.local.get('history');
  return (stored.history as ExplanationRecord[]) ?? [];
}

export async function recordExplanation(
  partial: Omit<ExplanationRecord, 'id' | 'createdAt'>,
): Promise<void> {
  const history = await getHistory();
  history.unshift({
    ...partial,
    id: crypto.randomUUID(),
    createdAt: Date.now(),
  });
  await chrome.storage.local.set({ history: history.slice(0, HISTORY_CAP) });
}

export async function clearHistory(): Promise<void> {
  await chrome.storage.local.remove('history');
}
