/**
 * Helpers that turn a raw text response from Claude into a typed object.
 *
 * The model is asked (per prompt) to emit a JSON object as its only output.
 * Reality: it sometimes wraps the JSON in a ```json ... ``` fence or prefixes
 * with prose. These helpers tolerate that without resorting to LLM round-trips.
 */

export class JsonExtractionError extends Error {
  constructor(message: string, public readonly rawSample: string) {
    // Embed the sample in the message so anything that only logs `.message`
    // (e.g. UI error banners) still has the diagnostic context.
    super(`${message}\n--- model output (first 200 chars) ---\n${rawSample}`);
    this.name = 'JsonExtractionError';
  }
}

/**
 * Pull a JSON object out of a possibly-decorated string. Strategy:
 *   1. Trim and check if the whole thing is already a JSON object.
 *   2. Strip a leading ```json … ``` fence if present.
 *   3. Otherwise locate the first `{` and matching last `}` and try that span.
 *
 * Throws JsonExtractionError on failure with a 200-char sample for debugging.
 */
export function extractJsonObject(raw: string): unknown {
  const trimmed = raw.trim();

  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    return tryParse(trimmed, raw);
  }

  const fenced = stripJsonFence(trimmed);
  if (fenced != null) {
    return tryParse(fenced, raw);
  }

  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start < 0 || end <= start) {
    throw new JsonExtractionError(
      'no JSON object found in model output',
      sample(raw),
    );
  }
  return tryParse(trimmed.slice(start, end + 1), raw);
}

function stripJsonFence(s: string): string | null {
  // ```json\n{…}\n``` or ```\n{…}\n```
  const fenceStart = /^```(?:json)?\s*\n/;
  const fenceEnd = /\n```$/;
  if (!fenceStart.test(s) || !fenceEnd.test(s)) return null;
  return s.replace(fenceStart, '').replace(fenceEnd, '').trim();
}

function tryParse(slice: string, original: string): unknown {
  try {
    return JSON.parse(slice);
  } catch (err) {
    throw new JsonExtractionError(
      `JSON.parse failed: ${err instanceof Error ? err.message : String(err)}`,
      sample(original),
    );
  }
}

function sample(s: string): string {
  return s.length > 200 ? s.slice(0, 200) + '…' : s;
}
