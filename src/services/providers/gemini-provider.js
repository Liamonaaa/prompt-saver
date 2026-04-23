const { GoogleGenAI } = require("@google/genai");
const { geminiConfig, getModelCandidates, supportsThinkingBudget } = require("../../config/gemini");
const { AppError } = require("../../lib/app-error");
const { isModelUnavailableError, normalizeGeminiError } = require("../../lib/normalize-gemini-error");
const {
  RESPONSE_SCHEMA,
  SYSTEM_INSTRUCTION,
  buildCompressionContents,
  parseCompressionResponse,
} = require("../../prompts/compression-prompt");

let client;

function getClient() {
  if (!process.env.GEMINI_API_KEY) {
    throw new AppError(
      500,
      "missing_api_key",
      "Missing GEMINI_API_KEY. Add your Gemini Developer API key before using Prompt Saver.",
    );
  }

  if (!client) {
    client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  }

  return client;
}

function buildConfigForModel(modelName) {
  const config = {
    systemInstruction: SYSTEM_INSTRUCTION,
    responseMimeType: "application/json",
    responseSchema: RESPONSE_SCHEMA,
    temperature: 0.15,
    topP: 0.9,
    maxOutputTokens: 4096,
  };

  if (supportsThinkingBudget(modelName)) {
    config.thinkingConfig = { thinkingBudget: 0 };
  }

  return config;
}

async function compress({ prompt, mode, analysisSummary, reviewHint }) {
  const modelsToTry = getModelCandidates();
  const ai = getClient();
  let lastError;

  for (let index = 0; index < modelsToTry.length; index += 1) {
    const modelName = modelsToTry[index];

    try {
      const response = await ai.models.generateContent({
        model: modelName,
        contents: buildCompressionContents(prompt, mode, analysisSummary, reviewHint),
        config: buildConfigForModel(modelName),
        httpOptions: {
          timeout: geminiConfig.timeoutMs,
        },
      });

      return {
        ...parseCompressionResponse(response),
        selectedModel: modelName,
        usedFallbackModel: index > 0,
      };
    } catch (error) {
      lastError = error;

      if (index < modelsToTry.length - 1 && isModelUnavailableError(error)) {
        continue;
      }

      throw normalizeGeminiError(error, modelName);
    }
  }

  throw normalizeGeminiError(lastError, modelsToTry[0]);
}

module.exports = {
  compress,
};
