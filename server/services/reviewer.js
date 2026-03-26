const { z } = require("zod");

const reviewResponseSchema = z.object({
  summary: z.string(),
  overallRisk: z.enum(["low", "medium", "high"]).default("medium"),
  findings: z
    .array(
      z.object({
        severity: z.enum(["critical", "high", "medium", "low"]),
        title: z.string(),
        details: z.string(),
        recommendation: z.string(),
        file: z.string().optional(),
        line: z.number().int().optional(),
      })
    )
    .min(1),
  suggestedTests: z.array(z.string()).default([]),
  assumptions: z.array(z.string()).default([]),
});

function mockReview(input, inputType, aiError) {
  const baseFinding = {
    severity: "medium",
    title: "Potential issue needs verification",
    details:
      inputType === "diff"
        ? "Review the modified sections for logic and edge cases. The diff context is limited."
        : "Scan for correctness, security, and performance; ensure inputs are validated and errors are handled.",
    recommendation:
      "Add tests for edge cases, validate inputs, and confirm error handling and authorization boundaries.",
  };

  return reviewResponseSchema.parse({
    summary: "Mock review (AI unavailable).",
    overallRisk: "medium",
    findings: [baseFinding],
    suggestedTests: [
      "Add unit tests for the main control flow and error paths.",
      "Add input validation tests (empty/invalid values).",
      "Add security-focused tests if any user input is used.",
    ],
    assumptions: [
      "This is a mock response; configure AI_PROVIDER and API keys to enable real reviews.",
      aiError ? `AI error: ${String(aiError)}` : "AI error: not available.",
    ],
  });
}

function extractFirstJsonObject(text) {
  if (typeof text !== "string") return null;
  const firstBrace = text.indexOf("{");
  const lastBrace = text.lastIndexOf("}");
  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) return null;
  const candidate = text.slice(firstBrace, lastBrace + 1);
  return candidate;
}

async function callOpenAIChat({ prompt, temperature = 0.2 }) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  const baseUrl = process.env.OPENAI_BASE_URL || "https://api.openai.com/v1";
  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";

  const url = `${baseUrl.replace(/\/$/, "")}/chat/completions`;

  const body = {
    model,
    temperature,
    messages: [
      {
        role: "system",
        content:
          "You are a strict senior code reviewer. Return ONLY valid JSON that matches the required schema. No markdown.",
      },
      { role: "user", content: prompt },
    ],
  };

  const resp = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`AI request failed: ${resp.status} ${text}`.trim());
  }

  const data = await resp.json();
  const content = data?.choices?.[0]?.message?.content;
  return content ?? "";
}

async function callHuggingFace({ prompt, temperature = 0.2 }) {
  const apiKey = process.env.HF_API_KEY;
  if (!apiKey) return null;

  const baseUrl = process.env.HF_BASE_URL || "https://router.huggingface.co/v1";
  const model = process.env.HF_MODEL || "mistralai/Mistral-7B-Instruct-v0.2";

  // HF Router Responses API (OpenAI-compatible style):
  // POST {baseUrl}/responses
  const url = `${baseUrl.replace(/\/$/, "")}/responses`;

  const reviewJsonSchema = {
    name: "CodeReview",
    schema: {
      type: "object",
      properties: {
        summary: { type: "string" },
        overallRisk: { type: "string", enum: ["low", "medium", "high"] },
        findings: {
          type: "array",
          minItems: 1,
          items: {
            type: "object",
            properties: {
              severity: {
                type: "string",
                enum: ["critical", "high", "medium", "low"],
              },
              title: { type: "string" },
              details: { type: "string" },
              recommendation: { type: "string" },
              file: { type: "string" },
              line: { type: "integer" },
            },
            required: ["severity", "title", "details", "recommendation"],
            additionalProperties: false,
          },
        },
        suggestedTests: { type: "array", items: { type: "string" } },
        assumptions: { type: "array", items: { type: "string" } },
      },
      required: ["summary", "overallRisk", "findings", "suggestedTests", "assumptions"],
      additionalProperties: false,
    },
    strict: true,
  };

  const body = {
    model,
    instructions:
      "You are a strict senior code reviewer. Return ONLY valid JSON matching the provided JSON schema. No markdown, no extra text. " +
      "The `findings` array MUST contain at least 1 item. Never return an empty array. " +
      "If there are no significant issues, return one finding with severity 'low' titled 'No significant issues found'.",
    input: prompt,
    temperature,
    response_format: {
      type: "json_schema",
      json_schema: reviewJsonSchema,
    },
  };

  const resp = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`HF request failed: ${resp.status} ${text}`.trim());
  }

  const data = await resp.json().catch(() => null);

  const hfErrorMessage =
    typeof data?.error?.message === "string" ? data.error.message : null;
  if (hfErrorMessage) {
    throw new Error(hfErrorMessage);
  }

  function collectStrings(value, acc) {
    if (typeof value === "string") acc.push(value);
    else if (Array.isArray(value)) value.forEach((v) => collectStrings(v, acc));
    else if (value && typeof value === "object") {
      for (const k of Object.keys(value)) collectStrings(value[k], acc);
    }
  }

  // Prefer the chunk of text that contains our JSON schema keys.
  const strings = [];
  collectStrings(data, strings);

  const jsonCandidate =
    strings.find((s) => s.includes("\"overallRisk\"") && s.includes("{")) ||
    strings.find((s) => s.includes("overallRisk") && s.includes("{")) ||
    null;

  if (jsonCandidate) return jsonCandidate;

  const outputText =
    typeof data?.output_text === "string"
      ? data.output_text
      : typeof data?.output_text === "number"
        ? String(data.output_text)
        : null;
  if (outputText) return outputText;

  // As a last resort, if we have any string at all, return it.
  if (strings.length > 0) return strings[strings.length - 1];

  return null;
}

function buildPrompt({ input, inputType, language, context }) {
  const safeLanguage = language ? `Language: ${language}\n` : "";
  const safeContext = context ? `Project context: ${context}\n` : "";
  return (
    "Return ONLY a single valid JSON object (no markdown, no extra text). The response must start with '{' and end with '}'.\n" +
    "Use this structure exactly:\n" +
    "{\n" +
    '  "summary": string,\n' +
    '  "overallRisk": "low" | "medium" | "high",\n' +
    '  "findings": [\n' +
    "    {\n" +
    '      "severity": "critical" | "high" | "medium" | "low",\n' +
    '      "title": string,\n' +
    '      "details": string,\n' +
    '      "recommendation": string,\n' +
    '      "file": string (optional),\n' +
    '      "line": number (optional)\n' +
    "    }\n" +
    "  ],\n" +
    '  "suggestedTests": string[],\n' +
    '  "assumptions": string[]\n' +
    "}\n\n" +
    "Important: The `findings` array MUST contain at least 1 item. Never return an empty array.\n" +
    "If there are no significant issues, return one finding with severity 'low' titled 'No significant issues found'.\n\n" +
    "Code input type:\n" +
    `Input type: ${inputType}\n` +
    safeLanguage +
    safeContext +
    "\nCode/Diff:\n" +
    input
  );
}

async function reviewCode({ input, inputType, language, context }) {
  const prompt = buildPrompt({ input, inputType, language, context });

  const provider = (process.env.AI_PROVIDER || "").toLowerCase();

  try {
    if (provider === "huggingface") {
      const aiContent = await callHuggingFace({ prompt });
      if (!aiContent) return mockReview(input, inputType, "Hugging Face returned empty output.");

      const jsonText = extractFirstJsonObject(aiContent);
      if (!jsonText) return mockReview(input, inputType, "Hugging Face output did not contain JSON.");

      const parsed = JSON.parse(jsonText);
      return reviewResponseSchema.parse(parsed);
    }

    // Default provider: OpenAI (backwards-compatible)
    if (process.env.OPENAI_API_KEY) {
      const aiContent = await callOpenAIChat({ prompt });
      const jsonText = extractFirstJsonObject(aiContent);
      if (!jsonText) return mockReview(input, inputType, "OpenAI output did not contain JSON.");
      const parsed = JSON.parse(jsonText);
      return reviewResponseSchema.parse(parsed);
    }

    return mockReview(input, inputType, "No AI keys configured.");
  } catch (e) {
    // If AI calls fail, never break the app; fallback to mock review.
    // eslint-disable-next-line no-console
    console.warn("AI request failed; falling back to mock:", e?.message || e);
    return mockReview(input, inputType, e?.message || e);
  }
}

module.exports = { reviewCode };

