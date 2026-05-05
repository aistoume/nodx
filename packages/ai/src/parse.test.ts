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

  it('keeps short raw output verbatim in rawSample', () => {
    try {
      extractJsonObject('Sorry, I cannot help.');
      throw new Error('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(JsonExtractionError);
      expect((err as JsonExtractionError).rawSample).toBe(
        'Sorry, I cannot help.',
      );
    }
  });

  it('shows head + tail of long raw output in rawSample', () => {
    const long = 'A'.repeat(500) + 'B'.repeat(500);
    try {
      extractJsonObject(long);
      throw new Error('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(JsonExtractionError);
      const sample = (err as JsonExtractionError).rawSample;
      expect(sample).toContain('AAA');
      expect(sample).toContain('BBB');
      expect(sample).toContain('truncated');
      // Sized roughly 300 head + marker + 100 tail.
      expect(sample.length).toBeLessThan(500);
    }
  });
});
