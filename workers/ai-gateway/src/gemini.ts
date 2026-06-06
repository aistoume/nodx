/**
 * Thin wrapper over Google's Gemini embedding API (AI-Studio key path), kept
 * worker-side so the client never sees the Google key. Used for CBR case
 * indexing (PRD §3.16). Returns 768-dim MRL embeddings.
 */

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta';

/**
 * Real Google model id behind the PRD's "Gemini Embedding 2" shorthand. The
 * client may send `gemini-embedding-2`; we always call this concrete model.
 * (One-line change here if Google renames it.)
 */
export const GEMINI_EMBED_MODEL = 'gemini-embedding-001';

/** MRL output dimensionality — matches `EMBEDDING_DIM` in @nodx/models. */
export const EMBED_DIM = 768;

export interface GeminiEmbedParams {
  apiKey: string;
  texts: string[];
}

export interface GeminiEmbedResponse {
  embeddings: number[][];
  model: string;
}

export class GeminiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly upstreamBody: string,
  ) {
    super(message);
    this.name = 'GeminiError';
  }
}

interface BatchEmbedBody {
  embeddings?: Array<{ values?: number[] }>;
}

/**
 * Batch-embed texts in a single call (`:batchEmbedContents`), preserving
 * input order. Each request pins `outputDimensionality` to 768 so vectors are
 * MRL-truncated consistently.
 */
export async function callGeminiEmbed(
  params: GeminiEmbedParams,
): Promise<GeminiEmbedResponse> {
  const url = `${GEMINI_BASE}/models/${GEMINI_EMBED_MODEL}:batchEmbedContents?key=${params.apiKey}`;
  const body = {
    requests: params.texts.map((text) => ({
      model: `models/${GEMINI_EMBED_MODEL}`,
      content: { parts: [{ text }] },
      outputDimensionality: EMBED_DIM,
    })),
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    throw new GeminiError(
      res.status,
      `gemini ${res.status} ${res.statusText}`,
      await res.text(),
    );
  }

  const payload = (await res.json()) as BatchEmbedBody;
  const embeddings = (payload.embeddings ?? []).map((e) => e.values ?? []);
  if (embeddings.length !== params.texts.length) {
    throw new GeminiError(
      502,
      `gemini returned ${embeddings.length} embeddings for ${params.texts.length} texts`,
      JSON.stringify(payload).slice(0, 400),
    );
  }
  for (const v of embeddings) {
    if (v.length !== EMBED_DIM) {
      throw new GeminiError(
        502,
        `gemini returned a ${v.length}-dim vector, expected ${EMBED_DIM}`,
        '',
      );
    }
  }

  return { embeddings, model: GEMINI_EMBED_MODEL };
}
