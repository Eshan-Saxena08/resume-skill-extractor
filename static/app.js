/* =====================
   HELPERS
===================== */

const ALLOWED_EXTS = ["pdf", "txt", "docx"];

function getExt(filename) {
  return filename.split(".").pop().toLowerCase();
}

function isAllowed(file) {
  return ALLOWED_EXTS.includes(getExt(file.name));
}

function fileIcon(file) {
  const ext = getExt(file.name);
  if (ext === "pdf")  return "📄";
  if (ext === "txt")  return "📝";
  if (ext === "docx") return "📃";
  return "📄";
}

function formatBytes(b) {
  if (b < 1024)        return b + " B";
  if (b < 1048576)     return (b / 1024).toFixed(1) + " KB";
  return (b / 1048576).toFixed(1) + " MB";
}

function escapeHTML(s) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g,  "&lt;")
    .replace(/>/g,  "&gt;")
    .replace(/"/g,  "&quot;");
}

function showError(id, msg) {
  const el = document.getElementById(id);
  el.textContent = msg;
  el.style.display = "block";
}

function hideError(id) {
  document.getElementById(id).style.display = "none";
}

function setLoading(barId, on) {
  document.getElementById(barId).classList.toggle("active", on);
}

/* =====================
   STATE
===================== */

let selectedFile    = null;
let extractedData   = null;
let resumeUploaded  = false;  // tracks whether a resume is in the vector DB

/* =====================
   DOM REFS
===================== */

const dropZone    = document.getElementById("drop-zone");
const fileInput   = document.getElementById("file-input");
const browseBtn   = document.getElementById("browse-btn");
const filePreview = document.getElementById("file-preview");
const fileNameEl  = document.getElementById("file-name");
const fileSizeEl  = document.getElementById("file-size");
const fileIconEl  = document.getElementById("file-type-icon");
const removeBtn   = document.getElementById("remove-btn");
const extractBtn  = document.getElementById("extract-btn");
const statusHint  = document.getElementById("status-hint");
const resultsEl   = document.getElementById("results");
const summaryEl   = document.getElementById("summary-text");
const statRowEl   = document.getElementById("stat-row");
const skillsOut   = document.getElementById("skills-output");
const ragSection  = document.getElementById("rag-section");
const matchSection= document.getElementById("match-section");

/* =====================
   FILE UPLOAD WIRING
===================== */

// "browse to upload" span click
browseBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  fileInput.click();
});

// clicking the drop zone itself
dropZone.addEventListener("click", () => fileInput.click());

// native file picker change
fileInput.addEventListener("change", () => {
  if (fileInput.files[0]) handleFile(fileInput.files[0]);
});

// drag-and-drop
dropZone.addEventListener("dragover", (e) => {
  e.preventDefault();
  dropZone.classList.add("drag-over");
});
dropZone.addEventListener("dragleave", () => dropZone.classList.remove("drag-over"));
dropZone.addEventListener("drop", (e) => {
  e.preventDefault();
  dropZone.classList.remove("drag-over");
  const f = e.dataTransfer.files[0];
  if (f && isAllowed(f)) handleFile(f);
  else showError("extract-error", "Unsupported file. Please use PDF, TXT, or DOCX.");
});

/* =====================
   HANDLE FILE
===================== */

function handleFile(file) {
  if (!isAllowed(file)) {
    showError("extract-error", "Unsupported file type. Use PDF, TXT, or DOCX.");
    return;
  }
  if (file.size > 10 * 1024 * 1024) {
    showError("extract-error", "File too large (max 10 MB).");
    return;
  }

  selectedFile = file;
  hideError("extract-error");
  resetResults();

  fileNameEl.textContent = file.name;
  fileSizeEl.textContent = formatBytes(file.size);
  fileIconEl.textContent = fileIcon(file);

  filePreview.style.display = "flex";
  dropZone.style.display    = "none";

  extractBtn.disabled      = false;
  statusHint.textContent   = "Ready to extract";
}

/* =====================
   REMOVE FILE
===================== */

removeBtn.addEventListener("click", () => {
  selectedFile = null;
  fileInput.value = "";

  filePreview.style.display = "none";
  dropZone.style.display    = "block";

  extractBtn.disabled     = true;
  statusHint.textContent  = "Upload a file to begin";

  hideError("extract-error");
  resetResults();
});

/* =====================
   EXTRACT SKILLS
===================== */

extractBtn.addEventListener("click", async () => {
  if (!selectedFile) return;

  extractBtn.disabled    = true;
  extractBtn.textContent = "Extracting…";
  statusHint.textContent = "Analysing resume…";
  setLoading("loading-bar", true);
  hideError("extract-error");

  const fd = new FormData();
  fd.append("resume", selectedFile);

  try {
    const res  = await fetch("/extract", { method: "POST", body: fd });
    const data = await res.json();

    if (data.error) throw new Error(data.error);

    extractedData  = data;
    resumeUploaded = true;

    renderSkills(data);

    // Show RAG and match sections after successful upload
    ragSection.style.display   = "block";
    matchSection.style.display = "block";

  } catch (err) {
    showError("extract-error", err.message);
  } finally {
    extractBtn.disabled    = false;
    extractBtn.textContent = "Extract skills";
    statusHint.textContent = "Ready to extract";
    setLoading("loading-bar", false);
  }
});

/* =====================
   RENDER SKILLS
===================== */

function renderSkills(data) {
  summaryEl.textContent = data.summary || "No summary available.";

  const total   = ["technical","soft","tools","domain"].reduce((s,k) => s + (data[k]||[]).length, 0);
  const techNum = (data.technical||[]).length + (data.tools||[]).length;
  const nonTech = (data.soft||[]).length + (data.domain||[]).length;

  statRowEl.innerHTML = `
    <div class="stat-cell"><div class="num">${total}</div><div class="lbl">Total</div></div>
    <div class="stat-cell"><div class="num">${techNum}</div><div class="lbl">Technical</div></div>
    <div class="stat-cell"><div class="num">${nonTech}</div><div class="lbl">Non-technical</div></div>
  `;

  const cats = [
    { key: "technical", label: "Technical" },
    { key: "soft",      label: "Soft Skills" },
    { key: "tools",     label: "Tools & Platforms" },
    { key: "domain",    label: "Domain Knowledge" }
  ];

  skillsOut.innerHTML = "";

  cats.forEach(({ key, label }) => {
    const skills = data[key] || [];
    if (!skills.length) return;
    const block = document.createElement("div");
    block.className = "category-block";
    block.innerHTML = `
      <div class="cat-label">${label}</div>
      <div class="pill-row">
        ${skills.map(s => `<span class="pill ${key}">${escapeHTML(s)}</span>`).join("")}
      </div>`;
    skillsOut.appendChild(block);
  });

  resultsEl.style.display = "block";
  resultsEl.scrollIntoView({ behavior: "smooth" });
}

/* =====================
   COPY BUTTONS
===================== */

document.getElementById("copy-skills-btn").addEventListener("click", () => {
  if (!extractedData) return;
  const all = ["technical","soft","tools","domain"].flatMap(k => extractedData[k] || []);
  copyText(all.join(", "), "copy-skills-btn");
});

document.getElementById("copy-json-btn").addEventListener("click", () => {
  if (!extractedData) return;
  copyText(JSON.stringify(extractedData, null, 2), "copy-json-btn");
});

function copyText(text, btnId) {
  navigator.clipboard.writeText(text).then(() => {
    const btn  = document.getElementById(btnId);
    const orig = btn.textContent;
    btn.textContent = "Copied!";
    btn.classList.add("copied");
    setTimeout(() => { btn.textContent = orig; btn.classList.remove("copied"); }, 1800);
  });
}

/* =====================
   RESET
===================== */

function resetResults() {
  extractedData = null;
  resultsEl.style.display    = "none";
  ragSection.style.display   = "none";
  matchSection.style.display = "none";
  skillsOut.innerHTML        = "";
  statRowEl.innerHTML        = "";
  summaryEl.textContent      = "";

  // Clear RAG/match answers
  document.getElementById("rag-answer").style.display      = "none";
  document.getElementById("rag-answer-text").textContent   = "";
  document.getElementById("match-result-box").style.display = "none";
  document.getElementById("match-result-text").textContent  = "";
}

/* =====================
   RAG — ASK QUESTION
===================== */

document.getElementById("rag-ask-btn").addEventListener("click", askQuestion);

// Also allow pressing Enter in the input field
document.getElementById("rag-question").addEventListener("keydown", (e) => {
  if (e.key === "Enter") askQuestion();
});

async function askQuestion() {
  const question = document.getElementById("rag-question").value.trim();
  if (!question) return;

  const askBtn = document.getElementById("rag-ask-btn");
  askBtn.disabled    = true;
  askBtn.textContent = "Asking…";
  setLoading("rag-loading-bar", true);

  document.getElementById("rag-answer").style.display = "none";

  try {
    const res  = await fetch("/ask", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ question })
    });
    const data = await res.json();

    if (data.error) throw new Error(data.error);

    document.getElementById("rag-answer-text").textContent = data.answer;
    document.getElementById("rag-answer").style.display    = "block";

  } catch (err) {
    document.getElementById("rag-answer-text").textContent = "Error: " + err.message;
    document.getElementById("rag-answer").style.display    = "block";
  } finally {
    askBtn.disabled    = false;
    askBtn.textContent = "Ask";
    setLoading("rag-loading-bar", false);
  }
}

/* =====================
   JOB MATCH
===================== */

document.getElementById("match-btn").addEventListener("click", matchJob);

async function matchJob() {
  const job = document.getElementById("job-desc").value.trim();
  if (!job) return;

  const matchBtn = document.getElementById("match-btn");
  matchBtn.disabled    = true;
  matchBtn.textContent = "Checking…";
  setLoading("match-loading-bar", true);

  document.getElementById("match-result-box").style.display = "none";

  try {
    const res  = await fetch("/match", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ job })
    });
    const data = await res.json();

    if (data.error) throw new Error(data.error);

    document.getElementById("match-result-text").textContent = data.result;
    document.getElementById("match-result-box").style.display = "block";
    document.getElementById("match-result-box").scrollIntoView({ behavior: "smooth" });

  } catch (err) {
    document.getElementById("match-result-text").textContent = "Error: " + err.message;
    document.getElementById("match-result-box").style.display = "block";
  } finally {
    matchBtn.disabled    = false;
    matchBtn.textContent = "Check fit";
    setLoading("match-loading-bar", false);
  }
}