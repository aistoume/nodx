# i18n migration roadmap

nodx desktop was Chinese-first. This doc tracks the progressive English-locale rollout after Phase 1 (framework + core surfaces) shipped in v0.5.

## Architecture recap

- **`src/i18n/strings.ts`** — flat key-value dictionary, `zh` + `en` in parity.
  Grouped by dot-separated keys (`settings.keys.h`, `attention.title`, etc.).
- **`src/i18n/index.ts`** — the runtime:
  - `t(key, params?)` — pure lookup, safe from anywhere; falls back to English then to the raw key
  - `useT()` — React hook that returns `{ t, locale, setting, setSetting }` and re-renders when the user switches
  - `initLocale()` — called once from `main.tsx` (main + popover) to load the saved / system preference before first paint
- **Setting stored in** `localStorage['nodx:locale']` — one of `'auto' | 'zh' | 'en'`. `'auto'` follows `navigator.language`.

**How to translate any component**:

```tsx
import { useT } from '../i18n/index.js';

function Foo() {
  const { t } = useT();
  return <button>{t('common.save')}</button>;
}
```

If a key doesn't exist yet, add it to BOTH `zh` and `en` in `strings.ts` in
the same edit — `strings.ts` is `as const satisfies Record<Locale, ...>` so
missing keys break the type check immediately.

For parameter interpolation use `{{name}}` and pass a `params` object:

```ts
t('attention.count', { count: 42 })  // uses "{{count}}" in the source string
```

## Phase 1 (v0.5) — SHIPPED

Core navigation + Settings + surfaces users hit every session.

- [x] `src/i18n/{strings.ts,index.ts}` framework
- [x] `src/main.tsx` + `src/popover/main.tsx` — `initLocale()` before first render
- [x] `Header.tsx` — 5 tabs + drafts button + app tagline
- [x] `TopicTabsBar.tsx` — tabs, picker, create-new form
- [x] `LeftPanel.tsx` — new topic form, list, archived section, `StatusBadge`
- [x] `SettingsView.tsx` — **incl. new Language selector at top** (Auto / 中文 / English)
- [x] `PopoverApp.tsx` — the ⌥+E floating window
- [x] `AttentionInboxView.tsx` — 灵感池 (Pool), including time grouping

## Phase 2 — Reading & thinking surfaces (target v0.6)

These are what users touch the *second* time they open a topic, so English
users hit them within minutes. Priority: high.

| File | Approx. CN strings | Notes |
|---|---|---|
| `components/CenterPanel.tsx` | ~54 | Center of the app; empty-state + Survey trigger UI |
| `components/DocumentView.tsx` | ~87 | Prose thinking-doc editor; buttons + tooltips + empty states |
| `components/ChatThread.tsx` | ~12 | Message row buttons + user/AI labels |
| `components/RightPanel.tsx` | ~31 | Comment legend (already keys defined in `right.legend.*`); actions |
| `components/SurveyCard.tsx` | ~19 | First-principles factor card |
| `components/FactorListCard.tsx` | ~13 | Factor list output |
| `components/SpawnChildButton.tsx` | ~9 | Deep-dive button |
| `components/ExplainTrigger.tsx` | ~4 | Selection popover in the doc |

**Recommended order**: `CenterPanel` → `DocumentView` → `RightPanel` →
`ChatThread` → then the small ones.

## Phase 3 — Expert Panel + advanced flows (target v0.7)

Users only see these after they've built momentum. Priority: medium.

| File | Approx. CN strings | Notes |
|---|---|---|
| `components/panel/ExpertPanelView.tsx` | ~102 | The debate visualiser — biggest chunk here |
| `components/panel/PanelTranscript.tsx` | ~18 | Transcript rendering |
| `components/panel/LocalMaxCard.tsx` | ~20 | Local Maximum verdict card |
| `components/panel/MergePreviewModal.tsx` | ~14 | "Weave into document" preview |
| `components/panel/PanelMembers.tsx` | ~2 | Role chips |
| `components/auto-recursion/AutoRecursionModal.tsx` | ~167 | **Biggest single file** — PM engine wizard + progress + stop-confirm |
| `components/cbr/CaseSearchView.tsx` | ~78 | Case library search + preview |
| `components/report/ReportModal.tsx` | ~23 | Decision-report export |
| `components/replay/ReplayCard.tsx` | ~14 | "Nothing lost" replay card |

**Recommended order**: `AutoRecursionModal` (biggest, most user-facing wizard)
→ `ExpertPanelView` → `CaseSearchView` → the smaller panel cards.

## Phase 4 — Network graph + materials (target v0.8)

Users usually toggle to the graph after they've built out a few topics.
Priority: low (visual, less text-heavy).

| File | Approx. CN strings | Notes |
|---|---|---|
| `components/graph/TopicNode.tsx` | ~34 | Node chips, tooltips |
| `components/graph/MaterialPicker.tsx` | ~23 | Material library picker modal |
| `components/graph/SynthesisModal.tsx` | ~18 | 素材综合 (Synthesis) modal |
| `components/graph/MaterialNode.tsx` | ~16 | Material node badge |
| `components/NetworkGraphView.tsx` | (large but mostly labels) | Toolbar + empty states |

## Estimated remaining strings

Roughly **870 CN characters** to migrate, split across ~22 files. At the
rate Phase 1 landed (5 files → ~500 keys), each phase should take 1-2 focused
sessions.

## Migration checklist (per file)

For every file you migrate:

1. Add `import { useT } from '<relative>/i18n/index.js';`
2. In the top-level function component call `const { t } = useT();`
3. In any child sub-component that also uses strings, add `const { t } = useT();` too — no prop drilling required.
4. Replace every hardcoded CN literal with `t('key')`. **Add both zh + en to `strings.ts` in the same edit.**
5. Rename any local variable called `t` (setTimeout handles, etc.) — do it inside your edit, don't fight the shadow.
6. Run `pnpm tsc --noEmit`. Zero-tolerance on new errors.
7. For strings passed through `confirm()` / `alert()` remember `t()` returns a string, so `confirm(t('x.confirm'))` works.
8. For status enums that map to labels (like `TopicStatus`), keep a
   `Record<Enum, StringKey>` at module scope and let the component call
   `t(map[value])`. See `STATUS_SHORT_KEY` in `LeftPanel.tsx` for the pattern.

## Contribution rules

- **Never** commit a single-language change to `strings.ts`. If you add a key,
  add both `zh` and `en` in the same PR.
- English defaults to short and functional. Chinese defaults to concise but
  can carry more nuance (e.g. `left.status.exploring` = "探索" / "Explore").
- Emojis are locale-agnostic — leave them inline in the value.
- If a key ends up unused for two releases, remove it.

## QA plan

Before shipping each phase:

1. In Settings → Language switch to `English`. Restart nodx.
2. Walk through the surfaces the phase covers. Look for any remaining
   Chinese characters — those are misses.
3. Do the same test with `中文` and confirm no accidental English leaks.
4. Then test `Follow system` and confirm behaviour on both zh-CN and en-US
   system locales.
