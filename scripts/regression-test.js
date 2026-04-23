process.env.PROMPT_SAVER_USE_MOCK = "true";

const assert = require("node:assert/strict");
const { analyzePrompt, reviewCompressionResult } = require("../src/services/compression-analyzer");
const { compressPrompt } = require("../src/services/prompt-compressor");

const cases = [
  {
    name: "repeated style instructions",
    prompt: `
Be practical.
Do not be generic.
Think about messy reality, not the ideal case.
Explain tradeoffs, not just the happy path.
Give a clear recommendation, not a neutral summary.
    `.trim(),
    expectedProtected: [/practical/i, /generic/i, /tradeoffs?/i, /recommend/i],
  },
  {
    name: "long business prompt",
    prompt: `
Evaluate whether this catering marketplace can become a real business.
Do not confuse interest with conversion.
People may say they are interested and still never place an order.
Look at false demand signals, margin fragility, and scaling risk.
Explain tradeoffs and give a clear recommendation.
Warn about operationally dangerous ideas that sound attractive.
    `.trim(),
    expectedProtected: [/conversion/i, /margin/i, /risk/i, /recommend/i],
  },
  {
    name: "numbered requirements",
    prompt: `
Return:
1. Recommendation
2. Risks
3. Execution plan
4. What not to build first
Do not remove the numbered structure.
    `.trim(),
    expectedProtected: [/recommendation/i, /risks/i, /execution plan/i, /numbered structure/i],
  },
  {
    name: "edge-case examples",
    prompt: `
Expect operational friction.
Customers may ask questions, customize dishes, or cancel late.
Preserve these examples in compressed form because they affect staffing and margin.
    `.trim(),
    expectedProtected: [/questions/i, /customize/i, /cancel/i, /margin/i],
  },
  {
    name: "specificity hidden inside repetition",
    prompt: `
Be practical.
Do not be generic.
Ground the answer in real-world constraints rather than idealized assumptions.
    `.trim(),
    expectedProtected: [/practical/i, /generic/i, /real-world/i],
  },
  {
    name: "strong final recommendation requirement",
    prompt: `
Do not end with a neutral summary.
Pick a direction.
Give a clear recommendation and explain the tradeoffs.
    `.trim(),
    expectedProtected: [/neutral summary/i, /pick a direction/i, /tradeoffs?/i],
  },
];

async function runAnalyzerAssertions() {
  for (const testCase of cases) {
    const analysis = analyzePrompt(testCase.prompt);

    assert.ok(
      analysis.protectedSegments.length > 0,
      `Expected protected segments for case: ${testCase.name}`,
    );

    for (const pattern of testCase.expectedProtected) {
      assert.ok(
        analysis.protectedSegments.some((segment) => pattern.test(segment.text)),
        `Missing protected segment ${pattern} in case: ${testCase.name}`,
      );
    }
  }
}

async function runCompressionAssertions() {
  const prompt = `
Build an internal dashboard for restaurant operations.
Do not make this feel generic.
It should feel polished and app-like, not just responsive.
Preserve operational friction examples like questions, customizations, and late cancellations.
Explain tradeoffs and give a clear recommendation.
Return:
1. Recommendation
2. Risks
3. Execution plan
  `.trim();

  const result = await compressPrompt({ prompt, mode: "balanced" });
  const review = reviewCompressionResult(analyzePrompt(prompt), result);

  assert.ok(result.optimizedPrompt.length > 0);
  assert.ok(result.estimatedTokenReduction.estimatedReductionPercent >= 0);
  assert.ok(Array.isArray(result.preservedConstraints));
  assert.ok(Array.isArray(result.compressedOrMerged));
  assert.ok(Array.isArray(result.intentionallyDropped));
  assert.equal(typeof result.qualityReport.removedRepetition, "boolean");
  assert.equal(result.qualityReport.compressionLevel, "Balanced");
  assert.equal(review.missingDeliverables.length, 0);
  assert.equal(review.missingDecisionSignals.length, 0);
}

async function run() {
  await runAnalyzerAssertions();
  await runCompressionAssertions();
  console.log("Regression tests passed.");
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
