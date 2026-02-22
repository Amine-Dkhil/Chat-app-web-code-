/**
 * Transcript via YouTube captions only (youtube-transcript-plus).
 * No Whisper, no Gemini, no OPENAI_API_KEY needed.
 * Transcripts are stored in the channel JSON during download.
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

function toText(list) {
  if (!list || !Array.isArray(list)) return null;
  return list.map((t) => (typeof t === 'string' ? t : t.text || '')).join(' ').trim() || null;
}

async function getTranscriptWithFallback(videoId) {
  const vid = (videoId || '').replace(/^.*(?:v=|\/)([a-zA-Z0-9_-]{11}).*$/, '$1');
  if (!vid || vid.length !== 11) return 'Transcript unavailable.';
  try {
    const { fetchTranscript } = await import('youtube-transcript-plus');
    // Prefer English first so English videos don't return auto-generated Arabic etc.
    const langs = ['en', 'en-US', 'en-GB', 'a.en', undefined];
    for (const lang of langs) {
      try {
        const list = lang != null ? await fetchTranscript(vid, { lang }) : await fetchTranscript(vid);
        const text = toText(list);
        if (text) return text;
      } catch (_) {}
    }
  } catch (e) {
    if (process.env.DEBUG_TRANSCRIPT) console.error('[transcript]', e.message);
  }
  return 'Transcript unavailable.';
}

module.exports = { getTranscriptWithFallback };
