const { AppError } = require("./app-error");

function getStatusCode(error) {
  if (typeof error?.status === "number") {
    return error.status;
  }

  if (typeof error?.code === "number") {
    return error.code;
  }

  return undefined;
}

function getCombinedMessage(error) {
  return [error?.message, error?.cause?.message, error?.error?.message]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function isModelUnavailableError(error) {
  const statusCode = getStatusCode(error);
  const message = getCombinedMessage(error);

  return (
    statusCode === 404 ||
    message.includes("not found") ||
    message.includes("unsupported model") ||
    message.includes("model") && message.includes("not available")
  );
}

function normalizeGeminiError(error, modelName) {
  if (error instanceof AppError) {
    return error;
  }

  const statusCode = getStatusCode(error);
  const message = getCombinedMessage(error);

  if (message.includes("api key") && (message.includes("invalid") || message.includes("required"))) {
    return new AppError(
      401,
      "invalid_api_key",
      "Gemini rejected the API key. Check GEMINI_API_KEY and confirm the key is valid for the Gemini Developer API.",
      { modelName },
    );
  }

  if (statusCode === 401 || statusCode === 403 || message.includes("permission_denied")) {
    return new AppError(
      401,
      "invalid_api_key",
      "Gemini denied access. Check GEMINI_API_KEY and confirm the project has Gemini Developer API access.",
      { modelName },
    );
  }

  if (statusCode === 429 || message.includes("resource_exhausted") || message.includes("rate limit")) {
    return new AppError(
      429,
      "rate_limited",
      "Gemini is rate limiting this request right now. Wait a moment and try again.",
      { modelName },
    );
  }

  if (
    statusCode === 408 ||
    message.includes("deadline_exceeded") ||
    message.includes("timeout") ||
    message.includes("timed out")
  ) {
    return new AppError(
      504,
      "request_timeout",
      "Gemini took too long to respond. Try a shorter prompt or retry in a moment.",
      { modelName },
    );
  }

  if (isModelUnavailableError(error)) {
    return new AppError(
      503,
      "model_unavailable",
      `The configured Gemini model is unavailable. Check GEMINI_MODEL or try a supported Flash model.`,
      { modelName },
    );
  }

  if (statusCode === 400 || message.includes("invalid_argument")) {
    return new AppError(
      400,
      "invalid_request",
      "Gemini rejected the request payload. Adjust the prompt size or configuration and try again.",
      { modelName },
    );
  }

  return new AppError(
    502,
    "gemini_error",
    "Gemini returned an unexpected error. Try again in a moment.",
    { modelName },
  );
}

module.exports = {
  isModelUnavailableError,
  normalizeGeminiError,
};
