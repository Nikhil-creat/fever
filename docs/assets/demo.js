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

  const name = file.name.toLowerCase();

  try {
    if (file.type === "application/pdf" || name.endsWith(".pdf")) {
      extractedResumeText = await extractPdfText(file);
    } else if (
      name.endsWith(".docx") ||
      file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    ) {
      extractedResumeText = await extractDocxText(file);
    } else if (
      file.type.startsWith("image/") ||
      name.endsWith(".png") ||
      name.endsWith(".jpg") ||
      name.endsWith(".jpeg")
    ) {
      chip.textContent = `Reading ${file.name} — running OCR, this can take 10-20s...`;
      extractedResumeText = await extractImageTextOcr(file);
    } else {
      extractedResumeText = await file.text();
    }

    const wordCount = extractedResumeText.trim().split(/\s+/).filter(Boolean).length;
    if (wordCount < 15) {
      chip.textContent = `Loaded ${file.name}, but only found ${wordCount} words — the file may be a scanned image with poor quality, or empty.`;
    } else {
      chip.textContent = `Loaded: ${file.name} (${wordCount} words extracted)`;
    }
  } catch (err) {
    chip.textContent = `Couldn't read ${file.name}: ${err.message}. Try a different format (.txt always works).`;
    extractedResumeText = "";
  }
}

async function extractPdfText(file) {
  if (typeof pdfjsLib === "undefined") {
    throw new Error("PDF reader failed to load — check your connection and try again");
  }
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  let fullText = "";
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    fullText += content.items.map((it) => it.str).join(" ") + "\n";
  }
  if (fullText.trim().length < 10) {
    throw new Error("No selectable text found — this PDF may be a scanned image. Try uploading it as PNG/JPG instead for OCR");
  }
  return fullText;
}

async function extractDocxText(file) {
  if (typeof mammoth === "undefined") {
    throw new Error("DOCX reader failed to load — check your connection and try again");
  }
  const arrayBuffer = await file.arrayBuffer();
  const result = await mammoth.extractRawText({ arrayBuffer });
  return result.value || "";
}

async function extractImageTextOcr(file) {
  if (typeof Tesseract === "undefined") {
    throw new Error("OCR engine failed to load — check your connection and try again");
  }
  const { data } = await Tesseract.recognize(file, "eng");
  return data.text || "";
}

// ---------------------------------------------------------------------
// Keyword extraction & ATS scoring
// ---------------------------------------------------------------------

function extractKeywords(text) {
  const lower = text.toLowerCase();
  const matched = ATS_KEYWORD_BANK.filter((kw) => lower.includes(kw));
  const missing = ATS_KEYWORD_BANK.filter((kw) => !lower.includes(kw)).slice(0, 10);
  return { matched, missing };
}

const ACTION_VERBS = [
  "led", "built", "designed", "developed", "implemented", "managed",
  "improved", "optimized", "launched", "delivered", "automated", "reduced",
  "increased", "created", "architected", "collaborated", "mentored",
];

function computeAtsScore(text, matched) {
  // Heuristic scoring approximating common ATS parser checks. Weighted
  // generously toward keyword coverage and structure so a genuinely
  // well-written, keyword-rich resume can reach the 90s — this is a
  // client-side approximation, not a real ATS engine's proprietary model.
  let score = 0;
  const lower = text.toLowerCase();

  // Keyword coverage (up to 45 pts) — scales with how many bank terms hit
  score += Math.min(45, matched.length * 3.2);

  // Standard section headers present (up to 20 pts)
  const sections = ["experience", "education", "skills", "projects", "summary"];
  const sectionsFound = sections.filter((s) => lower.includes(s)).length;
  score += (sectionsFound / sections.length) * 20;

  // Reasonable length — not too short, not a wall of text (up to 12 pts)
  const wordCount = text.trim().split(/\s+/).length;
  if (wordCount >= 180 && wordCount <= 1400) score += 12;
  else if (wordCount > 50) score += 7;

  // Contact info presence (up to 8 pts)
  const hasEmail = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i.test(text);
  const hasPhone = /\d{10}|\+\d{1,3}[\s-]?\d{6,}/.test(text);
  if (hasEmail) score += 4;
  if (hasPhone) score += 4;

  // Quantified achievements — numbers/percentages signal measurable impact (up to 8 pts)
  const numberMatches = text.match(/\b\d+(\.\d+)?%?\b/g) || [];
  score += Math.min(8, numberMatches.length);

  // Strong action verbs (up to 7 pts)
  const verbHits = ACTION_VERBS.filter((v) => lower.includes(v)).length;
  score += Math.min(7, verbHits * 1.5);

  return Math.min(100, Math.round(score));
}

// ---------------------------------------------------------------------
// Resume rebuild — plain text + colorful HTML version
// ---------------------------------------------------------------------

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

let lastResumeData = null;

function escapeHtml(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function buildColorfulResumeHtml(originalText, matched, missing, targetRole, score) {
  const skills = [...new Set(matched)].map((s) => s.replace(/\b\w/g, (c) => c.toUpperCase()));
  const bodyText = escapeHtml(originalText.trim()).replace(/\n{2,}/g, "</p><p>").replace(/\n/g, "<br>");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<title>${escapeHtml(targetRole)} — ATS Resume by FEVER^</title>
<style>
  @media print {
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .no-print { display: none !important; }
  }
  body {
    font-family: 'Segoe UI', Arial, sans-serif;
    margin: 0; padding: 0;
    background: #f4f6fb;
    color: #1f2430;
  }
  .page { max-width: 760px; margin: 24px auto; background: #fff; box-shadow: 0 4px 24px rgba(0,0,0,0.08); border-radius: 12px; overflow: hidden; }
  .header {
    background: linear-gradient(135deg, #5b8cff, #34d399);
    color: #fff; padding: 32px 36px;
  }
  .header h1 { margin: 0 0 4px; font-size: 1.8rem; }
  .header .role { font-size: 1rem; opacity: 0.95; }
  .header .score-badge {
    display: inline-block; margin-top: 12px;
    background: rgba(255,255,255,0.2); border: 1px solid rgba(255,255,255,0.5);
    padding: 4px 14px; border-radius: 999px; font-weight: 700; font-size: 0.85rem;
  }
  .body { padding: 28px 36px; }
  .section { margin-bottom: 24px; }
  .section h2 {
    font-size: 0.95rem; text-transform: uppercase; letter-spacing: 0.05em;
    color: #5b8cff; border-bottom: 2px solid #eef1f8; padding-bottom: 6px; margin-bottom: 12px;
  }
  .skills { display: flex; flex-wrap: wrap; gap: 8px; }
  .skill-badge {
    background: #eef4ff; color: #3560d1; border: 1px solid #d7e3ff;
    padding: 4px 12px; border-radius: 999px; font-size: 0.82rem; font-weight: 600;
  }
  .exp-text { font-size: 0.92rem; line-height: 1.7; color: #333; }
  .missing-note {
    background: #fff8e6; border: 1px solid #ffe3a3; border-radius: 8px;
    padding: 12px 16px; font-size: 0.82rem; color: #7a5c00;
  }
  .footer {
    padding: 20px 36px; background: #f9fafc; border-top: 1px solid #eef1f8;
    font-size: 0.78rem; color: #888; display: flex; justify-content: space-between; flex-wrap: wrap; gap: 8px;
  }
  .print-btn {
    display: block; margin: 20px auto; padding: 10px 22px; background: #5b8cff; color: #fff;
    border: none; border-radius: 8px; font-weight: 600; cursor: pointer; font-size: 0.9rem;
  }
</style>
</head>
<body>
  <button class="print-btn no-print" onclick="window.print()">Print / Save as PDF</button>
  <div class="page">
    <div class="header">
      <h1>ATS-Optimized Resume</h1>
      <div class="role">Target role: ${escapeHtml(targetRole)}</div>
      <span class="score-badge">ATS Score: ${score}%</span>
    </div>
    <div class="body">
      <div class="section">
        <h2>Skills</h2>
        <div class="skills">
          ${skills.map((s) => `<span class="skill-badge">${escapeHtml(s)}</span>`).join("") || "<span>Add your skills here</span>"}
        </div>
      </div>
      <div class="section">
        <h2>Experience / Resume Content</h2>
        <div class="exp-text"><p>${bodyText}</p></div>
      </div>
      ${
        missing.length
          ? `<div class="section">
        <h2>Suggested Additions</h2>
        <div class="missing-note">Consider adding these commonly-searched keywords if genuinely applicable to your background: ${escapeHtml(missing.slice(0, 8).join(", "))}.</div>
      </div>`
          : ""
      }
    </div>
    <div class="footer">
      <span>Generated by FEVER^ Resume Matching Engine</span>
      <span>Designed and Developed by Nikhil Chary Sriramoju</span>
    </div>
  </div>
</body>
</html>`;
}

function openColorfulResume() {
  if (!lastResumeData) {
    alert("Analyze a resume first.");
    return;
  }
  const html = buildColorfulResumeHtml(
    lastResumeData.originalText,
    lastResumeData.matched,
    lastResumeData.missing,
    lastResumeData.targetRole,
    lastResumeData.score
  );
  const blob = new Blob([html], { type: "text/html" });
  const url = URL.createObjectURL(blob);
  window.open(url, "_blank");
}

// ---------------------------------------------------------------------
// Job search links — two categories via honest, verifiable search URLs
// (no scraping or unofficial APIs — just pre-filled search queries)
// ---------------------------------------------------------------------

function buildJobSearchLinks(matched, targetRole, location) {
  const role = targetRole || "Software Engineer";
  const loc = location || "India";
  const topSkills = matched.slice(0, 3).join(" ");
  const roleQ = encodeURIComponent(role);
  const locQ = encodeURIComponent(loc);

  const paid = [
    {
      name: "Internshala — Paid internships",
      desc: `"${role}" internships with stipend in ${loc}`,
      url: `https://internshala.com/internships/keywords-${role.toLowerCase().replace(/\s+/g, "-")}`,
    },
    {
      name: "LinkedIn — Internship & entry-level jobs",
      desc: `"${role}" roles in ${loc}, filter by Internship/Entry level`,
      url: `https://www.linkedin.com/jobs/search/?keywords=${roleQ}%20internship&location=${locQ}`,
    },
    {
      name: "Google Search — paid internships",
      desc: `Web-wide search for paid "${role}" internships with certificate + LOR`,
      url: `https://www.google.com/search?q=${roleQ}+internship+${encodeURIComponent(loc)}+stipend+certificate+%22letter+of+recommendation%22`,
    },
  ];

  const unpaid = [
    {
      name: "Internshala — Unpaid internships",
      desc: `"${role}" internships (no stipend) in ${loc} — certificate + LOR`,
      url: `https://internshala.com/internships/keywords-${role.toLowerCase().replace(/\s+/g, "-")}-work-from-home`,
    },
    {
      name: "LinkedIn — Volunteer & project-based roles",
      desc: `Unpaid/volunteer "${role}" opportunities in ${loc}`,
      url: `https://www.linkedin.com/jobs/search/?keywords=${roleQ}%20volunteer&location=${locQ}`,
    },
    {
      name: "Google Search — unpaid internships",
      desc: `Web-wide search for unpaid "${role}" internships offering certificate + LOR`,
      url: `https://www.google.com/search?q=${roleQ}+unpaid+internship+${encodeURIComponent(loc)}+certificate+%22letter+of+recommendation%22`,
    },
  ];

  return { paid, unpaid };
}

function renderJobLinks(containerId, links) {
  document.getElementById(containerId).innerHTML = links
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

// ---------------------------------------------------------------------
// Main analyze action
// ---------------------------------------------------------------------

function analyzeResume() {
  const targetRole = document.getElementById("target-role").value.trim() || "Software Engineer";
  const location = document.getElementById("target-location").value.trim();
  const resultBox = document.getElementById("ats-result");

  if (!extractedResumeText || extractedResumeText.trim().length < 20) {
    resultBox.classList.add("show");
    document.getElementById("ats-summary").textContent =
      "Please upload a resume file first (PDF, DOCX, TXT, or an image) — need at least a few lines of text to analyze.";
    document.getElementById("ats-score-num").textContent = "—";
    document.getElementById("matched-pills").innerHTML = "";
    document.getElementById("missing-pills").innerHTML = "";
    document.getElementById("optimized-resume").value = "";
    document.getElementById("job-links-paid").innerHTML = "";
    document.getElementById("job-links-unpaid").innerHTML = "";
    return;
  }

  const { matched, missing } = extractKeywords(extractedResumeText);
  const score = computeAtsScore(extractedResumeText, matched);

  resultBox.classList.add("show");
  document.getElementById("ats-ring").style.setProperty("--pct", score);
  document.getElementById("ats-score-num").textContent = `${score}%`;
  document.getElementById("ats-summary").textContent =
    score >= 90
      ? "Excellent ATS compatibility — this resume is well-structured and keyword-rich."
      : score >= 70
      ? "Good baseline — add a few missing keywords below to push it higher."
      : score >= 50
      ? "Decent baseline — add the missing keywords and section headers below."
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

  lastResumeData = {
    originalText: extractedResumeText,
    matched,
    missing,
    targetRole,
    score,
  };

  const { paid, unpaid } = buildJobSearchLinks(matched, targetRole, location);
  renderJobLinks("job-links-paid", paid);
  renderJobLinks("job-links-unpaid", unpaid);
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
