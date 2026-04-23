const { groqConfig } = require("../../config/groq");
const { AppError } = require("../../lib/app-error");
const { SYSTEM_INSTRUCTION, buildCompressionContents, parseCompressionResponse } = require("../../prompts/compression-prompt");

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";

const JSON_SCHEMA_INSTRUCTION = `
Return your response as a JSON object with exactly these fields:
- optimizedPrompt: string — the compressed, directly usable prompt
- preservedConstraints: array of strings — critical constraints that were kept
- compressedOrMerged: array of strings — what was tightened or combined
- intentionallyDropped: array of strings — what was safely removed (empty array if nothing meaningful was dropped)
`.trim();

function getApiKey() {
  if (!process.env.GROQ_API_KEY) {
    throw new AppError(
      500,
      "missing_api_key",
      "Missing GROQ_API_KEY. Add your Groq API key before using Prompt Saver.",
    );
  }
  return process.env.GROQ_API_KEY;
}

function normalizeGroqError(status, payload) {
  const message = (payload?.error?.message || "").toLowerCase();

  if (status === 401) {
    return new AppError(401, "invalid_api_key", "Groq rejected the API key. Check GROQ_API_KEY.");
  }

  if (status === 429 || message.includes("rate limit") || message.includes("quota")) {
    const retryMatch = (payload?.error?.message || "").match(/retry after (\d+)/i);
    const hint = retryMatch ? ` Retry in ${retryMatch[1]} seconds.` : " Wait a moment and try again.";
    return new AppError(429, "rate_limited", `Groq is rate limiting this request.${hint}`);
  }

  if (status === 503 || message.includes("overloaded") || message.includes("unavailable")) {
    return new AppError(503, "model_unavailable", "Groq is temporarily unavailable. Try again in a moment.");
  }

  return new AppError(502, "groq_error", payload?.error?.message || "Groq returned an unexpected error. Try again in a moment.");
}

async function compress({ prompt, mode, analysisSummary, reviewHint }) {
  const apiKey = getApiKey();
  const userContent = buildCompressionContents(prompt, mode, analysisSummary, reviewHint);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), groqConfig.timeoutMs);

  let response;
  try {
    response = await fetch(GROQ_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: groqConfig.model,
        messages: [
          { role: "system", content: `${SYSTEM_INSTRUCTION}\n\n${JSON_SCHEMA_INSTRUCTION}` },
          { role: "user", content: userContent },
        ],
        response_format: { type: "json_object" },
        temperature: 0.15,
        max_tokens: 16384,
      }),
      signal: controller.signal,
    });
  } catch (error) {
    if (error.name === "AbortError") {
      throw new AppError(504, "request_timeout", "Groq took too long to respond. Try a shorter prompt or retry.");
    }
    throw new AppError(502, "groq_error", "Failed to reach Groq API. Check your network and try again.");
  } finally {
    clearTimeout(timer);
  }

  const payload = await response.json();

  if (!response.ok) {
    throw normalizeGroqError(response.status, payload);
  }

  const rawText = payload?.choices?.[0]?.message?.content || "";
  const fakeResponse = { parsed: null, text: rawText };
  return {
    ...parseCompressionResponse(fakeResponse),
    selectedModel: groqConfig.model,
    usedFallbackModel: false,
  };
}

module.exports = { compress };
