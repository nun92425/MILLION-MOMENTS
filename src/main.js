import { selectBestMaterial, drawMosaic } from './mosaic.js';

// Worker 初期化
const worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });

let workerId = 0;
const workerCallbacks = new Map();

worker.onmessage = (e) => {
  const { id, type, payload } = e.data;
  const cb = workerCallbacks.get(id);
  if (!cb) return;
  if (type === 'progress' && cb.onProgress) {
    cb.onProgress(payload);
  } else if (type === 'done') {
    cb.resolve(payload);
    workerCallbacks.delete(id);
  } else if (type === 'error') {
    cb.reject(new Error(payload));
    workerCallbacks.delete(id);
  }
};

function callWorker(type, payload, onProgress) {
  return new Promise((resolve, reject) => {
    const id = ++workerId;
    workerCallbacks.set(id, { resolve, reject, onProgress });
    worker.postMessage({ id, type, payload });
  });
}

// 状態
let targetImg = null; // HTMLImageElement
let targetBitmapData = null; // { data, width, height }
let materials = []; // [{ index, img, file, r,g,b,luminance }]
let mosaicCanvas = null;
let lastMosaicDataUrl = null;

// DOM
const targetInput = document.getElementById('target-input');
const targetDropzone = document.getElementById('target-dropzone');
const targetPreview = document.getElementById('target-preview');
const targetPlaceholder = document.getElementById('target-placeholder');
const targetInfo = document.getElementById('target-info');
const targetClear = document.getElementById('target-clear');

const materialInput = document.getElementById('material-input');
const materialDropzone = document.getElementById('material-dropzone');
const materialGrid = document.getElementById('material-grid');
const materialCount = document.getElementById('material-count');
const materialStatus = document.getElementById('material-status');
const materialClear = document.getElementById('material-clear');
const materialShuffle = document.getElementById('material-shuffle');

const gridSizeEl = document.getElementById('grid-size');
const gridValueEl = document.getElementById('grid-value');
const blendEl = document.getElementById('blend-strength');
const blendValueEl = document.getElementById('blend-value');
const avoidDuplicateEl = document.getElementById('avoid-duplicate');
const usePenaltyEl = document.getElementById('use-penalty');
const exportScaleEl = document.getElementById('export-scale');

const generateBtn = document.getElementById('generate-btn');
const generateHint = document.getElementById('generate-hint');
const progressEl = document.getElementById('progress');
const progressFill = document.getElementById('progress-fill');
const progressText = document.getElementById('progress-text');

const canvas = document.getElementById('mosaic-canvas');
const canvasWrapper = document.getElementById('canvas-wrapper');
const canvasPlaceholder = document.getElementById('canvas-placeholder');
const canvasFooter = document.getElementById('canvas-footer');
const canvasInfo = document.getElementById('canvas-info');
const resultCard = document.getElementById('result-card');
const resultStats = document.getElementById('result-stats');

const zoomIn = document.getElementById('zoom-in');
const zoomOut = document.getElementById('zoom-out');
const zoomReset = document.getElementById('zoom-reset');
const fitBtn = document.getElementById('fit-btn');
const zoomLevelEl = document.getElementById('zoom-level');
const downloadBtn = document.getElementById('download-btn');
const compareBtn = document.getElementById('compare-btn');
const compareDialog = document.getElementById('compare-dialog');
const compareClose = document.getElementById('compare-close');

// Helpers
function updateSteps() {
  document.querySelectorAll('.step').forEach(s => s.classList.remove('active'));
  if (!targetImg) {
    document.querySelector('[data-step="1"]').classList.add('active');
  } else if (materials.length === 0) {
    document.querySelector('[data-step="2"]').classList.add('active');
  } else if (canvas.classList.contains('hidden')) {
    document.querySelector('[data-step="3"]').classList.add('active');
  } else {
    document.querySelector('[data-step="4"]').classList.add('active');
  }
}

function updateGenerateBtn() {
  const ok = targetImg && materials.length > 0;
  generateBtn.disabled = !ok;
  if (!targetImg && materials.length === 0) generateHint.textContent = 'メイン画像と素材画像を選択してください';
  else if (!targetImg) generateHint.textContent = 'メイン画像を選択してください';
  else if (materials.length === 0) generateHint.textContent = '素材画像を選択してください';
  else generateHint.textContent = `${materials.length}枚の素材で ${gridSizeEl.value}×${gridSizeEl.value} のモザイクを生成します`;
  updateSteps();
}

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      // URLは保持しておく（compare用）
      resolve(img);
    };
    img.onerror = reject;
    img.src = url;
  });
}

function getImageData(img, maxWidth = 800) {
  // 解析用に縮小してImageDataを取得
  const scale = Math.min(1, maxWidth / Math.max(img.width, img.height));
  const w = Math.round(img.width * scale);
  const h = Math.round(img.height * scale);
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  ctx.drawImage(img, 0, 0, w, h);
  return { data: ctx.getImageData(0, 0, w, h).data, width: w, height: h, scale, originalWidth: img.width, originalHeight: img.height };
}

function getFullImageData(img) {
  const c = document.createElement('canvas');
  c.width = img.width; c.height = img.height;
  const ctx = c.getContext('2d');
  ctx.drawImage(img, 0, 0);
  return { data: ctx.getImageData(0, 0, img.width, img.height).data, width: img.width, height: img.height };
}

// ターゲット画像処理
async function handleTargetFile(file) {
  if (!file) return;
  const img = await loadImage(file);
  targetImg = img;
  targetPreview.src = img.src;
  targetPreview.classList.remove('hidden');
  targetPlaceholder.classList.add('hidden');
  targetClear.classList.remove('hidden');
  targetInfo.textContent = `${file.name} — ${img.width}×${img.height}px`;
  // 解析用データをキャッシュ（800pxに縮小）
  targetBitmapData = getImageData(img, 800);
  updateGenerateBtn();
}

targetInput.addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (file) await handleTargetFile(file);
});
targetDropzone.addEventListener('dragover', (e) => { e.preventDefault(); targetDropzone.classList.add('dragover'); });
targetDropzone.addEventListener('dragleave', () => targetDropzone.classList.remove('dragover'));
targetDropzone.addEventListener('drop', async (e) => {
  e.preventDefault(); targetDropzone.classList.remove('dragover');
  const file = e.dataTransfer.files[0];
  if (file && file.type.startsWith('image/')) await handleTargetFile(file);
});
targetClear.addEventListener('click', () => {
  targetImg = null;
  targetBitmapData = null;
  targetPreview.classList.add('hidden');
  targetPlaceholder.classList.remove('hidden');
  targetClear.classList.add('hidden');
  targetInfo.textContent = '';
  targetInput.value = '';
  updateGenerateBtn();
});

// 素材画像処理
async function handleMaterialFiles(files) {
  const newFiles = Array.from(files).filter(f => f.type.startsWith('image/'));
  if (newFiles.length === 0) return;

  materialStatus.textContent = `${newFiles.length}枚を読み込み中...`;
  const startIdx = materials.length;

  for (let i = 0; i < newFiles.length; i++) {
    const file = newFiles[i];
    try {
      const img = await loadImage(file);
      // 解析用に64x64に縮小して平均色を後でWorkerで計算するため、小さいImageDataを作る
      const c = document.createElement('canvas');
      const size = 64;
      c.width = size; c.height = size;
      const ctx = c.getContext('2d');
      // カバー描画
      const ratio = Math.max(size / img.width, size / img.height);
      const w = img.width * ratio;
      const h = img.height * ratio;
      ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
      const data = ctx.getImageData(0, 0, size, size).data;

      // 平均色を即時計算（軽量なのでメインで）
      let r = 0, g = 0, b = 0;
      const count = size * size;
      for (let p = 0; p < data.length; p += 4) {
        r += data[p]; g += data[p+1]; b += data[p+2];
      }
      r = Math.round(r/count); g = Math.round(g/count); b = Math.round(b/count);
      const luminance = 0.2126*r + 0.7152*g + 0.0722*b;

      materials.push({ index: startIdx + i, img, file, r, g, b, luminance, thumbUrl: img.src });
      // グリッドに追加（100枚まで表示、以降は仮想化）
      if (materialGrid.children.length < 200) {
        const thumb = document.createElement('img');
        thumb.src = img.src;
        thumb.className = 'material-thumb';
        thumb.title = file.name;
        thumb.loading = 'lazy';
        materialGrid.appendChild(thumb);
      }
    } catch (err) {
      console.warn('Failed to load', file.name, err);
    }
    if (i % 20 === 0) {
      materialCount.textContent = `${materials.length} 枚`;
      await new Promise(r => setTimeout(r, 0));
    }
  }
  materialCount.textContent = `${materials.length} 枚`;
  materialStatus.textContent = materials.length > 0 ? `準備完了 — ${materials.length}枚で生成できます` : '素材を選択してください';
  materialClear.disabled = materials.length === 0;
  materialShuffle.disabled = materials.length === 0;
  updateGenerateBtn();
}

materialInput.addEventListener('change', async (e) => {
  await handleMaterialFiles(e.target.files);
  e.target.value = '';
});
materialDropzone.addEventListener('dragover', (e) => { e.preventDefault(); materialDropzone.classList.add('dragover'); });
materialDropzone.addEventListener('dragleave', () => materialDropzone.classList.remove('dragover'));
materialDropzone.addEventListener('drop', async (e) => {
  e.preventDefault(); materialDropzone.classList.remove('dragover');
  await handleMaterialFiles(e.dataTransfer.files);
});
materialClear.addEventListener('click', () => {
  materials.forEach(m => URL.revokeObjectURL(m.img.src));
  materials = [];
  materialGrid.innerHTML = '';
  materialCount.textContent = '0 枚';
  materialStatus.textContent = '素材を選択してください';
  materialClear.disabled = true;
  materialShuffle.disabled = true;
  updateGenerateBtn();
});
materialShuffle.addEventListener('click', () => {
  // 表示をシャッフル
  const thumbs = Array.from(materialGrid.children);
  for (let i = thumbs.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    materialGrid.appendChild(thumbs[j]);
  }
});

// 設定UI
gridSizeEl.addEventListener('input', () => {
  const v = parseInt(gridSizeEl.value);
  gridValueEl.textContent = `${v} × ${v} = ${ (v*v).toLocaleString()} マス`;
  updateGenerateBtn();
});
blendEl.addEventListener('input', () => {
  blendValueEl.textContent = blendEl.value + '%';
});

// 生成メイン
generateBtn.addEventListener('click', async () => {
  if (!targetImg || materials.length === 0) return;

  const gridSize = parseInt(gridSizeEl.value);
  const blendStrength = parseInt(blendEl.value);
  const avoidDuplicate = avoidDuplicateEl.checked;
  const usePenalty = usePenaltyEl.checked;
  const exportScale = parseInt(exportScaleEl.value);

  // バリデーション
  const totalTiles = gridSize * gridSize;
  if (totalTiles > 22500) {
    if (!confirm(`${totalTiles}マスは非常に重い処理になります。続行しますか？`)) return;
  }
  // Canvas上限チェック
  const targetWidth = targetBitmapData.originalWidth || targetImg.width;
  const targetHeight = targetBitmapData.originalHeight || targetImg.height;
  // アスペクト比を維持しつつ、長辺を800px相当に正規化してからタイル分割する方式に
  // 実際はターゲット画像の元サイズをそのままタイル分割に使うと巨大になるため、800px基準にリスケール
  const maxSide = 800;
  const scale = Math.min(1, maxSide / Math.max(targetImg.width, targetImg.height));
  const normW = Math.round(targetImg.width * scale);
  const normH = Math.round(targetImg.height * scale);
  // gridSizeは正方形だが、画像が長方形なら短辺側をアスペクト比で調整
  // 簡易的に正方形グリッドで全領域をカバー

  generateBtn.disabled = true;
  progressEl.classList.remove('hidden');
  progressFill.style.width = '0%';
  progressText.textContent = 'ターゲット画像を解析中...';

  try {
    // 1. ターゲット画像のタイル平均色をWorkerで解析
    const fullData = getFullImageData(targetImg);
    // Worker用に正規化サイズのデータを作る（800px基準）
    const normCanvas = document.createElement('canvas');
    normCanvas.width = normW; normCanvas.height = normH;
    const normCtx = normCanvas.getContext('2d');
    normCtx.drawImage(targetImg, 0, 0, normW, normH);
    const normData = normCtx.getImageData(0, 0, normW, normH);

    // gridSizeは正方形なので、normW/normHに合わせてタイルサイズを計算
    // Workerはwidth/heightとgridSizeからタイルを切るので、短辺側は余白が出るが許容
    const tiles = await callWorker('analyzeTargetTiles', {
      data: normData.data,
      width: normW,
      height: normH,
      gridSize
    });

    progressFill.style.width = '35%';
    progressText.textContent = `最適な配置を計算中... (${tiles.length}マス)`;

    // 2. 素材選択（メインスレッド）
    const placed = Array.from({ length: gridSize }, () => Array(gridSize).fill(-1));
    const usageCount = new Map();
    const placements = [];
    let uniqueUsed = new Set();

    for (let i = 0; i < tiles.length; i++) {
      const tile = tiles[i];
      const best = selectBestMaterial(tile, materials, usageCount, placed, {
        avoidDuplicate, usePenalty, gridSize
      });
      placements.push(best.index);
      placed[tile.y][tile.x] = best.index;
      usageCount.set(best.index, (usageCount.get(best.index) || 0) + 1);
      uniqueUsed.add(best.index);

      if (i % 500 === 0) {
        progressFill.style.width = `${35 + Math.round((i / tiles.length) * 35)}%`;
        progressText.textContent = `配置計算中... ${i}/${tiles.length} (${uniqueUsed.size}種類使用)`;
        if (i % 2000 === 0) await new Promise(r => setTimeout(r, 0));
      }
    }

    progressFill.style.width = '75%';
    progressText.textContent = '画像を合成中...';

    // 3. 描画
    mosaicCanvas = canvas;
    await drawMosaic(canvas, tiles, placements, materials, {
      gridSize, blendStrength, exportScale,
      targetWidth: normW, targetHeight: normH
    }, (p) => {
      progressFill.style.width = `${75 + Math.round(p * 25)}%`;
    });

    // 4. 完了表示
    canvas.classList.remove('hidden');
    canvasPlaceholder.classList.add('hidden');
    canvasFooter.classList.remove('hidden');
    resultCard.classList.remove('hidden');

    // 自然にフィット（拡大しない）
    fitCanvas();
    progressFill.style.width = '100%';
    progressText.textContent = '完成！';

    // 結果統計
    const sortedUsage = Array.from(usageCount.entries()).sort((a,b) => b[1]-a[1]);
    const maxUse = sortedUsage[0]?.[1] || 0;
    const minUse = sortedUsage[sortedUsage.length-1]?.[1] || 0;
    const avgUse = (tiles.length / uniqueUsed.size).toFixed(1);
    canvasInfo.textContent = `${normW*exportScale}×${normH*exportScale}px / ${gridSize}×${gridSize} (${tiles.length.toLocaleString()}マス) / ${uniqueUsed.size}種類使用`;
    resultStats.innerHTML = `
      <div class="stat"><div class="stat-value">${tiles.length.toLocaleString()}</div><div class="stat-label">総マス数</div></div>
      <div class="stat"><div class="stat-value">${uniqueUsed.size}</div><div class="stat-label">使用素材種類</div></div>
      <div class="stat"><div class="stat-value">${avgUse}</div><div class="stat-label">平均使用回数</div></div>
      <div class="stat"><div class="stat-value">${maxUse} / ${minUse}</div><div class="stat-label">最多 / 最少</div></div>
    `;

    // 比較用にデータURLを保持
    lastMosaicDataUrl = canvas.toDataURL('image/png');

    setTimeout(() => {
      progressEl.classList.add('hidden');
      generateBtn.disabled = false;
    }, 600);

  } catch (err) {
    console.error(err);
    progressText.textContent = 'エラー: ' + err.message;
    generateBtn.disabled = false;
  }
});

// ズーム - 自然な幅ベース（transformで拡大しない）
let currentZoom = 1;
function applyZoom() {
  // widthで拡大率を表現。100%でコンテナにフィット、200%で2倍でスクロール可能
  canvas.style.width = currentZoom <= 1 ? '100%' : (currentZoom * 100) + '%';
  canvas.style.maxWidth = currentZoom <= 1 ? '100%' : 'none';
  zoomLevelEl.textContent = Math.round(currentZoom * 100) + '%';
}
zoomIn.addEventListener('click', () => { currentZoom = Math.min(3, Math.round((currentZoom + 0.25)*100)/100); applyZoom(); });
zoomOut.addEventListener('click', () => { currentZoom = Math.max(0.5, Math.round((currentZoom - 0.25)*100)/100); applyZoom(); });
zoomReset.addEventListener('click', () => { currentZoom = 1; applyZoom(); canvasWrapper.scrollLeft = 0; canvasWrapper.scrollTop = 0; });
function fitCanvas() {
  if (canvas.classList.contains('hidden')) return;
  currentZoom = 1;
  applyZoom();
  canvasWrapper.scrollLeft = 0;
  canvasWrapper.scrollTop = 0;
}
fitBtn.addEventListener('click', fitCanvas);

// マウスホイールズーム + ドラッグパン
let isDragging = false, startX, startY, scrollLeft, scrollTop;
canvasWrapper.addEventListener('mousedown', (e) => {
  if (canvas.classList.contains('hidden')) return;
  isDragging = true;
  canvasWrapper.style.cursor = 'grabbing';
  startX = e.pageX - canvasWrapper.offsetLeft;
  startY = e.pageY - canvasWrapper.offsetTop;
  scrollLeft = canvasWrapper.scrollLeft;
  scrollTop = canvasWrapper.scrollTop;
});
canvasWrapper.addEventListener('mouseleave', () => { isDragging = false; canvasWrapper.style.cursor = 'default'; });
canvasWrapper.addEventListener('mouseup', () => { isDragging = false; canvasWrapper.style.cursor = 'default'; });
canvasWrapper.addEventListener('mousemove', (e) => {
  if (!isDragging) return;
  e.preventDefault();
  const x = e.pageX - canvasWrapper.offsetLeft;
  const y = e.pageY - canvasWrapper.offsetTop;
  canvasWrapper.scrollLeft = scrollLeft - (x - startX);
  canvasWrapper.scrollTop = scrollTop - (y - startY);
});
canvasWrapper.addEventListener('wheel', (e) => {
  if (e.ctrlKey || e.metaKey) {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.1 : 0.1;
    currentZoom = Math.min(4, Math.max(0.25, currentZoom + delta));
    applyZoom();
  }
}, { passive: false });

// 保存
downloadBtn.addEventListener('click', () => {
  if (canvas.classList.contains('hidden')) return;
  canvas.toBlob((blob) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `million-moments-${Date.now()}.png`;
    a.click();
    URL.revokeObjectURL(url);
  }, 'image/png');
});

// 比較
compareBtn.addEventListener('click', () => {
  if (!targetImg || !lastMosaicDataUrl) return;
  document.getElementById('compare-original').src = targetImg.src;
  document.getElementById('compare-mosaic').src = lastMosaicDataUrl;
  compareDialog.showModal();
});
compareClose.addEventListener('click', () => compareDialog.close());
compareDialog.addEventListener('click', (e) => {
  if (e.target === compareDialog) compareDialog.close();
});

// 初期表示
updateGenerateBtn();
gridSizeEl.dispatchEvent(new Event('input'));
blendEl.dispatchEvent(new Event('input'));

// キーボードショートカット
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !compareDialog.open) return;
});

// localStorageで設定を復元
try {
  const saved = JSON.parse(localStorage.getItem('mm-settings') || '{}');
  if (saved.gridSize) { gridSizeEl.value = saved.gridSize; gridSizeEl.dispatchEvent(new Event('input')); }
  if (saved.blend) { blendEl.value = saved.blend; blendEl.dispatchEvent(new Event('input')); }
  if (saved.exportScale) exportScaleEl.value = saved.exportScale;
  if (saved.avoidDuplicate !== undefined) avoidDuplicateEl.checked = saved.avoidDuplicate;
  if (saved.usePenalty !== undefined) usePenaltyEl.checked = saved.usePenalty;
} catch {}
// 保存
['change','input'].forEach(ev => {
  [gridSizeEl, blendEl, exportScaleEl, avoidDuplicateEl, usePenaltyEl].forEach(el => {
    el.addEventListener(ev, () => {
      localStorage.setItem('mm-settings', JSON.stringify({
        gridSize: gridSizeEl.value,
        blend: blendEl.value,
        exportScale: exportScaleEl.value,
        avoidDuplicate: avoidDuplicateEl.checked,
        usePenalty: usePenaltyEl.checked
      }));
    });
  });
});
