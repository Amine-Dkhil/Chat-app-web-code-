export default function PlayVideoCard({ video_id, title, thumbnail_url, video_url }) {
  const url = video_url || `https://www.youtube.com/watch?v=${video_id}`;
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="play-video-card"
    >
      <div className="play-video-thumb">
        {thumbnail_url ? (
          <img src={thumbnail_url} alt="" />
        ) : (
          <div className="play-video-placeholder">▶</div>
        )}
      </div>
      <div className="play-video-title">{title || 'Video'}</div>
    </a>
  );
}
