# YouTube AI Chat Assistant - Homework Setup

## 1. Add YouTube API Key

Add your YouTube Data API v3 key to `.env`:

```
REACT_APP_YOUTUBE_API_KEY=your_youtube_api_key
```

Get a key at [Google Cloud Console](https://console.cloud.google.com/apis/credentials) (enable YouTube Data API v3).

## 2. Pre-download Veritasium Channel Data

Run this to download 10 videos from https://www.youtube.com/@veritasium and save to `public/veritasium-channel-data.json`:

```bash
node scripts/download-veritasium.js
```

This file is used to verify the YouTube download works (grading requirement).

## 3. Run the App

```bash
npm install
npm start
```

Then open http://localhost:3000
