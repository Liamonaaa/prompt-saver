const { geminiConfig } = require("../config/gemini");
const { gemmaConfig } = require("../config/gemma");
const { groqConfig } = require("../config/groq");
const { buildReductionEstimate } = require("../lib/metrics");
const {
  analyzePrompt,
  buildAnalysisSummary,
  buildQualityReport,
  buildReviewHint,
  reviewCompressionResult,
} = require("./compression-analyzer");
const gemmaProvider = require("./providers/gemma-provider");
const geminiProvider = require("./providers/gemini-provider");
const groqProvider = require("./providers/groq-provider");
const mockProvider = require("./providers/mock-provider");

function getConfiguredProviderName() {
  if (geminiConfig.useMockProvider) {
    return "mock";
  }

  const configured = (process.env.PROMPT_SAVER_PROVIDER || "gemma").trim().toLowerCase();
  return ["gemma", "groq", "gemini"].includes(configured) ? configured : "gemma";
}

function getProviderDetails() {
  const providerName = getConfiguredProviderName();

  if (providerName === "mock") {
    return {
      provider: mockProvider,
      providerName,
      configuredModel: "mock-gemini-provider",
      fallbackModels: [],
    };
  }

  if (providerName === "groq") {
    return {
      provider: groqProvider,
      providerName,
      configuredModel: groqConfig.model,
      fallbackModels: [],
    };
  }

  if (providerName === "gemini") {
    return {
      provider: geminiProvider,
      providerName,
      configuredModel: geminiConfig.defaultModel,
      fallbackModels: geminiConfig.fallbackModels,
    };
  }

  return {
    provider: gemmaProvider,
    providerName: "gemma",
    configuredModel: gemmaConfig.model,
    fallbackModels: [],
  };
}

function getActiveProviderInfo() {
  const { providerName, configuredModel, fallbackModels } = getProviderDetails();
  return { providerName, configuredModel, fallbackModels };
}

async function compressPrompt({ prompt, mode }) {
  const { provider } = getProviderDetails();
  const analysis = analyzePrompt(prompt);
  const analysisSummary = buildAnalysisSummary(analysis);
  let result = await provider.compress({ prompt, mode, analysisSummary });
  let review = reviewCompressionResult(analysis, result);

  if (review.shouldRetry) {
    result = await provider.compress({
      prompt,
      mode,
      analysisSummary,
      reviewHint: buildReviewHint(review),
    });
    review = reviewCompressionResult(analysis, result);
  }

  const qualityReport = result.compressionFailed
    ? { removedRepetition: false, importantNuancePreserved: true, compressionLevel: "None — fallback" }
    : buildQualityReport({ mode, result, review });

  return {
    ...result,
    qualityReport,
    estimatedTokenReduction: buildReductionEstimate(prompt, result.optimizedPrompt),
  };
}

module.exports = {
  compressPrompt,
  getActiveProviderInfo,
};
