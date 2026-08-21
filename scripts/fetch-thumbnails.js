#!/usr/bin/env node
/**
 * YouTube サムネイル一括取得スクリプト
 * 使い方:
 *   YOUTUBE_API_KEY=xxx node scripts/fetch-thumbnails.js --playlist PLxxxx --talent "甘狼このみ" --out local-materials/thumbnails
 *   YOUTUBE_API_KEY=xxx node scripts/fetch-thumbnails.js --playlist PLxxxx --split-by-channel --skip-existing
 *   YOUTUBE_API_KEY=xxx node scripts/fetch-thumbnails.js --channel UCxxxx --talent "あくび・でもんすぺーど"
 *
 * 依存: Node.js 18+ (fetch built-in)
 * 出力: 各動画の最大解像度サムネイルをダウンロード + metadata.json + _index.json
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

let API_KEY = process.env.YOUTUBE_API_KEY;

// talentMap.json を読み込む（あれば）
let TALENT_MAP = {};
try {
  const mapPath = path.join(path.dirname(fileURLToPath(import.meta.url)), 'talentMap.json');
  if (fs.existsSync(mapPath)) {
    TALENT_MAP = JSON.parse(fs.readFileSync(mapPath, 'utf-8'));
  }
} catch {}

function sanitize(str) {
  return str.replace(/[^a-zA-Z0-9\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF_-]/g, '_').slice(0, 80).trim() || 'unknown';
}

function resolveTalent(channelTitle, explicitTalent) {
  if (explicitTalent) return explicitTalent;
  // channelTitle から talentMap で推測
  for (const [key, formal] of Object.entries(TALENT_MAP)) {
    if (channelTitle.toLowerCase().includes(key.toLowerCase())) return formal;
  }
  return channelTitle;
}

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = {
    playlist: null,
    videoIds: null,
    channel: null,
    out: 'local-materials/thumbnails',
    maxResults: 1000,
    talent: null,
    splitByChannel: false,
    skipExisting: false,
    dryRun: false
  };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--playlist') opts.playlist = args[++i];
    else if (args[i] === '--video-ids') opts.videoIds = args[++i];
    else if (args[i] === '--channel') opts.channel = args[++i];
    else if (args[i] === '--out') opts.out = args[++i];
    else if (args[i] === '--talent') opts.talent = args[++i];
    else if (args[i] === '--split-by-channel') opts.splitByChannel = true;
    else if (args[i] === '--skip-existing') opts.skipExisting = true;
    else if (args[i] === '--dry-run') opts.dryRun = true;
    else if (args[i] === '--max') opts.maxResults = parseInt(args[++i], 10);
    else if (args[i] === '--help' || args[i] === '-h') {
      console.log(`
使い方:
  YOUTUBE_API_KEY=xxx node scripts/fetch-thumbnails.js --playlist PLxxxx --talent "甘狼このみ"
  YOUTUBE_API_KEY=xxx node scripts/fetch-thumbnails.js --playlist PLxxxx --split-by-channel --skip-existing
  YOUTUBE_API_KEY=xxx node scripts/fetch-thumbnails.js --channel UCxxxx --talent "あくび・でもんすぺーど"

オプション:
  --playlist  プレイリストID (PL... または URLから抽出)
  --video-ids カンマ区切りの動画ID
  --channel   チャンネルID (そのチャンネルのアップロード動画を取得)
  --talent    タレント名（フォルダ分け用、例: "甘狼このみ"）— 指定すると out/<タレント名>/ に保存
  --split-by-channel  混合プレイリストを channelTitle ごとに自動でタレント別フォルダへ分割
  --skip-existing     既存の _index.json / metadata.json を参照し重複 videoId をスキップ（追記マージ）
  --dry-run           取得せず件数のみ表示（重複チェックの確認用）
  --out       出力フォルダ (default: local-materials/thumbnails)
  --max       最大取得件数 (default: 1000)
       `);
      process.exit(0);
    }
  }
  // URLからID抽出
  if (opts.playlist && opts.playlist.includes('list=')) {
    const m = opts.playlist.match(/[?&]list=([^&]+)/);
    if (m) opts.playlist = m[1];
  }
  return opts;
}

async function ytFetch(url) {
  const res = await fetch(url);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`YouTube API error ${res.status}: ${text}`);
  }
  return res.json();
}

async function getPlaylistVideoIds(playlistId, maxResults) {
  let videoIds = [];
  let pageToken = '';
  do {
    const url = `https://www.googleapis.com/youtube/v3/playlistItems?part=contentDetails&playlistId=${playlistId}&maxResults=50&pageToken=${pageToken}&key=${API_KEY}`;
    const data = await ytFetch(url);
    for (const item of data.items) {
      videoIds.push(item.contentDetails.videoId);
      if (videoIds.length >= maxResults) break;
    }
    pageToken = data.nextPageToken || '';
    if (videoIds.length >= maxResults) break;
    await new Promise(r => setTimeout(r, 100));
  } while (pageToken);
  return videoIds;
}

async function getUploadsPlaylistId(channelId) {
  const url = `https://www.googleapis.com/youtube/v3/channels?part=contentDetails&id=${channelId}&key=${API_KEY}`;
  const data = await ytFetch(url);
  if (!data.items || data.items.length === 0) throw new Error('Channel not found: ' + channelId);
  return data.items[0].contentDetails.relatedPlaylists.uploads;
}

async function getVideoDetails(videoIds) {
  const details = [];
  for (let i = 0; i < videoIds.length; i += 50) {
    const chunk = videoIds.slice(i, i + 50);
    const url = `https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails&id=${chunk.join(',')}&key=${API_KEY}`;
    const data = await ytFetch(url);
    details.push(...data.items);
    await new Promise(r => setTimeout(r, 100));
  }
  return details;
}

function pickBestThumbnail(thumbnails) {
  return thumbnails.maxres?.url || thumbnails.standard?.url || thumbnails.high?.url || thumbnails.medium?.url || thumbnails.default?.url;
}

async function downloadImage(url, destPath) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to download ${url}: ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  await fs.promises.writeFile(destPath, buf);
}

async function loadExistingIndex(baseOut) {
  const indexPath = path.join(baseOut, '_index.json');
  const existingIds = new Set();
  const byTalent = {};
  // _index.json があればそれを優先
  if (fs.existsSync(indexPath)) {
    try {
      const idx = JSON.parse(fs.readFileSync(indexPath, 'utf-8'));
      for (const id of idx.videoIds || []) existingIds.add(id);
      for (const id of idx.blockedIds || []) existingIds.add(id);
      return { existingIds, indexPath, byTalent: idx.byTalent || {}, blockedIds: idx.blockedIds || [] };
    } catch {}
  }
  // なければ各 metadata.json を走査
  if (fs.existsSync(baseOut)) {
    const walk = (dir) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (entry.name === 'metadata.json') {
          try {
            const arr = JSON.parse(fs.readFileSync(full, 'utf-8'));
            for (const item of arr) {
              if (item.videoId) existingIds.add(item.videoId);
            }
          } catch {}
        }
      }
    };
    try { walk(baseOut); } catch {}
  }
  return { existingIds, indexPath, byTalent };
}

async function saveIndex(baseOut, existingIds, talentStats) {
  const indexPath = path.join(baseOut, '_index.json');
  // 既存の blockedIds を保持
  let blockedIds = [];
  if (fs.existsSync(indexPath)) {
    try { blockedIds = JSON.parse(fs.readFileSync(indexPath, 'utf-8')).blockedIds || []; } catch {}
  }
  // blockedIds は existingIds から除外して総数計算（totalは実際のファイル数）
  const blockedSet = new Set(blockedIds);
  const total = Array.from(existingIds).filter(id => !blockedSet.has(id)).length;
  const data = {
    updatedAt: new Date().toISOString(),
    total,
    videoIds: Array.from(existingIds).filter(id => !blockedSet.has(id)).sort(),
    blockedIds,
    byTalent: talentStats
  };
  await fs.promises.writeFile(indexPath, JSON.stringify(data, null, 2), 'utf-8');
}

async function main() {
  const opts = parseArgs();

  API_KEY = process.env.YOUTUBE_API_KEY;
  if (!API_KEY) {
    console.error('[ERROR] YOUTUBE_API_KEY 環境変数を設定してください');
    console.error('   例: YOUTUBE_API_KEY=xxx node scripts/fetch-thumbnails.js --playlist PLxxxx --split-by-channel --skip-existing');
    console.error('   取得方法: https://console.cloud.google.com/apis/credentials でAPIキーを作成し、YouTube Data API v3を有効化');
    process.exit(1);
  }

  const baseOut = opts.out; // 重複索引の基点
  // タレント単一指定かつ split しない場合のみ out をサブフォルダに
  let singleOut = null;
  if (opts.talent && !opts.splitByChannel) {
    singleOut = path.join(baseOut, sanitize(opts.talent));
  }

  console.log('MILLION MOMENTS - サムネ取得開始');
  if (opts.talent) console.log(`   タレント: ${opts.talent}`);
  if (opts.splitByChannel) console.log('   モード: タレント別自動分割 (--split-by-channel)');
  if (opts.skipExisting) console.log('   重複排除: ON (--skip-existing)');
  console.log(`   出力ベース: ${baseOut}`);
  if (singleOut) console.log(`   出力: ${singleOut}`);
  await fs.promises.mkdir(singleOut || baseOut, { recursive: true });

  // 既存索引を読み込み
  let existingIds = new Set();
  let talentStats = {};
  if (opts.skipExisting) {
    const loaded = await loadExistingIndex(baseOut);
    existingIds = loaded.existingIds;
    talentStats = loaded.byTalent || {};
    console.log(`[INFO] 既存索引: ${existingIds.size}件の videoId を読み込み（重複はスキップ）`);
  }

  let videoIds = [];
  if (opts.videoIds) {
    videoIds = opts.videoIds.split(',').map(s => s.trim()).filter(Boolean);
    console.log(`[INFO] 動画ID指定: ${videoIds.length}件`);
  } else if (opts.playlist) {
    console.log(`[INFO] プレイリスト取得: ${opts.playlist}`);
    videoIds = await getPlaylistVideoIds(opts.playlist, opts.maxResults);
    console.log(`[OK] プレイリストから ${videoIds.length}件取得`);
  } else if (opts.channel) {
    console.log(`[INFO] チャンネル取得: ${opts.channel}`);
    const uploadsId = await getUploadsPlaylistId(opts.channel);
    console.log(`   アップロード用プレイリスト: ${uploadsId}`);
    videoIds = await getPlaylistVideoIds(uploadsId, opts.maxResults);
    console.log(`[OK] チャンネル動画 ${videoIds.length}件取得`);
  } else {
    console.error('[ERROR] --playlist, --video-ids, --channel のいずれかを指定してください');
    console.error('   例: node scripts/fetch-thumbnails.js --playlist PLxxxx --split-by-channel --skip-existing');
    process.exit(1);
  }

  // 重複排除（取得前にフィルタ）
  let filteredIds = videoIds;
  if (opts.skipExisting && existingIds.size > 0) {
    const before = videoIds.length;
    filteredIds = videoIds.filter(id => !existingIds.has(id));
    console.log(`[INFO] 重複排除: ${before}件中 ${before - filteredIds.length}件が既存のためスキップ → 新規 ${filteredIds.length}件`);
  }

  if (filteredIds.length === 0) {
    console.log('[INFO] 新規に取得する動画がありません（すべて重複）');
    return;
  }

  if (opts.dryRun) {
    console.log(`[DRY-RUN] 新規 ${filteredIds.length}件が取得対象です（実際にはダウンロードしません）`);
    console.log(`  IDs: ${filteredIds.slice(0, 10).join(', ')}${filteredIds.length > 10 ? ' ...' : ''}`);
    return;
  }

  console.log(`[INFO] 動画詳細を取得中... (${filteredIds.length}件)`);
  const details = await getVideoDetails(filteredIds);
  console.log(`[OK] 詳細取得完了: ${details.length}件`);

  // グループ分け: split-by-channel なら channelTitle ごと、そうでなければ単一
  const groups = new Map(); // outDir -> { details: [], talentName }
  if (opts.splitByChannel) {
    for (const v of details) {
      const talentName = resolveTalent(v.snippet.channelTitle, null);
      const safe = sanitize(talentName);
      const outDir = path.join(baseOut, safe);
      if (!groups.has(outDir)) groups.set(outDir, { details: [], talentName });
      groups.get(outDir).details.push(v);
    }
    console.log(`[INFO] タレント別に ${groups.size} グループへ分割`);
    for (const [dir, g] of groups) {
      console.log(`  - ${g.talentName} (${path.basename(dir)}): ${g.details.length}件`);
    }
  } else if (singleOut) {
    groups.set(singleOut, { details, talentName: opts.talent });
  } else {
    groups.set(baseOut, { details, talentName: opts.talent || null });
  }

  let globalSuccess = 0, globalFailed = 0, globalSkipped = 0;

  for (const [outDir, group] of groups) {
    await fs.promises.mkdir(outDir, { recursive: true });
    const metaPath = path.join(outDir, 'metadata.json');
    let existingMeta = [];
    if (fs.existsSync(metaPath)) {
      try { existingMeta = JSON.parse(fs.readFileSync(metaPath, 'utf-8')); } catch { existingMeta = []; }
    }
    const existingInGroup = new Set(existingMeta.map(m => m.videoId));
    const groupDetails = group.details.filter(v => !existingInGroup.has(v.id));
    // 既存インデックスにもある場合はスキップ（二重チェック）
    const toDownload = opts.skipExisting ? groupDetails.filter(v => !existingIds.has(v.id)) : groupDetails;
    if (toDownload.length === 0) {
      console.log(`\n[SKIP] ${group.talentName || path.basename(outDir)}: 新規なし（すべて重複）`);
      continue;
    }
    console.log(`\n[INFO] ${group.talentName || path.basename(outDir)}: ${toDownload.length}件をダウンロード -> ${outDir}`);

    let success = 0, failed = 0;
    // 既存の連番を考慮
    const startNum = existingMeta.length;
    for (let i = 0; i < toDownload.length; i++) {
      const v = toDownload[i];
      const thumbUrl = pickBestThumbnail(v.snippet.thumbnails);
      if (!thumbUrl) {
        console.warn(`[WARN] サムネなし: ${v.id} ${v.snippet.title}`);
        failed++;
        continue;
      }
      const safeTitle = v.snippet.title.replace(/[^a-zA-Z0-9\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF_-]/g, '_').slice(0, 50);
      const ext = thumbUrl.includes('.webp') ? 'webp' : 'jpg';
      const filename = `${String(startNum + i + 1).padStart(4,'0')}_${v.id}_${safeTitle}.${ext}`;
      const dest = path.join(outDir, filename);

      if (fs.existsSync(dest) && opts.skipExisting) {
        globalSkipped++;
        continue;
      }

      try {
        await downloadImage(thumbUrl, dest);
        success++;
        globalSuccess++;
        existingIds.add(v.id);
        console.log(`  [${i+1}/${toDownload.length}] [OK] ${v.snippet.title.slice(0,40)} -> ${path.basename(dest)}`);
        // metadata 追加
        existingMeta.push({
          videoId: v.id,
          title: v.snippet.title,
          channelTitle: v.snippet.channelTitle,
          talent: group.talentName || v.snippet.channelTitle,
          publishedAt: v.snippet.publishedAt,
          thumbnailUrl: thumbUrl,
          localFile: filename,
          url: `https://www.youtube.com/watch?v=${v.id}`
        });
      } catch (err) {
        console.warn(`  [${i+1}/${toDownload.length}] [FAIL] ${v.id}: ${err.message}`);
        failed++;
        globalFailed++;
      }
      await new Promise(r => setTimeout(r, 50));
    }
    // metadata を publishedAt 降順で保存
    existingMeta.sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt));
    await fs.promises.writeFile(metaPath, JSON.stringify(existingMeta, null, 2), 'utf-8');
    console.log(`[完了] ${group.talentName || path.basename(outDir)}: 成功 ${success}件 / 失敗 ${failed}件 -> ${metaPath}`);
    talentStats[group.talentName || path.basename(outDir)] = existingMeta.length;
  }

  // グローバル索引を保存
  if (opts.skipExisting || opts.splitByChannel) {
    await saveIndex(baseOut, existingIds, talentStats);
    console.log(`\n[索引] 更新: ${existingIds.size}件 -> ${path.join(baseOut, '_index.json')}`);
  }

  console.log(`\n[完了] 全体: 成功 ${globalSuccess}件 / 失敗 ${globalFailed}件 / スキップ ${globalSkipped}件`);
  console.log(`   出力ベース: ${baseOut}/`);
  console.log(`\n次のステップ: ブラウザで http://localhost:5173 を開き、素材画像として各タレントフォルダの画像を選択してください`);
}

main().catch(err => {
  console.error('[ERROR]', err.message);
  process.exit(1);
});
