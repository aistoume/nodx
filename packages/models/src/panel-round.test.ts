import { describe, expect, it } from 'vitest';
import type { PanelExchange } from './panel-exchange.js';
import {
  MAX_PANEL_ROUNDS,
  PanelRoundNumberSchema,
  PanelRoundSchema,
  PanelRoundTypeSchema,
  PanelStopSignalSchema,
  type PanelRound,
} from './panel-round.js';

const exchange: PanelExchange = {
  id: 'ex_1',
  agentId: 'agent_anna',
  content: '初判 ...',
  createdAt: 1_700_000_000_000,
};

const validRound: PanelRound = {
  id: 'rnd_1',
  roundNumber: 1,
  type: 'initial',
  exchanges: [exchange],
};

describe('PanelRoundTypeSchema', () => {
  it('accepts the four documented types', () => {
    for (const t of [
      'initial',
      'critique',
      'refined',
      'synthesis',
    ] as const) {
      expect(PanelRoundTypeSchema.parse(t)).toBe(t);
    }
  });

  it('rejects an unknown type', () => {
    expect(() => PanelRoundTypeSchema.parse('voting')).toThrow();
  });
});

describe('PanelStopSignalSchema', () => {
  it('accepts the three documented stop signals', () => {
    for (const s of [
      'semantic_convergence',
      'marginal_decay',
      'max_rounds',
    ] as const) {
      expect(PanelStopSignalSchema.parse(s)).toBe(s);
    }
  });

  it('rejects an unknown signal', () => {
    expect(() => PanelStopSignalSchema.parse('user_satisfied')).toThrow();
  });
});

describe('PanelRoundNumberSchema', () => {
  it('accepts 1 through MAX_PANEL_ROUNDS', () => {
    for (const n of [1, 3, 5, 8, MAX_PANEL_ROUNDS]) {
      expect(PanelRoundNumberSchema.parse(n)).toBe(n);
    }
  });

  it('rejects 0, a non-integer, and above the ceiling', () => {
    expect(() => PanelRoundNumberSchema.parse(0)).toThrow();
    expect(() => PanelRoundNumberSchema.parse(2.5)).toThrow();
    expect(() => PanelRoundNumberSchema.parse(MAX_PANEL_ROUNDS + 1)).toThrow();
  });
});

describe('PanelRoundSchema', () => {
  it('accepts a minimal valid round', () => {
    expect(PanelRoundSchema.parse(validRound)).toEqual(validRound);
  });

  it('accepts a converging round with stopSignalsHit', () => {
    const refined: PanelRound = {
      ...validRound,
      id: 'rnd_3',
      roundNumber: 3,
      type: 'refined',
      stopSignalsHit: ['semantic_convergence'],
    };
    expect(PanelRoundSchema.parse(refined)).toEqual(refined);
  });

  it('accepts an empty exchanges array (pre-fill state)', () => {
    expect(
      PanelRoundSchema.parse({ ...validRound, exchanges: [] }),
    ).toEqual({ ...validRound, exchanges: [] });
  });

  it('rejects roundNumber out of [1, MAX_PANEL_ROUNDS]', () => {
    expect(() =>
      PanelRoundSchema.parse({
        ...validRound,
        roundNumber: MAX_PANEL_ROUNDS + 1,
      }),
    ).toThrow();
    expect(() =>
      PanelRoundSchema.parse({ ...validRound, roundNumber: 0 }),
    ).toThrow();
  });

  it('rejects unknown round type', () => {
    expect(() =>
      PanelRoundSchema.parse({ ...validRound, type: 'voting' }),
    ).toThrow();
  });

  it('rejects unknown stop signal', () => {
    expect(() =>
      PanelRoundSchema.parse({
        ...validRound,
        stopSignalsHit: ['bored'],
      }),
    ).toThrow();
  });

  it('rejects missing id', () => {
    const { id: _drop, ...rest } = validRound;
    expect(() => PanelRoundSchema.parse(rest)).toThrow();
  });

  it('rejects unknown extra fields (strict)', () => {
    expect(() =>
      PanelRoundSchema.parse({ ...validRound, scratchpad: 'x' }),
    ).toThrow();
  });
});
