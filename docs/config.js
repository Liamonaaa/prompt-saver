window.PROMPT_SAVER_CONFIG = {
  provider: "groq",
  groq: {
    defaultModel: "llama-3.3-70b-versatile",
    endpointBase: "https://api.groq.com/openai/v1",
  },
  gemini: {
    defaultModel: "gemini-2.0-flash",
    fallbackModels: ["gemini-1.5-flash"],
    endpointBase: "https://generativelanguage.googleapis.com/v1beta",
  },
};
