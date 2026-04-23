const MODE_LABELS = {
  safe: "Light",
  balanced: "Balanced",
  aggressive: "Aggressive",
};

const STOPWORDS = new Set([
  "the",
  "and",
  "for",
  "with",
  "that",
  "this",
  "from",
  "into",
  "your",
  "their",
  "then",
  "than",
  "they",
  "them",
  "have",
  "has",
  "should",
  "must",
  "will",
  "would",
  "could",
  "keep",
  "make",
  "more",
  "less",
  "just",
  "very",
  "also",
  "only",
  "when",
  "where",
  "what",
  "which",
  "into",
  "over",
  "under",
  "about",
  "after",
  "before",
  "using",
  "used",
  "like",
  "need",
  "needs",
  "dont",
  "doesnt",
  "shouldnt",
  "mustnt",
  "אין",
  "אסור",
  "חובה",
  "צריך",
  "צריכה",
  "הזה",
  "הזאת",
  "האלה",
  "כדי",
  "אבל",
  "אלא",
  "יותר",
  "פחות",
  "זה",
  "זאת",
  "של",
  "עם",
  "בלי",
  "תוך",
  "אחרי",
  "לפני",
  "מאוד",
]);

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[`"'.,:;!?()[\]{}]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildKeywords(text) {
  const matches = normalizeText(text).match(/[a-z\u0590-\u05ff][a-z\u0590-\u05ff'-]{2,}/g) || [];

  return [...new Set(matches.filter((token) => token.length >= 4 && !STOPWORDS.has(token)))].slice(0, 8);
}

function detectTags(text) {
  const tags = [];

  if (
    /(must|must not|never|do not|don't|cannot|can't|required|non-negotiable|preserve|keep|do not remove|don't remove|אסור|אין ל|חובה|לשמור|אל תשנה)/i.test(
      text,
    )
  ) {
    tags.push("hard_constraint");
  }

  if (/(return|output|deliverable|format|section|include|final answer|plan|risks?|deliverables?|numbered)/i.test(text)) {
    tags.push("output_requirement");
  }

  if (
    /(recommend|recommendation|be opinionated|clear recommendation|final decision|choose|pick a direction|take a stance|tradeoffs?|prioritization|explain tradeoffs)/i.test(
      text,
    )
  ) {
    tags.push("decision_instruction");
  }

  if (
    /(practical|generic|premium|polished|app-like|micro-interactions?|psychology|realistic|honest|specific|messy reality|mobile-first|intentional mobile|operational|dashboard|ux|tone|depth|style|not just responsive|not just a responsive shrink|be practical)/i.test(
      text,
    )
  ) {
    tags.push("quality_instruction");
  }

  if (
    /(example|for example|e\.g\.|questions|customiz|cancel|delay|friction|edge case|failure|warning|caveat|false demand|convert|interested|margin|fragility|reluctance|operational risk|late cancellation|messy)/i.test(
      text,
    )
  ) {
    tags.push("edge_case");
  }

  if (/\bnot\b.+\bbut\b|rather than|instead of|not just|לא .* אלא|במקום|ולא רק/i.test(text)) {
    tags.push("contrast");
  }

  if (
    /(api|backend|frontend|node|express|database|schema|typescript|react|gemini|quota|timeout|audit|rbac|role-based|webhook|mobile|responsive|accessibility)/i.test(
      text,
    )
  ) {
    tags.push("technical_constraint");
  }

  if (/(risk|danger|failure|break|fragile|operationally dangerous|unsafe|warning|caution|reluctance)/i.test(text)) {
    tags.push("risk_language");
  }

  return tags;
}

function scoreSegment(text, tags) {
  let score = 1;

  if (tags.includes("hard_constraint")) {
    score = Math.max(score, 5);
  }

  if (tags.includes("output_requirement") || tags.includes("decision_instruction")) {
    score = Math.max(score, 4);
  }

  if (tags.includes("quality_instruction") || tags.includes("edge_case") || tags.includes("risk_language")) {
    score = Math.max(score, 4);
  }

  if (tags.includes("contrast") || tags.includes("technical_constraint")) {
    score = Math.max(score, 4);
  }

  if (/^\d+[.)]\s/.test(text) || /^[-*]\s/.test(text)) {
    score = Math.max(score, 3);
  }

  if (text.length > 180) {
    score = Math.min(5, score + 1);
  }

  return Math.max(1, Math.min(5, score));
}

function splitPrompt(prompt) {
  return prompt
    .split(/\r?\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function analyzePrompt(prompt) {
  const segments = splitPrompt(prompt).map((text, index) => {
    const tags = detectTags(text);
    const score = scoreSegment(text, tags);
    const keywords = buildKeywords(text);
    const protectedSegment =
      score >= 4 ||
      tags.includes("contrast") ||
      tags.includes("output_requirement") ||
      tags.includes("decision_instruction") ||
      tags.includes("risk_language");

    return {
      index,
      text,
      normalized: normalizeText(text),
      tags,
      score,
      keywords,
      protectedSegment,
    };
  });

  const protectedSegments = segments.filter((segment) => segment.protectedSegment);
  const scoredCounts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };

  segments.forEach((segment) => {
    scoredCounts[segment.score] += 1;
  });

  return {
    segments,
    protectedSegments,
    scoredCounts,
    summaryLines: protectedSegments
      .slice(0, 12)
      .map((segment) => `[${segment.score}] ${segment.text}`),
  };
}

function segmentIsRepresented(segment, resultText) {
  if (!segment.keywords.length) {
    return resultText.includes(segment.normalized.slice(0, Math.min(36, segment.normalized.length)));
  }

  const matchedKeywords = segment.keywords.filter((keyword) => resultText.includes(keyword)).length;
  const minimumMatches = Math.min(Math.max(1, Math.ceil(segment.keywords.length / 2)), 3);

  return matchedKeywords >= minimumMatches;
}

function reviewCompressionResult(analysis, result) {
  const haystack = normalizeText(
    [
      result?.optimizedPrompt,
      ...(result?.preservedConstraints || []),
      ...(result?.compressedOrMerged || []),
      ...(result?.intentionallyDropped || []),
    ].join("\n"),
  );

  const missingProtectedSegments = analysis.protectedSegments.filter(
    (segment) => !segmentIsRepresented(segment, haystack),
  );

  const missingDeliverables = analysis.protectedSegments.filter(
    (segment) => segment.tags.includes("output_requirement") && !segmentIsRepresented(segment, haystack),
  );

  const missingDecisionSignals = analysis.protectedSegments.filter(
    (segment) => segment.tags.includes("decision_instruction") && !segmentIsRepresented(segment, haystack),
  );

  return {
    missingProtectedSegments,
    missingDeliverables,
    missingDecisionSignals,
    shouldRetry: missingProtectedSegments.length > 0,
  };
}

function buildAnalysisSummary(analysis) {
  if (!analysis.summaryLines.length) {
    return "No additional protected-content findings.";
  }

  return analysis.summaryLines.join("\n");
}

function buildReviewHint(review) {
  if (!review?.missingProtectedSegments?.length) {
    return "";
  }

  return review.missingProtectedSegments
    .slice(0, 8)
    .map((segment) => `- Restore or strengthen: ${segment.text}`)
    .join("\n");
}

function buildQualityReport({ mode, result, review }) {
  return {
    removedRepetition: Boolean(result?.compressedOrMerged?.length),
    importantNuancePreserved: !review.missingProtectedSegments.length,
    compressionLevel: MODE_LABELS[mode] || MODE_LABELS.balanced,
  };
}

module.exports = {
  analyzePrompt,
  buildAnalysisSummary,
  buildQualityReport,
  buildReviewHint,
  reviewCompressionResult,
};
