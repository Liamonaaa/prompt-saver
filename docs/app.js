const STORAGE_KEYS = {
  prompt: "prompt-saver:last-prompt",
  mode: "prompt-saver:mode",
  theme: "prompt-saver:theme",
  apiKey: "prompt-saver:groq-api-key",
  model: "prompt-saver:groq-model",
};

const SAMPLE_PROMPT = `בנו לוח בקרה פנימי מוכן לפרודקשן לטיפול באירועי תקלות.

זה לא דמו. אין לפשט את מודל הנתונים.
אין להסיר audit logging.
אין להסיר role-based access control.
אין לשנות את חוזה ה־API אלא אם אין ברירה.
המוצר חייב לכלול ניווט מלא במקלדת.
המוצר חייב לכלול ניווט מלא במקלדת.
יש לשמר את לוגיקת ה־retry הקיימת של ה־webhooks.
יש לשמר את לוגיקת ה־retry הקיימת של ה־webhooks.
יש לשמר את כל האילוצים הקשיחים, במיוחד auditability והרשאות גישה.
אסור להפוך את זה לעמוד שיווקי.
אסור להפוך את זה לעמוד שיווקי.

דרישות:
- מותר להשתמש ב־React בצד הלקוח, אבל לשמור על ארכיטקטורה פשוטה.
- חובה לתמוך במצב כהה.
- חובה לתמוך במצב כהה.
- ה־backend חייב להישאר על Node.js.
- הפלט צריך לכלול תוכנית מימוש, סיכונים ותוצרים סופיים.
- לשמור על טון ישיר וטכני.
- לשמור על טון ישיר וטכני.

אם משהו נראה מעורפל אבל עלול להיות קריטי, עדיף להשאיר אותו מאשר להסיר אותו.`;


const SYSTEM_INSTRUCTION = `You are Prompt Saver, a prompt optimization engine for coding agents.

This is not generic summarization.
Your job is to produce the shortest safe prompt, not the shortest possible prompt.

Non-negotiable rules:
- Preserve the core task goal.
- Preserve all hard constraints.
- Preserve all do-not-touch rules.
- Preserve technical limitations, output requirements, language requirements, and safety-critical instructions.
- Preserve product and UX guidance when it materially shapes implementation quality, product feel, mobile behavior, interaction quality, realism, tradeoffs, or evaluation criteria.
- Preserve instructions about what the result must not become when they guard against generic or degraded output.
- If you are unsure whether something is critical, keep it.
- Never silently drop constraints that could change behavior or break the result.
- Merge duplicate instructions when possible, but do not weaken them.
- Remove repetition, filler wording, repeated warnings, and redundant examples unless the example affects edge cases, business logic, operational risk, or recommendation quality.
- Keep the optimized prompt directly usable in Codex or Claude Code.
- Do not write a generic summary.
- Do not add new requirements not present in the source.

Compression priority:
1. Core task goal
2. Hard constraints
3. Non-negotiable product and UX requirements
4. Technical constraints
5. Output and delivery requirements
6. Secondary preferences
7. Repetitive or compressible wording

Important preservation rule:
- Do not treat descriptive product and UX guidance as fluff just because it is qualitative.
- Preserve tradeoff instructions, realism, messy-reality details, customer or operator behavior, operational friction, risk examples, and final recommendation asks when they shape the answer.
- If an example matters, compress it into grouped form instead of deleting it.

Return valid JSON matching the provided schema.`;

const MODE_GUIDANCE = {
  safe: "Favor maximal preservation. Remove obvious repetition and fluff only.",
  balanced: "Compress firmly, merge duplicates, and shorten wording without risking constraints.",
  aggressive:
    "Compress hard where safe, but still keep any requirement that could affect correctness, safety, or deliverables.",
};

const MODE_LABELS = {
  safe: "קל",
  balanced: "מאוזן",
  aggressive: "אגרסיבי",
};

const config = window.PROMPT_SAVER_CONFIG;

const state = {
  mode: "balanced",
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
  qualityReport: document.getElementById("quality-report"),
  preservedList: document.getElementById("preserved-list"),
  compressedList: document.getElementById("compressed-list"),
  droppedList: document.getElementById("dropped-list"),
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
  return `${text.length.toLocaleString("he-IL")} תווים · ${countWords(text).toLocaleString("he-IL")} מילים`;
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
      <div><dt>מקור</dt><dd>הערכה: 0 טוקנים</dd></div>
      <div><dt>מקוצר</dt><dd>הערכה: 0 טוקנים</dd></div>
      <div><dt>חיסכון</dt><dd>0%</dd></div>
    `;
    return;
  }

  const estimate = result.estimatedTokenReduction;
  elements.compareMetrics.classList.remove("empty-card");
  elements.compareMetrics.innerHTML = `
    <div><dt>מקור</dt><dd>הערכה: ${estimate.estimatedOriginalTokens.toLocaleString("he-IL")} טוקנים</dd></div>
    <div><dt>מקוצר</dt><dd>הערכה: ${estimate.estimatedOptimizedTokens.toLocaleString("he-IL")} טוקנים</dd></div>
    <div><dt>חיסכון</dt><dd>${estimate.estimatedReductionPercent}%</dd></div>
  `;
}

function renderQualityReport(result) {
  if (!result?.qualityReport || !result?.estimatedTokenReduction) {
    elements.qualityReport.classList.add("empty-card");
    elements.qualityReport.innerHTML = `
      <div><dt>הוסרה חזרה</dt><dd>עדיין אין תוצאה.</dd></div>
      <div><dt>נשמרה ניואנסיות</dt><dd>עדיין אין תוצאה.</dd></div>
      <div><dt>רמת דחיסה</dt><dd>מאוזן</dd></div>
      <div><dt>הערכת חיסכון</dt><dd>0%</dd></div>
    `;
    return;
  }

  elements.qualityReport.classList.remove("empty-card");
  elements.qualityReport.innerHTML = `
    <div><dt>הוסרה חזרה</dt><dd>${result.qualityReport.removedRepetition ? "כן" : "לא"}</dd></div>
    <div><dt>נשמרה ניואנסיות</dt><dd>${result.qualityReport.importantNuancePreserved ? "כן" : "לא"}</dd></div>
    <div><dt>רמת דחיסה</dt><dd>${result.qualityReport.compressionLevel}</dd></div>
    <div><dt>הערכת חיסכון</dt><dd>${result.estimatedTokenReduction.estimatedReductionPercent}%</dd></div>
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
  renderQualityReport(result);
  renderList(elements.preservedList, result?.preservedConstraints, "עדיין לא זוהו אילוצים.");
  renderList(elements.compressedList, result?.compressedOrMerged, "עדיין אין פירוט על הדחיסה.");
  renderList(elements.droppedList, result?.intentionallyDropped, "לא הושמט שום דבר מהותי.");
}

function persistEditorState() {
  localStorage.setItem(STORAGE_KEYS.prompt, elements.promptInput.value);
  localStorage.setItem(STORAGE_KEYS.mode, state.mode);
}

function saveKeyState() {
  localStorage.setItem(STORAGE_KEYS.apiKey, elements.apiKeyInput.value.trim());
  localStorage.setItem(STORAGE_KEYS.model, elements.modelInput.value.trim());
  setStatus("המפתח והמודל נשמרו בדפדפן הזה.", "success");
}

function clearKeyState() {
  elements.apiKeyInput.value = "";
  localStorage.removeItem(STORAGE_KEYS.apiKey);
  setStatus("המפתח השמור נמחק מהדפדפן הזה.", "success");
}

function setTheme(theme) {
  const isDark = theme === "dark";
  document.body.classList.toggle("dark", isDark);
  elements.themeToggle.textContent = isDark ? "מצב בהיר" : "מצב כהה";
  localStorage.setItem(STORAGE_KEYS.theme, isDark ? "dark" : "light");
}

const JSON_SCHEMA_INSTRUCTION = `Return your response as a JSON object with exactly these fields:
- optimizedPrompt: string — the compressed, directly usable prompt
- preservedConstraints: array of strings — critical constraints that were kept
- compressedOrMerged: array of strings — what was tightened or combined
- intentionallyDropped: array of strings — what was safely removed (empty array if nothing was dropped)`.trim();

function buildGroqMessages(prompt, mode) {
  const userContent = `Compression mode: ${mode}
Mode guidance: ${MODE_GUIDANCE[mode] || MODE_GUIDANCE.balanced}

Task:
Transform the input into a shorter prompt for a coding agent.
Preserve every critical instruction.
Preserve important product and UX guidance when it shapes quality or implementation.
Reduce token-heavy repetition.
Do not turn it into a generic summary.

Meaning-loss check:
- Keep edge cases, warnings, tradeoffs, final recommendation asks, and "not X but Y" contrasts when they change the answer.
- If an example matters, compress it instead of deleting it.
- If unsure whether something is important, keep it.

Input prompt:
"""${prompt}"""`;

  return [
    { role: "system", content: `${SYSTEM_INSTRUCTION}

${JSON_SCHEMA_INSTRUCTION}` },
    { role: "user", content: userContent },
  ];
}

function parseGroqResponse(payload) {
  const text = (payload?.choices?.[0]?.message?.content || "").trim();

  if (!text) {
    throw new Error("Groq החזיר תגובה ריקה.");
  }

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("Groq החזיר תגובה חתוכה. נסו פרומפט קצר יותר או מצב דחיסה אגרסיבי.");
  }

  if (!parsed?.optimizedPrompt) {
    throw new Error("Groq החזיר מבנה תשובה לא תקין.");
  }

  return {
    optimizedPrompt: parsed.optimizedPrompt.trim(),
    preservedConstraints: Array.isArray(parsed.preservedConstraints)
      ? parsed.preservedConstraints.filter(Boolean).slice(0, 8)
      : [],
    compressedOrMerged: Array.isArray(parsed.compressedOrMerged)
      ? parsed.compressedOrMerged.filter(Boolean).slice(0, 8)
      : [],
    intentionallyDropped: Array.isArray(parsed.intentionallyDropped)
      ? parsed.intentionallyDropped.filter(Boolean).slice(0, 8)
      : [],
  };
}

function mapGroqError(status, payload) {
  const apiMessage = payload?.error?.message || "";
  const lower = apiMessage.toLowerCase();

  if (status === 401) {
    return "Groq דחה את מפתח ה־API. בדקו את המפתח ונסו שוב.";
  }

  if (status === 429 || lower.includes("rate limit") || lower.includes("quota")) {
    const retryMatch = apiMessage.match(/retry after (\d+)/i);
    const hint = retryMatch ? ` נסו שוב בעוד ${retryMatch[1]} שניות.` : " נסו שוב בעוד רגע.";
    return `Groq הגביל את הבקשה.${hint}`;
  }

  if (status === 503 || lower.includes("overloaded") || lower.includes("unavailable")) {
    return "Groq עמוס כרגע. נסו שוב בעוד רגע.";
  }

  return apiMessage || "הבקשה אל Groq נכשלה.";
}

async function callGroq(prompt, mode) {
  const apiKey = elements.apiKeyInput.value.trim();
  const selectedModel = elements.modelInput.value.trim() || config.groq.defaultModel;

  const response = await fetch(`${config.groq.endpointBase}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: selectedModel,
      messages: buildGroqMessages(prompt, mode),
      response_format: { type: "json_object" },
      temperature: 0.15,
      max_tokens: 16384,
    }),
  });

  const payload = await response.json();

  if (!response.ok) {
    throw new Error(mapGroqError(response.status, payload));
  }

  return {
    ...parseGroqResponse(payload),
    selectedModel,
    usedFallbackModel: false,
  };
}


async function compressPrompt() {
  const prompt = elements.promptInput.value.trim();
  const apiKey = elements.apiKeyInput.value.trim();

  if (!prompt || state.loading) {
    return;
  }

  if (!apiKey) {
    setStatus("צריך להזין מפתח Groq לפני שמקצרים.", "error");
    return;
  }

  setLoading(true);
  setStatus("מקצר את הפרומפט עם Groq...", "");

  try {
    const result = await callGroq(prompt, state.mode);
    result.estimatedTokenReduction = buildReductionEstimate(prompt, result.optimizedPrompt);
    result.qualityReport = {
      removedRepetition: Boolean(result.compressedOrMerged?.length),
      importantNuancePreserved: Boolean(result.preservedConstraints?.length),
      compressionLevel:
        state.mode === "safe" ? "Light" : state.mode === "aggressive" ? "Aggressive" : "Balanced",
    };
    renderResult(result);

    const suffix = result.usedFallbackModel
      ? ` נעשה שימוש במודל גיבוי: ${result.selectedModel}.`
      : ` נעשה שימוש במודל ${result.selectedModel}.`;

    setStatus(`הקיצור הושלם.${suffix}`, "success");
  } catch (error) {
    setStatus(error.message || "הקיצור נכשל.", "error");
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
    setStatus("הפרומפט המקוצר הועתק ללוח.", "success");
  } catch (_error) {
    setStatus("ההעתקה נכשלה. אפשר לסמן ולהעתיק ידנית.", "error");
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
  link.download = "prompt-saver-hebrew.txt";
  link.click();
  URL.revokeObjectURL(url);
  setStatus("הפרומפט המקוצר ירד כקובץ.", "success");
}

function clearAll() {
  elements.promptInput.value = "";
  renderResult(null);
  persistEditorState();
  setLoading(false);
  setStatus("נוקה. אפשר להדביק פרומפט חדש.");
}

function initialize() {
  elements.promptInput.value = localStorage.getItem(STORAGE_KEYS.prompt) || "";
  elements.apiKeyInput.value = localStorage.getItem(STORAGE_KEYS.apiKey) || "";
  elements.modelInput.value = localStorage.getItem(STORAGE_KEYS.model) || config.groq.defaultModel;
  state.mode = localStorage.getItem(STORAGE_KEYS.mode) || "balanced";
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
    button.textContent = MODE_LABELS[button.dataset.mode] || button.textContent;
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
    setStatus("נטענה דוגמה. אפשר לעבור עליה ולקצר כשמוכנים.");
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
