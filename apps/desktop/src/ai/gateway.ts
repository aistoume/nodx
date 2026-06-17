import {
  complete,
  completeUntilDone,
  completeText,
  completeTextUntilDone,
  embed,
  pingGateway,
  type GatewayConfig,
} from '@nodx/ai';

const ENDPOINT = import.meta.env.VITE_AI_GATEWAY_URL ?? 'http://localhost:8787';
const TOKEN = import.meta.env.VITE_AI_CLIENT_TOKEN ?? '';

let cachedConfig: GatewayConfig | null = null;

export class AiNotConfiguredError extends Error {
  constructor() {
    super(
      'AI 网关未配置。请把 apps/desktop/.env.example 复制为 .env.local 并填入 VITE_AI_CLIENT_TOKEN（与 worker 的 .dev.vars CLIENT_TOKEN 一致）。',
    );
    this.name = 'AiNotConfiguredError';
  }
}

export function getGatewayConfig(): GatewayConfig {
  if (!cachedConfig) {
    if (!TOKEN) throw new AiNotConfiguredError();
    cachedConfig = { endpoint: ENDPOINT, clientToken: TOKEN };
  }
  return cachedConfig;
}

export function isAiConfigured(): boolean {
  return !!TOKEN;
}

/**
 * Usage tap — every completion through `ai.*` reports (modelId, token usage)
 * to registered listeners. The auto-recursion budget meter (PRD §3.19)
 * subscribes for the duration of a run to accumulate real spend. Attribution
 * assumes other AI surfaces stay quiet while a run is active (V1-acceptable:
 * the run modal blocks the surface that drives it).
 */
export type AiUsageListener = (
  model: string,
  usage: { inputTokens: number; outputTokens: number },
) => void;

const usageListeners = new Set<AiUsageListener>();

/** Subscribe to all gateway token usage. Returns an unsubscribe function. */
export function onAiUsage(listener: AiUsageListener): () => void {
  usageListeners.add(listener);
  return () => {
    usageListeners.delete(listener);
  };
}

function emitUsage(
  model: string,
  usage: { inputTokens: number; outputTokens: number },
): void {
  for (const l of usageListeners) {
    try {
      l(model, usage);
    } catch {
      // a broken listener must never break the AI call path
    }
  }
}

/**
 * Bound versions that pull config from env so call sites don't repeat themselves.
 * Re-exports keep the type imports flowing through this single file.
 */
export const ai = {
  async complete<T>(
    opts: Omit<Parameters<typeof complete<T>>[1], never>,
  ): ReturnType<typeof complete<T>> {
    const r = await complete(getGatewayConfig(), opts);
    emitUsage(opts.model, r.usage);
    return r;
  },

  async completeUntilDone<T>(
    opts: Parameters<typeof completeUntilDone<T>>[1],
  ): ReturnType<typeof completeUntilDone<T>> {
    const r = await completeUntilDone(getGatewayConfig(), opts);
    emitUsage(opts.model, r.usage);
    return r;
  },

  async completeText(
    opts: Parameters<typeof completeText>[1],
  ): ReturnType<typeof completeText> {
    const r = await completeText(getGatewayConfig(), opts);
    emitUsage(opts.model, r.usage);
    return r;
  },

  async completeTextUntilDone(
    opts: Parameters<typeof completeTextUntilDone>[1],
  ): ReturnType<typeof completeTextUntilDone> {
    const r = await completeTextUntilDone(getGatewayConfig(), opts);
    emitUsage(opts.model, r.usage);
    return r;
  },

  async embed(
    opts: Parameters<typeof embed>[1],
  ): ReturnType<typeof embed> {
    return embed(getGatewayConfig(), opts);
  },

  async ping(): Promise<boolean> {
    if (!isAiConfigured()) return false;
    return pingGateway(getGatewayConfig());
  },
};
