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
