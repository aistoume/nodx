/**
 * Canvas topics — topics created via the graph's 🆕 新画布. They start blank
 * (materials/synthesis workspace) and DON'T auto-fire the Survey flow; the
 * user triggers Survey manually when ready. Persisted in localStorage so the
 * opt-out survives an app restart.
 */

const KEY = 'nodx:canvas-topics:v1';

function read(): Set<string> {
  try {
    const raw = localStorage.getItem(KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

function write(set: Set<string>): void {
  try {
    localStorage.setItem(KEY, JSON.stringify([...set]));
  } catch {
    // non-fatal
  }
}

export function markCanvasTopic(id: string): void {
  const s = read();
  s.add(id);
  write(s);
}

/** Called once the user manually kicks off Survey — resume normal behaviour. */
export function unmarkCanvasTopic(id: string): void {
  const s = read();
  if (s.delete(id)) write(s);
}

export function isCanvasTopic(id: string): boolean {
  return read().has(id);
}
