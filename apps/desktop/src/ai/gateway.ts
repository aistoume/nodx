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
 * Bound versions that pull config from env so call sites don't repeat themselves.
 * Re-exports keep the type imports flowing through this single file.
 */
export const ai = {
  async complete<T>(
    opts: Omit<Parameters<typeof complete<T>>[1], never>,
  ): ReturnType<typeof complete<T>> {
    return complete(getGatewayConfig(), opts);
  },

  async completeUntilDone<T>(
    opts: Parameters<typeof completeUntilDone<T>>[1],
  ): ReturnType<typeof completeUntilDone<T>> {
    return completeUntilDone(getGatewayConfig(), opts);
  },

  async completeText(
    opts: Parameters<typeof completeText>[1],
  ): ReturnType<typeof completeText> {
    return completeText(getGatewayConfig(), opts);
  },

  async completeTextUntilDone(
    opts: Parameters<typeof completeTextUntilDone>[1],
  ): ReturnType<typeof completeTextUntilDone> {
    return completeTextUntilDone(getGatewayConfig(), opts);
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
