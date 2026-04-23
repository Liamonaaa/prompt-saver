function estimateTokens(text) {
  const cleaned = typeof text === "string" ? text.trim() : "";

  if (!cleaned) {
    return 0;
  }

  return Math.max(1, Math.round(cleaned.length / 4));
}

function buildReductionEstimate(originalPrompt, optimizedPrompt) {
  const estimatedOriginalTokens = estimateTokens(originalPrompt);
  const estimatedOptimizedTokens = estimateTokens(optimizedPrompt);
  const estimatedReductionPercent =
    estimatedOriginalTokens > 0
      ? Math.max(
          0,
          Math.round(
            ((estimatedOriginalTokens - estimatedOptimizedTokens) / estimatedOriginalTokens) * 100,
          ),
        )
      : 0;

  return {
    estimatedOriginalTokens,
    estimatedOptimizedTokens,
    estimatedReductionPercent,
  };
}

module.exports = {
  buildReductionEstimate,
  estimateTokens,
};
