const DEFAULT_MODEL = "gemma4:latest";
const DEFAULT_API_URL = "http://127.0.0.1:11434/api/chat";
const DEFAULT_TIMEOUT_MS = 60_000;
const DEFAULT_MAX_OUTPUT_TOKENS = 8192;

const gemmaConfig = {
  model: (process.env.GEMMA_MODEL || DEFAULT_MODEL).trim(),
  apiUrl: (process.env.GEMMA_API_URL || DEFAULT_API_URL).trim(),
  timeoutMs: Number.parseInt(process.env.GEMMA_TIMEOUT_MS || DEFAULT_TIMEOUT_MS, 10),
  maxOutputTokens: Number.parseInt(
    process.env.GEMMA_MAX_OUTPUT_TOKENS || DEFAULT_MAX_OUTPUT_TOKENS,
    10,
  ),
};

module.exports = {
  DEFAULT_MODEL,
  DEFAULT_API_URL,
  gemmaConfig,
};
