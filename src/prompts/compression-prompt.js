const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    optimizedPrompt: {
      type: "string",
      description:
        "A directly usable prompt for Codex or Claude Code that preserves all critical requirements.",
    },
    preservedConstraints: {
      type: "array",
      description: "Critical constraints that were explicitly preserved.",
      items: { type: "string" },
    },
    compressedOrMerged: {
      type: "array",
      description: "Areas where repeated or filler content was merged or shortened.",
      items: { type: "string" },
    },
  },
  required: ["optimizedPrompt", "preservedConstraints", "compressedOrMerged"],
  propertyOrdering: ["optimizedPrompt", "preservedConstraints", "compressedOrMerged"],
};

const SYSTEM_INSTRUCTION = `
You are Prompt Saver, a prompt optimization engine for coding agents.

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
- Remove repetition, filler wording, repeated warnings, and redundant examples unless the example is essential to preserve behavior.
- Keep the optimized prompt directly usable in Codex or Claude Code.
- Do not explain the prompt at length.
- Do not write a summary of the original text.
- Do not add new requirements that were not present in the source.

Compression priority:
1. Core task goal
2. Hard constraints
3. What must not be changed
4. Technical constraints
5. Output and delivery requirements
6. Secondary design preferences
7. Nice-to-have details

Return valid JSON matching the provided schema.
`.trim();

const MODE_GUIDANCE = {
  safe: "Favor maximal preservation. Remove obvious repetition and fluff only.",
  balanced: "Compress firmly, merge duplicates, and shorten wording without risking constraints.",
  aggressive:
    "Compress hard where safe, but still keep any requirement that could affect correctness, safety, or deliverables.",
};

function buildCompressionContents(prompt, mode) {
  const selectedMode = MODE_GUIDANCE[mode] ? mode : "balanced";

  return `
Compression mode: ${selectedMode}
Mode guidance: ${MODE_GUIDANCE[selectedMode]}

Task:
Transform the input into a shorter prompt for a coding agent.
Preserve every critical instruction.
Reduce token-heavy repetition.
Do not turn it into a generic summary.

Input prompt:
"""${prompt}"""
  `.trim();
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
    preservedConstraints: Array.isArray(parsed.preservedConstraints)
      ? parsed.preservedConstraints.filter(Boolean).slice(0, 8)
      : [],
    compressedOrMerged: Array.isArray(parsed.compressedOrMerged)
      ? parsed.compressedOrMerged.filter(Boolean).slice(0, 8)
      : [],
  };
}

module.exports = {
  RESPONSE_SCHEMA,
  SYSTEM_INSTRUCTION,
  buildCompressionContents,
  parseCompressionResponse,
};
