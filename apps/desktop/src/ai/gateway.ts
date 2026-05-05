import {
  complete,
  completeText,
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
 * Bound versions that pull config from env so call sites don't repeat themselves.
 * Re-exports keep the type imports flowing through this single file.
 */
export const ai = {
  async complete<T>(
    opts: Omit<Parameters<typeof complete<T>>[1], never>,
  ): ReturnType<typeof complete<T>> {
    return complete(getGatewayConfig(), opts);
  },

  async completeText(
    opts: Parameters<typeof completeText>[1],
  ): ReturnType<typeof completeText> {
    return completeText(getGatewayConfig(), opts);
  },

  async ping(): Promise<boolean> {
    if (!isAiConfigured()) return false;
    return pingGateway(getGatewayConfig());
  },
};
