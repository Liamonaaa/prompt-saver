const STORAGE_KEYS = {
  prompt: "prompt-saver:last-prompt",
  mode: "prompt-saver:mode",
  theme: "prompt-saver:theme",
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

const MODE_LABELS = {
  safe: "קל",
  balanced: "מאוזן",
  aggressive: "אגרסיבי",
};

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
};

function countWords(text) {
  const matches = text.trim().match(/\S+/g);
  return matches ? matches.length : 0;
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
  renderQualityReport(result);
  renderList(elements.preservedList, result?.preservedConstraints, "עדיין לא זוהו אילוצים.");
  renderList(elements.compressedList, result?.compressedOrMerged, "עדיין אין פירוט על הדחיסה.");
  renderList(elements.droppedList, result?.intentionallyDropped, "לא הושמט שום דבר מהותי.");
}

function persistInput() {
  localStorage.setItem(STORAGE_KEYS.prompt, elements.promptInput.value);
  localStorage.setItem(STORAGE_KEYS.mode, state.mode);
}

function setTheme(theme) {
  const isDark = theme === "dark";
  document.body.classList.toggle("dark", isDark);
  elements.themeToggle.textContent = isDark ? "מצב בהיר" : "מצב כהה";
  localStorage.setItem(STORAGE_KEYS.theme, isDark ? "dark" : "light");
}

async function compressPrompt() {
  const prompt = elements.promptInput.value.trim();

  if (!prompt || state.loading) {
    return;
  }

  setLoading(true);
  setStatus("מקצר את הפרומפט עם ג׳מיני...", "");

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
      throw new Error(payload?.error?.message || "הקיצור נכשל.");
    }

    renderResult(payload.result);

    const modelBadge = payload.result.usedFallbackModel
      ? ` נעשה שימוש במודל גיבוי: ${payload.result.selectedModel}.`
      : ` נעשה שימוש במודל ${payload.result.selectedModel}.`;

    setStatus(`הקיצור הושלם.${modelBadge}`, "success");
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
  persistInput();
  setLoading(false);
  setStatus("נוקה. אפשר להדביק פרומפט חדש.");
}

function initialize() {
  elements.promptInput.value = localStorage.getItem(STORAGE_KEYS.prompt) || "";
  state.mode = localStorage.getItem(STORAGE_KEYS.mode) || "balanced";
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
    button.textContent = MODE_LABELS[button.dataset.mode] || button.textContent;
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
    setStatus("נטענה דוגמה. אפשר לעבור עליה ולקצר כשמוכנים.");
  });
  elements.clearButton.addEventListener("click", clearAll);
  elements.copyButton.addEventListener("click", copyOutput);
  elements.downloadButton.addEventListener("click", downloadOutput);
  elements.themeToggle.addEventListener("click", () => {
    setTheme(document.body.classList.contains("dark") ? "light" : "dark");
  });
}

initialize();
