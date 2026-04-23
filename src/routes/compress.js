const express = require("express");
const { AppError } = require("../lib/app-error");
const { compressPrompt } = require("../services/prompt-compressor");

const router = express.Router();
const MODES = new Set(["safe", "balanced", "aggressive"]);
const MAX_PROMPT_LENGTH = 60_000;

function normalizeMode(value) {
  return value === "light" ? "safe" : value;
}

router.post("/", async (req, res, next) => {
  try {
    const prompt = typeof req.body?.prompt === "string" ? req.body.prompt.trim() : "";
    const requestedMode =
      typeof req.body?.mode === "string" ? req.body.mode.trim().toLowerCase() : "balanced";
    const mode = normalizeMode(requestedMode);

    if (!prompt) {
      throw new AppError(400, "missing_prompt", "Paste a prompt before trying to compress it.");
    }

    if (prompt.length > MAX_PROMPT_LENGTH) {
      throw new AppError(
        400,
        "prompt_too_large",
        `The prompt is too large for this lightweight flow. Keep it under ${MAX_PROMPT_LENGTH.toLocaleString()} characters.`,
      );
    }

    if (!MODES.has(mode)) {
      throw new AppError(400, "invalid_mode", "Choose Safe, Balanced, or Aggressive mode.");
    }

    const result = await compressPrompt({ prompt, mode });

    res.json({
      ok: true,
      result,
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
