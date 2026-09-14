/**
 * FEVER^ static-site demo logic.
 *
 * If a backend URL is provided, calls the real FastAPI /api/v1/match endpoint.
 * Otherwise falls back to a JS re-implementation of the same token-overlap
 * scoring used server-side in app/main.py (_cpu_bound_match_score), so the
 * demo works standalone on GitHub Pages with zero backend.
 *
 * Designed and Developed by Nikhil Chary Sriramoju
 * GitHub: https://github.com/Nikhil-creat
 * LinkedIn: https://in.linkedin.com/in/nikhil-chary-sriramoju-95041b38a
 * Email: sriramojunikhil66@gmail.com | Phone: +91 6300556301
 */

function mockMatchScore(jobDescription, resumeText) {
  const tokenize = (s) =>
    new Set(
      s
        .toLowerCase()
        .split(/[^a-z0-9+.#]+/)
        .filter(Boolean)
    );

  const jdTokens = tokenize(jobDescription);
  const resumeTokens = tokenize(resumeText);

  if (jdTokens.size === 0) return 0;

  let overlap = 0;
  jdTokens.forEach((t) => {
    if (resumeTokens.has(t)) overlap += 1;
  });

  return Math.round((overlap / jdTokens.size) * 10000) / 10000;
}

function setModeTag(isLive) {
  const tag = document.getElementById("mode-tag");
  if (!tag) return;
  if (isLive) {
    tag.textContent = "live backend";
    tag.className = "tag live";
  } else {
    tag.textContent = "mock mode";
    tag.className = "tag mock";
  }
}

async function runMatch() {
  const backendUrl = document.getElementById("backend-url").value.trim();
  const jd = document.getElementById("jd").value.trim();
  const resumeText = document.getElementById("resume").value.trim();
  const candidateId = document.getElementById("cand-id").value.trim() || "demo-candidate";

  const resultBox = document.getElementById("result");
  const scoreVal = document.getElementById("score-val");
  const metaBox = document.getElementById("result-meta");

  if (!jd || !resumeText) {
    resultBox.classList.add("show");
    scoreVal.textContent = "—";
    metaBox.textContent = "Please provide both a job description and resume text.";
    return;
  }

  resultBox.classList.add("show");
  scoreVal.textContent = "…";
  metaBox.textContent = backendUrl ? "Calling live backend..." : "Running local mock scoring...";

  // Attempt real backend call if a URL was provided
  if (backendUrl) {
    try {
      const endpoint = backendUrl.replace(/\/+$/, "") + "/api/v1/match";
      const resp = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          job_description: jd,
          resume_text: resumeText,
          candidate_id: candidateId,
        }),
      });

      if (!resp.ok) throw new Error(`Backend responded with ${resp.status}`);

      const data = await resp.json();
      setModeTag(true);
      scoreVal.textContent = data.score;
      metaBox.textContent = `Live result from ${backendUrl} — cached: ${data.cached}`;
      return;
    } catch (err) {
      // Graceful fallback: backend unreachable (CORS, offline, wrong URL, cold start, etc.)
      setModeTag(false);
      const score = mockMatchScore(jd, resumeText);
      scoreVal.textContent = score;
      metaBox.textContent =
        `Backend unreachable (${err.message}) — showing local mock score instead. ` +
        `Check CORS config and that the URL is correct.`;
      return;
    }
  }

  // No backend configured — pure mock mode
  setModeTag(false);
  const score = mockMatchScore(jd, resumeText);
  scoreVal.textContent = score;
  metaBox.textContent = "No backend URL configured — showing local mock score.";
}
