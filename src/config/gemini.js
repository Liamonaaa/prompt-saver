const DEFAULT_MODEL = "gemini-2.5-flash";
const DEFAULT_FALLBACK_MODELS = ["gemini-2.5-flash-lite"];
const DEFAULT_TIMEOUT_MS = 20_000;

function parseList(value) {
  if (!value) {
    return [];
  }

  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

const geminiConfig = {
  defaultModel: (process.env.GEMINI_MODEL || DEFAULT_MODEL).trim(),
  fallbackModels:
    parseList(process.env.GEMINI_FALLBACK_MODELS) || DEFAULT_FALLBACK_MODELS,
  timeoutMs: Number.parseInt(process.env.GEMINI_TIMEOUT_MS || DEFAULT_TIMEOUT_MS, 10),
  useMockProvider: process.env.PROMPT_SAVER_USE_MOCK === "true",
};

if (!geminiConfig.fallbackModels.length) {
  geminiConfig.fallbackModels = [...DEFAULT_FALLBACK_MODELS];
}

function getModelCandidates() {
  return [geminiConfig.defaultModel, ...geminiConfig.fallbackModels].filter(
    (model, index, list) => model && list.indexOf(model) === index,
  );
}

function supportsThinkingBudget(modelName) {
  return typeof modelName === "string" && modelName.startsWith("gemini-2.5");
}

module.exports = {
  DEFAULT_MODEL,
  DEFAULT_FALLBACK_MODELS,
  geminiConfig,
  getModelCandidates,
  supportsThinkingBudget,
};
