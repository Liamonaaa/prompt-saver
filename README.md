# Prompt Saver

Prompt Saver is a Gemini-powered web app that compresses long prompts for coding agents without turning them into generic summaries. The app is built to preserve the real task goal, hard constraints, do-not-touch rules, technical limitations, and delivery requirements while reducing token-heavy repetition.

## Why this is different from summarization

Prompt Saver uses a dedicated prompt-optimization system instruction rather than a generic summarization prompt. The model is told to:

- preserve core task intent
- preserve hard constraints and do-not-touch rules
- keep technical and output requirements intact
- keep anything ambiguous if removing it could break the result
- merge duplicate instructions and remove filler only when safe

The backend asks Gemini for structured JSON, then computes token estimates server-side so the UI can show reduction metrics without extra model calls.

## Default Gemini model

- Default configured model: `gemini-2.5-flash`
- Fallback model if the default is unavailable at runtime: `gemini-2.5-flash-lite`

The model is configured in one place: [src/config/gemini.js](/C:/Users/liamn/Documents/Codex/2026-04-23-be-extremely-careful-not-to-turn/prompt-saver/src/config/gemini.js)

Why this choice:

- Google’s official Gemini model docs list `gemini-2.5-flash` as the primary Flash model.
- Google’s official thinking docs note that Gemini 2.5 models enable thinking by default, so Prompt Saver sets `thinkingBudget: 0` for 2.5 models to keep free-tier usage lighter.
- If `gemini-2.5-flash` is unavailable in the user’s API environment, Prompt Saver retries once with `gemini-2.5-flash-lite`, which is the closest configured Flash-family fallback.

## Stack

- Frontend: plain HTML, CSS, JavaScript
- Backend: Node.js + Express
- AI provider: Gemini Developer API via `@google/genai`

## Project structure

```text
prompt-saver/
  public/
    app.js
    index.html
    styles.css
  scripts/
    smoke-test.js
  src/
    config/
      gemini.js
    lib/
      app-error.js
      metrics.js
      normalize-gemini-error.js
    prompts/
      compression-prompt.js
    routes/
      compress.js
    services/
      prompt-compressor.js
      providers/
        gemini-provider.js
        mock-provider.js
    app.js
    server.js
  .env.example
  .gitignore
  package.json
  README.md
```

## Setup

1. Install dependencies:

```bash
npm install
```

2. Create a local env file:

```bash
cp .env.example .env
```

3. Set your Gemini API key in `.env`:

```env
GEMINI_API_KEY=your_gemini_api_key_here
```

4. Start the app:

```bash
npm start
```

5. Open [http://localhost:3000](http://localhost:3000)

## Environment variables

```env
PORT=3000
GEMINI_API_KEY=your_gemini_api_key_here
GEMINI_MODEL=gemini-2.5-flash
GEMINI_FALLBACK_MODELS=gemini-2.5-flash-lite
GEMINI_TIMEOUT_MS=20000
PROMPT_SAVER_USE_MOCK=false
```

## Compression flow

1. The frontend sends the original prompt and selected mode to `POST /api/compress`.
2. The backend validates the request and forwards one structured compression request to Gemini.
3. The system instruction forces prompt-optimizer behavior instead of generic summarization.
4. Gemini returns JSON with:
   - optimized prompt
   - preserved critical constraints
   - compressed or merged sections
5. The server estimates token reduction from prompt length and sends the final payload back to the UI.

Only one Gemini request is used per compression action unless the configured model is unavailable, in which case the backend retries once with the configured fallback model.

## Preserving critical constraints

Prompt Saver preserves critical constraints in three ways:

1. The system prompt explicitly prioritizes hard constraints above style preferences.
2. The model is instructed to keep any ambiguous instruction if removing it could affect correctness or safety.
3. The UI returns a visible list of preserved constraints so users can quickly verify the compression did not drop anything important.

## Error handling

The backend maps common Gemini failures to friendly UI messages, including:

- invalid or missing API key
- unavailable model
- rate limits and quota exhaustion
- request timeout
- malformed request payloads

## Local validation

Run the built-in smoke test:

```bash
npm run smoke-test
```

This uses the mock provider so you can verify the full frontend-backend contract locally without spending API quota. Production use still goes through Gemini unless `PROMPT_SAVER_USE_MOCK=true`.
