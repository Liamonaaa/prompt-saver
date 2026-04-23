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
const mockProvider = require("./providers/mock-provider");

async function compressPrompt({ prompt, mode }) {
  const provider = geminiConfig.useMockProvider ? mockProvider : geminiProvider;
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

  return {
    ...result,
    qualityReport: buildQualityReport({ mode, result, review }),
    estimatedTokenReduction: buildReductionEstimate(prompt, result.optimizedPrompt),
  };
}

module.exports = {
  compressPrompt,
};
