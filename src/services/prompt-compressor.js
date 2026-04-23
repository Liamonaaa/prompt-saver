const { geminiConfig } = require("../config/gemini");
const { buildReductionEstimate } = require("../lib/metrics");
const geminiProvider = require("./providers/gemini-provider");
const mockProvider = require("./providers/mock-provider");

async function compressPrompt({ prompt, mode }) {
  const provider = geminiConfig.useMockProvider ? mockProvider : geminiProvider;
  const result = await provider.compress({ prompt, mode });

  return {
    ...result,
    estimatedTokenReduction: buildReductionEstimate(prompt, result.optimizedPrompt),
  };
}

module.exports = {
  compressPrompt,
};
