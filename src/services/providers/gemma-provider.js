const { gemmaConfig } = require("../../config/gemma");
const { AppError } = require("../../lib/app-error");
const { robustParseJson } = require("../../lib/parse-json");
const {
  SYSTEM_INSTRUCTION,
  buildCompressionContents,
  buildSimpleCompressionContents,
  normalizeList,
} = require("../../prompts/compression-prompt");

const JSON_SCHEMA_INSTRUCTION = `
Return your response as a JSON object with exactly these fields:
- optimizedPrompt: string - the compressed, directly usable prompt
- preservedConstraints: array of strings - critical constraints that were kept
- compressedOrMerged: array of strings - what was tightened or combined
- intentionallyDropped: array of strings - what was safely removed
`.trim();

function normalizeGemmaError(error) {
  if (error instanceof AppError) {
    return error;
  }

  if (error.name === "AbortError") {
    return new AppError(504, "request_timeout", "Gemma took too long to respond. Try a shorter prompt or retry.");
  }

  return new AppError(
    502,
    "gemma_unreachable",
    `Could not reach local Gemma at ${gemmaConfig.apiUrl}. Start Ollama and run: ollama pull ${gemmaConfig.model}`,
  );
}

async function readPayload(response) {
  const text = await response.text();

  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text);
  } catch (_error) {
    return { error: text };
  }
}

function normalizeOllamaResponseError(status, payload) {
  const raw = typeof payload?.error === "string" ? payload.error : "";
  const lower = raw.toLowerCase();

  if (status === 404 || lower.includes("not found") || lower.includes("pull")) {
    return new AppError(
      503,
      "model_unavailable",
      `Gemma model ${gemmaConfig.model} is not available locally. Run: ollama pull ${gemmaConfig.model}`,
    );
  }

  if (status === 400 || lower.includes("invalid")) {
    return new AppError(400, "bad_gemma_request", raw || "Ollama rejected the Gemma request.");
  }

  return new AppError(502, "gemma_error", raw || "Gemma returned an unexpected error.");
}

async function callGemmaRaw(messages) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), gemmaConfig.timeoutMs);

  let response;
  try {
    response = await fetch(gemmaConfig.apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: gemmaConfig.model,
        messages,
        stream: false,
        format: "json",
        options: {
          temperature: 0.15,
          top_p: 0.9,
          num_predict: gemmaConfig.maxOutputTokens,
        },
      }),
      signal: controller.signal,
    });
  } catch (error) {
    throw normalizeGemmaError(error);
  } finally {
    clearTimeout(timer);
  }

  const payload = await readPayload(response);

  if (!response.ok) {
    throw normalizeOllamaResponseError(response.status, payload);
  }

  return payload;
}

function extractResult(payload) {
  const rawText = payload?.message?.content || payload?.response || "";
  const parsed = robustParseJson(rawText);
  return { parsed, rawText };
}

function buildResult(parsed, extra = {}) {
  return {
    optimizedPrompt: parsed.optimizedPrompt.trim(),
    preservedConstraints: normalizeList(parsed.preservedConstraints),
    compressedOrMerged: normalizeList(parsed.compressedOrMerged),
    intentionallyDropped: normalizeList(parsed.intentionallyDropped),
    selectedModel: gemmaConfig.model,
    usedFallbackModel: false,
    ...extra,
  };
}

async function compress({ prompt, mode, analysisSummary, reviewHint }) {
  const systemMessage = { role: "system", content: `${SYSTEM_INSTRUCTION}\n\n${JSON_SCHEMA_INSTRUCTION}` };

  const userContent = buildCompressionContents(prompt, mode, analysisSummary, reviewHint);
  const payload1 = await callGemmaRaw([systemMessage, { role: "user", content: userContent }]);
  const { parsed: parsed1, rawText: raw1 } = extractResult(payload1);

  if (parsed1?.optimizedPrompt) {
    return buildResult(parsed1);
  }

  console.error(`[gemma-provider] Attempt 1 parse failed. Raw (first 400): ${raw1.slice(0, 400)}`);
  const simpleContent = buildSimpleCompressionContents(prompt, mode);
  const payload2 = await callGemmaRaw([systemMessage, { role: "user", content: simpleContent }]);
  const { parsed: parsed2, rawText: raw2 } = extractResult(payload2);

  if (parsed2?.optimizedPrompt) {
    return buildResult(parsed2, { usedSimpleFallback: true });
  }

  console.error(`[gemma-provider] Attempt 2 parse failed. Raw (first 400): ${raw2.slice(0, 400)}`);
  return {
    optimizedPrompt: prompt,
    preservedConstraints: ["Original prompt preserved - compression could not parse model output."],
    compressedOrMerged: [],
    intentionallyDropped: [],
    selectedModel: gemmaConfig.model,
    usedFallbackModel: false,
    compressionFailed: true,
  };
}

module.exports = { compress };
