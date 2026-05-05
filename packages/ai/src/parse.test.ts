import { describe, expect, it } from 'vitest';
import { JsonExtractionError, extractJsonObject } from './parse.js';

describe('extractJsonObject', () => {
  it('parses bare JSON object', () => {
    expect(extractJsonObject('{"a": 1, "b": "x"}')).toEqual({ a: 1, b: 'x' });
  });

  it('tolerates surrounding whitespace and newlines', () => {
    expect(extractJsonObject('\n\n  {"ok": true}\n')).toEqual({ ok: true });
  });

  it('strips ```json … ``` fence', () => {
    const wrapped = '```json\n{"factors": []}\n```';
    expect(extractJsonObject(wrapped)).toEqual({ factors: [] });
  });

  it('strips bare ``` … ``` fence', () => {
    const wrapped = '```\n{"k": 1}\n```';
    expect(extractJsonObject(wrapped)).toEqual({ k: 1 });
  });

  it('extracts JSON when prefixed with prose', () => {
    const decorated =
      'Sure, here is the JSON you asked for:\n{"answer": 42}\n— done.';
    expect(extractJsonObject(decorated)).toEqual({ answer: 42 });
  });

  it('handles nested objects in prose', () => {
    const decorated = 'Result: {"outer": {"inner": [1, 2, 3]}}';
    expect(extractJsonObject(decorated)).toEqual({
      outer: { inner: [1, 2, 3] },
    });
  });

  it('throws JsonExtractionError on no-JSON input', () => {
    expect(() => extractJsonObject('Sorry, I cannot help.')).toThrowError(
      JsonExtractionError,
    );
  });

  it('throws JsonExtractionError on malformed JSON', () => {
    expect(() => extractJsonObject('{"a": 1,}')).toThrowError(
      JsonExtractionError,
    );
  });

  it('truncates the rawSample to ~200 chars', () => {
    const long = 'x'.repeat(500);
    try {
      extractJsonObject(long);
      throw new Error('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(JsonExtractionError);
      expect((err as JsonExtractionError).rawSample.length).toBeLessThanOrEqual(
        201,
      );
    }
  });
});
