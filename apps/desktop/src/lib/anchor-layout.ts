import { useSyncExternalStore } from 'react';

/**
 * Shared store holding the viewport-Y coordinate of each comment's anchor
 * inside the document. DocumentView writes; RightPanel reads. Lives outside
 * React state so cross-panel reads don't need a context provider in App.
 *
 * Coordinates are in CSS pixels relative to the viewport (matches what
 * `Element.getBoundingClientRect().top` returns), so RightPanel just
 * subtracts its own panel rect top to convert to panel-local Y.
 */

const EMPTY = new Map<string, number>();
let positions: Map<string, number> = EMPTY;
const listeners = new Set<() => void>();

export function setAnchorPositions(next: Map<string, number>): void {
  // Skip the notify if nothing actually changed — re-running RightPanel's
  // useSyncExternalStore on every editor.update would be wasteful.
  if (mapsEqual(positions, next)) return;
  positions = next;
  for (const l of listeners) l();
}

export function useAnchorPositions(): Map<string, number> {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => {
        listeners.delete(cb);
      };
    },
    () => positions,
    () => EMPTY,
  );
}

function mapsEqual(
  a: Map<string, number>,
  b: Map<string, number>,
): boolean {
  if (a.size !== b.size) return false;
  for (const [k, v] of a) {
    const bv = b.get(k);
    // 0.5 px slop — sub-pixel differences from coordsAtPos shouldn't trigger
    // a re-layout on every scroll tick.
    if (bv === undefined || Math.abs(v - bv) > 0.5) return false;
  }
  return true;
}
