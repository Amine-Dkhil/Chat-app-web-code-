require('dotenv').config();
const express = require('express');
const { MongoClient, ObjectId } = require('mongodb');
const bcrypt = require('bcryptjs');
const cors = require('cors');
const { getTranscriptWithFallback } = require('./transcript');

// Expose for /api/transcript route

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

const URI = process.env.REACT_APP_MONGODB_URI || process.env.MONGODB_URI || process.env.REACT_APP_MONGO_URI;
const DB = 'chatapp';

let db;

async function connect() {
  const client = await MongoClient.connect(URI);
  db = client.db(DB);
  console.log('MongoDB connected');
}

app.get('/', (req, res) => {
  res.send(`
    <html>
      <body style="font-family:sans-serif;padding:2rem;background:#00356b;color:white;min-height:100vh;display:flex;align-items:center;justify-content:center;margin:0">
        <div style="text-align:center">
          <h1>Chat API Server</h1>
          <p>Backend is running. Use the React app at <a href="http://localhost:3000" style="color:#ffd700">localhost:3000</a></p>
          <p><a href="/api/status" style="color:#ffd700">Check DB status</a></p>
        </div>
      </body>
    </html>
  `);
});

app.get('/api/status', async (req, res) => {
  try {
    const usersCount = await db.collection('users').countDocuments();
    const sessionsCount = await db.collection('sessions').countDocuments();
    res.json({ usersCount, sessionsCount });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Users ────────────────────────────────────────────────────────────────────

app.post('/api/users', async (req, res) => {
  try {
    const { username, password, email, firstName, lastName } = req.body;
    if (!username || !password)
      return res.status(400).json({ error: 'Username and password required' });
    const name = String(username).trim().toLowerCase();
    const existing = await db.collection('users').findOne({ username: name });
    if (existing) return res.status(400).json({ error: 'Username already exists' });
    const hashed = await bcrypt.hash(password, 10);
    await db.collection('users').insertOne({
      username: name,
      password: hashed,
      email: email ? String(email).trim().toLowerCase() : null,
      firstName: firstName ? String(firstName).trim() : null,
      lastName: lastName ? String(lastName).trim() : null,
      createdAt: new Date().toISOString(),
    });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/users/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password)
      return res.status(400).json({ error: 'Username and password required' });
    const name = username.trim().toLowerCase();
    const user = await db.collection('users').findOne({ username: name });
    if (!user) return res.status(401).json({ error: 'User not found' });
    const ok = await bcrypt.compare(password, user.password);
    if (!ok) return res.status(401).json({ error: 'Invalid password' });
    res.json({
      ok: true,
      username: name,
      firstName: user.firstName || null,
      lastName: user.lastName || null,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Sessions ─────────────────────────────────────────────────────────────────

app.get('/api/sessions', async (req, res) => {
  try {
    const { username } = req.query;
    if (!username) return res.status(400).json({ error: 'username required' });
    const sessions = await db
      .collection('sessions')
      .find({ username })
      .sort({ createdAt: -1 })
      .toArray();
    res.json(
      sessions.map((s) => ({
        id: s._id.toString(),
        agent: s.agent || null,
        title: s.title || null,
        createdAt: s.createdAt,
        messageCount: (s.messages || []).length,
      }))
    );
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/sessions', async (req, res) => {
  try {
    const { username, agent } = req.body;
    if (!username) return res.status(400).json({ error: 'username required' });
    const { title } = req.body;
    const result = await db.collection('sessions').insertOne({
      username,
      agent: agent || null,
      title: title || null,
      createdAt: new Date().toISOString(),
      messages: [],
    });
    res.json({ id: result.insertedId.toString() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/sessions/:id', async (req, res) => {
  try {
    await db.collection('sessions').deleteOne({ _id: new ObjectId(req.params.id) });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.patch('/api/sessions/:id/title', async (req, res) => {
  try {
    const { title } = req.body;
    await db.collection('sessions').updateOne(
      { _id: new ObjectId(req.params.id) },
      { $set: { title } }
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── YouTube Channel Data ─────────────────────────────────────────────────────

const YOUTUBE_API_KEY = process.env.REACT_APP_YOUTUBE_API_KEY || process.env.YOUTUBE_API_KEY;

async function fetchYouTubeJson(url, params = {}) {
  const u = new URL(url);
  Object.entries(params).forEach(([k, v]) => u.searchParams.set(k, v));
  const res = await fetch(u.toString());
  if (!res.ok) throw new Error(`YouTube API: ${res.status} ${await res.text()}`);
  return res.json();
}

const RESERVED_PATHS = /^(watch|playlist|results|channel|user|feed|shorts|live|embed|v|@)/i;

function parseChannelIdentifier(channelUrl) {
  const url = channelUrl.trim();
  const channelIdMatch = url.match(/youtube\.com\/channel\/([a-zA-Z0-9_-]+)/);
  if (channelIdMatch) return { type: 'id', value: channelIdMatch[1] };
  const handleMatch = url.match(/youtube\.com\/@([a-zA-Z0-9_.-]+)/);
  if (handleMatch) return { type: 'handle', value: handleMatch[1] };
  const userMatch = url.match(/youtube\.com\/user\/([a-zA-Z0-9_-]+)/);
  if (userMatch) return { type: 'username', value: userMatch[1] };
  const customMatch = url.match(/youtube\.com\/c\/([a-zA-Z0-9_-]+)/);
  if (customMatch) return { type: 'custom', value: customMatch[1] };
  const pathMatch = url.match(/youtube\.com\/([a-zA-Z0-9_-]+)(?:\/|$|\?)/);
  if (pathMatch && !RESERVED_PATHS.test(pathMatch[1])) return { type: 'custom', value: pathMatch[1] };
  throw new Error('Invalid YouTube channel URL. Use format: https://www.youtube.com/@channelname, https://www.youtube.com/channel/CHANNEL_ID, or https://www.youtube.com/PewDiePie');
}

async function getChannelIdAndUploadsPlaylist(identifier, apiKey) {
  if (identifier.type === 'id') {
    const data = await fetchYouTubeJson('https://www.googleapis.com/youtube/v3/channels', {
      part: 'contentDetails,snippet',
      id: identifier.value,
      key: apiKey,
    });
    const ch = data.items?.[0];
    if (!ch) throw new Error('Channel not found');
    return { channelId: ch.id, uploadsPlaylistId: ch.contentDetails.relatedPlaylists.uploads, title: ch.snippet?.title || '' };
  }
  if (identifier.type === 'handle' || identifier.type === 'username' || identifier.type === 'custom') {
    const q = identifier.type === 'handle' ? `@${identifier.value}` : identifier.value;
    const data = await fetchYouTubeJson('https://www.googleapis.com/youtube/v3/search', {
      part: 'snippet',
      type: 'channel',
      q,
      key: apiKey,
    });
    const ch = data.items?.[0];
    if (!ch) throw new Error('Channel not found');
    const channelId = ch.snippet?.channelId;
    const chData = await fetchYouTubeJson('https://www.googleapis.com/youtube/v3/channels', {
      part: 'contentDetails,snippet',
      id: channelId,
      key: apiKey,
    });
    const channel = chData.items?.[0];
    if (!channel) throw new Error('Channel not found');
    return { channelId: channel.id, uploadsPlaylistId: channel.contentDetails.relatedPlaylists.uploads, title: channel.snippet?.title || '' };
  }
  throw new Error('Invalid identifier');
}

// ── Transcript (tiered fallback in server/transcript.js) ─────────────────────

const GEMINI_KEY = process.env.REACT_APP_GEMINI_API_KEY || process.env.GEMINI_API_KEY;

async function getTranscript(videoId) {
  return getTranscriptWithFallback(videoId);
}

function sendProgress(res, obj) {
  res.write(JSON.stringify(obj) + '\n');
}

app.post('/api/youtube/channel', async (req, res) => {
  res.setHeader('Content-Type', 'application/x-ndjson');
  res.setHeader('Transfer-Encoding', 'chunked');
  try {
    if (!YOUTUBE_API_KEY) {
      sendProgress(res, { type: 'error', error: 'YouTube API key not configured' });
      res.end();
      return;
    }
    const { channelUrl, maxVideos } = req.body;
    const max = Math.min(Math.max(1, parseInt(maxVideos, 10) || 10), 100);
    const identifier = parseChannelIdentifier(channelUrl || '');

    sendProgress(res, { type: 'progress', step: 'channel', current: 0, total: max });
    const { uploadsPlaylistId, channelId, title } = await getChannelIdAndUploadsPlaylist(identifier, YOUTUBE_API_KEY);

    const videoIds = [];
    let pageToken = '';
    while (videoIds.length < max) {
      const data = await fetchYouTubeJson('https://www.googleapis.com/youtube/v3/playlistItems', {
        part: 'contentDetails',
        playlistId: uploadsPlaylistId,
        maxResults: Math.min(50, max - videoIds.length),
        pageToken,
        key: YOUTUBE_API_KEY,
      });
      const items = data.items || [];
      items.forEach((i) => {
        if (i.contentDetails?.videoId) videoIds.push(i.contentDetails.videoId);
      });
      pageToken = data.nextPageToken || '';
      if (!pageToken || items.length === 0) break;
    }

    const videos = [];
    for (let i = 0; i < videoIds.length; i++) {
      sendProgress(res, { type: 'progress', step: 'videos', current: videos.length, total: videoIds.length });
      const ids = videoIds.slice(i, Math.min(i + 50, videoIds.length));
      const vdata = await fetchYouTubeJson('https://www.googleapis.com/youtube/v3/videos', {
        part: 'snippet,contentDetails,statistics',
        id: ids.join(','),
        key: YOUTUBE_API_KEY,
      });
      const items = vdata.items || [];
      for (const v of items) {
        const vid = v.id;
        const snip = v.snippet || {};
        const stats = v.statistics || {};
        const content = v.contentDetails || {};
        sendProgress(res, { type: 'progress', step: 'transcript', current: videos.length + 1, total: videoIds.length });
        const transcript = await getTranscript(vid);
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
          thumbnail_url: snip.thumbnails?.high?.url || snip.thumbnails?.medium?.url || snip.thumbnails?.default?.url || null,
        });
      }
      i += ids.length - 1;
    }

    const result = { channel_id: channelId, channel_title: title, videos };
    sendProgress(res, { type: 'complete', data: result });
    res.end();
  } catch (err) {
    console.error('[YouTube]', err);
    sendProgress(res, { type: 'error', error: err.message || 'Failed to fetch channel data' });
    res.end();
  }
});

// ── On-demand transcript fetch (when JSON has none) ───────────────────────────

app.get('/api/transcript', async (req, res) => {
  try {
    const videoId = req.query.video_id;
    if (!videoId) return res.status(400).json({ error: 'video_id required' });
    const transcript = await getTranscriptWithFallback(videoId);
    res.json({ transcript });
  } catch (err) {
    console.error('[transcript]', err);
    res.status(500).json({ error: err.message || 'Transcript fetch failed' });
  }
});

// ── Image generation (Gemini Imagen, Replicate fallback) ──────────────────────

const REPLICATE_TOKEN = process.env.REPLICATE_API_TOKEN;

async function generateImageViaReplicate(prompt, anchorImage) {
  if (!REPLICATE_TOKEN) return null;
  try {
    const Replicate = (await import('replicate')).default;
    const replicate = new Replicate({ auth: REPLICATE_TOKEN });
    const fullPrompt = anchorImage?.data
      ? `${prompt} (based on the provided reference image)`
      : prompt;
    const output = await replicate.run('black-forest-labs/flux-schnell', {
      input: { prompt: fullPrompt },
    });
    const first = Array.isArray(output) ? output[0] : output;
    if (!first) return null;
    let base64, mimeType = 'image/webp';
    if (Buffer.isBuffer(first)) {
      base64 = first.toString('base64');
    } else if (typeof first === 'string' && first.startsWith('http')) {
      const imgResp = await fetch(first);
      const buf = Buffer.from(await imgResp.arrayBuffer());
      base64 = buf.toString('base64');
    } else if (first?.url?.()) {
      const imgResp = await fetch(first.url());
      const buf = Buffer.from(await imgResp.arrayBuffer());
      base64 = buf.toString('base64');
    } else return null;
    return { imageBase64: base64, mimeType };
  } catch (e) {
    console.error('[generate-image] Replicate fallback:', e.message);
    return null;
  }
}

// Guide: when anchor present, put image FIRST in parts, then text.
function buildImageParts(prompt, anchorImage) {
  const textPart = { text: prompt && prompt.trim() ? `Generate an image: ${prompt}` : 'Generate an image based on this reference.' };
  if (anchorImage?.data) {
    return [
      {
        inline_data: {
          mime_type: anchorImage.mimeType || 'image/png',
          data: anchorImage.data,
        },
      },
      textPart,
    ];
  }
  return [textPart];
}

app.post('/api/generate-image', async (req, res) => {
  try {
    const { prompt, anchorImage, anchorImageBase64, mimeType } = req.body;
    if (!prompt && !anchorImageBase64) return res.status(400).json({ error: 'prompt or anchorImageBase64 required' });
    if (!GEMINI_KEY && !REPLICATE_TOKEN) {
      return res.status(500).json({ error: 'Add REPLICATE_API_TOKEN or REACT_APP_GEMINI_API_KEY to .env' });
    }
    const anchorImageNormalized = anchorImage?.data
      ? anchorImage
      : anchorImageBase64
        ? { data: anchorImageBase64, mimeType: mimeType || 'image/png' }
        : null;

    let result = null;

    if (GEMINI_KEY) {
      const imageModels = [
        'gemini-2.5-flash-image',
        'gemini-2.0-flash-exp-image-generation',
        'gemini-2.0-flash-preview-image-generation',
        'gemini-2.5-flash-preview-05-20',
      ];
      let parts = buildImageParts(prompt || '', anchorImageNormalized);
      for (const model of imageModels) {
        try {
          const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_KEY}`;
          const body = {
            contents: [{ role: 'user', parts }],
            generationConfig: { responseModalities: ['TEXT', 'IMAGE'] },
          };
          const resp = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          });
          const text = await resp.text();
          if (!resp.ok) {
            if (process.env.DEBUG_IMAGE) console.error(`[generate-image] ${model}:`, text.slice(0, 300));
            continue;
          }
          const data = JSON.parse(text);
          const blockReason = data.candidates?.[0]?.finishReason || data.promptFeedback?.blockReason;
          if (blockReason && blockReason !== 'STOP' && blockReason !== 'END_TURN') {
            if (process.env.DEBUG_IMAGE) console.error(`[generate-image] ${model} blocked:`, blockReason);
            continue;
          }
          const content = data.candidates?.[0]?.content;
          const partsArr = content?.parts || [];
          const imagePart = partsArr.find((p) => p.inlineData?.data);
          const textPart = partsArr.find((p) => p.text);
          if (imagePart?.inlineData?.data) {
            result = {
              imageBase64: imagePart.inlineData.data,
              mimeType: imagePart.inlineData.mimeType || 'image/png',
              ...(textPart?.text && { text: textPart.text }),
            };
            break;
          }
        } catch (e) {
          if (process.env.DEBUG_IMAGE) console.error(`[generate-image] ${model}:`, e.message);
        }
      }
      if (!result && anchorImageNormalized?.data) {
        parts = buildImageParts(prompt || '', null);
        for (const model of imageModels) {
          try {
            const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_KEY}`;
            const resp = await fetch(url, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                contents: [{ role: 'user', parts }],
                generationConfig: { responseModalities: ['TEXT', 'IMAGE'] },
              }),
            });
            if (!resp.ok) continue;
            const data = await resp.json();
            const content = data.candidates?.[0]?.content;
            const partsArr = content?.parts || [];
            const imagePart = partsArr.find((p) => p.inlineData?.data);
            const textPart = partsArr.find((p) => p.text);
            if (imagePart?.inlineData?.data) {
              result = {
                imageBase64: imagePart.inlineData.data,
                mimeType: imagePart.inlineData.mimeType || 'image/png',
                ...(textPart?.text && { text: textPart.text }),
              };
              break;
            }
          } catch (_) {}
        }
      }
    }

    if (!result && REPLICATE_TOKEN) {
      result = await generateImageViaReplicate(prompt, anchorImage);
    }

    if (!result) {
      return res.status(500).json({
        error: 'Image generation failed. Ensure REACT_APP_GEMINI_API_KEY is set and the model supports image generation, or add REPLICATE_API_TOKEN for fallback.',
      });
    }
    res.json(result);
  } catch (err) {
    console.error('[generate-image]', err);
    res.status(500).json({ error: err.message || 'Image generation failed' });
  }
});

// ── Messages ─────────────────────────────────────────────────────────────────

app.post('/api/messages', async (req, res) => {
  try {
    const { session_id, role, content, imageData, charts, toolCalls, generatedImages } = req.body;
    if (!session_id || !role || content === undefined)
      return res.status(400).json({ error: 'session_id, role, content required' });
    const msg = {
      role,
      content,
      timestamp: new Date().toISOString(),
      ...(imageData && {
        imageData: Array.isArray(imageData) ? imageData : [imageData],
      }),
      ...(charts?.length && { charts }),
      ...(toolCalls?.length && { toolCalls }),
      ...(generatedImages?.length && { generatedImages }),
    };
    await db.collection('sessions').updateOne(
      { _id: new ObjectId(session_id) },
      { $push: { messages: msg } }
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/messages', async (req, res) => {
  try {
    const { session_id } = req.query;
    if (!session_id) return res.status(400).json({ error: 'session_id required' });
    const doc = await db
      .collection('sessions')
      .findOne({ _id: new ObjectId(session_id) });
    const raw = doc?.messages || [];
    const msgs = raw.map((m, i) => {
      const arr = m.imageData
        ? Array.isArray(m.imageData)
          ? m.imageData
          : [m.imageData]
        : [];
      const genImgs = m.generatedImages?.length
        ? m.generatedImages.map((g) => ({ imageBase64: g.imageBase64 ?? g.data, mimeType: g.mimeType || 'image/png' }))
        : (m.generatedImage && [{ imageBase64: m.generatedImage.data ?? m.generatedImage.imageBase64, mimeType: m.generatedImage.mimeType || 'image/png' }]) || undefined;
      return {
        id: `${doc._id}-${i}`,
        role: m.role,
        content: m.content,
        timestamp: m.timestamp,
        images: arr.length
          ? arr.map((img) => ({ data: img.data, mimeType: img.mimeType }))
          : undefined,
        charts: m.charts?.length ? m.charts : undefined,
        toolCalls: m.toolCalls?.length ? m.toolCalls : undefined,
        generatedImages: genImgs,
      };
    });
    res.json(msgs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────

const PORT = process.env.PORT || 3001;

connect()
  .then(() => {
    app.listen(PORT, () => console.log(`Server on http://localhost:${PORT}`));
  })
  .catch((err) => {
    console.error('MongoDB connection failed:', err.message);
    process.exit(1);
  });
