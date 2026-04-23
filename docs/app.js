const STORAGE_KEYS = {
  prompt: "prompt-saver:last-prompt",
  mode: "prompt-saver:mode",
  theme: "prompt-saver:theme",
  apiKey: "prompt-saver:gemini-api-key",
  model: "prompt-saver:gemini-model",
};

const SAMPLE_PROMPT = `Build a production-ready internal dashboard for incident response.

This is not a toy. Do not simplify the data model.
Do not remove audit logging.
Do not remove role-based access control.
Do not change the API contract unless absolutely necessary.
The product must ship with accessible keyboard navigation.
The product must ship with accessible keyboard navigation.
Preserve existing webhook retry semantics.
Preserve existing webhook retry semantics.
Preserve all hard constraints, especially auditability and access control.
Never turn this into a marketing landing page.
Never turn this into a marketing landing page.

Requirements:
- React frontend is allowed, but keep the architecture simple.
- Must support dark mode.
- Must support dark mode.
- Backend must remain Node.js.
- Output should include implementation plan, risks, and final deliverables.
- Keep the tone direct and technical.
- Keep the tone direct and technical.

If anything seems ambiguous but could be critical, keep it instead of dropping it.`;

const PROMPT_SCHEMA = {
  type: "OBJECT",
  properties: {
    optimizedPrompt: { type: "STRING" },
    preservedConstraints: {
      type: "ARRAY",
      items: { type: "STRING" },
    },
    compressedOrMerged: {
      type: "ARRAY",
      items: { type: "STRING" },
    },
  },
  required: ["optimizedPrompt", "preservedConstraints", "compressedOrMerged"],
  propertyOrdering: ["optimizedPrompt", "preservedConstraints", "compressedOrMerged"],
};

const SYSTEM_INSTRUCTION = `You are Prompt Saver, a prompt optimization engine for coding agents.

This is not generic summarization.
Your job is to compress prompts while preserving the task's real intent and every critical constraint.

Non-negotiable rules:
- Preserve the core task goal.
- Preserve all hard constraints.
- Preserve all do-not-touch rules.
- Preserve technical limitations, output requirements, language requirements, and safety-critical instructions.
- If you are unsure whether something is critical, keep it.
- Never silently drop constraints that could change behavior or break the result.
- Merge duplicate instructions when possible, but do not weaken them.
- Remove repetition, filler wording, repeated warnings, and redundant examples unless the example is essential.
- Keep the optimized prompt directly usable in Codex or Claude Code.
- Do not write a generic summary.
- Do not add new requirements not present in the source.

Compression priority:
1. Core task goal
2. Hard constraints
3. What must not be changed
4. Technical constraints
5. Output and delivery requirements
6. Secondary design preferences
7. Nice-to-have details

Return valid JSON matching the provided schema.`;

const MODE_GUIDANCE = {
  safe: "Favor maximal preservation. Remove obvious repetition and fluff only.",
  balanced: "Compress firmly, merge duplicates, and shorten wording without risking constraints.",
  aggressive:
    "Compress hard where safe, but still keep any requirement that could affect correctness, safety, or deliverables.",
};

const config = window.PROMPT_SAVER_CONFIG;

const state = {
  mode: "safe",
  loading: false,
  lastResult: null,
};

const elements = {
  promptInput: document.getElementById("prompt-input"),
  promptOutput: document.getElementById("prompt-output"),
  inputCounts: document.getElementById("input-counts"),
  outputCounts: document.getElementById("output-counts"),
  statusMessage: document.getElementById("status-message"),
  compressButton: document.getElementById("compress-button"),
  sampleButton: document.getElementById("sample-button"),
  clearButton: document.getElementById("clear-button"),
  copyButton: document.getElementById("copy-button"),
  downloadButton: document.getElementById("download-button"),
  compareMetrics: document.getElementById("compare-metrics"),
  preservedList: document.getElementById("preserved-list"),
  compressedList: document.getElementById("compressed-list"),
  modeButtons: [...document.querySelectorAll(".mode-button")],
  themeToggle: document.getElementById("theme-toggle"),
  apiKeyInput: document.getElementById("api-key-input"),
  modelInput: document.getElementById("model-input"),
  saveKeyButton: document.getElementById("save-key-button"),
  clearKeyButton: document.getElementById("clear-key-button"),
};

function countWords(text) {
  const matches = text.trim().match(/\S+/g);
  return matches ? matches.length : 0;
}

function estimateTokens(text) {
  const cleaned = typeof text === "string" ? text.trim() : "";
  return cleaned ? Math.max(1, Math.round(cleaned.length / 4)) : 0;
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

function formatCounts(text) {
  return `${text.length.toLocaleString()} chars · ${countWords(text).toLocaleString()} words`;
}

function setStatus(message, tone = "") {
  elements.statusMessage.textContent = message;
  elements.statusMessage.className = `status-message ${tone}`.trim();
}

function renderCounts() {
  elements.inputCounts.textContent = formatCounts(elements.promptInput.value);
  elements.outputCounts.textContent = formatCounts(elements.promptOutput.value);
}

function renderMode() {
  elements.modeButtons.forEach((button) => {
    const isActive = button.dataset.mode === state.mode;
    button.classList.toggle("active", isActive);
    button.setAttribute("aria-checked", isActive ? "true" : "false");
  });
}

function renderList(target, items, fallbackText) {
  target.innerHTML = "";

  if (!items?.length) {
    const emptyItem = document.createElement("li");
    emptyItem.textContent = fallbackText;
    target.appendChild(emptyItem);
    target.classList.add("empty-card");
    return;
  }

  target.classList.remove("empty-card");
  items.forEach((item) => {
    const li = document.createElement("li");
    li.textContent = item;
    target.appendChild(li);
  });
}

function renderCompare(result) {
  if (!result) {
    elements.compareMetrics.classList.add("empty-card");
    elements.compareMetrics.innerHTML = `
      <div><dt>Original</dt><dd>0 tokens est.</dd></div>
      <div><dt>Optimized</dt><dd>0 tokens est.</dd></div>
      <div><dt>Reduction</dt><dd>0%</dd></div>
    `;
    return;
  }

  const estimate = result.estimatedTokenReduction;
  elements.compareMetrics.classList.remove("empty-card");
  elements.compareMetrics.innerHTML = `
    <div><dt>Original</dt><dd>${estimate.estimatedOriginalTokens.toLocaleString()} tokens est.</dd></div>
    <div><dt>Optimized</dt><dd>${estimate.estimatedOptimizedTokens.toLocaleString()} tokens est.</dd></div>
    <div><dt>Reduction</dt><dd>${estimate.estimatedReductionPercent}%</dd></div>
  `;
}

function setLoading(isLoading) {
  state.loading = isLoading;
  const disabled = isLoading || !elements.promptInput.value.trim();
  elements.compressButton.disabled = disabled;
  elements.sampleButton.disabled = isLoading;
  elements.clearButton.disabled = isLoading;
}

function renderResult(result) {
  state.lastResult = result;
  elements.promptOutput.value = result?.optimizedPrompt || "";
  elements.copyButton.disabled = !result?.optimizedPrompt;
  elements.downloadButton.disabled = !result?.optimizedPrompt;
  renderCounts();
  renderCompare(result);
  renderList(elements.preservedList, result?.preservedConstraints, "No constraints captured yet.");
  renderList(elements.compressedList, result?.compressedOrMerged, "No compression notes yet.");
}

function persistEditorState() {
  localStorage.setItem(STORAGE_KEYS.prompt, elements.promptInput.value);
  localStorage.setItem(STORAGE_KEYS.mode, state.mode);
}

function saveKeyState() {
  localStorage.setItem(STORAGE_KEYS.apiKey, elements.apiKeyInput.value.trim());
  localStorage.setItem(STORAGE_KEYS.model, elements.modelInput.value.trim());
  setStatus("Gemini key and model saved in this browser.", "success");
}

function clearKeyState() {
  elements.apiKeyInput.value = "";
  localStorage.removeItem(STORAGE_KEYS.apiKey);
  setStatus("Saved Gemini key removed from this browser.", "success");
}

function setTheme(theme) {
  const isDark = theme === "dark";
  document.body.classList.toggle("dark", isDark);
  elements.themeToggle.textContent = isDark ? "Light mode" : "Dark mode";
  localStorage.setItem(STORAGE_KEYS.theme, isDark ? "dark" : "light");
}

function buildRequestBody(prompt, mode) {
  return {
    systemInstruction: {
      parts: [{ text: SYSTEM_INSTRUCTION }],
    },
    generationConfig: {
      temperature: 0.15,
      topP: 0.9,
      maxOutputTokens: 4096,
      responseMimeType: "application/json",
      responseSchema: PROMPT_SCHEMA,
      thinkingConfig: {
        thinkingBudget: 0,
      },
    },
    contents: [
      {
        parts: [
          {
            text: `Compression mode: ${mode}
Mode guidance: ${MODE_GUIDANCE[mode] || MODE_GUIDANCE.safe}

Task:
Transform the input into a shorter prompt for a coding agent.
Preserve every critical instruction.
Reduce token-heavy repetition.
Do not turn it into a generic summary.

Input prompt:
"""${prompt}"""`,
          },
        ],
      },
    ],
  };
}

function parseGeminiResponse(payload) {
  const candidate = payload?.candidates?.[0];
  const text = candidate?.content?.parts?.map((part) => part.text || "").join("").trim();

  if (!text) {
    throw new Error("Gemini returned an empty response.");
  }

  const parsed = JSON.parse(text);

  if (!parsed?.optimizedPrompt) {
    throw new Error("Gemini returned an invalid optimization payload.");
  }

  return {
    optimizedPrompt: parsed.optimizedPrompt.trim(),
    preservedConstraints: Array.isArray(parsed.preservedConstraints)
      ? parsed.preservedConstraints.filter(Boolean).slice(0, 8)
      : [],
    compressedOrMerged: Array.isArray(parsed.compressedOrMerged)
      ? parsed.compressedOrMerged.filter(Boolean).slice(0, 8)
      : [],
  };
}

function mapGeminiError(status, payload) {
  const message = JSON.stringify(payload || {}).toLowerCase();

  if (status === 401 || status === 403 || message.includes("api key")) {
    return "Gemini rejected the API key. Check the key and try again.";
  }

  if (status === 404 || message.includes("not found") || message.includes("unsupported model")) {
    return "The configured Gemini model is unavailable. Try the fallback Flash model.";
  }

  if (status === 429 || message.includes("rate limit") || message.includes("resource_exhausted")) {
    return "Gemini is rate limiting this request right now. Wait a moment and try again.";
  }

  if (status >= 500) {
    return "Gemini is currently unavailable. Try again in a moment.";
  }

  return payload?.error?.message || "Gemini request failed.";
}

async function callGemini(prompt, mode) {
  const apiKey = elements.apiKeyInput.value.trim();
  const selectedModel = elements.modelInput.value.trim() || config.defaultModel;
  const modelsToTry = [selectedModel, ...config.fallbackModels.filter((model) => model !== selectedModel)];
  let lastError;

  for (let index = 0; index < modelsToTry.length; index += 1) {
    const modelName = modelsToTry[index];
    const response = await fetch(`${config.endpointBase}/models/${modelName}:generateContent`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify(buildRequestBody(prompt, mode)),
    });

    const payload = await response.json();

    if (response.ok) {
      return {
        ...parseGeminiResponse(payload),
        selectedModel: modelName,
        usedFallbackModel: index > 0,
      };
    }

    lastError = new Error(mapGeminiError(response.status, payload));

    const rawMessage = JSON.stringify(payload || {}).toLowerCase();
    const modelUnavailable =
      response.status === 404 ||
      rawMessage.includes("unsupported model") ||
      rawMessage.includes("not found");

    if (modelUnavailable && index < modelsToTry.length - 1) {
      continue;
    }

    throw lastError;
  }

  throw lastError || new Error("Gemini request failed.");
}

async function compressPrompt() {
  const prompt = elements.promptInput.value.trim();
  const apiKey = elements.apiKeyInput.value.trim();

  if (!prompt || state.loading) {
    return;
  }

  if (!apiKey) {
    setStatus("Enter a Gemini API key before compressing.", "error");
    return;
  }

  setLoading(true);
  setStatus("Compressing prompt with Gemini...", "");

  try {
    const result = await callGemini(prompt, state.mode);
    result.estimatedTokenReduction = buildReductionEstimate(prompt, result.optimizedPrompt);
    renderResult(result);

    const suffix = result.usedFallbackModel
      ? ` using fallback model ${result.selectedModel}.`
      : ` using ${result.selectedModel}.`;

    setStatus(`Compression complete${suffix}`, "success");
  } catch (error) {
    setStatus(error.message || "Compression failed.", "error");
  } finally {
    setLoading(false);
  }
}

async function copyOutput() {
  if (!elements.promptOutput.value) {
    return;
  }

  try {
    await navigator.clipboard.writeText(elements.promptOutput.value);
    setStatus("Optimized prompt copied to clipboard.", "success");
  } catch (_error) {
    setStatus("Clipboard copy failed. Select and copy manually.", "error");
  }
}

function downloadOutput() {
  if (!elements.promptOutput.value) {
    return;
  }

  const blob = new Blob([elements.promptOutput.value], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "optimized-prompt.txt";
  link.click();
  URL.revokeObjectURL(url);
  setStatus("Optimized prompt downloaded.", "success");
}

function clearAll() {
  elements.promptInput.value = "";
  renderResult(null);
  persistEditorState();
  setLoading(false);
  setStatus("Cleared. Paste another prompt when ready.");
}

function initialize() {
  elements.promptInput.value = localStorage.getItem(STORAGE_KEYS.prompt) || "";
  elements.apiKeyInput.value = localStorage.getItem(STORAGE_KEYS.apiKey) || "";
  elements.modelInput.value = localStorage.getItem(STORAGE_KEYS.model) || config.defaultModel;
  state.mode = localStorage.getItem(STORAGE_KEYS.mode) || "safe";
  setTheme(localStorage.getItem(STORAGE_KEYS.theme) || "light");

  renderMode();
  renderResult(null);
  renderCounts();
  setLoading(false);

  elements.promptInput.addEventListener("input", () => {
    persistEditorState();
    renderCounts();
    elements.compressButton.disabled = state.loading || !elements.promptInput.value.trim();
  });

  elements.modeButtons.forEach((button) => {
    button.addEventListener("click", () => {
      state.mode = button.dataset.mode;
      persistEditorState();
      renderMode();
    });
  });

  elements.compressButton.addEventListener("click", compressPrompt);
  elements.sampleButton.addEventListener("click", () => {
    elements.promptInput.value = SAMPLE_PROMPT;
    persistEditorState();
    renderCounts();
    elements.compressButton.disabled = false;
    setStatus("Loaded sample prompt. Review it and compress when ready.");
  });
  elements.clearButton.addEventListener("click", clearAll);
  elements.copyButton.addEventListener("click", copyOutput);
  elements.downloadButton.addEventListener("click", downloadOutput);
  elements.themeToggle.addEventListener("click", () => {
    setTheme(document.body.classList.contains("dark") ? "light" : "dark");
  });
  elements.saveKeyButton.addEventListener("click", saveKeyState);
  elements.clearKeyButton.addEventListener("click", clearKeyState);
}

initialize();
