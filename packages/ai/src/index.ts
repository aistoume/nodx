export * from './models.js';

export {
  complete,
  completeText,
  pingGateway,
  GatewayError,
  type GatewayConfig,
  type CompleteOptions,
  type CompleteResult,
  type CompleteTextOptions,
  type CompleteTextResult,
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
