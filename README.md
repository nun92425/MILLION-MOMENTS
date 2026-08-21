# MILLION MOMENTS

**「無数の瞬間が、一つの景色になる。」** — ミリプロ フォトモザイクアート

ブラウザだけで完結するフォトモザイク生成ツール。無数の素材画像を一枚の大きなビジュアルへ再構成します。

## 特徴

- 🎨 **完全ブラウザ型** — 画像はサーバーに送信されません。すべて端末内で処理
- 🖼️ **大量画像対応** — 数百〜数千枚の素材に対応（Web Workerで非ブロッキング）
- ⚡ **Vite + Canvas API** — 高速な色解析・自動配置
- 🆓 **無料運用** — Render Static Siteで完全無料・広告なし

## 使い方

### 1. サイトで生成（一般公開）

1. https://your-site.onrender.com を開く
2. **メイン画像**を1枚選択（完成形の絵）
3. **素材画像**を複数選択（ドラッグ&ドロップ可）
4. タイル数・色補正などを調整
5. **「モザイクを生成する」** → 保存してXで共有

### 2. ローカル開発

```bash
npm install
npm run dev
# http://localhost:5173
```

### 3. YouTubeサムネイル一括取得（ローカル専用）

```bash
# プレイリストから取得
YOUTUBE_API_KEY=xxx npm run fetch:thumbnails -- --playlist PLxxxx --out local-materials/thumbnails

# チャンネルから取得
YOUTUBE_API_KEY=xxx npm run fetch:thumbnails -- --channel UCxxxx --out local-materials/thumbnails

# 動画ID直接指定
YOUTUBE_API_KEY=xxx npm run fetch:thumbnails -- --video-ids dQw4w9WgXcQ,xxx --out local-materials/thumbnails
```

取得した画像は `local-materials/` に保存され、`.gitignore` によりGit/Renderには含まれません（絶対にデプロイされない）。

## 技術構成

- Vite + Vanilla JS
- Canvas API（画像合成）
- Web Worker（色解析）
- YouTube Data API v3（サムネ取得スクリプト）

## 非公式作品について

本ツールおよび生成される作品は**非公式ファンメイド**です。公式とは関係ありません。素材の利用にあたっては各ガイドラインを遵守してください。

## ライセンス

MIT

## 企画書

[企画書.md](./企画書.md) を参照
