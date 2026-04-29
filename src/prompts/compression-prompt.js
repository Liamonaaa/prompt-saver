const { robustParseJson } = require("../lib/parse-json");

const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    optimizedPrompt: {
      type: "string",
      description: "A directly usable prompt for Codex or Claude Code that preserves the task goal and critical requirements.",
    },
    preservedConstraints: {
      type: "array",
      description: "Critical constraints, product requirements, or do-not-change instructions that were preserved.",
      items: { type: "string" },
    },
    compressedOrMerged: {
      type: "array",
      description: "Redundant, repetitive, or overly long areas that were merged or tightened.",
      items: { type: "string" },
    },
    intentionallyDropped: {
      type: "array",
      description: "Items intentionally dropped because they were clearly redundant, repetitive, or non-material. Use an empty array if nothing meaningful was dropped.",
      items: { type: "string" },
    },
  },
  required: ["optimizedPrompt", "preservedConstraints", "compressedOrMerged", "intentionallyDropped"],
  propertyOrdering: ["optimizedPrompt", "preservedConstraints", "compressedOrMerged", "intentionallyDropped"],
};

const SYSTEM_INSTRUCTION = `
You are Prompt Saver, a prompt optimization engine for coding agents.

This is not summarization. Your job is to reduce token count while preserving task quality, requirements, constraints, structure, and important nuance. Prefer a slightly longer compressed prompt over losing important meaning.

Compression priorities, in order:
1. Preserve the user's core task and intended outcome.
2. Preserve every explicit requirement, numbered section, output format instruction, count, threshold, role, date, tool name, product name, and domain-specific detail.
3. Preserve every negative constraint, especially instructions beginning with "do not", "avoid", "never", "must not", "cannot", or equivalent wording.
4. Preserve required output structure and section lists. Do not collapse a numbered deliverable list into a vague summary.
5. Preserve context that affects the expected answer, especially audience, business domain, user goals, risks, examples, success criteria, technical stack, and evaluation criteria.
6. Remove repetition, filler, verbose phrasing, repeated warnings, and redundant explanation.
7. Combine related ideas only when doing so does not weaken, erase, or generalize a requirement.
8. Keep plain language as plain language. Do not introduce LaTeX, symbolic notation, academic formatting, or symbolic shorthand for counts unless the original prompt explicitly asks for math formatting.
9. Do not make the prompt more generic than the original.
10. Do not replace precise constraints with vague summaries. For example, keep "do not assume users will read long documentation" instead of weakening it to "make onboarding clear".

Preservation categories to detect before compressing:
- Core objective: what must be produced, decided, built, evaluated, or changed.
- Required content: sections, bullets, deliverables, output format, counts, thresholds, roles, phases, dates, and examples.
- Negative constraints: "do not", "avoid", "never", "must not", "cannot", "do not remove", and equivalent phrasing.
- Style constraints: tone, language, specificity, scannability, plain-language requirements, and quality bars.
- Background context: audience, product, business domain, user goals, pain points, risks, source systems, technical limits, and evaluation criteria.
- Optional examples: keep examples when they affect answer quality; compress or group them only when the meaning remains intact.

Faithfulness checklist before finalizing:
- Did I keep the core objective and intended outcome?
- Did I keep all required sections and required output structure?
- Did I keep all numbers, counts, thresholds, roles, dates, tool names, product names, and domain terms?
- Did I keep every "do not" / "avoid" / "never" / "must not" constraint?
- Did I preserve the target audience, business domain, user goals, risks, examples, and success criteria?
- Did I avoid adding new requirements, changing the requested style, or making the prompt more generic?
- Did I keep normal wording as normal wording and avoid LaTeX or symbolic notation unless requested?
If any answer is no, restore the missing requirement before returning JSON.

Output requirements:
- Return valid JSON matching the provided schema.
- Put the compressed prompt in "optimizedPrompt".
- "preservedConstraints": list the most important requirements and constraints kept, especially negative constraints.
- "compressedOrMerged": list repetition or verbose areas that were tightened.
- "intentionallyDropped": only clearly redundant content. Empty array if nothing meaningful was dropped.
`.trim();

const MODE_GUIDANCE = {
  safe: `
Preserve nuance aggressively. Keep everything unless it is obviously word-for-word duplicate.
Prefer a slightly longer result over any doubt.
  `.trim(),
  balanced: `
Target around 55-75% of the original length when the prompt has many requirements, constraints, or structured output sections.
Remove repetition firmly, but preserve quality over maximum compression.
Keep every requirement, negative constraint, count, required section, domain context, and example that affects answer quality.
  `.trim(),
  aggressive: `
Compress strongly only when the prompt is low-risk.
If the prompt contains numbered required sections, many negative constraints, legal/medical/financial/safety instructions, code-generation requirements, formatting requirements, or evaluation criteria, behave more like balanced mode.
Never remove or weaken requirements, negative constraints, required structure, counts, examples, or domain context just to save tokens.
  `.trim(),
};

const RISK_SIGNAL_PATTERNS = [
  {
    label: "numbered required sections",
    pattern: /(^|\n)\s*\d+[.)]\s+\S|required sections|following sections|proposal with the following sections/i,
  },
  {
    label: "many negative constraints",
    pattern: /(do not|avoid|never|must not|cannot|can't|do not remove)/gi,
    minimumMatches: 2,
  },
  {
    label: "legal/medical/financial/safety instructions",
    pattern: /\b(legal|medical|financial|safety|compliance|privacy|security|audit|risk)\b/i,
  },
  {
    label: "code-generation requirements",
    pattern: /\b(code|coding|implementation|api|typescript|javascript|node|react|database|schema|test|tests)\b/i,
  },
  {
    label: "formatting requirements",
    pattern: /\b(format|structured|scannable|section|bullet|markdown|json|table|copy examples|microcopy)\b/i,
  },
  {
    label: "evaluation criteria",
    pattern: /\b(metric|criteria|activation|leading indicator|lagging indicator|qualitative|experiment|hypothesis|primary metric)\b/i,
  },
];

function detectCompressionRiskSignals(prompt) {
  return RISK_SIGNAL_PATTERNS.filter(({ pattern, minimumMatches }) => {
    if (!minimumMatches) {
      return pattern.test(prompt);
    }

    const matches = prompt.match(pattern);
    return (matches || []).length >= minimumMatches;
  }).map(({ label }) => label);
}

function buildCompressionContents(prompt, mode, analysisSummary = "", reviewHint = "") {
  const selectedMode = MODE_GUIDANCE[mode] ? mode : "balanced";
  const riskSignals = detectCompressionRiskSignals(prompt);
  const conservativeGuidance =
    selectedMode === "aggressive" && riskSignals.length
      ? `
Aggressive-mode safety override:
This prompt has preservation-risk signals: ${riskSignals.join(", ")}.
Compress conservatively. Preserve required structure, negative constraints, counts, examples, and evaluation criteria even if the result is longer.
`.trim()
      : "";

  return `
Compression mode: ${selectedMode}
Mode guidance: ${MODE_GUIDANCE[selectedMode]}

${conservativeGuidance ? `${conservativeGuidance}\n\n` : ""}Protected segments (treat as high-priority):
${analysisSummary || "No additional protected-content notes."}

${reviewHint ? `Retry guidance - these were missing in the previous attempt:\n${reviewHint}\n` : ""}

Input prompt:
"""
${prompt}
"""
  `.trim();
}

function buildSimpleCompressionContents(prompt, mode) {
  return `
Compress this prompt. Mode: ${mode}.

Rules:
- Remove repetition and filler only.
- Keep all hard requirements, negative constraints, numbered sections, counts, deliverables, structure, roles, examples, domain context, and technical details.
- Keep plain language as plain language; do not introduce LaTeX or symbolic notation unless requested.
- Prefer slightly longer output over losing any requirement.
- Return JSON: { "optimizedPrompt": "...", "preservedConstraints": [], "compressedOrMerged": [], "intentionallyDropped": [] }

Input:
"""
${prompt}
"""
  `.trim();
}

function normalizeList(value, maxItems = 10) {
  return Array.isArray(value) ? value.filter(Boolean).slice(0, maxItems) : [];
}

function parseCompressionResponse(response) {
  const rawText =
    typeof response?.text === "string"
      ? response.text
      : typeof response?.text === "function"
        ? response.text()
        : "";

  const parsed = response?.parsed || robustParseJson(rawText);

  if (!parsed) {
    console.error("[parseCompressionResponse] All parse strategies failed. Raw text (first 500 chars):", rawText.slice(0, 500));
    throw new Error("The model returned a response that could not be parsed as JSON. Try again or use a shorter prompt.");
  }

  if (!parsed.optimizedPrompt || typeof parsed.optimizedPrompt !== "string") {
    console.error("[parseCompressionResponse] Parsed object missing optimizedPrompt:", JSON.stringify(parsed).slice(0, 300));
    throw new Error("The model returned an incomplete response (missing optimizedPrompt). Try again.");
  }

  return {
    optimizedPrompt: parsed.optimizedPrompt.trim(),
    preservedConstraints: normalizeList(parsed.preservedConstraints),
    compressedOrMerged: normalizeList(parsed.compressedOrMerged),
    intentionallyDropped: normalizeList(parsed.intentionallyDropped),
  };
}

module.exports = {
  RESPONSE_SCHEMA,
  SYSTEM_INSTRUCTION,
  MODE_GUIDANCE,
  buildCompressionContents,
  buildSimpleCompressionContents,
  detectCompressionRiskSignals,
  normalizeList,
  parseCompressionResponse,
};
