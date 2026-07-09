/** @jsxImportSource preact */
import { render } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import {
  getHistory,
  clearHistory,
  type ExplanationRecord,
} from '../shared/history.js';
import { getSettings } from '../shared/settings.js';
import { setLocale, t } from '../shared/i18n.js';

function App() {
  const [records, setRecords] = useState<ExplanationRecord[]>([]);
  const [ready, setReady] = useState(false);
  const [captureBusy, setCaptureBusy] = useState(false);
  const [captureMsg, setCaptureMsg] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const s = await getSettings();
      setLocale(s.language);
      setRecords(await getHistory());
      setReady(true);
    })();
  }, []);

  const startCapture = async () => {
    setCaptureBusy(true);
    setCaptureMsg(null);
    try {
      // Ask the service worker to grab the visible tab and forward it to
      // the tab's content script for marquee selection.
      const res = (await chrome.runtime.sendMessage({ type: 'START_CAPTURE' })) as {
        ok: boolean;
        error?: string;
      };
      if (res?.ok) {
        // Close the popup so the overlay is unobstructed; the rest of
        // the flow lives in the content script.
        window.close();
      } else {
        setCaptureMsg(res?.error ?? 'Capture failed to start.');
      }
    } catch (e) {
      setCaptureMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setCaptureBusy(false);
    }
  };

  if (!ready) return <div className="popup"><div className="empty">…</div></div>;

  return (
    <div className="popup">
      <div className="head">
        <strong>{t('popupTitle')}</strong>
        <button className="link" onClick={() => chrome.runtime.openOptionsPage()}>
          {t('settingsLink')}
        </button>
      </div>

      <div className="capture-row">
        <button
          className="capture-btn"
          disabled={captureBusy}
          onClick={() => void startCapture()}
        >
          📸 {captureBusy ? 'Starting…' : 'Screenshot region → nodx'}
        </button>
        {captureMsg && <div className="capture-msg">{captureMsg}</div>}
      </div>

      {records.length === 0 ? (
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
      )}
    </div>
  );
}

render(<App />, document.getElementById('root')!);
