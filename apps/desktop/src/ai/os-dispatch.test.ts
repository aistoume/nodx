import { describe, expect, it } from 'vitest';
import { parseDirective, type OsGrounding } from './os-dispatch.js';

const G: OsGrounding = {
  apps: [{ name: 'WeChat', bundleId: 'com.tencent.xinWeChat', pid: 1, frontmost: false }],
  shortcuts: ['Nodx sS', 'Open URLs'],
};

describe('parseDirective', () => {
  it('parses a whole-reply open_url directive', () => {
    const d = parseDirective(
      '{"action":"open_url","url":"https://www.amazon.com/s?k=aloe","note":"已打开 Amazon"}',
      G,
    );
    expect(d).toEqual({ action: 'open_url', url: 'https://www.amazon.com/s?k=aloe', note: '已打开 Amazon' });
  });

  it('parses a fenced directive', () => {
    const d = parseDirective(
      '```json\n{"action":"open_app","app":"com.tencent.xinWeChat","note":"切到微信"}\n```',
      G,
    );
    expect(d?.action).toBe('open_app');
  });

  it('parses a directive embedded in prose', () => {
    const d = parseDirective(
      'Sure — {"action":"run_shortcut","name":"Nodx sS","note":"跑截图"} done.',
      G,
    );
    expect(d).toMatchObject({ action: 'run_shortcut', name: 'Nodx sS' });
  });

  it('rejects non-http url schemes', () => {
    expect(
      parseDirective('{"action":"open_url","url":"file:///etc/passwd","note":"x"}', G),
    ).toBeNull();
  });

  it('rejects shortcut names not in the inventory (anti-hallucination)', () => {
    expect(
      parseDirective('{"action":"run_shortcut","name":"Delete Everything","note":"x"}', G),
    ).toBeNull();
  });

  it('returns null for a plain text answer', () => {
    expect(parseDirective('这段话的意思是……', G)).toBeNull();
  });
});
