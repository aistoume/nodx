/**
 * Appended to JSON-output prompts that contain free Chinese prose in string
 * values. LLMs frequently quote a term with half-width double quotes inside a
 * string (e.g. 如"如何量化"而非...), which is an unescaped `"` that breaks
 * JSON.parse. Telling the model to use Chinese quotes 「」 instead avoids the
 * single most common malformed-JSON failure mode.
 */
export const JSON_QUOTE_RULE =
  '\n\n（务必输出严格合法的 JSON：字符串值内部若要强调或引用词语，请用中文引号「」，' +
  '绝不要用半角双引号 "，否则会破坏 JSON 解析。）';
