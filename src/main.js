/**
 * main.js — PSD Mobile Viewer entry point
 */
import Psd from '@webtoon/psd';
import { TouchHandler } from './touch-handler.js';
import { LayerPanel } from './layer-panel.js';
import { compositeToImageData, renderToCanvas, fitViewport } from './psd-renderer.js';

// ── DOM refs ──────────────────────────────────────────────────────────
const canvas      = document.getElementById('main-canvas');
const canvasWrap  = document.getElementById('canvas-wrap');
const fileInput   = document.getElementById('file-input');
const dropOverlay = document.getElementById('drop-overlay');
const welcome     = document.getElementById('welcome');
const loading     = document.getElementById('loading');
const loadingMsg  = document.getElementById('loading-msg');
const toastEl     = document.getElementById('toast');
const toastMsgEl  = document.getElementById('toast-msg');
const textInfo    = document.getElementById('text-info');
const textContent = document.getElementById('text-info-content');
const layerSheet  = document.getElementById('layer-sheet');
const sheetHandle = document.getElementById('sheet-handle');
const layerList   = document.getElementById('layer-list');

const btnOpen      = document.getElementById('btn-open');
const btnSample    = document.getElementById('btn-sample');
const btnExport    = document.getElementById('btn-export');
const btnFit       = document.getElementById('btn-fit');
const btnLayers    = document.getElementById('btn-layers');
const btnSheetClose = document.getElementById('btn-sheet-close');

const welcomeOpen   = document.getElementById('welcome-open');
const welcomeSample = document.getElementById('welcome-sample');

// ── App state ─────────────────────────────────────────────────────────
let psd = null;
let psdWidth = 0;
let psdHeight = 0;
let compositeImageData = null;
let layerState = new Map();

const viewport = { x: 0, y: 0, scale: 1 };

// ── Layer panel ───────────────────────────────────────────────────────
const panel = new LayerPanel(layerList, (state, selectedLayer) => {
  layerState = state;
  if (psd) scheduleComposite();
  if (selectedLayer) {
    const text = getLayerText(selectedLayer);
    if (text) {
      textContent.textContent = text;
      textInfo.classList.remove('hidden');
    } else {
      textInfo.classList.add('hidden');
    }
  } else {
    textInfo.classList.add('hidden');
  }
});

// ── Touch / mouse handler ─────────────────────────────────────────────
const touch = new TouchHandler(
  canvasWrap,
  viewport,
  () => { if (compositeImageData) renderToCanvas(canvas, compositeImageData, viewport); },
  () => fitAndRender(),
);

// ── Composite scheduler ───────────────────────────────────────────────
let rafPending = false;
function scheduleComposite() {
  if (rafPending) return;
  rafPending = true;
  requestAnimationFrame(() => {
    rafPending = false;
    recomposite();
  });
}

async function recomposite() {
  if (!psd) return;
  compositeImageData = await compositeToImageData(psd, layerState, psdWidth, psdHeight);
  renderToCanvas(canvas, compositeImageData, viewport);
}

// ── Fit / render ──────────────────────────────────────────────────────
function fitAndRender() {
  if (!compositeImageData) return;
  const wrap = canvas.parentElement;
  const fit = fitViewport(psdWidth, psdHeight, wrap.clientWidth, wrap.clientHeight);
  viewport.x = fit.x;
  viewport.y = fit.y;
  viewport.scale = fit.scale;
  renderToCanvas(canvas, compositeImageData, viewport);
}

// ── Load PSD from ArrayBuffer ─────────────────────────────────────────
async function loadPSD(buffer) {
  showLoading('Parsing PSD…');
  try {
    psd = Psd.parse(buffer);
    psdWidth  = psd.width;
    psdHeight = psd.height;

    showLoading('Compositing layers…');
    panel.build(psd.children);
    layerState = panel.state;

    compositeImageData = await compositeToImageData(psd, layerState, psdWidth, psdHeight);

    const wrap = canvas.parentElement;
    const fit = fitViewport(psdWidth, psdHeight, wrap.clientWidth, wrap.clientHeight);
    viewport.x = fit.x;
    viewport.y = fit.y;
    viewport.scale = fit.scale;

    renderToCanvas(canvas, compositeImageData, viewport);

    // Enable toolbar buttons
    btnExport.disabled = false;
    btnFit.disabled    = false;
    btnLayers.disabled = false;

    // Hide welcome, show canvas
    welcome.style.display = 'none';
    textInfo.classList.add('hidden');

    toast(`Loaded ${psd.children.length} layer${psd.children.length !== 1 ? 's' : ''}`);
  } catch (err) {
    console.error(err);
    toast('Failed to parse PSD: ' + (err.message ?? err), true);
  } finally {
    hideLoading();
  }
}

// ── File input ────────────────────────────────────────────────────────
function openFile() { fileInput.click(); }

fileInput.addEventListener('change', async () => {
  const file = fileInput.files?.[0];
  if (!file) return;
  await loadPSD(await file.arrayBuffer());
  fileInput.value = '';
});

// ── Drag & drop ───────────────────────────────────────────────────────
document.addEventListener('dragenter', (e) => {
  e.preventDefault();
  dropOverlay.classList.remove('hidden');
  dropOverlay.classList.add('pointer-events-auto');
});
document.addEventListener('dragover', (e) => { e.preventDefault(); });
document.addEventListener('dragleave', (e) => {
  if (e.relatedTarget === null) hideDropOverlay();
});
document.addEventListener('drop', async (e) => {
  e.preventDefault();
  hideDropOverlay();
  const file = e.dataTransfer?.files?.[0];
  if (!file) return;
  if (!/\.(psd|psb)$/i.test(file.name)) {
    toast('Please drop a .psd or .psb file', true);
    return;
  }
  await loadPSD(await file.arrayBuffer());
});

function hideDropOverlay() {
  dropOverlay.classList.add('hidden');
  dropOverlay.classList.remove('pointer-events-auto');
}

// ── Sample PSD ────────────────────────────────────────────────────────
async function loadSample() {
  showLoading('Fetching sample PSD…');
  try {
    const base = import.meta.env.BASE_URL ?? '/';
    const url  = base.replace(/\/$/, '') + '/sample.psd';
    const res  = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buf = await res.arrayBuffer();
    await loadPSD(buf);
  } catch (err) {
    console.error(err);
    toast('Could not load sample: ' + (err.message ?? err), true);
    hideLoading();
  }
}

// ── Export PNG ────────────────────────────────────────────────────────
function exportPNG() {
  if (!compositeImageData) return;

  // Render full-res composite to an off-screen canvas
  const offscreen = document.createElement('canvas');
  offscreen.width  = psdWidth;
  offscreen.height = psdHeight;
  offscreen.getContext('2d').putImageData(compositeImageData, 0, 0);

  offscreen.toBlob((blob) => {
    if (!blob) return;
    const a = document.createElement('a');
    a.href     = URL.createObjectURL(blob);
    a.download = 'composite.png';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    toast('PNG exported');
  }, 'image/png');
}

// ── Bottom sheet (swipe) ──────────────────────────────────────────────
const SHEET_OPEN  = 0;           // translateY = 0 → fully open
const SHEET_PEEK  = 'calc(100% - 3.5rem)'; // peeked / handle visible

let sheetOpen = false;

function setSheet(open) {
  sheetOpen = open;
  layerSheet.style.transform = open ? 'translateY(0)' : `translateY(${SHEET_PEEK})`;
  btnSheetClose.style.transform = open ? '' : 'rotate(180deg)';
  document.documentElement.style.setProperty('--sheet-h', open ? '70vh' : '3.5rem');
}

sheetHandle.addEventListener('click', () => setSheet(!sheetOpen));
btnSheetClose.addEventListener('click', (e) => { e.stopPropagation(); setSheet(false); });
btnLayers.addEventListener('click', () => setSheet(!sheetOpen));

// Swipe-up gesture on the handle
let sheetSwipeStartY = 0;
sheetHandle.addEventListener('touchstart', (e) => {
  sheetSwipeStartY = e.touches[0].clientY;
}, { passive: true });
sheetHandle.addEventListener('touchend', (e) => {
  const dy = sheetSwipeStartY - e.changedTouches[0].clientY;
  if (Math.abs(dy) > 30) setSheet(dy > 0);
}, { passive: true });

// ── Toolbar buttons ───────────────────────────────────────────────────
btnOpen.addEventListener('click', openFile);
btnSample.addEventListener('click', loadSample);
btnExport.addEventListener('click', exportPNG);
btnFit.addEventListener('click', fitAndRender);
welcomeOpen.addEventListener('click', openFile);
welcomeSample.addEventListener('click', loadSample);

// ── Resize ────────────────────────────────────────────────────────────
window.addEventListener('resize', () => {
  if (compositeImageData) renderToCanvas(canvas, compositeImageData, viewport);
});

// ── Helpers ───────────────────────────────────────────────────────────
function showLoading(msg) {
  loadingMsg.textContent = msg ?? 'Loading…';
  loading.classList.remove('hidden');
}
function hideLoading() {
  loading.classList.add('hidden');
}

let toastTimer = null;
function toast(msg, isError = false) {
  toastMsgEl.textContent = msg;
  toastMsgEl.className = isError
    ? 'bg-red-900/80 border border-red-500/30 text-red-200 text-sm rounded-xl px-4 py-2 shadow-lg'
    : 'bg-[#1e1e2e] border border-white/10 text-gray-200 text-sm rounded-xl px-4 py-2 shadow-lg';
  toastEl.classList.remove('hidden');
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.add('hidden'), 3000);
}

function getLayerText(layer) {
  if (!layer) return null;
  // @webtoon/psd exposes text layers via layer.additionalLayerProperties
  if (layer.additionalLayerProperties) {
    const textProp = layer.additionalLayerProperties.find?.(p => p.key === 'TySh' || p.key === 'luni');
    if (textProp) {
      const raw = textProp.data?.text ?? textProp.data?.name ?? null;
      if (raw) return raw;
    }
  }
  // Fallback: check layer.text (some parsers expose this)
  if (layer.text && typeof layer.text === 'string') return layer.text;
  if (layer.text?.text) return layer.text.text;
  return null;
}

// ── Service worker ────────────────────────────────────────────────────
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    const base = import.meta.env.BASE_URL ?? '/';
    navigator.serviceWorker.register(base + 'sw.js').catch(() => {});
  });
}
