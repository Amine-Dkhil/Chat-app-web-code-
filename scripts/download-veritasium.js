/**
 * Pre-download 10 videos from https://www.youtube.com/@veritasium
 * Saves to public/veritasium-channel-data.json
 * Run: node scripts/download-veritasium.js
 * Requires: REACT_APP_YOUTUBE_API_KEY or YOUTUBE_API_KEY in .env
 * Uses tiered transcript fallback (YouTube → Gemini/Whisper) from server/transcript.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const fs = require('fs');
const path = require('path');
const { getTranscriptWithFallback } = require('../server/transcript');

const API_KEY = process.env.REACT_APP_YOUTUBE_API_KEY || process.env.YOUTUBE_API_KEY;

async function fetchJson(url, params = {}) {
  const u = new URL(url);
  Object.entries(params).forEach(([k, v]) => u.searchParams.set(k, v));
  const res = await fetch(u.toString());
  if (!res.ok) throw new Error(`API: ${res.status}`);
  return res.json();
}

async function main() {
  if (!API_KEY) {
    console.error('Set REACT_APP_YOUTUBE_API_KEY or YOUTUBE_API_KEY in .env');
    process.exit(1);
  }
  const channelUrl = 'https://www.youtube.com/@veritasium';
  const maxVideos = 10;

  const searchRes = await fetchJson('https://www.googleapis.com/youtube/v3/search', {
    part: 'snippet',
    type: 'channel',
    q: '@veritasium',
    key: API_KEY,
  });
  const channelId = searchRes.items?.[0]?.snippet?.channelId;
  if (!channelId) throw new Error('Channel not found');

  const chRes = await fetchJson('https://www.googleapis.com/youtube/v3/channels', {
    part: 'contentDetails,snippet',
    id: channelId,
    key: API_KEY,
  });
  const uploadsId = chRes.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
  const title = chRes.items?.[0]?.snippet?.title || 'Veritasium';
  if (!uploadsId) throw new Error('Uploads playlist not found');

  const plRes = await fetchJson('https://www.googleapis.com/youtube/v3/playlistItems', {
    part: 'contentDetails',
    playlistId: uploadsId,
    maxResults: maxVideos,
    key: API_KEY,
  });
  const videoIds = (plRes.items || []).map((i) => i.contentDetails?.videoId).filter(Boolean);

  const vRes = await fetchJson('https://www.googleapis.com/youtube/v3/videos', {
    part: 'snippet,contentDetails,statistics',
    id: videoIds.join(','),
    key: API_KEY,
  });

  const videos = [];
  for (const v of vRes.items || []) {
    const vid = v.id;
    const snip = v.snippet || {};
    const stats = v.statistics || {};
    const content = v.contentDetails || {};
    console.log(`Fetching transcript for ${vid}...`);
    const transcript = await getTranscriptWithFallback(vid);
    videos.push({
      video_id: vid,
      title: snip.title || '',
      description: snip.description || '',
      transcript: transcript || null,
      duration: content.duration || null,
      release_date: snip.publishedAt || null,
      view_count: parseInt(stats.viewCount, 10) || 0,
      like_count: parseInt(stats.likeCount, 10) || 0,
      comment_count: parseInt(stats.commentCount, 10) || 0,
      video_url: `https://www.youtube.com/watch?v=${vid}`,
      thumbnail_url: snip.thumbnails?.high?.url || snip.thumbnails?.medium?.url || null,
    });
  }

  const result = { channel_id: channelId, channel_title: title, videos };
  const outPath = path.join(__dirname, '..', 'public', 'veritasium-channel-data.json');
  fs.writeFileSync(outPath, JSON.stringify(result, null, 2), 'utf8');
  console.log(`Saved ${videos.length} videos to ${outPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
