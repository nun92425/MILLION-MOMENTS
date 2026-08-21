#!/usr/bin/env node
/**
 * YouTube サムネイル一括取得スクリプト
 * 使い方:
 *   YOUTUBE_API_KEY=xxx node scripts/fetch-thumbnails.js --playlist PLxxxx --out local-materials/thumbnails
 *   YOUTUBE_API_KEY=xxx node scripts/fetch-thumbnails.js --video-ids dQw4w9WgXcQ,xxxxx --out local-materials/thumbnails
 *   YOUTUBE_API_KEY=xxx node scripts/fetch-thumbnails.js --channel UCxxxx --out local-materials/thumbnails
 *
 * 依存: Node.js 18+ (fetch built-in)
 * 出力: 各動画の最大解像度サムネイルをダウンロード + metadata.json
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

let API_KEY = process.env.YOUTUBE_API_KEY;

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = { playlist: null, videoIds: null, channel: null, out: 'local-materials/thumbnails', maxResults: 500, talent: null };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--playlist') opts.playlist = args[++i];
    else if (args[i] === '--video-ids') opts.videoIds = args[++i];
    else if (args[i] === '--channel') opts.channel = args[++i];
    else if (args[i] === '--out') opts.out = args[++i];
    else if (args[i] === '--talent') opts.talent = args[++i];
    else if (args[i] === '--max') opts.maxResults = parseInt(args[++i], 10);
    else if (args[i] === '--help' || args[i] === '-h') {
    console.log(`
使い方:
  YOUTUBE_API_KEY=xxx node scripts/fetch-thumbnails.js --playlist PLxxxx --talent "甘狼このみ"
  YOUTUBE_API_KEY=xxx node scripts/fetch-thumbnails.js --video-ids id1,id2 --talent "音ノ乃のの"
  YOUTUBE_API_KEY=xxx node scripts/fetch-thumbnails.js --channel UCxxxx --talent "あくび・でもんすぺーど"

オプション:
  --playlist  プレイリストID (PL... または URLから抽出)
  --video-ids カンマ区切りの動画ID
  --channel   チャンネルID (そのチャンネルのアップロード動画を取得)
  --talent    タレント名（フォルダ分け用、例: "甘狼このみ"）— 指定すると out/<タレント名>/ に保存
  --out       出力フォルダ (default: local-materials/thumbnails)
  --max       最大取得件数 (default: 500)
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
    // レート制限対策
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
  // 50件ずつvideos.listで詳細取得（サムネURL含む）
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
  // maxres > standard > high > medium > default の優先
  return thumbnails.maxres?.url || thumbnails.standard?.url || thumbnails.high?.url || thumbnails.medium?.url || thumbnails.default?.url;
}

async function downloadImage(url, destPath) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to download ${url}: ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  await fs.promises.writeFile(destPath, buf);
}

async function main() {
  const opts = parseArgs();

  API_KEY = process.env.YOUTUBE_API_KEY;
  if (!API_KEY) {
    console.error('[ERROR] YOUTUBE_API_KEY 環境変数を設定してください');
    console.error('   例: YOUTUBE_API_KEY=xxx node scripts/fetch-thumbnails.js --playlist PLxxxx');
    console.error('   取得方法: https://console.cloud.google.com/apis/credentials でAPIキーを作成し、YouTube Data API v3を有効化');
    process.exit(1);
  }

  // タレント名が指定されていればサブフォルダに振り分け
  if (opts.talent) {
    const safeTalent = opts.talent.replace(/[^a-zA-Z0-9\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF_-]/g, '_');
    opts.out = path.join(opts.out, safeTalent);
  }
  console.log('MILLION MOMENTS - サムネ取得開始');
  if (opts.talent) console.log(`   タレント: ${opts.talent}`);
  console.log(`   出力: ${opts.out}`);
  await fs.promises.mkdir(opts.out, { recursive: true });

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
    console.error('   例: node scripts/fetch-thumbnails.js --playlist PLxxxx');
    process.exit(1);
  }

  if (videoIds.length === 0) {
    console.log('[WARN] 取得する動画がありません');
    return;
  }

  console.log(`[INFO] 動画詳細を取得中... (${videoIds.length}件)`);
  const details = await getVideoDetails(videoIds);
  console.log(`[OK] 詳細取得完了: ${details.length}件`);

  const metadata = [];
  let success = 0, failed = 0;

  for (let i = 0; i < details.length; i++) {
    const v = details[i];
    const thumbUrl = pickBestThumbnail(v.snippet.thumbnails);
    if (!thumbUrl) {
      console.warn(`[WARN] サムネなし: ${v.id} ${v.snippet.title}`);
      failed++;
      continue;
    }
    const safeTitle = v.snippet.title.replace(/[^a-zA-Z0-9\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF_-]/g, '_').slice(0, 50);
    const ext = thumbUrl.includes('.webp') ? 'webp' : 'jpg';
    const filename = `${String(i+1).padStart(4,'0')}_${v.id}_${safeTitle}.${ext}`;
    const dest = path.join(opts.out, filename);

    try {
      await downloadImage(thumbUrl, dest);
      success++;
      console.log(`  [${i+1}/${details.length}] [OK] ${v.snippet.title.slice(0,40)} -> ${filename}`);
    } catch (err) {
      console.warn(`  [${i+1}/${details.length}] [FAIL] ${v.id}: ${err.message}`);
      failed++;
    }
    metadata.push({
      videoId: v.id,
      title: v.snippet.title,
      channelTitle: v.snippet.channelTitle,
      talent: opts.talent || v.snippet.channelTitle,
      publishedAt: v.snippet.publishedAt,
      thumbnailUrl: thumbUrl,
      localFile: filename,
      url: `https://www.youtube.com/watch?v=${v.id}`
    });
    // レート制限対策: 50ms待機
    await new Promise(r => setTimeout(r, 50));
  }

  const metaPath = path.join(opts.out, 'metadata.json');
  await fs.promises.writeFile(metaPath, JSON.stringify(metadata, null, 2), 'utf-8');
  console.log(`\n[完了] 成功 ${success}件 / 失敗 ${failed}件`);
  console.log(`   画像: ${opts.out}/`);
  console.log(`   メタデータ: ${metaPath}`);
  console.log(`\n次のステップ: ブラウザで http://localhost:5173 を開き、素材画像として ${opts.out} の画像を選択してください`);
}

main().catch(err => {
  console.error('[ERROR]', err.message);
  process.exit(1);
});
