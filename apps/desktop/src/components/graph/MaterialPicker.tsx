/**
 * MaterialPicker — the "➕ 加载素材" overlay for the network graph. Lists all
 * 素材 (案例库 方案 + 灵感池 灵感) with a kind filter + search; clicking one
 * loads it onto the canvas. Already-loaded materials are marked.
 */

import { useEffect, useMemo, useState } from 'react';
import { MATERIAL_KIND_META, type MaterialKind, type MaterialRef } from '@nodx/models';
import { listMaterials } from '../../db/materials.js';

interface MaterialPickerProps {
  /** Source ids already on the canvas (marked as loaded). */
  loadedIds: Set<string>;
  onPick: (m: MaterialRef) => void;
  onClose: () => void;
}

type KindFilter = 'all' | MaterialKind;

export function MaterialPicker({ loadedIds, onPick, onClose }: MaterialPickerProps) {
  const [materials, setMaterials] = useState<MaterialRef[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [kindFilter, setKindFilter] = useState<KindFilter>('all');
  const [search, setSearch] = useState('');

  useEffect(() => {
    let cancelled = false;
    listMaterials()
      .then((m) => !cancelled && setMaterials(m))
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    if (!materials) return [];
    const q = search.trim().toLowerCase();
    return materials.filter((m) => {
      if (kindFilter !== 'all' && m.kind !== kindFilter) return false;
      if (!q) return true;
      return (
        m.title.toLowerCase().includes(q) ||
        (m.subtitle ?? '').toLowerCase().includes(q) ||
        (m.body ?? '').toLowerCase().includes(q)
      );
    });
  }, [materials, kindFilter, search]);

  return (
    <div className="absolute inset-0 z-20 flex" onMouseDown={onClose}>
      <div className="absolute inset-0 bg-black/40" />
      <div
        onMouseDown={(e) => e.stopPropagation()}
        className="relative m-auto w-[520px] max-h-[80%] flex flex-col rounded-xl border border-zinc-700 bg-zinc-900 text-zinc-100 shadow-2xl overflow-hidden"
      >
        <header className="px-4 py-3 border-b border-zinc-800 flex items-center gap-2">
          <span className="text-sm font-semibold">➕ 加载素材到画布</span>
          <span className="text-[11px] text-zinc-500">
            案例库(方案) + 灵感池(灵感)
          </span>
          <button
            type="button"
            onClick={onClose}
            className="ml-auto text-zinc-500 hover:text-zinc-200 text-sm"
          >
            关闭
          </button>
        </header>

        <div className="px-4 py-2.5 border-b border-zinc-800 flex items-center gap-2">
          <div className="flex gap-1">
            {(['all', 'solution', 'inspiration'] as const).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setKindFilter(k)}
                className={
                  'px-2 py-1 rounded text-[11px] transition ' +
                  (kindFilter === k
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                    : 'bg-zinc-800 text-zinc-400 border border-transparent hover:text-zinc-200')
                }
              >
                {k === 'all'
                  ? '全部'
                  : `${MATERIAL_KIND_META[k].emoji} ${MATERIAL_KIND_META[k].label}`}
              </button>
            ))}
          </div>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜索素材…"
            className="ml-auto flex-1 max-w-[220px] px-2.5 py-1 text-xs rounded bg-zinc-800 border border-zinc-700 focus:outline-none focus:border-amber-500/50"
          />
        </div>

        <div className="flex-1 overflow-y-auto p-2">
          {error && (
            <p className="text-xs text-rose-400 p-2">{error}</p>
          )}
          {!materials && !error && (
            <p className="text-xs text-zinc-500 p-2">加载素材中…</p>
          )}
          {materials && filtered.length === 0 && (
            <p className="text-xs text-zinc-500 p-3">
              没有匹配的素材。专家组采纳会入「案例库(方案)」，Lens 捕获会进「灵感池(灵感)」。
            </p>
          )}
          <ul className="flex flex-col gap-1.5">
            {filtered.map((m) => {
              const loaded = loadedIds.has(m.id);
              const meta = MATERIAL_KIND_META[m.kind];
              return (
                <li key={`${m.kind}_${m.id}`}>
                  <button
                    type="button"
                    disabled={loaded}
                    onClick={() => onPick(m)}
                    className={
                      'w-full text-left rounded-lg border p-2.5 transition ' +
                      (loaded
                        ? 'border-zinc-800 opacity-45 cursor-not-allowed'
                        : 'border-zinc-700 hover:border-amber-500/60 hover:bg-zinc-800/60')
                    }
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-amber-300 flex-shrink-0">
                        {meta.emoji} {meta.label}
                      </span>
                      <span className="text-xs font-medium truncate">
                        {m.title}
                      </span>
                      {loaded && (
                        <span className="ml-auto text-[10px] text-zinc-500 flex-shrink-0">
                          已在画布
                        </span>
                      )}
                    </div>
                    {m.subtitle && (
                      <div className="text-[10.5px] text-zinc-500 mt-0.5 truncate">
                        {m.subtitle}
                      </div>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </div>
  );
}
