process.env.PROMPT_SAVER_USE_MOCK = "true";

const assert = require("node:assert/strict");
const { createApp } = require("../src/app");

async function run() {
  const app = createApp();
  const server = app.listen(0);

  try {
    await new Promise((resolve, reject) => {
      server.once("listening", resolve);
      server.once("error", reject);
    });

    const { port } = server.address();
    const baseUrl = `http://127.0.0.1:${port}`;

    const healthResponse = await fetch(`${baseUrl}/api/health`);
    const healthPayload = await healthResponse.json();

    assert.equal(healthResponse.status, 200);
    assert.equal(healthPayload.ok, true);
    assert.equal(healthPayload.provider, "mock");

    const compressResponse = await fetch(`${baseUrl}/api/compress`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        mode: "balanced",
        prompt: "Do not remove hard constraints.\nDo not remove hard constraints.\nKeep output direct.",
      }),
    });

    const compressPayload = await compressResponse.json();

    assert.equal(compressResponse.status, 200);
    assert.equal(compressPayload.ok, true);
    assert.match(compressPayload.result.optimizedPrompt, /Do not remove hard constraints/);
    assert.equal(typeof compressPayload.result.estimatedTokenReduction.estimatedReductionPercent, "number");
    assert.ok(Array.isArray(compressPayload.result.intentionallyDropped));

    const productPrompt = `
Build a polished internal operations dashboard for a logistics team.
Do not make this feel generic.
It should feel premium and app-like, not just a responsive shrink of the desktop layout.
Preserve intentional mobile UX for dispatchers in the field.
Preserve refined micro-interactions when they clarify state changes.
The admin experience must feel operationally efficient, not decorative.
Do not make this feel generic.
Keep the backend in Node.js and preserve audit logging.
Output should include implementation plan and delivery risks.
    `.trim();

    const productResponse = await fetch(`${baseUrl}/api/compress`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        mode: "balanced",
        prompt: productPrompt,
      }),
    });

    const productPayload = await productResponse.json();

    assert.equal(productResponse.status, 200);
    assert.equal(productPayload.ok, true);
    assert.ok(
      productPayload.result.preservedConstraints.some((item) =>
        /generic|premium|mobile|operational|interaction/i.test(item),
      ),
    );
    assert.ok(Array.isArray(productPayload.result.compressedOrMerged));
    assert.ok(Array.isArray(productPayload.result.intentionallyDropped));

    console.log("Smoke test passed.");
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
