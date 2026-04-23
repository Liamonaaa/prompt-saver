const path = require("path");
const express = require("express");
const compressionRouter = require("./routes/compress");
const { AppError } = require("./lib/app-error");
const { geminiConfig } = require("./config/gemini");

function createApp() {
  const app = express();
  const publicDir = path.join(__dirname, "..", "public");

  app.disable("x-powered-by");
  app.use(express.json({ limit: "200kb" }));
  app.use(express.static(publicDir));

  app.get("/api/health", (_req, res) => {
    res.json({
      ok: true,
      provider: geminiConfig.useMockProvider ? "mock" : "gemini",
      configuredModel: geminiConfig.defaultModel,
      fallbackModels: geminiConfig.fallbackModels,
    });
  });

  app.use("/api/compress", compressionRouter);

  app.use((_req, _res, next) => {
    next(new AppError(404, "not_found", "That route does not exist."));
  });

  app.use((error, _req, res, _next) => {
    const appError =
      error instanceof AppError
        ? error
        : new AppError(500, "internal_error", "Unexpected server error.");

    res.status(appError.statusCode).json({
      ok: false,
      error: {
        code: appError.code,
        message: appError.message,
        details: appError.details,
      },
    });
  });

  return app;
}

module.exports = {
  createApp,
};
