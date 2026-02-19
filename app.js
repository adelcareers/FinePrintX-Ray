/* app.js - entry point (ES module) */
import { detectFindings } from './detectors.js';
import { buildReport } from './report.js';
import { hashBuffer, loadReport, saveReport, wipeAll } from './storage.js';

const el = selector => document.querySelector(selector);

const state = {
  status: 'idle',
  pdfDoc: null,
  pages: [],
  findings: [],
  report: null,
  pageCount: 1,
  currentPage: 1,
  cached: false
};

function setStatus(text){
  const statusElement = el('#status');
  if (statusElement) statusElement.textContent = text;
}

function setState(next){
  state.status = next;
  setStatus(humanizeState(next));
  updateProgressStrip(next);
  const resetBtn = el('#resetBtn');
  if(resetBtn) resetBtn.disabled = next === 'idle' || next === 'uploading';
}

function humanizeState(next){
  const map = {
    idle: 'Idle',
    uploading: 'Uploading...',
    scanned: 'Scan complete',
    revealed: 'Findings revealed',
    explained: 'Report explained',
    error: 'Error'
  };
  return map[next] || next;
}

function updateProgressStrip(next){
  const steps = [...document.querySelectorAll('.progress-step')];
  const order = ['scanned', 'revealed', 'explained'];
  const idx = order.indexOf(next);
  steps.forEach((step, i) => {
    step.classList.toggle('active', idx >= i && idx !== -1);
  });
}

async function loadPdf(arrayBuffer){
  const pdfjs = await import('./pdfjs/pdf.mjs');
  pdfjs.GlobalWorkerOptions.workerSrc = './pdfjs/pdf.worker.mjs';
  const loading = pdfjs.getDocument({ data: arrayBuffer });
  const pdf = await loading.promise;
  state.pdfDoc = pdf;
  state.pageCount = pdf.numPages;
  updatePager();
  await renderPage(1);
  return pdf;
}

async function extractPagesText(pdf){
  const pages = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const txt = await page.getTextContent();
    const pageText = txt.items.map(it => it.str).join(' ');
    pages.push({ pageNumber: i, text: pageText });
  }
  return pages;
}

function renderReport(reportData){
  const report = el('#report');
  const riskLabel = el('#riskLabel');
  const moneyList = el('#moneyTrapsList');
  const escapeSummary = el('#escapeSummary');
  const escapeChecklist = el('#escapeChecklist');
  const riskScore = el('#riskScore');
  const scoreDetails = el('#scoreDetails');
  const scoreBreakdown = el('#scoreBreakdown');
  if(!report) return;

  moneyList.innerHTML = '';
  reportData.moneyTraps.forEach(trap => {
    const li = document.createElement('li');
    li.className = 'finding';
    li.dataset.page = trap.pageNumber;
    li.dataset.snippet = trap.evidence;
    li.innerHTML = `<strong>${trap.trigger}</strong> — ${trap.consequence} <span class="muted">(p.${trap.pageNumber}, ${trap.confidence})</span>`;
    li.addEventListener('click', () => jumpToEvidence(trap.pageNumber, trap.evidence));
    moneyList.appendChild(li);
  });

  escapeChecklist.innerHTML = '';
  reportData.escapeChecklist.forEach(item => {
    const li = document.createElement('li');
    li.textContent = `${item.present ? '✓' : '•'} ${item.label}`;
    escapeChecklist.appendChild(li);
  });
  escapeSummary.textContent = reportData.escapeChecklist.some(i => i.present)
    ? 'Cancellation terms detected'
    : 'Not found / unclear';

  riskLabel.textContent = `Risk: ${reportData.riskLabel}`;
  riskLabel.classList.toggle('bad', reportData.riskLabel !== 'Good Deal');
  riskLabel.classList.toggle('good', reportData.riskLabel === 'Good Deal');
  riskScore.textContent = `${reportData.riskScore} / 10`;
  scoreDetails.textContent = reportData.riskScore === 0 ? 'No signals detected' : 'Score based on rubric signals';

  scoreBreakdown.innerHTML = '';
  reportData.breakdown.forEach(row => {
    const li = document.createElement('li');
    li.textContent = `${row.signal}: ${row.present ? 'present' : 'not found'} (weight ${row.weight})`;
    scoreBreakdown.appendChild(li);
  });

  report.classList.remove('hidden');
  toggleExportButtons(true);
}

function resetUI(){
  state.pages = [];
  state.findings = [];
  state.report = null;
  state.pdfDoc = null;
  state.currentPage = 1;
  state.pageCount = 1;
  updatePager();
  el('#report').classList.add('hidden');
  el('#evidenceSnippet').textContent = 'No selection yet.';
  setState('idle');
  toggleExportButtons(false);
}

function wireDropZone(){
  const drop = el('#upload');
  const input = el('#fileInput');
  const analyzeAnother = el('#analyzeAnother');
  if(!drop || !input) return;

  drop.addEventListener('click', ()=> input.click());
  input.addEventListener('change', async (e)=>{
    const file = e.target.files[0];
    if(file) await handleFile(file);
  });

  drop.addEventListener('dragenter', (e)=>{ e.preventDefault(); drop.classList.add('hover'); setStatus('Drop file to upload'); });
  drop.addEventListener('dragover', (e)=>{ e.preventDefault(); });
  drop.addEventListener('dragleave', (e)=>{ drop.classList.remove('hover'); setStatus('Idle'); });
  drop.addEventListener('drop', async (e)=>{
    e.preventDefault(); drop.classList.remove('hover');
    const file = e.dataTransfer.files[0];
    if(file && file.type === 'application/pdf'){
      await handleFile(file);
    } else {
      setStatus('Please provide a text-based PDF');
    }
  });

  if(analyzeAnother) analyzeAnother.addEventListener('click', resetUI);
}

function wireControls(){
  const prevBtn = el('#prevPage');
  const nextBtn = el('#nextPage');
  const pageInput = el('#pageNumber');
  const resetBtn = el('#resetBtn');
  const downloadTxt = el('#downloadTxt');
  const downloadJson = el('#downloadJson');

  if(prevBtn) prevBtn.addEventListener('click', () => goToPage(state.currentPage - 1));
  if(nextBtn) nextBtn.addEventListener('click', () => goToPage(state.currentPage + 1));
  if(pageInput) pageInput.addEventListener('change', () => goToPage(parseInt(pageInput.value, 10)));
  if(resetBtn) resetBtn.addEventListener('click', resetUI);

  if(downloadTxt) downloadTxt.addEventListener('click', () => exportReport('txt'));
  if(downloadJson) downloadJson.addEventListener('click', () => exportReport('json'));
}

async function goToPage(pageNumber){
  if(!state.pdfDoc) return;
  const page = Math.min(state.pageCount, Math.max(1, pageNumber));
  state.currentPage = page;
  await renderPage(page);
  updatePager();
}

function updatePager(){
  const count = el('#pageCount');
  const input = el('#pageNumber');
  const prevBtn = el('#prevPage');
  const nextBtn = el('#nextPage');
  if(count) count.textContent = `/ ${state.pageCount}`;
  if(input) input.value = state.currentPage;
  if(prevBtn) prevBtn.disabled = state.currentPage <= 1;
  if(nextBtn) nextBtn.disabled = state.currentPage >= state.pageCount;
}

async function renderPage(pageNumber){
  if(!state.pdfDoc) return;
  const page = await state.pdfDoc.getPage(pageNumber);
  const canvas = el('#pdfCanvas');
  const ctx = canvas.getContext('2d');
  const viewport = page.getViewport({ scale: 1.2 });
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  await page.render({ canvasContext: ctx, viewport }).promise;
}

function jumpToEvidence(pageNumber, snippet){
  goToPage(pageNumber);
  el('#evidenceSnippet').textContent = snippet || 'No snippet available.';
}

function toggleExportButtons(enabled){
  const downloadTxt = el('#downloadTxt');
  const downloadJson = el('#downloadJson');
  if(downloadTxt) downloadTxt.disabled = !enabled;
  if(downloadJson) downloadJson.disabled = !enabled;
}

function exportReport(format){
  if(!state.report) return;
  const data = format === 'json'
    ? JSON.stringify(state.report, null, 2)
    : buildTxtExport(state.report);
  const blob = new Blob([data], { type: 'text/plain' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `fineprint-report.${format === 'json' ? 'json' : 'txt'}`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 100);
}

function buildTxtExport(reportData){
  const lines = [];
  lines.push(`Risk Label: ${reportData.riskLabel}`);
  lines.push(`Risk Score: ${reportData.riskScore}/10`);
  lines.push('Money Traps:');
  reportData.moneyTraps.forEach(t => {
    lines.push(`- ${t.trigger} (p.${t.pageNumber}) ${t.consequence}`);
    lines.push(`  Evidence: ${t.evidence}`);
  });
  return lines.join('\n');
}

async function handleFile(file){
  try{
    setState('uploading');
    const arrayBuffer = await file.arrayBuffer();
    const hash = await hashBuffer(arrayBuffer);
    const cached = await loadReport(hash);
    if(cached){
      state.report = cached.report;
      state.findings = cached.findings;
      state.pages = cached.pages;
      state.cached = true;
      setState('explained');
      renderReport(state.report);
      return;
    }

    await loadPdf(arrayBuffer);
    state.pages = await extractPagesText(state.pdfDoc);
    const totalText = state.pages.map(p => p.text).join('');
    let minTextLength = 200; // arbitrary threshold to filter out scanned PDFs without OCR
    if(totalText.length < minTextLength){
      setState('error');
      setStatus('Unsupported PDF: text not detected (no OCR in v1).');
      return;
    }
    setState('scanned');

    state.findings = detectFindings(state.pages);
    setState('revealed');

    state.report = buildReport(state.findings);
    setState('explained');
    renderReport(state.report);

    await saveReport({ hash, pages: state.pages, findings: state.findings, report: state.report, createdAt: new Date().toISOString() });
  }catch(err){
    console.error(err);
    setState('error');
    setStatus('Error processing file');
  }
}

function init(){
  wireDropZone();
  wireControls();
  setState('idle');
}

document.addEventListener('DOMContentLoaded', init);
