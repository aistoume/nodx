import { describe, expect, it, vi } from 'vitest';
import type { ExpertAgent } from '@nodx/models';
import { runPanel, type PanelSteps } from './run-panel.js';
import type { SynthesisInput, SynthesisOutput } from '../prompts/panel/synthesis.js';
import type { PanelJudgeInput } from '../prompts/panel/judge.js';

function agent(name: string, role: ExpertAgent['role']): ExpertAgent {
  return {
    id: `id-${name}`,
    personaTemplateId: `tpl-${name}`,
    displayName: name,
    // The persona carries the name so the fake can echo who is speaking.
    systemPrompt: `persona:${name}`,
    role,
  };
}

const MEMBERS = [
  agent('Alice', 'proposer'),
  agent('Bob', 'critic'),
  agent('Carol', 'practitioner'),
];

function roundOf(userPrompt: string): number {
  if (userPrompt.includes('第 1 轮')) return 1;
  if (userPrompt.includes('第 2 轮')) return 2;
  if (userPrompt.includes('第 3 轮')) return 3;
  return 0;
}

function nameOf(systemPrompt: string): string {
  return systemPrompt.replace('persona:', '');
}

interface Fakes {
  steps: PanelSteps;
  exchangeCalls: Array<{ name: string; round: number; userPrompt: string }>;
  judgeCalls: PanelJudgeInput[];
  synthCalls: SynthesisInput[];
  maxInFlight: number;
}

function makeFakes(marginalScore = 0.5): Fakes {
  const exchangeCalls: Fakes['exchangeCalls'] = [];
  const judgeCalls: PanelJudgeInput[] = [];
  const synthCalls: SynthesisInput[] = [];
  let inFlight = 0;
  let maxInFlight = 0;

  const steps: PanelSteps = {
    async runExchange(systemPrompt, userPrompt) {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((r) => setTimeout(r, 0));
      const name = nameOf(systemPrompt);
      const round = roundOf(userPrompt);
      exchangeCalls.push({ name, round, userPrompt });
      inFlight--;
      return `${name}#${round}`;
    },
    async judgeMarginal(input) {
      judgeCalls.push(input);
      return marginalScore;
    },
    async synthesize(input): Promise<SynthesisOutput> {
      synthCalls.push(input);
      return {
        consensus: ['c1'],
        divergence: [{ point: 'p', conditions: 'cond' }],
        openQuestions: ['oq1'],
        bestAnswer: 'do X',
        confidence: 0.7,
      };
    },
  };

  return {
    steps,
    exchangeCalls,
    judgeCalls,
    synthCalls,
    get maxInFlight() {
      return maxInFlight;
    },
  };
}

describe('runPanel', () => {
  it('runs the canonical 3 + synthesis when maxRounds=3', async () => {
    const f = makeFakes();
    const res = await runPanel(
      { members: MEMBERS, question: 'q', context: 'ctx', maxRounds: 3 },
      f.steps,
    );

    expect(res.rounds.map((r) => r.type)).toEqual([
      'initial',
      'critique',
      'refined',
      'synthesis',
    ]);
    expect(res.rounds.map((r) => r.roundNumber)).toEqual([1, 2, 3, 4]);

    // Each debate round has one exchange per member, in members[] order.
    for (const r of res.rounds.slice(0, 3)) {
      expect(r.exchanges.map((e) => e.agentId)).toEqual([
        'id-Alice',
        'id-Bob',
        'id-Carol',
      ]);
    }
    // Synthesis round carries no member exchanges.
    expect(res.rounds[3]!.exchanges).toEqual([]);

    expect(f.synthCalls).toHaveLength(1);
    expect(res.localMaximum.bestAnswer).toBe('do X');
    expect(res.localMaximum.acceptedByUser).toBe(false);
  });

  it('runs members in parallel within a round', async () => {
    const f = makeFakes();
    await runPanel(
      { members: MEMBERS, question: 'q', context: '', maxRounds: 3 },
      f.steps,
    );
    // 3 members all in flight at once.
    expect(f.maxInFlight).toBe(3);
  });

  it('threads peer utterances into later rounds', async () => {
    const f = makeFakes();
    await runPanel(
      { members: MEMBERS, question: 'q', context: '', maxRounds: 3 },
      f.steps,
    );

    // Round 1 is closed-book: Alice's R1 prompt must not mention Bob.
    const aliceR1 = f.exchangeCalls.find(
      (c) => c.name === 'Alice' && c.round === 1,
    )!;
    expect(aliceR1.userPrompt).not.toContain('Bob');

    // Round 2 critique: Alice sees Bob's & Carol's R1 outputs.
    const aliceR2 = f.exchangeCalls.find(
      (c) => c.name === 'Alice' && c.round === 2,
    )!;
    expect(aliceR2.userPrompt).toContain('Bob#1');
    expect(aliceR2.userPrompt).toContain('Carol#1');

    // Round 3 refine: Alice sees peers' R2 critiques + her own history.
    const aliceR3 = f.exchangeCalls.find(
      (c) => c.name === 'Alice' && c.round === 3,
    )!;
    expect(aliceR3.userPrompt).toContain('Bob#2');
    expect(aliceR3.userPrompt).toContain('Alice#1');
  });

  it('calls the convergence judge from round 2 onward (N>=2)', async () => {
    const f = makeFakes();
    await runPanel(
      { members: MEMBERS, question: 'q', context: '', maxRounds: 3 },
      f.steps,
    );
    // Judged after round 2 and round 3 → twice.
    expect(f.judgeCalls).toHaveLength(2);
  });

  it('caps the debate at maxRounds and flags max_rounds (high score)', async () => {
    const f = makeFakes(0.9); // always improving → never marginal_decay
    const res = await runPanel(
      { members: MEMBERS, question: 'q', context: '', maxRounds: 5 },
      f.steps,
    );
    const debate = res.rounds.filter((r) => r.type !== 'synthesis');
    // initial, critique, then 3 refined rounds = 5 debate rounds.
    expect(debate.map((r) => r.roundNumber)).toEqual([1, 2, 3, 4, 5]);
    expect(debate.filter((r) => r.type === 'refined')).toHaveLength(3);
    // The final debate round hit the cap.
    expect(debate[4]!.stopSignalsHit).toContain('max_rounds');
    // Synthesis numbered after the last debate round.
    expect(res.rounds.at(-1)!.roundNumber).toBe(6);
  });

  it('stops early at 3 when the judge score decays, even with a high cap', async () => {
    const f = makeFakes(0.05); // below MARGINAL_THRESHOLD
    const res = await runPanel(
      { members: MEMBERS, question: 'q', context: '', maxRounds: 8 },
      f.steps,
    );
    // Cap is 8 but the debate converges at the canonical 3.
    expect(res.rounds.map((r) => r.type)).toEqual([
      'initial',
      'critique',
      'refined',
      'synthesis',
    ]);
    const refined = res.rounds.find((r) => r.type === 'refined')!;
    expect(refined.stopSignalsHit).toContain('marginal_decay');
    // Judge only ran for R2 + R3 (no extension rounds).
    expect(f.judgeCalls).toHaveLength(2);
  });

  it('clamps maxRounds below the canonical 3 up to 3', async () => {
    const f = makeFakes(0.9);
    const res = await runPanel(
      { members: MEMBERS, question: 'q', context: '', maxRounds: 1 },
      f.steps,
    );
    // Still runs the full canonical debate.
    expect(res.rounds.filter((r) => r.type !== 'synthesis')).toHaveLength(3);
  });

  it('fires callbacks in order: roundStart → exchange(s) → roundComplete', async () => {
    const f = makeFakes();
    const events: string[] = [];
    await runPanel(
      { members: MEMBERS, question: 'q', context: '', maxRounds: 3 },
      f.steps,
      {
        onRoundStart: (r) => {
          events.push(`start:${r.type}`);
        },
        onExchange: (roundId, ex) => {
          events.push(`ex:${ex.agentId}`);
        },
        onRoundComplete: (r) => {
          events.push(`done:${r.type}`);
        },
      },
    );

    // First round: start precedes its exchanges, which precede done.
    expect(events[0]).toBe('start:initial');
    const firstDone = events.indexOf('done:initial');
    const firstStart = events.indexOf('start:initial');
    const exBetween = events
      .slice(firstStart + 1, firstDone)
      .every((e) => e.startsWith('ex:'));
    expect(exBetween).toBe(true);
    // Synthesis round emits start + done, no member exchanges.
    expect(events).toContain('start:synthesis');
    expect(events).toContain('done:synthesis');
  });
});
