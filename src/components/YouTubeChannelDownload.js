import { useState } from 'react';
import './YouTubeChannelDownload.css';

const API = process.env.REACT_APP_API_URL || '';

export default function YouTubeChannelDownload() {
  const [channelUrl, setChannelUrl] = useState('https://www.youtube.com/@veritasium');
  const [maxVideos, setMaxVideos] = useState(10);
  const [progress, setProgress] = useState(0);
  const [progressTotal, setProgressTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);

  const handleDownload = async () => {
    setLoading(true);
    setError('');
    setResult(null);
    setProgress(0);
    setProgressTotal(maxVideos);

    try {
      const res = await fetch(`${API}/api/youtube/channel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channelUrl, maxVideos }),
      });
      if (!res.ok) throw new Error(res.statusText);
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let finalData = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const obj = JSON.parse(line);
            if (obj.type === 'progress') {
              setProgress(obj.current);
              setProgressTotal(obj.total);
            } else if (obj.type === 'complete') {
              finalData = obj.data;
            } else if (obj.type === 'error') {
              throw new Error(obj.error);
            }
          } catch (e) {
            if (e instanceof SyntaxError) continue;
            throw e;
          }
        }
      }

      if (finalData) {
        setResult(finalData);
      } else {
        throw new Error('No data received');
      }
    } catch (err) {
      setError(err.message || 'Download failed');
    } finally {
      setLoading(false);
      setProgress(0);
      setProgressTotal(0);
    }
  };

  const handleDownloadJson = () => {
    if (!result) return;
    const blob = new Blob([JSON.stringify(result, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `youtube-channel-${result.channel_title?.replace(/\W+/g, '-') || 'data'}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="yt-download">
      <div className="yt-download-card">
        <h2 className="yt-download-title">YouTube Channel Download</h2>
        <p className="yt-download-desc">Enter a YouTube channel URL to download metadata for its videos.</p>

        <div className="yt-input-group">
          <label>Channel URL</label>
          <input
            type="url"
            placeholder="https://www.youtube.com/@veritasium"
            value={channelUrl}
            onChange={(e) => setChannelUrl(e.target.value)}
            disabled={loading}
          />
        </div>

        <div className="yt-input-group">
          <label>Max videos (1–100)</label>
          <input
            type="number"
            min={1}
            max={100}
            value={maxVideos}
            onChange={(e) => setMaxVideos(Math.min(100, Math.max(1, parseInt(e.target.value, 10) || 10)))}
            disabled={loading}
          />
        </div>

        {error && <div className="yt-error">{error}</div>}

        <button className="yt-download-btn" onClick={handleDownload} disabled={loading}>
          {loading ? 'Downloading...' : 'Download Channel Data'}
        </button>

        {loading && (
          <div className="yt-progress-wrap">
            <div className="yt-progress-bar">
              <div
                className="yt-progress-fill"
                style={{ width: progressTotal ? `${(progress / progressTotal) * 100}%` : '0%' }}
              />
            </div>
            <span className="yt-progress-text">
              {progress} / {progressTotal} videos
            </span>
          </div>
        )}

        {result && !loading && (
          <div className="yt-result">
            <p className="yt-result-summary">
              Downloaded {result.videos?.length || 0} videos from {result.channel_title || 'channel'}.
            </p>
            <button className="yt-download-json-btn" onClick={handleDownloadJson}>
              Download JSON
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
