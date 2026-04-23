process.env.PROMPT_SAVER_USE_MOCK = "true";

const assert = require("node:assert/strict");
const { analyzePrompt, reviewCompressionResult } = require("../src/services/compression-analyzer");
const { compressPrompt } = require("../src/services/prompt-compressor");
const { robustParseJson } = require("../src/lib/parse-json");
const { parseCompressionResponse } = require("../src/prompts/compression-prompt");

const analyzerCases = [
  {
    name: "repeated style instructions",
    prompt: "Be practical.\nDo not be generic.\nThink about messy reality.\nExplain tradeoffs.\nGive a clear recommendation.",
    expectedProtected: [/practical/i, /generic/i, /tradeoffs?/i, /recommend/i],
  },
  {
    name: "long business prompt",
    prompt: "Evaluate this catering marketplace.\nDo not confuse interest with conversion.\nLook at false demand signals, margin fragility, and scaling risk.\nExplain tradeoffs and give a clear recommendation.",
    expectedProtected: [/conversion/i, /margin/i, /risk/i, /recommend/i],
  },
  {
    name: "numbered requirements",
    prompt: "Return:\n1. Recommendation\n2. Risks\n3. Execution plan\nDo not remove the numbered structure.",
    expectedProtected: [/recommendation/i, /risks/i, /execution plan/i, /numbered structure/i],
  },
  {
    name: "edge-case examples",
    prompt: "Expect operational friction.\nCustomers may ask questions, customize dishes, or cancel late.\nPreserve these examples because they affect staffing and margin.",
    expectedProtected: [/questions/i, /customize/i, /cancel/i, /margin/i],
  },
  {
    name: "strong final recommendation requirement",
    prompt: "Do not end with a neutral summary.\nPick a direction.\nGive a clear recommendation and explain the tradeoffs.",
    expectedProtected: [/neutral summary/i, /pick a direction/i, /tradeoffs?/i],
  },
];

const parserCases = [
  {
    name: "valid JSON",
    input: '{"optimizedPrompt":"test","preservedConstraints":[],"compressedOrMerged":[],"intentionallyDropped":[]}',
    expectNull: false,
  },
  {
    name: "code-fenced JSON",
    input: "```json\n{\"optimizedPrompt\":\"test\",\"preservedConstraints\":[],\"compressedOrMerged\":[],\"intentionallyDropped\":[]}\n```",
    expectNull: false,
  },
  {
    name: "code fence without language tag",
    input: "```\n{\"optimizedPrompt\":\"hello\",\"preservedConstraints\":[],\"compressedOrMerged\":[],\"intentionallyDropped\":[]}\n```",
    expectNull: false,
  },
  {
    name: "JSON embedded in prose",
    input: "Here is the result:\n{\"optimizedPrompt\":\"embedded\",\"preservedConstraints\":[],\"compressedOrMerged\":[],\"intentionallyDropped\":[]}",
    expectNull: false,
  },
  {
    name: "truncated JSON",
    input: '{"optimizedPrompt":"truncated prompt text',
    expectNull: false,
  },
  {
    name: "plain text returns null",
    input: "This is just plain text with no JSON.",
    expectNull: true,
  },
  {
    name: "empty string returns null",
    input: "",
    expectNull: true,
  },
];

const responseParserCases = [
  {
    name: "text field as string",
    response: { text: '{"optimizedPrompt":"ok","preservedConstraints":[],"compressedOrMerged":[],"intentionallyDropped":[]}' },
    expectThrow: false,
  },
  {
    name: "pre-parsed object",
    response: { parsed: { optimizedPrompt: "ok", preservedConstraints: [], compressedOrMerged: [], intentionallyDropped: [] } },
    expectThrow: false,
  },
  {
    name: "code-fenced in text",
    response: { text: "```json\n{\"optimizedPrompt\":\"fenced\",\"preservedConstraints\":[],\"compressedOrMerged\":[],\"intentionallyDropped\":[]}\n```" },
    expectThrow: false,
  },
  {
    name: "empty text throws",
    response: { text: "" },
    expectThrow: true,
  },
  {
    name: "missing optimizedPrompt throws",
    response: { text: '{"preservedConstraints":[],"compressedOrMerged":[],"intentionallyDropped":[]}' },
    expectThrow: true,
  },
];

const COMPLEX_PROMPT = [
  "Build an internal dashboard for restaurant operations.",
  "Do not make this feel generic.",
  "It should feel polished and app-like, not just responsive.",
  "Preserve operational friction examples like questions, customizations, and late cancellations.",
  "Explain tradeoffs and give a clear recommendation.",
  "Return:",
  "1. Recommendation",
  "2. Risks",
  "3. Execution plan",
  "Stack: React frontend, Node.js backend, PostgreSQL.",
  "Admin must have RBAC with at least 3 roles: owner, manager, staff.",
  "Preserve audit logging — do not remove it.",
  "Webhook retry logic must be preserved as-is.",
  "Dark mode is required.",
].join("\n");

async function runAnalyzerTests() {
  for (const tc of analyzerCases) {
    const analysis = analyzePrompt(tc.prompt);
    assert.ok(analysis.protectedSegments.length > 0, `No protected segments: ${tc.name}`);
    for (const pattern of tc.expectedProtected) {
      assert.ok(
        analysis.protectedSegments.some((s) => pattern.test(s.text)),
        `Missing protected segment ${pattern} in: ${tc.name}`,
      );
    }
  }
  console.log("  OK Analyzer tests");
}

function runParserTests() {
  for (const tc of parserCases) {
    const result = robustParseJson(tc.input);
    if (tc.expectNull) {
      assert.equal(result, null, `Expected null for: ${tc.name}`);
    } else {
      assert.notEqual(result, null, `Expected non-null for: ${tc.name}`);
    }
  }
  console.log("  OK robustParseJson tests");
}

function runResponseParserTests() {
  for (const tc of responseParserCases) {
    if (tc.expectThrow) {
      assert.throws(() => parseCompressionResponse(tc.response), Error, `Expected throw for: ${tc.name}`);
    } else {
      const result = parseCompressionResponse(tc.response);
      assert.ok(result.optimizedPrompt, `Expected optimizedPrompt for: ${tc.name}`);
    }
  }
  console.log("  OK parseCompressionResponse tests");
}

async function runCompressionTest() {
  const result = await compressPrompt({ prompt: COMPLEX_PROMPT, mode: "balanced" });
  const review = reviewCompressionResult(analyzePrompt(COMPLEX_PROMPT), result);

  assert.ok(result.optimizedPrompt.length > 0, "optimizedPrompt empty");
  assert.ok(result.estimatedTokenReduction.estimatedReductionPercent >= 0, "reduction pct < 0");
  assert.ok(Array.isArray(result.preservedConstraints));
  assert.ok(Array.isArray(result.compressedOrMerged));
  assert.ok(Array.isArray(result.intentionallyDropped));
  assert.equal(typeof result.qualityReport.removedRepetition, "boolean");
  assert.equal(review.missingDeliverables.length, 0, "missing deliverables");
  assert.equal(review.missingDecisionSignals.length, 0, "missing decision signals");
  console.log("  OK Compression integration test");
}

async function run() {
  console.log("Running regression tests...");
  runParserTests();
  runResponseParserTests();
  await runAnalyzerTests();
  await runCompressionTest();
  console.log("\nAll tests passed.");
}

run().catch((error) => {
  console.error("\nTest failed:", error.message);
  process.exitCode = 1;
});
