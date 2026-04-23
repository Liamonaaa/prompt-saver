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

function groupMergedLines(lines) {
  const normalizedGroups = new Map();

  for (const line of lines) {
    const normalized = line.toLowerCase().replace(/\s+/g, " ").trim();

    if (!normalizedGroups.has(normalized)) {
      normalizedGroups.set(normalized, []);
    }

    normalizedGroups.get(normalized).push(line);
  }

  return [...normalizedGroups.values()].filter((group) => group.length > 1);
}

function extractConstraintLines(prompt) {
  return prompt
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) =>
      /must|never|do not|don't|cannot|can't|required|preserve|keep|premium|polished|mobile-first|responsive|generic|dashboard|interaction|ux|app-like/i.test(
        line,
      ),
    );
}

async function compress({ prompt, mode, analysisSummary, reviewHint }) {
  const lines = prompt
    .split(/\r?\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
  const dedupedLines = dedupeLines(lines);
  const mergedGroups = groupMergedLines(lines);
  const preservedConstraints = dedupeLines(extractConstraintLines(prompt)).slice(0, 6);
  const optimizedPrompt = dedupedLines.join("\n");
  const compressedOrMerged = [
    `Merged duplicate lines in ${mode} mode.`,
    ...mergedGroups.slice(0, 2).map((group) => `Merged repeated guidance: ${group[0]}`),
  ];

  if (analysisSummary) {
    compressedOrMerged.push("Protected high-priority instructions before compressing.");
  }

  if (reviewHint) {
    compressedOrMerged.push("Ran a meaning-loss retry to restore weakened nuance.");
  }

  return {
    optimizedPrompt,
    preservedConstraints,
    compressedOrMerged: dedupeLines(compressedOrMerged).slice(0, 6),
    intentionallyDropped: [],
    selectedModel: "mock-gemini-provider",
    usedFallbackModel: false,
  };
}

module.exports = {
  compress,
};
