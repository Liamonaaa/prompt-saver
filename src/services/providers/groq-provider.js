const { groqConfig } = require("../../config/groq");
const { AppError } = require("../../lib/app-error");
const { robustParseJson } = require("../../lib/parse-json");
const {
  SYSTEM_INSTRUCTION,
  buildCompressionContents,
  buildSimpleCompressionContents,
  normalizeList,
} = require("../../prompts/compression-prompt");

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";

const JSON_SCHEMA_INSTRUCTION = `
Return your response as a JSON object with exactly these fields:
- optimizedPrompt: string — the compressed, directly usable prompt
- preservedConstraints: array of strings — critical constraints that were kept
- compressedOrMerged: array of strings — what was tightened or combined
- intentionallyDropped: array of strings — what was safely removed (empty array if nothing dropped)
`.trim();

function getApiKey() {
  if (!process.env.GROQ_API_KEY) {
    throw new AppError(500, "missing_api_key", "Missing GROQ_API_KEY. Add your Groq API key before using Prompt Saver.");
  }
  return process.env.GROQ_API_KEY;
}

function normalizeGroqError(status, payload) {
  const message = (payload?.error?.message || "").toLowerCase();
  const raw = payload?.error?.message || "";

  if (status === 401) {
    return new AppError(401, "invalid_api_key", "Groq rejected the API key. Check GROQ_API_KEY.");
  }

  if (status === 429 || message.includes("rate limit") || message.includes("quota")) {
    const retryMatch = raw.match(/retry after (\d+)/i);
    const hint = retryMatch ? ` Retry in ${retryMatch[1]} seconds.` : " Wait a moment and try again.";
    return new AppError(429, "rate_limited", `Groq is rate limiting this request.${hint}`);
  }

  if (status === 413 || message.includes("too large") || message.includes("tokens")) {
    return new AppError(413, "prompt_too_large", "Prompt is too large for Groq's free tier. Try Aggressive mode or a shorter prompt.");
  }

  if (status === 503 || message.includes("overloaded") || message.includes("unavailable")) {
    return new AppError(503, "model_unavailable", "Groq is temporarily unavailable. Try again in a moment.");
  }

  return new AppError(502, "groq_error", raw || "Groq returned an unexpected error. Try again in a moment.");
}

async function callGroqRaw(apiKey, messages) {
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
        messages,
        response_format: { type: "json_object" },
        temperature: 0.15,
        max_tokens: 6000,
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

  return payload;
}

function extractResult(payload, model) {
  const rawText = payload?.choices?.[0]?.message?.content || "";
  const parsed = robustParseJson(rawText);
  return { parsed, rawText };
}

async function compress({ prompt, mode, analysisSummary, reviewHint }) {
  const apiKey = getApiKey();

  const systemMessage = { role: "system", content: `${SYSTEM_INSTRUCTION}\n\n${JSON_SCHEMA_INSTRUCTION}` };

  // Attempt 1: full compression prompt
  const userContent = buildCompressionContents(prompt, mode, analysisSummary, reviewHint);
  const payload1 = await callGroqRaw(apiKey, [systemMessage, { role: "user", content: userContent }]);
  const { parsed: parsed1, rawText: raw1 } = extractResult(payload1);

  if (parsed1?.optimizedPrompt) {
    return {
      optimizedPrompt: parsed1.optimizedPrompt.trim(),
      preservedConstraints: Array.isArray(parsed1.preservedConstraints) ? parsed1.preservedConstraints.filter(Boolean).slice(0, 10) : [],
      compressedOrMerged: Array.isArray(parsed1.compressedOrMerged) ? parsed1.compressedOrMerged.filter(Boolean).slice(0, 10) : [],
      intentionallyDropped: Array.isArray(parsed1.intentionallyDropped) ? parsed1.intentionallyDropped.filter(Boolean).slice(0, 10) : [],
      selectedModel: groqConfig.model,
      usedFallbackModel: false,
    };
  }

  // Attempt 2: simpler prompt
  console.error(`[groq-provider] Attempt 1 parse failed. Raw (first 400): ${raw1.slice(0, 400)}`);
  const simpleContent = buildSimpleCompressionContents(prompt, mode);
  const payload2 = await callGroqRaw(apiKey, [systemMessage, { role: "user", content: simpleContent }]);
  const { parsed: parsed2, rawText: raw2 } = extractResult(payload2);

  if (parsed2?.optimizedPrompt) {
    return {
      optimizedPrompt: parsed2.optimizedPrompt.trim(),
      preservedConstraints: Array.isArray(parsed2.preservedConstraints) ? parsed2.preservedConstraints.filter(Boolean).slice(0, 10) : [],
      compressedOrMerged: Array.isArray(parsed2.compressedOrMerged) ? parsed2.compressedOrMerged.filter(Boolean).slice(0, 10) : [],
      intentionallyDropped: Array.isArray(parsed2.intentionallyDropped) ? parsed2.intentionallyDropped.filter(Boolean).slice(0, 10) : [],
      selectedModel: groqConfig.model,
      usedFallbackModel: false,
      usedSimpleFallback: true,
    };
  }

  // Attempt 3: return original, never lose the prompt
  console.error(`[groq-provider] Attempt 2 parse failed. Raw (first 400): ${raw2.slice(0, 400)}`);
  return {
    optimizedPrompt: prompt,
    preservedConstraints: ["Original prompt preserved — compression could not parse model output."],
    compressedOrMerged: [],
    intentionallyDropped: [],
    selectedModel: groqConfig.model,
    usedFallbackModel: false,
    compressionFailed: true,
  };
}

module.exports = { compress };
