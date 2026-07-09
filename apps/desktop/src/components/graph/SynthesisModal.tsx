/**
 * SynthesisModal — 素材综合. The user wired several 素材 into a thinking node
 * and clicked 综合. Shows the linked materials, takes a question, runs the AI
 * synthesiser, and appends the result to the node's document.
 */

import { useState } from 'react';
import { MATERIAL_KIND_META, type MaterialRef } from '@nodx/models';
import { synthesizeMaterials } from '../../ai/synthesize.js';
import { appendToDocument } from '../../db/documents.js';
import { markdownToHtml } from '../../lib/markdown.js';
import { useT } from '../../i18n/index.js';

interface SynthesisModalProps {
  topicId: string;
  topicTitle: string;
  materials: MaterialRef[];
  /** Called after the synthesis is written to the doc (topicId). */
  onDone: (topicId: string) => void;
  onClose: () => void;
}

export function SynthesisModal({
  topicId,
  topicTitle,
  materials,
  onDone,
  onClose,
}: SynthesisModalProps) {
  const { t } = useT();
  const [question, setQuestion] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      const md = await synthesizeMaterials(
        topicId,
        topicTitle,
        question,
        materials,
      );
      await appendToDocument(topicId, markdownToHtml(md));
      onDone(topicId);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };

  return (
    <div
      className="absolute inset-0 z-30 flex"
      onMouseDown={busy ? undefined : onClose}
    >
      <div className="absolute inset-0 bg-black/45" />
      <div
        onMouseDown={(e) => e.stopPropagation()}
        className="relative m-auto w-[560px] max-h-[85%] flex flex-col rounded-xl border border-zinc-700 bg-zinc-900 text-zinc-100 shadow-2xl overflow-hidden"
      >
        <header className="px-4 py-3 border-b border-zinc-800 flex items-center gap-2">
          <span className="text-sm font-semibold">{t('synth.title')}</span>
          <span className="text-[11px] text-zinc-500 truncate max-w-[220px]">
            {topicTitle}
          </span>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="ml-auto text-zinc-500 hover:text-zinc-200 text-sm disabled:opacity-40"
          >
            {t('picker.close')}
          </button>
        </header>

        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
          <div>
            <p className="text-[11px] uppercase tracking-wider text-zinc-500 mb-1.5">
              {t('synth.linkedMaterials', { n: String(materials.length) })}
            </p>
            <ul className="flex flex-col gap-1">
              {materials.map((m) => {
                const meta = MATERIAL_KIND_META[m.kind];
                return (
                  <li
                    key={`${m.kind}_${m.id}`}
                    className="rounded border border-zinc-800 bg-zinc-800/40 px-2.5 py-1.5 text-xs flex items-center gap-2"
                  >
                    <span className="text-amber-300 flex-shrink-0">
                      {meta.emoji} {m.kind === 'solution' ? t('material.kind.solution') : t('material.kind.inspiration')}
                    </span>
                    <span className="truncate">{m.title}</span>
                  </li>
                );
              })}
            </ul>
          </div>

          <div>
            <label className="text-[11px] uppercase tracking-wider text-zinc-500 mb-1.5 block">
              {t('synth.questionLabel')}
            </label>
            <textarea
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              disabled={busy}
              rows={3}
              placeholder={t('synth.questionPlaceholder')}
              className="w-full resize-none rounded-md bg-zinc-800 border border-zinc-700 px-3 py-2 text-sm focus:outline-none focus:border-amber-500/50 disabled:opacity-60"
            />
          </div>

          {error && (
            <pre className="text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded p-2 whitespace-pre-wrap break-all">
              {error}
            </pre>
          )}

          {busy && (
            <div className="flex items-center gap-2 text-xs text-zinc-400">
              <span className="inline-block w-3 h-3 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
              {t('synth.busyHint')}
            </div>
          )}
        </div>

        <footer className="px-4 py-3 border-t border-zinc-800 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="px-2.5 py-1.5 text-xs rounded border border-zinc-700 text-zinc-400 hover:text-zinc-200 disabled:opacity-40"
          >
            {t('common.cancel')}
          </button>
          <button
            type="button"
            onClick={() => void run()}
            disabled={busy || materials.length === 0}
            className="px-3 py-1.5 text-xs font-medium rounded-md bg-amber-600 text-white hover:bg-amber-500 disabled:opacity-40 transition"
          >
            {busy ? t('synth.busyBtn') : t('synth.synthesizeBtn')}
          </button>
        </footer>
      </div>
    </div>
  );
}
