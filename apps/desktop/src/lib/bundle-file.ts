// Native file I/O for .nodx bundles via the Tauri dialog + fs plugins, so the
// user picks the exact save location / file to load (a real "另存为" / "打开"
// dialog), not a silent browser download.

import { save, open } from '@tauri-apps/plugin-dialog';
import { writeTextFile, readTextFile } from '@tauri-apps/plugin-fs';
import { t } from '../i18n/index.js';

/**
 * Prompt for a save location and write the bundle there.
 * Returns the chosen path, or null if the user cancelled.
 */
export async function saveBundleFile(
  defaultName: string,
  text: string,
): Promise<string | null> {
  const path = await save({
    title: t('bundle.exportDialogTitle'),
    defaultPath: defaultName,
    filters: [{ name: t('bundle.filterName'), extensions: ['nodx'] }],
  });
  if (!path) return null;
  await writeTextFile(path, text);
  return path;
}

/**
 * Prompt for a .nodx file and read it.
 * Returns { path, text }, or null if the user cancelled.
 */
export async function openBundleFile(): Promise<{
  path: string;
  text: string;
} | null> {
  const selected = await open({
    title: t('bundle.importDialogTitle'),
    multiple: false,
    directory: false,
    filters: [{ name: t('bundle.filterName'), extensions: ['nodx', 'json'] }],
  });
  if (!selected || typeof selected !== 'string') return null;
  const text = await readTextFile(selected);
  return { path: selected, text };
}

/** Filesystem-safe filename stem from a topic title. */
export function safeFileName(title: string): string {
  return (title.replace(/[\\/:*?"<>|]+/g, '_').trim() || 'topic').slice(0, 60);
}
