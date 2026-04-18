/* =====================
   PDF.js CONFIG
===================== */

pdfjsLib.GlobalWorkerOptions.workerSrc =
"https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

/* =====================
   STATE
===================== */

let selectedFile = null;
let extractedData = null;

/* =====================
   DOM ELEMENTS
===================== */

const dropZone      = document.getElementById("drop-zone");
const pdfInput      = document.getElementById("pdf-input");
const browseBtn     = document.getElementById("browse-btn");
const filePreview   = document.getElementById("file-preview");
const fileNameEl    = document.getElementById("file-name");
const fileSizeEl    = document.getElementById("file-size");
const removeBtn     = document.getElementById("remove-btn");
const extractBtn    = document.getElementById("extract-btn");
const statusHint    = document.getElementById("status-hint");
const loadingBar    = document.getElementById("loading-bar");
const errorMsg      = document.getElementById("error-msg");
const resultsEl     = document.getElementById("results");
const summaryText   = document.getElementById("summary-text");
const statRow       = document.getElementById("stat-row");
const skillsOutput  = document.getElementById("skills-output");
const copySkillsBtn = document.getElementById("copy-skills-btn");
const copyJsonBtn   = document.getElementById("copy-json-btn");

/* =====================
   FILE SELECTION
===================== */

browseBtn.addEventListener("click", () => pdfInput.click());

dropZone.addEventListener("click", (e) => {
  if (e.target !== browseBtn) pdfInput.click();
});

pdfInput.addEventListener("change", () => {
  if (pdfInput.files[0]) handleFile(pdfInput.files[0]);
});

/* =====================
   DRAG & DROP
===================== */

dropZone.addEventListener("dragover", (e) => {
  e.preventDefault();
  dropZone.classList.add("drag-over");
});

dropZone.addEventListener("dragleave", () => {
  dropZone.classList.remove("drag-over");
});

dropZone.addEventListener("drop", (e) => {
  e.preventDefault();
  dropZone.classList.remove("drag-over");

  const file = e.dataTransfer.files[0];

  if (file && file.type === "application/pdf") {
    handleFile(file);
  } else {
    showError("Please drop a valid PDF file.");
  }
});

/* =====================
   HANDLE FILE
===================== */

function handleFile(file){

  if(file.type !== "application/pdf"){
    showError("Only PDF files are supported.");
    return;
  }

  if(file.size > 10 * 1024 * 1024){
    showError("File too large (max 10MB).");
    return;
  }

  selectedFile = file;

  hideError();
  resetResults();

  fileNameEl.textContent = file.name;
  fileSizeEl.textContent = formatBytes(file.size);

  filePreview.style.display = "flex";
  dropZone.style.display = "none";

  extractBtn.disabled = false;
  statusHint.textContent = "Ready to extract";
}

/* =====================
   REMOVE FILE
===================== */

removeBtn.addEventListener("click", () => {

  selectedFile = null;
  pdfInput.value = "";

  filePreview.style.display = "none";
  dropZone.style.display = "block";

  extractBtn.disabled = true;
  statusHint.textContent = "Upload a PDF to begin";

  hideError();
  resetResults();
});

/* =====================
   EXTRACT BUTTON
===================== */

extractBtn.addEventListener("click", runExtraction);

async function runExtraction(){

  if(!selectedFile) return;

  setLoading(true, "Uploading resume...");

  const formData = new FormData();
  formData.append("resume", selectedFile);

  try{

    const response = await fetch("/extract", {
      method:"POST",
      body: formData
    });

    if(!response.ok){
      throw new Error("Server error while processing resume.");
    }

    const data = await response.json();

    extractedData = data;

    renderResults(data);

  }catch(err){

    showError(err.message);

  }finally{

    setLoading(false);
  }
}

/* =====================
   RENDER RESULTS
===================== */

function renderResults(data){

  summaryText.textContent = data.summary || "";

  const categories = ["technical","soft","tools","domain"];

  const total = categories.reduce((sum,k)=>sum+(data[k]||[]).length,0);

  const techNum = (data.technical || []).length + (data.tools || []).length;
  const nonTech = (data.soft || []).length + (data.domain || []).length;

  statRow.innerHTML = `
  <div class="stat-cell">
  <div class="num">${total}</div>
  <div class="lbl">Total skills</div>
  </div>

  <div class="stat-cell">
  <div class="num">${techNum}</div>
  <div class="lbl">Technical</div>
  </div>

  <div class="stat-cell">
  <div class="num">${nonTech}</div>
  <div class="lbl">Non-technical</div>
  </div>
  `;

  const catConfig = [
    {key:"technical", label:"Technical"},
    {key:"soft", label:"Soft Skills"},
    {key:"tools", label:"Tools & Platforms"},
    {key:"domain", label:"Domain Knowledge"}
  ];

  skillsOutput.innerHTML = "";

  catConfig.forEach(({key,label})=>{

    const skills = data[key] || [];

    if(!skills.length) return;

    const block = document.createElement("div");

    block.className = "category-block";

    block.innerHTML = `
    <div class="cat-label">${label}</div>
    <div class="pill-row">
      ${skills.map(s => `<span class="pill ${key}">${escapeHTML(s)}</span>`).join("")}
    </div>
    `;

    skillsOutput.appendChild(block);

  });

  resultsEl.style.display = "block";

  resultsEl.scrollIntoView({behavior:"smooth"});
}

/* =====================
   COPY BUTTONS
===================== */

copySkillsBtn.addEventListener("click", () => {

  if(!extractedData) return;

  const allSkills = ["technical","soft","tools","domain"]
  .flatMap(k => extractedData[k] || []);

  copyText(allSkills.join(", "), copySkillsBtn);
});

copyJsonBtn.addEventListener("click", () => {

  if(!extractedData) return;

  copyText(JSON.stringify(extractedData,null,2), copyJsonBtn);
});

function copyText(text,btn){

  navigator.clipboard.writeText(text).then(()=>{

    const original = btn.textContent;

    btn.textContent = "Copied!";
    btn.classList.add("copied");

    setTimeout(()=>{
      btn.textContent = original;
      btn.classList.remove("copied");
    },1800);

  });
}

/* =====================
   HELPERS
===================== */

function setLoading(on, hint=""){

  extractBtn.disabled = on;
  extractBtn.textContent = on ? "Extracting..." : "Extract skills";

  loadingBar.classList.toggle("active", on);

  if(hint) statusHint.textContent = hint;

  if(!on){
    statusHint.textContent = selectedFile ? "Ready to extract" : "Upload a PDF to begin";
  }
}

function showError(msg){

  errorMsg.textContent = msg;
  errorMsg.style.display = "block";
}

function hideError(){

  errorMsg.style.display = "none";
}

function resetResults(){

  extractedData = null;

  resultsEl.style.display = "none";
  skillsOutput.innerHTML = "";
  statRow.innerHTML = "";
  summaryText.textContent = "";
}

function formatBytes(bytes){

  if(bytes < 1024) return bytes + " B";
  if(bytes < 1024 * 1024) return (bytes/1024).toFixed(1) + " KB";

  return (bytes/(1024*1024)).toFixed(1) + " MB";
}

function escapeHTML(str){

  return str
  .replace(/&/g,"&amp;")
  .replace(/</g,"&lt;")
  .replace(/>/g,"&gt;")
  .replace(/"/g,"&quot;");
}