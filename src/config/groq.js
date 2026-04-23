const DEFAULT_MODEL = "llama-3.3-70b-versatile";
const DEFAULT_TIMEOUT_MS = 30_000;

const groqConfig = {
  model: (process.env.GROQ_MODEL || DEFAULT_MODEL).trim(),
  timeoutMs: Number.parseInt(process.env.GROQ_TIMEOUT_MS || DEFAULT_TIMEOUT_MS, 10),
};

module.exports = { groqConfig, DEFAULT_MODEL };
