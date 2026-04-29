# Prompt Saver

Prompt Saver is a Gemma-powered web app that compresses long prompts for coding agents without turning them into generic summaries. It preserves the real task goal, hard constraints, do-not-touch rules, technical limitations, and delivery requirements while reducing token-heavy repetition.

## Default model

The default brain is Gemma 4 through local Ollama:

- Provider: `gemma`
- Model: `gemma4:latest`
- API URL: `http://127.0.0.1:11434/api/chat`

This expects the local Ollama model tag `gemma4:latest`.

## Stack

- Frontend: plain HTML, CSS, JavaScript
- Backend: Node.js + Express
- Default AI provider: local Ollama running Gemma 4
- Optional providers: Groq and Gemini

## Setup

1. Install dependencies:

```bash
npm install
```

2. Install and start Ollama.

3. Pull the Gemma model:

```bash
ollama pull gemma4
```

4. Create a local env file:

```bash
cp .env.example .env
```

5. Start the app:

```bash
npm start
```

6. Open [http://localhost:3000](http://localhost:3000)

## Environment variables

```env
PORT=3000
PROMPT_SAVER_PROVIDER=gemma
GEMMA_MODEL=gemma4:latest
GEMMA_API_URL=http://127.0.0.1:11434/api/chat
GEMMA_TIMEOUT_MS=180000
GEMMA_MAX_OUTPUT_TOKENS=8192
PROMPT_SAVER_USE_MOCK=false
```

To switch back to another provider:

```env
PROMPT_SAVER_PROVIDER=groq
GROQ_API_KEY=your_groq_api_key_here
```

or:

```env
PROMPT_SAVER_PROVIDER=gemini
GEMINI_API_KEY=your_gemini_api_key_here
```

## Compression flow

1. The frontend sends the original prompt and selected mode to `POST /api/compress`.
2. The backend validates the request and forwards one structured compression request to the configured provider.
3. The system instruction forces prompt-optimizer behavior instead of generic summarization.
4. The provider returns JSON with:
   - optimized prompt
   - preserved critical constraints
   - compressed or merged sections
   - intentionally dropped repetition
5. The server estimates token reduction from prompt length and sends the final payload back to the UI.

## Local validation

Run the built-in tests:

```bash
npm test
npm run smoke-test
```

The test scripts use the mock provider, so they do not require Ollama or API quota.
