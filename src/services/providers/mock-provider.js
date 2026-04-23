function dedupeLines(lines) {
  const seen = new Set();
  const result = [];

  for (const line of lines) {
    const normalized = line.toLowerCase();

    if (normalized && !seen.has(normalized)) {
      seen.add(normalized);
      result.push(line);
    }
  }

  return result;
}

function extractConstraintLines(prompt) {
  return prompt
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => /must|never|do not|don't|cannot|can't|required|preserve|keep/i.test(line));
}

async function compress({ prompt, mode }) {
  const lines = prompt
    .split(/\r?\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
  const dedupedLines = dedupeLines(lines);
  const preservedConstraints = dedupeLines(extractConstraintLines(prompt)).slice(0, 6);
  const optimizedPrompt = dedupedLines.join("\n");

  return {
    optimizedPrompt,
    preservedConstraints,
    compressedOrMerged: [
      `Merged duplicate lines in ${mode} mode.`,
      "Removed repeated warnings and filler phrasing for smoke-test output.",
    ],
    selectedModel: "mock-gemini-provider",
    usedFallbackModel: false,
  };
}

module.exports = {
  compress,
};
