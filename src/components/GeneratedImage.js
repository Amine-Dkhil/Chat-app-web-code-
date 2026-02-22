import { useState } from 'react';

export default function GeneratedImage({ imageBase64, mimeType = 'image/png' }) {
  const [enlarged, setEnlarged] = useState(false);

  if (!imageBase64 || typeof imageBase64 !== 'string') {
    return (
      <div className="generated-image-unavailable">
        Image unavailable (generation may have failed due to quota or API error).
      </div>
    );
  }

  const src = `data:${mimeType};base64,${imageBase64}`;

  const handleDownload = (e) => {
    e.stopPropagation();
    try {
      const binary = atob(imageBase64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      const blob = new Blob([bytes], { type: mimeType || 'image/png' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `generated-image-${Date.now()}.png`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      const a = document.createElement('a');
      a.href = src;
      a.download = `generated-image-${Date.now()}.png`;
      a.click();
    }
  };

  return (
    <>
      <div className="generated-image-container">
        <div className="generated-image-wrap" onClick={() => setEnlarged(true)}>
          <img src={src} alt="Generated" className="generated-image-img" />
        </div>
        <button type="button" className="generated-image-download-btn" onClick={handleDownload}>
          Download
        </button>
      </div>
      {enlarged && (
        <div className="generated-image-lightbox" onClick={() => setEnlarged(false)}>
          <div className="generated-image-lightbox-inner" onClick={(e) => e.stopPropagation()}>
            <img src={src} alt="Generated" />
            <div className="generated-image-actions">
              <button type="button" onClick={handleDownload}>Download</button>
              <button type="button" onClick={() => setEnlarged(false)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
