process.env.PROMPT_SAVER_USE_MOCK = "true";

const assert = require("node:assert/strict");
const { analyzePrompt, reviewCompressionResult } = require("../src/services/compression-analyzer");
const { compressPrompt } = require("../src/services/prompt-compressor");
const { _private: gemmaProviderPrivate } = require("../src/services/providers/gemma-provider");
const { robustParseJson } = require("../src/lib/parse-json");
const {
  MODE_GUIDANCE,
  SYSTEM_INSTRUCTION,
  buildCompressionContents,
  detectCompressionRiskSignals,
  parseCompressionResponse,
} = require("../src/prompts/compression-prompt");

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

const ONBOARDING_REGRESSION_PROMPT = `
You are an expert product strategist, UX researcher, and technical writer helping a small B2B SaaS company redesign its onboarding flow for a complex analytics dashboard used by operations managers in mid-sized logistics companies.

Your task is to produce a detailed onboarding redesign proposal that is practical, specific, and prioritized. The company's current onboarding has the following problems: users often skip the setup wizard, many accounts never connect their first data source, users do not understand the difference between dashboards, alerts, reports, and automations, and the sales team frequently has to manually explain concepts that should be self-explanatory in the product. The product is powerful but intimidating, and new users often feel they need training before they can get value.

The target users are operations managers, dispatch supervisors, and analysts. They are busy, not always technical, and usually care more about solving operational problems than exploring software features. Their main goals are to identify delays, reduce idle time, monitor SLA breaches, generate weekly performance summaries, and create alerts when certain thresholds are crossed. They may be importing data from spreadsheets, internal databases, or third-party fleet-management systems.

Please create a proposal with the following sections:

1. Executive summary: explain the main onboarding strategy in 3-5 concise paragraphs.
2. Current-state diagnosis: identify the most likely causes of poor activation and explain how each one affects user behavior.
3. New onboarding principles: define 5-7 principles that should guide the redesign, such as progressive disclosure, outcome-first setup, contextual education, and reducing blank states.
4. Recommended onboarding flow: describe the full step-by-step experience from first login to first meaningful value. Include what the user sees, what action they take, what the system should explain, and what success looks like at each step.
5. Copy examples: write sample microcopy for at least 8 important UI moments, including welcome screen, data-source connection, empty dashboard state, first alert creation, failed import, confusing terminology, success state, and invite-teammate prompt.
6. Segmentation: propose how the onboarding should adapt for different user roles and data maturity levels.
7. Activation metrics: define specific metrics that should be tracked, including leading indicators, lagging indicators, and qualitative signals.
8. Experiment plan: propose at least 5 A/B tests or product experiments, each with hypothesis, variant, primary metric, and possible downside.
9. Risks and tradeoffs: explain what could go wrong with the redesign and how to mitigate those risks.
10. Implementation roadmap: divide the work into short-term, medium-term, and long-term phases, assuming the team has 2 product designers, 4 engineers, 1 product manager, and limited customer-success bandwidth.

Important constraints:
- Do not suggest a generic product tour as the main solution.
- Do not assume users will read long documentation.
- Do not over-focus on visual polish; prioritize behavior change and activation.
- Keep the proposal realistic for a small team.
- Avoid vague advice like "make it intuitive" unless you explain exactly how.
- Use plain language, not startup buzzwords.
- Where relevant, mention tradeoffs between speed, personalization, engineering effort, and learning quality.
- The final answer should be structured, scannable, and detailed enough that a product team could discuss it in a planning meeting.
- Use concrete examples, not just abstract principles.
- Assume the product currently has weak analytics instrumentation and suggest how to improve measurement without delaying the whole redesign.
`.trim();

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

function runGemmaProviderParserTests() {
  const malformedGemmaJson = `{
    "optimizedPrompt": "Keep all constraints, including \\"do not\\" rules."
    "preservedConstraints": ["Do not remove numbered sections", "Use at least 8 examples"],
    "compressedOrMerged": ["Removed repeated filler"],
    "intentionallyDropped": []
  `;
  const parsed = gemmaProviderPrivate.parseLooseGemmaJson(malformedGemmaJson);

  assert.equal(parsed.optimizedPrompt, 'Keep all constraints, including "do not" rules.');
  assert.deepEqual(parsed.preservedConstraints, [
    "Do not remove numbered sections",
    "Use at least 8 examples",
  ]);
  assert.deepEqual(parsed.compressedOrMerged, ["Removed repeated filler"]);
  console.log("  OK Gemma provider loose parser tests");
}

function runPromptTemplateTests() {
  const balancedContents = buildCompressionContents(ONBOARDING_REGRESSION_PROMPT, "balanced");
  const aggressiveContents = buildCompressionContents(ONBOARDING_REGRESSION_PROMPT, "aggressive");
  const riskSignals = detectCompressionRiskSignals(ONBOARDING_REGRESSION_PROMPT);
  const combinedInstruction = `${SYSTEM_INSTRUCTION}\n${balancedContents}`;

  assert.match(SYSTEM_INSTRUCTION, /negative constraint/i, "system prompt must protect negative constraints");
  assert.match(SYSTEM_INSTRUCTION, /numbered section/i, "system prompt must protect numbered sections");
  assert.match(SYSTEM_INSTRUCTION, /count|threshold/i, "system prompt must protect counts and thresholds");
  assert.match(SYSTEM_INSTRUCTION, /examples.*affect answer quality/i, "system prompt must protect quality-shaping examples");
  assert.match(SYSTEM_INSTRUCTION, /LaTeX|symbolic notation/i, "system prompt must forbid unwanted LaTeX");
  assert.match(SYSTEM_INSTRUCTION, /Faithfulness checklist/i, "system prompt must include a faithfulness checklist");
  assert.match(SYSTEM_INSTRUCTION, /slightly longer/i, "system prompt must prefer faithfulness over over-compression");

  assert.match(MODE_GUIDANCE.balanced, /55-75%/, "balanced mode should target 55-75% length");
  assert.match(MODE_GUIDANCE.balanced, /preserve quality over maximum compression/i);
  assert.match(aggressiveContents, /Aggressive-mode safety override/i);
  assert.match(aggressiveContents, /Compress conservatively/i);

  for (const expectedSignal of [
    "numbered required sections",
    "many negative constraints",
    "formatting requirements",
    "evaluation criteria",
  ]) {
    assert.ok(riskSignals.includes(expectedSignal), `Missing aggressive-mode risk signal: ${expectedSignal}`);
  }

  for (const expectedPhrase of [
    "do not assume users will read long documentation",
    "Avoid vague advice",
    "at least 8",
    "at least 5",
    "operations managers",
    "third-party fleet-management systems",
    "weak analytics instrumentation",
  ]) {
    assert.match(combinedInstruction, new RegExp(expectedPhrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"));
  }

  assert.doesNotMatch(combinedInstruction, /\$\\ge/, "template should not model LaTeX count phrasing");
  console.log("  OK prompt template tests");
}

function runOnboardingRegressionAnalyzerTests() {
  const analysis = analyzePrompt(ONBOARDING_REGRESSION_PROMPT);
  const protectedText = analysis.protectedSegments.map((segment) => segment.text).join("\n");

  for (const pattern of [
    /Executive summary/i,
    /Current-state diagnosis/i,
    /Copy examples/i,
    /at least 8/i,
    /at least 5/i,
    /Do not suggest a generic product tour/i,
    /Do not assume users will read long documentation/i,
    /Avoid vague advice/i,
    /weak analytics instrumentation/i,
  ]) {
    assert.match(protectedText, pattern, `Missing protected onboarding requirement: ${pattern}`);
  }

  const lossyResult = {
    optimizedPrompt: "Create a concise onboarding proposal with concrete examples for a SaaS dashboard.",
    preservedConstraints: [],
    compressedOrMerged: [],
    intentionallyDropped: [],
  };
  const review = reviewCompressionResult(analysis, lossyResult);
  assert.ok(review.missingProtectedSegments.length > 0, "lossy onboarding compression should be flagged");
  assert.ok(review.missingDeliverables.length > 0, "lossy onboarding compression should flag missing deliverables");
  console.log("  OK onboarding regression analyzer tests");
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
  runGemmaProviderParserTests();
  runPromptTemplateTests();
  await runAnalyzerTests();
  runOnboardingRegressionAnalyzerTests();
  await runCompressionTest();
  console.log("\nAll tests passed.");
}

run().catch((error) => {
  console.error("\nTest failed:", error.message);
  process.exitCode = 1;
});
