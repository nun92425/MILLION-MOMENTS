/**
 * フォトモザイク生成ロジック
 * 企画書.md:202 のアルゴリズムを実装
 */

export function colorDistance(c1, c2) {
  // RGBユークリッド距離（将来的にLab差に拡張可能）
  const dr = c1.r - c2.r;
  const dg = c1.g - c2.g;
  const db = c1.b - c2.b;
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

/**
 * 最適な素材を選択
 * @param {Object} tile - {r,g,b,luminance, x,y}
 * @param {Array} materials - [{index,r,g,b,luminance, img}]
 * @param {Map} usageCount - index -> count
 * @param {Array} placed - 2D array of placed indices
 * @param {Object} opts - {avoidDuplicate, usePenalty, gridSize}
 */
export function selectBestMaterial(tile, materials, usageCount, placed, opts) {
  let best = null;
  let bestScore = Infinity;

  // 近傍の使用済みインデックス
  const neighborIndices = new Set();
  if (opts.avoidDuplicate) {
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        const nx = tile.x + dx;
        const ny = tile.y + dy;
        if (nx >= 0 && nx < opts.gridSize && ny >= 0 && ny < opts.gridSize) {
          const idx = placed[ny]?.[nx];
          if (idx !== undefined && idx !== -1) neighborIndices.add(idx);
        }
      }
    }
  }

  // 多様性のため、スコアにランダムな微小ノイズを加える
  for (const m of materials) {
    let score = 0;

    // 1. 色距離 (0-441)
    const cd = colorDistance(tile, m);
    score += cd * 1.0;

    // 2. 輝度差 (0-255) を少し重み付け
    const ld = Math.abs(tile.luminance - m.luminance);
    score += ld * 0.3;

    // 3. 使用回数ペナルティ
    if (opts.usePenalty) {
      const count = usageCount.get(m.index) || 0;
      // 使用回数が増えるほどペナルティを指数的に増加
      score += count * 12;
    }

    // 4. 周辺重複ペナルティ
    if (neighborIndices.has(m.index)) {
      score += 80;
    }

    // 5. 微小ランダムノイズ（同点対策・多様性）
    score += Math.random() * 3;

    if (score < bestScore) {
      bestScore = score;
      best = m;
    }
  }
  return best;
}

/**
 * キャンバスにモザイクを描画
 * @param {HTMLCanvasElement} canvas
 * @param {Array} tiles - タイルの色情報
 * @param {Array} placements - 各タイルに選ばれた素材indexの配列
 * @param {Array} materials - 素材画像データ
 * @param {Object} opts - {gridSize, blendStrength, exportScale, targetWidth, targetHeight}
 * @param {Function} onProgress
 */
export async function drawMosaic(canvas, tiles, placements, materials, opts, onProgress) {
  const { gridSize, blendStrength, exportScale, targetWidth, targetHeight } = opts;
  const tileW = targetWidth / gridSize;
  const tileH = targetHeight / gridSize;

  // キャンバスサイズを出力解像度に合わせて設定
  canvas.width = Math.round(targetWidth * exportScale);
  canvas.height = Math.round(targetHeight * exportScale);
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingQuality = 'high';

  // 背景を黒で塗りつぶし
  ctx.fillStyle = '#08080c';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // 素材画像のキャッシュ: 事前に縮小したImageBitmapを作っておくと速いが、ここでは直接描画
  const scale = exportScale;
  const blendAlpha = blendStrength / 100;

  for (let i = 0; i < placements.length; i++) {
    const matIndex = placements[i];
    const tile = tiles[i];
    const mat = materials.find(m => m.index === matIndex);
    if (!mat || !mat.img) continue;

    const x = (tile.x * tileW) * scale;
    const y = (tile.y * tileH) * scale;
    const w = tileW * scale;
    const h = tileH * scale;

    // 素材画像をタイル領域にカバー描画（中央クロップ）
    const img = mat.img;
    const imgRatio = img.width / img.height;
    const tileRatio = w / h;
    let sx, sy, sw, sh;
    if (imgRatio > tileRatio) {
      // 画像が横長 → 左右をクロップ
      sh = img.height;
      sw = sh * tileRatio;
      sx = (img.width - sw) / 2;
      sy = 0;
    } else {
      sw = img.width;
      sh = sw / tileRatio;
      sx = 0;
      sy = (img.height - sh) / 2;
    }
    ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);

    // 色補正: タイルの目標色を半透明で重ねる
    if (blendAlpha > 0) {
      ctx.fillStyle = `rgba(${tile.r}, ${tile.g}, ${tile.b}, ${blendAlpha})`;
      ctx.fillRect(x, y, w, h);
    }

    if (i % 500 === 0 && onProgress) {
      onProgress(i / placements.length);
      // UIブロッキングを避けるため少し譲る
      if (i % 2000 === 0) await new Promise(r => setTimeout(r, 0));
    }
  }
  if (onProgress) onProgress(1);
}
