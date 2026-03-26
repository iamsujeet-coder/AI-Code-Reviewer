const dotenv = require("dotenv");
const path = require("path");

dotenv.config({ path: path.join(__dirname, "..", ".env") });

async function main() {
  const apiKey = process.env.HF_API_KEY;
  const model = process.env.HF_MODEL;
  const baseUrl =
    process.env.HF_BASE_URL || "https://router.huggingface.co/v1";

  const overrideModel = process.argv[2];
  const effectiveModel = overrideModel || model;

  if (!apiKey) {
    console.log("HF_API_KEY missing; set it in server/.env");
    process.exit(0);
  }

  const prompt =
    "Input type: code\n" +
    "Language: JavaScript\n" +
    "Code/Diff:\n" +
    "const x = 1;";

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
              severity: { type: "string", enum: ["critical", "high", "medium", "low"] },
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

  const url = `${baseUrl.replace(/\/$/, "")}/responses`;

  const body = {
    model: effectiveModel,
    instructions:
      "You are a strict senior code reviewer. Return ONLY valid JSON matching the provided JSON schema. No markdown, no extra text.",
    input: prompt,
    temperature: 0.2,
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

  const text = await resp.text();
  console.log("status:", resp.status);
  console.log("first-chars:", text.slice(0, 500));
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e?.message || e);
  process.exit(1);
});

