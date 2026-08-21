// Web Worker: 素材画像の平均色・輝度を解析
// メインスレッドから ImageData を受け取り、平均色を返す

self.onmessage = async (e) => {
  const { id, type, payload } = e.data;

  try {
    if (type === 'analyzeMaterials') {
      // payload: { images: [{ index, bitmap }] } ただし bitmap は transferable
      // ここでは OffscreenCanvas を使わず、ImageData から直接計算する方式もサポート
      // 今回はメイン側で ImageData を作って送る方式
      const results = [];
      for (const item of payload.images) {
        const { index, data, width, height } = item;
        let r = 0, g = 0, b = 0;
        const len = width * height;
        // サンプリング: 大きい画像は間引く
        const step = len > 10000 ? 4 : 1;
        let count = 0;
        for (let i = 0; i < data.length; i += 4 * step) {
          r += data[i];
          g += data[i + 1];
          b += data[i + 2];
          count++;
        }
        r = Math.round(r / count);
        g = Math.round(g / count);
        b = Math.round(b / count);
        // 輝度 (Rec.709)
        const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
        results.push({ index, r, g, b, luminance });
        // 進捗通知
        if (results.length % 50 === 0) {
          self.postMessage({ id, type: 'progress', payload: { done: results.length, total: payload.images.length } });
        }
      }
      self.postMessage({ id, type: 'done', payload: results });
    }

    if (type === 'analyzeTargetTiles') {
      // メイン画像をタイル分割して各タイルの平均色を返す
      // 比率を正確に保つため、端数の出る幅も余さずカバーする（小数タイル対応）
      const { data, width, height, gridSize } = payload;
      const tileWF = width / gridSize;
      const tileHF = height / gridSize;
      const tiles = [];
      for (let y = 0; y < gridSize; y++) {
        for (let x = 0; x < gridSize; x++) {
          const x0 = Math.floor(x * tileWF);
          const x1 = Math.floor((x + 1) * tileWF);
          const y0 = Math.floor(y * tileHF);
          const y1 = Math.floor((y + 1) * tileHF);
          const tileW = Math.max(1, x1 - x0);
          const tileH = Math.max(1, y1 - y0);
          // タイル内の平均色
          let r = 0, g = 0, b = 0, count = 0;
          // サンプリング間隔（端数タイルでも余白なくカバー）
          for (let ty = 0; ty < tileH; ty += 2) {
            for (let tx = 0; tx < tileW; tx += 2) {
              const px = x0 + tx;
              const py = y0 + ty;
              if (px >= width || py >= height) continue;
              const idx = (py * width + px) * 4;
              r += data[idx];
              g += data[idx + 1];
              b += data[idx + 2];
              count++;
            }
          }
          if (count === 0) count = 1;
          r = Math.round(r / count);
          g = Math.round(g / count);
          b = Math.round(b / count);
          const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
          tiles.push({ x, y, r, g, b, luminance });
        }
      }
      self.postMessage({ id, type: 'done', payload: tiles });
    }
  } catch (err) {
    self.postMessage({ id, type: 'error', payload: err.message });
  }
};
