const STORAGE_KEYS = {
  prompt: "prompt-saver:last-prompt",
  mode: "prompt-saver:mode",
  theme: "prompt-saver:theme",
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
};

function countWords(text) {
  const matches = text.trim().match(/\S+/g);
  return matches ? matches.length : 0;
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
  elements.compressButton.disabled = isLoading || !elements.promptInput.value.trim();
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

function persistInput() {
  localStorage.setItem(STORAGE_KEYS.prompt, elements.promptInput.value);
  localStorage.setItem(STORAGE_KEYS.mode, state.mode);
}

function setTheme(theme) {
  const isDark = theme === "dark";
  document.body.classList.toggle("dark", isDark);
  elements.themeToggle.textContent = isDark ? "Light mode" : "Dark mode";
  localStorage.setItem(STORAGE_KEYS.theme, isDark ? "dark" : "light");
}

async function compressPrompt() {
  const prompt = elements.promptInput.value.trim();

  if (!prompt || state.loading) {
    return;
  }

  setLoading(true);
  setStatus("Compressing prompt with Gemini...", "");

  try {
    const response = await fetch("/api/compress", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        prompt,
        mode: state.mode,
      }),
    });

    const payload = await response.json();

    if (!response.ok || !payload.ok) {
      throw new Error(payload?.error?.message || "Compression failed.");
    }

    renderResult(payload.result);

    const modelBadge = payload.result.usedFallbackModel
      ? ` using fallback model ${payload.result.selectedModel}.`
      : ` using ${payload.result.selectedModel}.`;

    setStatus(`Compression complete${modelBadge}`, "success");
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
  persistInput();
  setLoading(false);
  setStatus("Cleared. Paste another prompt when ready.");
}

function initialize() {
  elements.promptInput.value = localStorage.getItem(STORAGE_KEYS.prompt) || "";
  state.mode = localStorage.getItem(STORAGE_KEYS.mode) || "safe";
  setTheme(localStorage.getItem(STORAGE_KEYS.theme) || "light");

  renderMode();
  renderResult(null);
  renderCounts();
  setLoading(false);

  elements.promptInput.addEventListener("input", () => {
    persistInput();
    renderCounts();
    elements.compressButton.disabled = state.loading || !elements.promptInput.value.trim();
  });

  elements.modeButtons.forEach((button) => {
    button.addEventListener("click", () => {
      state.mode = button.dataset.mode;
      persistInput();
      renderMode();
    });
  });

  elements.compressButton.addEventListener("click", compressPrompt);
  elements.sampleButton.addEventListener("click", () => {
    elements.promptInput.value = SAMPLE_PROMPT;
    persistInput();
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
}

initialize();
