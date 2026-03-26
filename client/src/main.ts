import "./app.css";

type ReviewFinding = {
  severity: "critical" | "high" | "medium" | "low";
  title: string;
  details: string;
  recommendation: string;
  file?: string;
  line?: number;
};

type CodeReviewResponse = {
  summary: string;
  overallRisk: "low" | "medium" | "high";
  findings: ReviewFinding[];
  suggestedTests: string[];
  assumptions: string[];
};

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:5000";

function escapeHtml(s: string) {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function renderReview(review: CodeReviewResponse) {
  const findingsHtml = review.findings
    .map((f) => {
      const loc = f.file
        ? `${escapeHtml(f.file)}${typeof f.line === "number" ? `:${f.line}` : ""}`
        : "";
      return `
        <div class="finding">
          <div class="finding-top">
            <div class="finding-sev ${f.severity}">${escapeHtml(f.severity.toUpperCase())}</div>
            <div class="finding-title">${escapeHtml(f.title)}</div>
          </div>
          ${loc ? `<div class="finding-loc">${loc}</div>` : ""}
          <div class="finding-details">${escapeHtml(f.details)}</div>
          <div class="finding-rec"><span class="label">Recommendation:</span> ${escapeHtml(
            f.recommendation
          )}</div>
        </div>
      `;
    })
    .join("");

  const testsHtml =
    review.suggestedTests.length > 0
      ? `<ul class="list">${review.suggestedTests
          .map((t) => `<li>${escapeHtml(t)}</li>`)
          .join("")}</ul>`
      : `<div class="muted">No test suggestions returned.</div>`;

  const assumptionsHtml =
    review.assumptions.length > 0
      ? `<ul class="list">${review.assumptions
          .map((a) => `<li>${escapeHtml(a)}</li>`)
          .join("")}</ul>`
      : `<div class="muted">No assumptions returned.</div>`;

  return `
    <div class="result-head">
      <div class="risk-pill ${review.overallRisk}">Overall risk: ${escapeHtml(review.overallRisk)}</div>
      <div class="summary">${escapeHtml(review.summary)}</div>
    </div>
    <div class="section-title">Findings</div>
    <div class="findings">${findingsHtml}</div>
    <div class="section-title">Suggested tests</div>
    ${testsHtml}
    <div class="section-title">Assumptions</div>
    ${assumptionsHtml}
  `;
}

function setLoading(isLoading: boolean) {
  const btn = document.querySelector<HTMLButtonElement>("#reviewBtn");
  const status = document.querySelector<HTMLDivElement>("#status");
  if (!btn || !status) return;

  btn.disabled = isLoading;
  btn.textContent = isLoading ? "Reviewing..." : "Review";
  status.textContent = isLoading ? "Sending code to reviewer..." : "";
}

function setFooterError(message: string | null) {
  const footerError = document.querySelector<HTMLDivElement>("#footerError");
  if (!footerError) return;
  footerError.innerHTML = message ? `AI service error: ${escapeHtml(message)}` : "";
}

async function submitReview() {
  const input = (document.querySelector<HTMLTextAreaElement>("#codeInput")?.value || "").trim();
  const inputType = (document.querySelector<HTMLSelectElement>("#inputType")?.value || "code") as
    | "code"
    | "diff";
  const language = (document.querySelector<HTMLInputElement>("#language")?.value || "").trim();
  const context = (document.querySelector<HTMLTextAreaElement>("#context")?.value || "").trim();

  if (!input) {
    alert("Please paste code or a diff first.");
    return;
  }

  setLoading(true);
  setFooterError(null);
  try {
    const resp = await fetch(`${API_BASE}/api/review`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        input,
        inputType,
        language: language || undefined,
        context: context || undefined,
      }),
    });

    if (!resp.ok) {
      const errText = await resp.text().catch(() => "");
      throw new Error(`Request failed: ${resp.status} ${errText}`.trim());
    }

    const data = await resp.json();
    if (!data?.ok || !data?.review) throw new Error("Invalid response from server.");

    const container = document.querySelector<HTMLDivElement>("#result");
    if (!container) return;
    container.innerHTML = renderReview(data.review as CodeReviewResponse);

    const review = data.review as CodeReviewResponse;
    const aiError = (review.assumptions || []).find((a) => a.startsWith("AI error:"));
    setFooterError(aiError ? aiError.replace(/^AI error:\s*/, "") : null);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    setFooterError(message);
    const container = document.querySelector<HTMLDivElement>("#result");
    if (container) container.innerHTML = `<div class="error">Error: ${escapeHtml(message)}</div>`;
  } finally {
    setLoading(false);
  }
}

document.querySelector<HTMLDivElement>("#app")!.innerHTML = `
  <div class="page">
    <header class="topbar">
      <div>
        <div class="title">AI Code Reviewer</div>
        <div class="subtitle">Paste code or a diff and get structured review findings.</div>
      </div>
    </header>

    <main class="grid">
      <section class="card">
        <div class="card-title">Input</div>

        <div class="row">
          <label class="field-label" for="inputType">Input type</label>
          <select id="inputType" class="input">
            <option value="code" selected>Code</option>
            <option value="diff">Git diff</option>
          </select>
        </div>

        <div class="row">
          <label class="field-label" for="language">Language (optional)</label>
          <input id="language" class="input" placeholder="e.g. JavaScript, Python, React" />
        </div>

        <div class="row">
          <label class="field-label" for="context">Context (optional)</label>
          <textarea id="context" class="textarea" rows="3" placeholder="Any constraints, stack, or goal for this review..."></textarea>
        </div>

        <div class="row">
          <label class="field-label" for="codeInput">Code / Diff</label>
          <textarea id="codeInput" class="textarea code" rows="14" placeholder="Paste your code here..."></textarea>
          <div class="hint">Tip: Include surrounding code for better accuracy.</div>
        </div>

        <div class="actions">
          <button id="reviewBtn" class="button" type="button">Review</button>
        </div>

        <div id="status" class="status"></div>
      </section>

      <section class="card">
        <div class="card-title">Review output</div>
        <div id="result" class="result empty">
          Run a review to see findings here.
        </div>
      </section>
    </main>

    <footer class="footer">
      <div class="muted">
        If the service is unavailable, the app returns a fallback response and displays an error in the footer.
      </div>
      <div id="footerError" class="footer-error" aria-live="polite"></div>
    </footer>
  </div>
`;

document.querySelector<HTMLButtonElement>("#reviewBtn")?.addEventListener("click", submitReview);
