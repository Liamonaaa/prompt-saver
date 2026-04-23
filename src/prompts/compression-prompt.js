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

This is not summarization. Your job is to produce the shortest safe prompt, not the shortest prompt.

STEP 1 — Detect structure before compressing.
Identify which of these are present:
- Goal: what is being built or evaluated
- Stack: languages, frameworks, runtime, DB, infra
- Architecture: patterns, module boundaries, data flow
- Flows: user flows, system flows, state transitions
- Roles: user types, permissions, admin vs. end-user distinctions
- Pricing / billing: tiers, limits, payment logic
- Timing / scheduling: cron, delays, SLA, deadlines
- Status logic: state machines, transitions, error states
- Data model: entities, relationships, schema constraints
- Admin requirements: dashboards, audit logs, RBAC
- Edge cases: explicit examples, failure modes, exceptions
- Testing / security: test coverage, auth, validation, audit
- Deliverables: what must be produced or returned

Preserve every category you find. Never drop a whole category silently.

STEP 2 — Compress safely.
Remove: repeated wording, duplicate warnings, filler, restated instructions.
Merge: multiple instructions that say the same thing → one stronger instruction.
Keep: any wording that changes expected behavior, quality, or correctness.
For complex prompts, output compact structured sections — not one dense paragraph.
Prefer slightly longer output over losing an important requirement.

GUARD — Before returning, verify:
- Every major section from Step 1 is still present.
- Every explicit flow is still present.
- Every hard constraint is still present (must/never/do-not/required).
- Every edge case example is still present in compact form.
- Every deliverable is still present.
If any are missing, restore them before returning JSON.

Core rules:
- Never rewrite into a high-level summary.
- Never silently weaken a constraint when merging.
- Never add new requirements.
- When in doubt, keep it.

What to remove:
- Repeated emphasis ("Do not do X. Do not do X. Really, do not do X." → "Do not do X.")
- Repeated adjectives and filler words.
- Duplicate phrasing that adds no new information.

Output requirements:
- Return valid JSON matching the provided schema.
- "preservedConstraints": list the most important things kept.
- "compressedOrMerged": what was tightened or combined.
- "intentionallyDropped": only clearly redundant content. Empty array if nothing dropped.
`.trim();

const MODE_GUIDANCE = {
  safe: `
Preserve nuance aggressively. Keep everything unless it is obviously word-for-word duplicate.
Prefer a slightly longer result over any doubt.
  `.trim(),
  balanced: `
Remove repetition firmly. Keep any requirement that changes expected behavior, quality, or correctness.
Optimize for shortest safe prompt, not shortest output.
  `.trim(),
  aggressive: `
Maximize reduction. Still preserve anything that affects correctness, product feel, deliverables, or hard constraints.
When unsure whether something is critical, keep it in compact form.
  `.trim(),
};

function buildCompressionContents(prompt, mode, analysisSummary = "", reviewHint = "") {
  const selectedMode = MODE_GUIDANCE[mode] ? mode : "balanced";

  return `
Compression mode: ${selectedMode}
Mode guidance: ${MODE_GUIDANCE[selectedMode]}

Protected segments (treat as high-priority):
${analysisSummary || "No additional protected-content notes."}

${reviewHint ? `Retry guidance — these were missing in the previous attempt:\n${reviewHint}\n` : ""}

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
- Keep all hard requirements, constraints, flows, deliverables, stack, edge cases, and technical details.
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
  buildCompressionContents,
  buildSimpleCompressionContents,
  parseCompressionResponse,
};
