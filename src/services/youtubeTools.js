// ── YouTube Channel JSON tool declarations (exact names for grading) ───────────

const FIELD_NOTE =
  'Use the exact field name from the channel JSON. Common fields: view_count, like_count, comment_count, duration (ISO 8601), release_date. For duration you may need to parse to seconds.';

export const YOUTUBE_TOOL_DECLARATIONS = [
  {
    name: 'generateImage',
    description:
      'Generate an image from a text prompt. Optionally, the user can attach an anchor/reference image (drag into chat or use the paperclip) to modify or use as inspiration. Use when they ask to generate, create, or make an image.',
    parameters: {
      type: 'OBJECT',
      properties: {
        prompt: {
          type: 'STRING',
          description: 'Detailed text prompt describing the image to generate.',
        },
      },
      required: ['prompt'],
    },
  },
  {
    name: 'plot_metric_vs_time',
    description:
      'Plot any numeric field (view_count, like_count, comment_count, etc.) vs time (release_date) for YouTube channel videos. Use when the user asks to plot, graph, or visualize a metric over time.',
    parameters: {
      type: 'OBJECT',
      properties: {
        metric: {
          type: 'STRING',
          description:
            'Numeric field to plot on y-axis. Common: view_count, like_count, comment_count. ' +
            FIELD_NOTE,
        },
      },
      required: ['metric'],
    },
  },
  {
    name: 'play_video',
    description:
      'Open/play a YouTube video from the loaded channel data. The user can specify by: title (e.g. "play the asbestos video"), ordinal (e.g. "play the first video", "play video 3"), or "most viewed" for the highest view_count video. Display a clickable card with title and thumbnail; clicking opens the video on YouTube in a new tab.',
    parameters: {
      type: 'OBJECT',
      properties: {
        selector: {
          type: 'STRING',
          description:
            'How to pick the video: "first", "second", "third", "1", "2", etc. for ordinal; "most viewed" for highest views; or a partial title match (e.g. "asbestos").',
        },
      },
      required: ['selector'],
    },
  },
  {
    name: 'get_transcript',
    description:
      'Get the transcript/captions of a video from the loaded channel data. The user can specify by ordinal (e.g. "first", "second", "3") or "most viewed". Use when they ask for transcript, captions, or what was said in a video.',
    parameters: {
      type: 'OBJECT',
      properties: {
        selector: {
          type: 'STRING',
          description: 'How to pick the video: "first", "second", "third", "1", "2", etc., or "most viewed".',
        },
      },
      required: ['selector'],
    },
  },
  {
    name: 'compute_stats_json',
    description:
      'Compute mean, median, std, min, max for any numeric field in the channel JSON. Use when the user asks for statistics, average, distribution, or summary of a numeric column (e.g. view_count, like_count, comment_count).',
    parameters: {
      type: 'OBJECT',
      properties: {
        field: {
          type: 'STRING',
          description: 'Exact field name from channel JSON. ' + FIELD_NOTE,
        },
      },
      required: ['field'],
    },
  },
];

// ── Parse ISO 8601 duration (e.g. PT15M33S) to seconds ────────────────────────

function parseDuration(dur) {
  if (typeof dur !== 'string' || !dur.startsWith('PT')) return null;
  let seconds = 0;
  const hours = dur.match(/(\d+)H/);
  const mins = dur.match(/(\d+)M/);
  const secs = dur.match(/(\d+)S/);
  if (hours) seconds += parseInt(hours[1], 10) * 3600;
  if (mins) seconds += parseInt(mins[1], 10) * 60;
  if (secs) seconds += parseInt(secs[1], 10);
  return seconds;
}

const METRIC_ALIASES = {
  likecount: 'like_count', likes: 'like_count', likecounts: 'like_count',
  viewcount: 'view_count', views: 'view_count', viewcounts: 'view_count',
  commentcount: 'comment_count', comments: 'comment_count', commentcounts: 'comment_count',
};

const SNAKE_TO_CAMEL = {
  like_count: 'likeCount', view_count: 'viewCount', comment_count: 'commentCount',
  release_date: 'releaseDate',
};

function resolveField(videos, name) {
  if (!name || typeof name !== 'string') return name;
  const first = videos?.[0];
  const keys = first ? Object.keys(first) : [];
  if (keys.includes(name)) return name;
  const norm = (s) => String(s).toLowerCase().replace(/[\s_-]+/g, '');
  const target = norm(name);
  const aliased = METRIC_ALIASES[target];
  if (aliased && keys.includes(aliased)) return aliased;
  const found = keys.find((k) => norm(k) === target);
  if (found) return found;
  if (aliased) return aliased;
  return name;
}

function getDateMs(v) {
  const t = v.release_date || v.releaseDate || v.publishedAt || v.published_at;
  if (!t) return null;
  const ms = new Date(t).getTime();
  return Number.isFinite(ms) ? ms : null;
}

function getMetricValue(v, metric) {
  let val = v[metric];
  if (val !== undefined && val !== null) return val;
  const camel = SNAKE_TO_CAMEL[metric];
  if (camel && v[camel] !== undefined && v[camel] !== null) return v[camel];
  const snake = Object.keys(SNAKE_TO_CAMEL).find((k) => SNAKE_TO_CAMEL[k] === metric);
  if (snake && v[snake] !== undefined && v[snake] !== null) return v[snake];
  return undefined;
}

function numericValues(videos, field) {
  return videos
    .map((v) => {
      const val = v[field];
      if (typeof val === 'number' && !isNaN(val)) return val;
      if (field === 'duration') return parseDuration(val);
      if (field === 'release_date' && val) return new Date(val).getTime();
      const n = parseFloat(val);
      return isNaN(n) ? null : n;
    })
    .filter((v) => v != null);
}

const median = (sorted) =>
  sorted.length % 2 === 0
    ? (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
    : sorted[Math.floor(sorted.length / 2)];

const fmt = (n) => +Number(n).toFixed(4);

// ── Synchronous tool executor (generateImage is handled async in Chat) ─────────

export function executeYouTubeTool(toolName, args, videos) {
  const list = videos?.videos || videos || [];
  const arr = Array.isArray(list) ? list : (list.videos || []);

  switch (toolName) {
    case 'compute_stats_json': {
      const field = resolveField(arr, args.field);
      const vals = numericValues(arr, field);
      if (!vals.length)
        return {
          error: `No numeric values for field "${field}". Available: ${Object.keys(arr[0] || {}).join(', ')}`,
        };
      const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
      const sorted = [...vals].sort((a, b) => a - b);
      const variance = vals.reduce((a, b) => a + (b - mean) ** 2, 0) / vals.length;
      return {
        field,
        count: vals.length,
        mean: fmt(mean),
        median: fmt(median(sorted)),
        std: fmt(Math.sqrt(variance)),
        min: Math.min(...vals),
        max: Math.max(...vals),
      };
    }

    case 'plot_metric_vs_time': {
      const metric = resolveField(arr, args.metric);
      const points = arr
        .map((v) => {
          const x = getDateMs(v);
          let y = getMetricValue(v, metric);
          if (y === undefined || y === null) y = v[metric];
          if (metric === 'duration') y = parseDuration(y);
          else if (typeof y === 'string') y = parseFloat(y);
          if (x == null || (y !== 0 && !y)) return null;
          const numY = typeof y === 'number' ? y : parseFloat(y);
          if (numY !== 0 && !Number.isFinite(numY)) return null;
          return { x, y: numY };
        })
        .filter(Boolean)
        .sort((a, b) => a.x - b.x);
      if (!points.length)
        return {
          error: `No valid data for metric "${metric}" vs time. Check field name.`,
        };
      return {
        _chartType: 'metric_vs_time',
        metric,
        data: points.map((p) => ({
          date: new Date(p.x).toISOString().slice(0, 10),
          value: p.y,
        })),
      };
    }

    case 'get_transcript': {
      const sel = String(args.selector || '').toLowerCase().trim();
      let vid = null;
      if (/^most\s*viewed$/i.test(sel)) {
        const sorted = [...arr].sort((a, b) => (b.view_count || 0) - (a.view_count || 0));
        vid = sorted[0];
      } else {
        let idx = -1;
        if (/^first|1(st)?$/i.test(sel)) idx = 0;
        else if (/^second|2(nd)?$/i.test(sel)) idx = 1;
        else if (/^third|3(rd)?$/i.test(sel)) idx = 2;
        else {
          const num = parseInt(sel, 10);
          if (!isNaN(num) && num >= 1) idx = num - 1;
          else vid = arr.find((v) => (v.title || '').toLowerCase().includes(sel));
        }
        if (idx >= 0) vid = arr[idx];
      }
      if (vid) {
        const transcript = vid.transcript;
        if (!transcript || (Array.isArray(transcript) && !transcript.length)) {
          return {
            video_id: vid.video_id,
            title: vid.title,
            transcript: null,
            error: 'No transcript available for this video.',
          };
        }
        const text = Array.isArray(transcript)
          ? transcript.map((t) => (typeof t === 'string' ? t : t.text || '')).join(' ')
          : String(transcript);
        return {
          video_id: vid.video_id,
          title: vid.title,
          transcript: text,
        };
      }
      return { error: `Could not find video for selector "${args.selector}"` };
    }

    case 'play_video': {
      const sel = String(args.selector || '').toLowerCase().trim();
      let idx = -1;
      if (/^most\s*viewed$/i.test(sel)) {
        const sorted = [...arr].sort((a, b) => (b.view_count || 0) - (a.view_count || 0));
        const v = sorted[0];
        if (v)
          return {
            _playVideo: true,
            video_id: v.video_id,
            title: v.title,
            thumbnail_url: v.thumbnail_url,
            video_url: v.video_url,
          };
      }
      if (/^first|1(st)?$/i.test(sel)) idx = 0;
      else if (/^second|2(nd)?$/i.test(sel)) idx = 1;
      else if (/^third|3(rd)?$/i.test(sel)) idx = 2;
      else {
        const num = parseInt(sel, 10);
        if (!isNaN(num) && num >= 1) idx = num - 1;
        else {
          const match = arr.find((v) =>
            (v.title || '').toLowerCase().includes(sel)
          );
          if (match)
            return {
              _playVideo: true,
              video_id: match.video_id,
              title: match.title,
              thumbnail_url: match.thumbnail_url,
              video_url: match.video_url,
            };
        }
      }
      if (idx >= 0 && arr[idx]) {
        const v = arr[idx];
        return {
          _playVideo: true,
          video_id: v.video_id,
          title: v.title,
          thumbnail_url: v.thumbnail_url,
          video_url: v.video_url,
        };
      }
      return { error: `Could not find video for selector "${args.selector}"` };
    }

    default:
      return { error: `Unknown tool: ${toolName}` };
  }
}
