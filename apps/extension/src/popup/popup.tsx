/** @jsxImportSource preact */
import { render } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import {
  getHistory,
  clearHistory,
  type ExplanationRecord,
} from '../shared/history.js';
import {
  getSnippets,
  clearSnippets,
  snippetToMarkdown,
  buildNodxDeepLink,
  type SavedSnippet,
} from '../shared/snippets.js';
import { getSettings } from '../shared/settings.js';
import { setLocale, t } from '../shared/i18n.js';

type Tab = 'saved' | 'history';

function App() {
  const [tab, setTab] = useState<Tab>('saved');
  const [snippets, setSnippets] = useState<SavedSnippet[]>([]);
  const [records, setRecords] = useState<ExplanationRecord[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    void (async () => {
      const s = await getSettings();
      setLocale(s.language);
      setSnippets(await getSnippets());
      setRecords(await getHistory());
      setReady(true);
    })();
  }, []);

  if (!ready) return <div className="popup"><div className="empty">…</div></div>;

  return (
    <div className="popup">
      <div className="head">
        <strong>{t('popupTitle')}</strong>
        <button className="link" onClick={() => chrome.runtime.openOptionsPage()}>
          {t('settingsLink')}
        </button>
      </div>

      <div className="tabs">
        <button
          className={'tab' + (tab === 'saved' ? ' active' : '')}
          onClick={() => setTab('saved')}
        >
          {t('savedTabTitle')} {snippets.length > 0 && <span className="badge">{snippets.length}</span>}
        </button>
        <button
          className={'tab' + (tab === 'history' ? ' active' : '')}
          onClick={() => setTab('history')}
        >
          History
        </button>
      </div>

      {tab === 'saved' && (
        snippets.length === 0 ? (
          <div className="empty">
            <p>{t('savedEmpty')}</p>
          </div>
        ) : (
          <>
            <div className="list">
              {snippets.map((s) => (
                <div className="rec snippet" key={s.id}>
                  <div className="src">
                    {new URL(s.sourceUrl).hostname} · {new Date(s.capturedAt).toLocaleString()}
                  </div>
                  <div className="sel">"{s.text.slice(0, 80)}{s.text.length > 80 ? '…' : ''}"</div>
                  <div className="exp">
                    {s.explanation
                      ? <>{s.explanation.slice(0, 160)}{s.explanation.length > 160 ? '…' : ''}</>
                      : <em style={{ color: '#aaa' }}>（裸卡 · 未调用 AI）</em>}
                  </div>
                  <div className="actions">
                    <button
                      className="mini"
                      onClick={() => {
                        void navigator.clipboard.writeText(snippetToMarkdown(s));
                      }}
                    >
                      📋 Copy MD
                    </button>
                    <a
                      className="mini link-mini"
                      href={buildNodxDeepLink(s)}
                    >
                      🚀 Open in nodx
                    </a>
                  </div>
                </div>
              ))}
            </div>
            <div className="foot">
              <button
                className="link"
                onClick={async () => {
                  await clearSnippets();
                  setSnippets([]);
                }}
              >
                {t('clearHistory')}
              </button>
            </div>
          </>
        )
      )}

      {tab === 'history' && (
        records.length === 0 ? (
          <div className="empty">
            <p>{t('popupEmptyMain')}</p>
            <p className="hint">{t('popupEmptyHint')}</p>
          </div>
        ) : (
          <>
            <div className="list">
              {records.map((r) => (
                <div className="rec" key={r.id}>
                  <div className="src">
                    {new URL(r.sourceUrl).hostname} · {new Date(r.createdAt).toLocaleString()}
                  </div>
                  <div className="sel">"{r.selectedText.slice(0, 80)}{r.selectedText.length > 80 ? '…' : ''}"</div>
                  <div className="exp">{r.explanation.slice(0, 200)}{r.explanation.length > 200 ? '…' : ''}</div>
                </div>
              ))}
            </div>
            <div className="foot">
              <button
                className="link"
                onClick={async () => {
                  await clearHistory();
                  setRecords([]);
                }}
              >
                {t('clearHistory')}
              </button>
            </div>
          </>
        )
      )}
    </div>
  );
}

render(<App />, document.getElementById('root')!);
