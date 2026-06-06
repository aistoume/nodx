import { z } from 'zod';
import { PersonaRoleSchema } from '@nodx/models';
import { MODELS, type ModelId } from '../../models.js';

export const RECOMMEND_PANEL_PROMPT_VERSION = '2026-06-02.v1';
export const RECOMMEND_PANEL_PROMPT_MODEL: ModelId = MODELS.sonnet;

export interface RecommendPanelInput {
  /** Output of the domain-detect step. */
  domain: string;
  /** The direction question the panel will debate. */
  question: string;
  /** Parent / prior context; empty string when none. */
  context: string;
}

/**
 * One proposed panel member. The recommender invents a persona on the
 * fly (no persona-library seed yet — see plan); the desktop layer
 * assigns ids + a placeholder `personaTemplateId` when turning these
 * into `ExpertAgent`s.
 */
export const ProposedAgentSchema = z
  .object({
    displayName: z.string().min(1),
    role: PersonaRoleSchema,
    systemPrompt: z.string().min(1),
  })
  .strict();
export type ProposedAgent = z.infer<typeof ProposedAgentSchema>;

/**
 * Panel composition (PRD §3.14): 3–5 complementary experts, and the
 * `.refine` guards the two hard rules the protocol cares about —
 * the size band and the mandatory devil's-advocate (`critic`) that
 * keeps the panel out of an echo chamber.
 */
export const RecommendPanelOutputSchema = z
  .object({
    members: z
      .array(ProposedAgentSchema)
      .min(3, '专家组至少 3 人')
      .max(5, '专家组至多 5 人')
      .refine(
        (members) => members.some((m) => m.role === 'critic'),
        { message: '专家组必须包含至少一位魔鬼代言人（critic）' },
      ),
  })
  .strict();
export type RecommendPanelOutput = z.infer<typeof RecommendPanelOutputSchema>;

/**
 * Panel-recommender — Sonnet, because composing a balanced, non-redundant
 * persona stack with bespoke system prompts is real reasoning, not
 * classification. The five roles map to PRD §3.14's colour-coded slots:
 *   proposer (🔵正方主推) · critic (🔴魔鬼代言人, 必备) ·
 *   practitioner (🟢实操经验) · constraint (🟡外部约束) ·
 *   user_proxy (🟣用户自带, 本轮不主动生成)
 */
export function buildRecommendPanelPrompt(input: RecommendPanelInput): string {
  return `你是 AI 专家组的组建者。针对一个决策方向，提议 3–5 位**视角互补**的 AI 专家，组成一个结构化辩论小组。

领域：${input.domain}
决策方向：${input.question}
背景上下文：${input.context || '（无上下文）'}

角色（role）只能从以下取值，且必须覆盖互补视角、**至少包含一位 critic（魔鬼代言人，防止观点同源）**：
- "proposer"     正方主推：带分析框架给出方案
- "critic"       魔鬼代言人（必备）：专门挑漏洞、反驳、压力测试
- "practitioner" 实操经验：「我做过这事，告诉你坑在哪」
- "constraint"   外部约束：法务 / 监管 / 财务 / 合规规则
- "user_proxy"   用户自带视角（一般不用，除非方向明显需要某个具体相关方）

每位专家给一个 systemPrompt：用第二人称写，定义这位专家的身份、专长、思维框架、说话风格，
让他在辩论中稳定地扮演这个角色。systemPrompt 要具体（点名框架/方法论），不要空泛。

只输出 JSON：
{
  "members": [
    {
      "displayName": "<专家名/称谓>",
      "role": "proposer" | "critic" | "practitioner" | "constraint" | "user_proxy",
      "systemPrompt": "<该专家的人格设定，第二人称>"
    }
  ]
}`;
}
