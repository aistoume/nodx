/**
 * Model catalog shared by the options page and the side panel's quick
 * switcher. Lists refreshed 2026-07-11 — explain = fast/cheap tier,
 * deepen = quality tier.
 */

import type { Provider } from './settings.js';

export const MODELS: Record<Provider, { explain: string[]; deepen: string[]; help: string }> = {
  anthropic: {
    explain: ['claude-haiku-4-5'],
    deepen: ['claude-sonnet-5', 'claude-opus-4-8'],
    help: 'Get an Anthropic key at console.anthropic.com/settings/keys',
  },
  openai: {
    explain: ['gpt-5.6-luna', 'gpt-5.6-terra'],
    deepen: ['gpt-5.6-sol', 'gpt-5.6-terra'],
    help: 'Get an OpenAI key at platform.openai.com/api-keys',
  },
  google: {
    explain: ['gemini-3.5-flash', 'gemini-3.1-flash-lite'],
    deepen: ['gemini-3-pro', 'gemini-3.5-flash'],
    help: 'Get a Google AI key at aistudio.google.com/app/apikey — the AI Studio tier is free',
  },
  openrouter: {
    explain: ['openrouter/free', 'google/gemma-4-26b-a4b-it:free', 'google/gemma-4-31b-it:free'],
    deepen: ['openrouter/free', 'google/gemma-4-31b-it:free', 'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free'],
    help: 'FREE — get a key at openrouter.ai/keys. :free models cost nothing (~20 req/min, 200/day); openrouter/free auto-picks a vision-capable free model',
  },
  nodx: {
    explain: ['haiku', 'sonnet'],
    deepen: ['sonnet', 'opus'],
    help: 'No API key — uses your local nodx gateway (127.0.0.1:8787): the desktop app, `pnpm start:cli`, or `pnpm cli-gateway`. If the desktop gateway rejects with 401, paste its client token (VITE_AI_CLIENT_TOKEN) into the API Key field above — otherwise leave it empty.',
  },
};

/** Image-gen models (gemini-2.5-flash-image shuts down 2026-08-17). */
export const IMAGE_GEN_MODELS = ['gemini-3.1-flash-image', 'gemini-3-pro-image'];

/** Short display names for the side panel's compact switcher. */
export const PROVIDER_SHORT: Record<Provider, string> = {
  anthropic: 'Claude',
  openai: 'OpenAI',
  google: 'Gemini',
  openrouter: 'OpenRouter',
  nodx: 'nodx local',
};
