const { geminiConfig } = require("../config/gemini");
const { buildReductionEstimate } = require("../lib/metrics");
const {
  analyzePrompt,
  buildAnalysisSummary,
  buildQualityReport,
  buildReviewHint,
  reviewCompressionResult,
} = require("./compression-analyzer");
const geminiProvider = require("./providers/gemini-provider");
const groqProvider = require("./providers/groq-provider");
const mockProvider = require("./providers/mock-provider");

async function compressPrompt({ prompt, mode }) {
  let provider;
  if (geminiConfig.useMockProvider) {
    provider = mockProvider;
  } else if (process.env.GROQ_API_KEY) {
    provider = groqProvider;
  } else {
    provider = geminiProvider;
  }
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
};
