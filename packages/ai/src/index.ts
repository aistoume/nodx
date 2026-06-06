export * from './models.js';

export {
  complete,
  completeUntilDone,
  completeText,
  completeTextUntilDone,
  embed,
  pingGateway,
  GatewayError,
  type GatewayConfig,
  type CompleteOptions,
  type CompleteResult,
  type CompleteUntilDoneOptions,
  type CompleteTextOptions,
  type CompleteTextResult,
  type CompleteTextUntilDoneOptions,
  type EmbedOptions,
  type EmbedResult,
} from './client.js';

export { extractJsonObject, JsonExtractionError } from './parse.js';

export {
  SURVEY_PROMPT_VERSION,
  SURVEY_PROMPT_MODEL,
  SurveyFactorSchema,
  SurveyOutputSchema,
  buildSurveyPrompt,
  type SurveyInput,
  type SurveyFactor,
  type SurveyOutput,
} from './prompts/survey.js';

export {
  DECOMPOSE_PROMPT_VERSION,
  DECOMPOSE_PROMPT_MODEL,
  SubQuestionSchema,
  DecomposedFactorSchema,
  DecomposeOutputSchema,
  buildDecomposePrompt,
  type DecomposeInput,
  type SubQuestion,
  type DecomposedFactor,
  type DecomposeOutput,
} from './prompts/decompose.js';

export {
  ATOMIC_CHECK_PROMPT_VERSION,
  ATOMIC_CHECK_PROMPT_MODEL,
  AtomicMissingFieldSchema,
  AtomicCheckOutputSchema,
  buildAtomicCheckPrompt,
  type AtomicCheckInput,
  type AtomicMissingField,
  type AtomicCheckOutput,
} from './prompts/atomic-check.js';

export {
  EXPLAIN_PROMPT_VERSION,
  EXPLAIN_PROMPT_MODEL,
  ExplainOutputSchema,
  buildExplainPrompt,
  type ExplainInput,
  type ExplainOutput,
} from './prompts/explain.js';

export {
  DOCUMENT_DRAFT_PROMPT_VERSION,
  DOCUMENT_DRAFT_PROMPT_MODEL,
  FOCUSED_DOCUMENT_PROMPT_VERSION,
  FOCUSED_DOCUMENT_PROMPT_MODEL,
  REFINE_SELECTION_PROMPT_VERSION,
  REFINE_SELECTION_PROMPT_MODEL,
  buildDocumentDraftPrompt,
  buildFocusedDocumentPrompt,
  buildRefineSelectionPrompt,
  type DocumentDraftInput,
  type FocusedDocumentInput,
  type RefineSelectionInput,
} from './prompts/document.js';

// ── Expert Panel Protocol (PRD §3.14 / §8.9) ──────────────────────────────

export {
  DOMAIN_DETECT_PROMPT_VERSION,
  DOMAIN_DETECT_PROMPT_MODEL,
  DomainDetectOutputSchema,
  buildDomainDetectPrompt,
  type DomainDetectInput,
  type DomainDetectOutput,
} from './prompts/panel/domain-detect.js';

export {
  RECOMMEND_PANEL_PROMPT_VERSION,
  RECOMMEND_PANEL_PROMPT_MODEL,
  ProposedAgentSchema,
  RecommendPanelOutputSchema,
  buildRecommendPanelPrompt,
  type RecommendPanelInput,
  type ProposedAgent,
  type RecommendPanelOutput,
} from './prompts/panel/recommend.js';

export {
  PANEL_ROUND_PROMPT_VERSION,
  PANEL_ROUND_PROMPT_MODEL,
  buildInitialPrompt,
  buildCritiquePrompt,
  buildRefinePrompt,
  type PeerUtterance,
  type InitialRoundInput,
  type CritiqueRoundInput,
  type RefineRoundInput,
} from './prompts/panel/round.js';

export {
  SYNTHESIS_PROMPT_VERSION,
  SYNTHESIS_PROMPT_MODEL,
  SynthesisOutputSchema,
  buildSynthesisPrompt,
  type SynthesisInput,
  type SynthesisOutput,
  type TranscriptEntry,
} from './prompts/panel/synthesis.js';

export {
  PANEL_JUDGE_PROMPT_VERSION,
  PANEL_JUDGE_PROMPT_MODEL,
  MARGINAL_THRESHOLD,
  PanelJudgeOutputSchema,
  buildPanelJudgePrompt,
  type PanelJudgeInput,
  type PanelJudgeOutput,
} from './prompts/panel/judge.js';

export {
  runPanel,
  DEFAULT_MAX_ROUNDS,
  MAX_DEBATE_ROUNDS,
  type PanelSteps,
  type PanelCallbacks,
  type RunPanelInput,
  type RunPanelResult,
} from './panel/run-panel.js';

// ── CBR pipeline (PRD §3.16 / §3.18) ──────────────────────────────────────

export {
  ABSTRACTOR_PROMPT_VERSION,
  ABSTRACTOR_PROMPT_MODEL,
  AbstractorOutputSchema,
  buildAbstractorPrompt,
  type AbstractorInput,
  type AbstractorOutput,
} from './cbr/abstractor.js';

export {
  RELATION_FINDER_PROMPT_VERSION,
  RELATION_FINDER_PROMPT_MODEL,
  FoundRelationSchema,
  RelationFinderOutputSchema,
  buildRelationFinderPrompt,
  type ExistingCaseSummary,
  type RelationFinderInput,
  type FoundRelation,
  type RelationFinderOutput,
} from './cbr/relation-finder.js';

export {
  signatureToText,
  solutionToText,
  embeddingToBase64,
  base64ToEmbedding,
} from './cbr/indexer.js';

export {
  BRAIN_HUB_PROMPT_VERSION,
  BRAIN_HUB_PROMPT_MODEL,
  MAX_SUB_INTENTS,
  BrainHubOutputSchema,
  buildBrainHubPrompt,
  type BrainHubInput,
  type BrainHubOutput,
} from './cbr/brain-hub.js';

export {
  RANKING_WEIGHTS,
  FRESHNESS_TAU_MS,
  cosineSimilarity,
  freshnessDecay,
  rankCases,
  maxSimByCase,
  type RankInputCase,
  type RankedCase,
  type RankOptions,
} from './cbr/ranking.js';

export {
  FUSION_PROMPT_VERSION,
  FUSION_PROMPT_MODEL,
  FusionReportSchema,
  buildFusionPrompt,
  type FusionCandidate,
  type FusionInput,
  type FusionReport,
} from './cbr/fusion.js';

export {
  ADAPTER_PROMPT_VERSION,
  ADAPTER_PROMPT_MODEL,
  AdapterOutputSchema,
  buildAdapterPrompt,
  type AdapterInput,
  type AdapterOutput,
} from './cbr/adapter.js';
