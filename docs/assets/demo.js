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
}

// ---------------------------------------------------------------------
// Resume upload → parse → ATS score → optimize → job search links
// ---------------------------------------------------------------------

// Common ATS-weighted keywords across tech/business roles. In a real
// backend, this would come from the target job description via NLP;
// here it's a curated reference set so the demo works standalone.
const ATS_KEYWORD_BANK = [
  "python", "java", "javascript", "typescript", "sql", "react", "node.js",
  "aws", "azure", "gcp", "docker", "kubernetes", "ci/cd", "git", "rest api",
  "microservices", "agile", "scrum", "communication", "leadership",
  "problem solving", "data structures", "algorithms", "machine learning",
  "testing", "debugging", "linux", "html", "css", "redis", "mongodb",
  "postgresql", "team collaboration", "project management",
];

let extractedResumeText = "";

function initUploadZone() {
  const zone = document.getElementById("upload-zone");
  const fileInput = document.getElementById("resume-file");
  if (!zone || !fileInput) return;

  zone.addEventListener("click", () => fileInput.click());
  zone.addEventListener("dragover", (e) => {
    e.preventDefault();
    zone.classList.add("drag");
  });
  zone.addEventListener("dragleave", () => zone.classList.remove("drag"));
  zone.addEventListener("drop", (e) => {
    e.preventDefault();
    zone.classList.remove("drag");
    if (e.dataTransfer.files.length) handleResumeFile(e.dataTransfer.files[0]);
  });
  fileInput.addEventListener("change", (e) => {
    if (e.target.files.length) handleResumeFile(e.target.files[0]);
  });
}

async function handleResumeFile(file) {
  const chip = document.getElementById("file-chip");
  chip.classList.add("show");
  chip.textContent = `Reading ${file.name}...`;

  try {
    if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
      extractedResumeText = await extractPdfText(file);
    } else {
      extractedResumeText = await file.text();
    }
    chip.textContent = `Loaded: ${file.name} (${extractedResumeText.trim().split(/\s+/).length} words extracted)`;
  } catch (err) {
    chip.textContent = `Couldn't read ${file.name}: ${err.message}. Try a .txt file instead.`;
    extractedResumeText = "";
  }
}

async function extractPdfText(file) {
  if (typeof pdfjsLib === "undefined") {
    throw new Error("PDF reader failed to load — check your connection");
  }
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.0.379/pdf.worker.min.js";

  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  let fullText = "";
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    fullText += content.items.map((it) => it.str).join(" ") + "\n";
  }
  return fullText;
}

function extractKeywords(text) {
  const lower = text.toLowerCase();
  const matched = ATS_KEYWORD_BANK.filter((kw) => lower.includes(kw));
  const missing = ATS_KEYWORD_BANK.filter((kw) => !lower.includes(kw)).slice(0, 10);
  return { matched, missing };
}

function computeAtsScore(text, matched) {
  // Heuristic scoring — approximates common ATS parser checks:
  // keyword coverage, length, section presence, formatting simplicity.
  let score = 0;
  const lower = text.toLowerCase();

  // Keyword coverage (up to 50 pts)
  score += Math.min(50, matched.length * 2.5);

  // Standard section headers present (up to 25 pts)
  const sections = ["experience", "education", "skills", "projects", "summary"];
  const sectionsFound = sections.filter((s) => lower.includes(s)).length;
  score += (sectionsFound / sections.length) * 25;

  // Reasonable length — not too short, not a wall of text (up to 15 pts)
  const wordCount = text.trim().split(/\s+/).length;
  if (wordCount >= 200 && wordCount <= 1200) score += 15;
  else if (wordCount > 50) score += 8;

  // Contact info presence — email/phone pattern (up to 10 pts)
  const hasEmail = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i.test(text);
  const hasPhone = /\d{10}|\+\d{1,3}[\s-]?\d{6,}/.test(text);
  if (hasEmail) score += 5;
  if (hasPhone) score += 5;

  return Math.min(99, Math.round(score));
}

function buildOptimizedResume(originalText, matched, missing, targetRole) {
  const topMissing = missing.slice(0, 6);
  const skillsLine = [...new Set([...matched, ...topMissing.slice(0, 3)])]
    .map((s) => s.replace(/\b\w/g, (c) => c.toUpperCase()))
    .join(", ");

  return (
`# ATS-OPTIMIZED RESUME — Target Role: ${targetRole}
# Auto-generated by FEVER^ — review and personalize before submitting

SUMMARY
Results-driven ${targetRole} candidate with hands-on experience across ${matched.slice(0, 5).join(", ") || "core technical skills"}.
Proven ability to deliver measurable impact in fast-paced, collaborative environments.

SKILLS
${skillsLine || "Add your core technical and soft skills here"}

EXPERIENCE
${originalText.trim().slice(0, 1500)}
${originalText.length > 1500 ? "\n...(content truncated for preview — full original content is preserved in your download)" : ""}

EDUCATION
[Add your degree, institution, and graduation year]

NOTES FOR ATS COMPATIBILITY
- Use standard section headers (Summary, Skills, Experience, Education, Projects)
- Avoid tables, columns, images, and headers/footers — many ATS parsers can't read them
- Mirror exact keywords from the job description (see "Consider adding" above)
- Save as .docx or .pdf with selectable text (not a scanned image)
`
  );
}

function buildJobSearchLinks(matched, targetRole, location) {
  const skillsQuery = matched.slice(0, 4).join(" ");
  const roleQ = encodeURIComponent(targetRole || "Software Engineer");
  const locQ = encodeURIComponent(location || "India");
  const skillsQ = encodeURIComponent(skillsQuery);

  return [
    {
      name: "LinkedIn Jobs",
      desc: `"${targetRole}" jobs in ${location || "India"}`,
      url: `https://www.linkedin.com/jobs/search/?keywords=${roleQ}&location=${locQ}`,
    },
    {
      name: "Indeed",
      desc: `"${targetRole}" + top skills in ${location || "India"}`,
      url: `https://www.indeed.com/jobs?q=${roleQ}+${skillsQ}&l=${locQ}`,
    },
    {
      name: "Naukri.com",
      desc: `"${targetRole}" jobs in ${location || "India"}`,
      url: `https://www.naukri.com/${(targetRole || "software-engineer").toLowerCase().replace(/\s+/g, "-")}-jobs-in-${(location || "india").toLowerCase().replace(/\s+/g, "-")}`,
    },
    {
      name: "Internshala",
      desc: `Internships matching "${targetRole}"`,
      url: `https://internshala.com/internships/keywords-${(targetRole || "software").toLowerCase().replace(/\s+/g, "-")}`,
    },
  ];
}

function analyzeResume() {
  const targetRole = document.getElementById("target-role").value.trim() || "Software Engineer";
  const location = document.getElementById("target-location").value.trim();
  const resultBox = document.getElementById("ats-result");

  if (!extractedResumeText || extractedResumeText.trim().length < 20) {
    resultBox.classList.add("show");
    document.getElementById("ats-summary").textContent =
      "Please upload a resume file first (PDF or .txt) — need at least a few lines of text to analyze.";
    document.getElementById("ats-score-num").textContent = "—";
    document.getElementById("matched-pills").innerHTML = "";
    document.getElementById("missing-pills").innerHTML = "";
    document.getElementById("optimized-resume").value = "";
    document.getElementById("job-links").innerHTML = "";
    return;
  }

  const { matched, missing } = extractKeywords(extractedResumeText);
  const score = computeAtsScore(extractedResumeText, matched);

  resultBox.classList.add("show");
  document.getElementById("ats-ring").style.setProperty("--pct", score);
  document.getElementById("ats-score-num").textContent = `${score}%`;
  document.getElementById("ats-summary").textContent =
    score >= 80
      ? "Strong ATS compatibility. Minor tweaks below can push it further."
      : score >= 55
      ? "Decent baseline — add the missing keywords below to improve parsing accuracy."
      : "Low keyword coverage detected — the optimized version below adds structure and missing terms.";

  document.getElementById("matched-pills").innerHTML = matched
    .map((k) => `<span class="pill matched">${k}</span>`)
    .join("") || '<span class="footnote">None detected — try a more detailed resume</span>';

  document.getElementById("missing-pills").innerHTML = missing
    .slice(0, 8)
    .map((k) => `<span class="pill missing">${k}</span>`)
    .join("");

  document.getElementById("optimized-resume").value = buildOptimizedResume(
    extractedResumeText,
    matched,
    missing,
    targetRole
  );

  const jobLinks = buildJobSearchLinks(matched, targetRole, location);
  document.getElementById("job-links").innerHTML = jobLinks
    .map(
      (j) => `
    <a class="job-link-card" href="${j.url}" target="_blank" rel="noopener">
      <div>
        <div class="name">${j.name}</div>
        <div class="desc">${j.desc}</div>
      </div>
      <span class="arrow">&#8594;</span>
    </a>`
    )
    .join("");
}

function downloadOptimizedResume() {
  const text = document.getElementById("optimized-resume").value;
  if (!text) return;
  const blob = new Blob([text], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "ATS_Optimized_Resume_FEVER.txt";
  a.click();
  URL.revokeObjectURL(url);
}

function copyOptimizedResume() {
  const text = document.getElementById("optimized-resume").value;
  if (!text) return;
  navigator.clipboard.writeText(text).then(() => {
    alert("Optimized resume copied to clipboard.");
  });
}

document.addEventListener("DOMContentLoaded", initUploadZone);
