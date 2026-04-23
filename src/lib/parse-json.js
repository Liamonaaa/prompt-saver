function robustParseJson(text) {
  if (!text || !text.trim()) return null;
  const t = text.trim();

  // 1. Direct parse
  try { return JSON.parse(t); } catch {}

  // 2. Strip code fence (```json ... ``` or ``` ... ```)
  const fenceMatch = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenceMatch) {
    try { return JSON.parse(fenceMatch[1].trim()); } catch {}
  }

  // 3. Extract first {...} block
  const objMatch = t.match(/\{[\s\S]*\}/);
  if (objMatch) {
    try { return JSON.parse(objMatch[0]); } catch {}
  }

  // 4. Attempt truncation repair — try common closing suffixes
  const closings = ['"}', '"}]}', '"]}', '"]}}}', '"]},"intentionallyDropped":[]}', '}}'];
  for (const suffix of closings) {
    try {
      const result = JSON.parse(t + suffix);
      if (result && typeof result === "object") return result;
    } catch {}
  }

  return null;
}

module.exports = { robustParseJson };
