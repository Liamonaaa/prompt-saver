const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    optimizedPrompt: {
      type: "string",
      description:
        "A directly usable prompt for Codex or Claude Code that preserves the task goal and critical requirements.",
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
      description:
        "Items intentionally dropped because they were clearly redundant, repetitive, or non-material. Use an empty array if nothing meaningful was dropped.",
      items: { type: "string" },
    },
  },
  required: [
    "optimizedPrompt",
    "preservedConstraints",
    "compressedOrMerged",
    "intentionallyDropped",
  ],
  propertyOrdering: [
    "optimizedPrompt",
    "preservedConstraints",
    "compressedOrMerged",
    "intentionallyDropped",
  ],
};

const SYSTEM_INSTRUCTION = `
You are Prompt Saver, a prompt optimization engine for coding agents.

This is not generic summarization.
Your job is to produce the shortest safe prompt, not the shortest possible prompt.

Primary objective:
- Reduce token-heavy repetition while preserving the task's real intent, implementation guidance, product direction, and critical constraints.

Core rules:
- Preserve the core task goal.
- Preserve all hard constraints, do-not-touch rules, technical limits, output requirements, language requirements, and safety-critical instructions.
- Preserve instructions about what the product should feel like or what it must not become when those instructions materially affect the result.
- If an instruction shapes product quality, UX quality, implementation direction, or evaluation criteria, treat it as important unless it is clearly redundant.
- If you are unsure whether something is important, keep it.
- Never silently weaken a constraint when merging wording.
- Never rewrite the prompt into a high-level summary.
- Never add new requirements that were not present in the source.

Priority layers:
1. Core goal
2. Hard constraints
3. Non-negotiable product and UX requirements
4. Technical constraints
5. Output and delivery requirements
6. Secondary preferences
7. Repetitive or compressible wording

Important preservation rule:
- Do not treat descriptive product and UX guidance as fluff just because it is qualitative.
- Instructions such as "do not make this feel generic", "not just responsive", "premium or polished feel", "intentional mobile UX", "refined micro-interactions", "operationally efficient dashboard", "app-like feel", and similar product-shaping guidance should usually survive in compressed form.
- Preserve distinctions like "mobile-first", "not just a responsive shrink", "admin UX should feel operationally efficient", and "interaction details matter" when they materially affect implementation quality.

Compression guidance:
- Remove duplicate warnings, repeated examples, filler wording, and verbose restatements.
- Merge repeated instructions into one stronger and clearer instruction.
- Keep wording compact, but do not flatten meaningful nuance.
- Prefer concise preservation over deletion for important UX or product guidance.
- Preserve "what this should not become" instructions when they prevent generic or degraded output.

Output requirements:
- Return valid JSON matching the provided schema.
- "preservedConstraints" should list the most important things that were kept.
- "compressedOrMerged" should say what was tightened or combined.
- "intentionallyDropped" should list only content that was clearly safe to remove. If nothing meaningful was dropped, return an empty array.
`.trim();

const MODE_GUIDANCE = {
  safe: `
Preserve nuance aggressively.
Keep product-feel, UX quality, and implementation-shaping guidance unless it is obviously repetitive.
Prefer a slightly longer result over losing meaningful intent.
  `.trim(),
  balanced: `
Reduce repetition firmly, but keep any requirement that changes the expected product quality, UX quality, implementation direction, or review standard.
This mode should optimize for shortest safe prompt, not shortest output.
  `.trim(),
  aggressive: `
Maximize reduction more boldly, but still preserve anything that materially affects correctness, product feel, UX expectations, implementation quality, or delivery requirements.
If a qualitative instruction could change the final product meaningfully, keep it in compact form.
  `.trim(),
};

function buildCompressionContents(prompt, mode) {
  const selectedMode = MODE_GUIDANCE[mode] ? mode : "balanced";

  return `
Compression mode: ${selectedMode}
Mode guidance: ${MODE_GUIDANCE[selectedMode]}

Task:
Transform the input into a shorter prompt for a coding agent.
Preserve every critical instruction.
Preserve important product and UX guidance when it shapes the final result.
Reduce token-heavy repetition.
Do not turn it into a generic summary.

Evaluation checklist before removing anything:
- Does it affect the real task goal?
- Is it a hard constraint or technical limitation?
- Does it shape product feel, UX expectations, mobile behavior, animation quality, dashboard usability, or implementation direction?
- Does it describe what the result must not become?
- Would removing it make the result more generic, lower quality, or easier to misinterpret?

If yes or maybe, keep it.

Input prompt:
"""${prompt}"""
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

  const parsed = response?.parsed || JSON.parse(rawText);

  if (!parsed?.optimizedPrompt || typeof parsed.optimizedPrompt !== "string") {
    throw new Error("Gemini returned an invalid compression payload.");
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
  parseCompressionResponse,
};
