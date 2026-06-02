import { describe, expect, it } from 'vitest';
import type { ExpertAgent } from './expert-agent.js';
import type { LocalMaximumResult } from './local-maximum.js';
import {
  ExpertPanelSchema,
  ExpertPanelStatusSchema,
  type ExpertPanel,
} from './expert-panel.js';

const agent: ExpertAgent = {
  id: 'agent_anna',
  personaTemplateId: 'tpl_anna',
  displayName: 'Anna · M&A 律师',
  role: 'critic',
  systemPrompt: '你是资深 M&A 律师 ...',
};

const validPanel: ExpertPanel = {
  id: 'panel_1',
  topicId: 'topic_1',
  domain: 'm&a',
  members: [agent],
  status: 'forming',
  rounds: [],
  createdAt: 1_700_000_000_000,
  updatedAt: 1_700_000_001_000,
};

describe('ExpertPanelStatusSchema', () => {
  it('accepts the four documented statuses', () => {
    for (const s of [
      'forming',
      'debating',
      'converged',
      'rejected_by_user',
    ] as const) {
      expect(ExpertPanelStatusSchema.parse(s)).toBe(s);
    }
  });

  it('rejects an unknown status', () => {
    expect(() => ExpertPanelStatusSchema.parse('live')).toThrow();
  });
});

describe('ExpertPanelSchema', () => {
  it('accepts a freshly-formed panel', () => {
    expect(ExpertPanelSchema.parse(validPanel)).toEqual(validPanel);
  });

  it('rejects an empty members array', () => {
    expect(() =>
      ExpertPanelSchema.parse({ ...validPanel, members: [] }),
    ).toThrow();
  });

  it('rejects missing topicId', () => {
    const { topicId: _drop, ...rest } = validPanel;
    expect(() => ExpertPanelSchema.parse(rest)).toThrow();
  });

  it('rejects empty domain', () => {
    expect(() =>
      ExpertPanelSchema.parse({ ...validPanel, domain: '' }),
    ).toThrow();
  });

  it('rejects an unknown status', () => {
    expect(() =>
      ExpertPanelSchema.parse({ ...validPanel, status: 'live' }),
    ).toThrow();
  });

  it('accepts a converged panel with localMaximum', () => {
    const local: LocalMaximumResult = {
      consensus: ['A 比 B 好'],
      divergence: [],
      openQuestions: [],
      bestAnswer: '采用方案 A',
      confidence: 0.9,
      acceptedByUser: true,
      acceptedAt: 1_700_000_002_000,
    };
    const converged: ExpertPanel = {
      ...validPanel,
      status: 'converged',
      localMaximum: local,
    };
    expect(ExpertPanelSchema.parse(converged)).toEqual(converged);
  });

  it('rejects a malformed nested localMaximum (confidence > 1)', () => {
    const bad = {
      ...validPanel,
      status: 'converged' as const,
      localMaximum: {
        consensus: [],
        divergence: [],
        openQuestions: [],
        bestAnswer: '...',
        confidence: 1.5,
        acceptedByUser: false,
      },
    };
    expect(() => ExpertPanelSchema.parse(bad)).toThrow();
  });

  it('rejects unknown extra fields (strict)', () => {
    expect(() =>
      ExpertPanelSchema.parse({ ...validPanel, scratchpad: 'x' }),
    ).toThrow();
  });
});
