# Replicate image generation in your chat app (from reel_maker)

This is **exactly** how this project does image generation (prompt + anchor, no token limit) and thumbnail via chat. Copy and adapt in your app.

---

## 1. Why it works here and not in your app

- **We never send chat history to the image API.** Each image is one direct call: `prompt + optional anchor image(s)` only.
- **We use the image model** with `responseModalities: ['TEXT', 'IMAGE']` and read the image from the response.
- **We pass the returned Blob to the UI** and render it (img + download + lightbox). If you only show “tool called” or text, the image never appears.

---

## 2. Dependencies and env

- Same as here: `@google/genai` (GoogleGenAI).
- `.env`: `REACT_APP_GEMINI_API_KEY=your_key`

---

## 3. Core: one function that generates an image (no history)

This is the **exact pattern** from `src/services/gemini.js`. One request = one prompt + optional anchor(s). No conversation.

```javascript
import { GoogleGenAI } from '@google/genai';

const API_KEY = (process.env.REACT_APP_GEMINI_API_KEY || '').trim();
const ai = API_KEY ? new GoogleGenAI({ apiKey: API_KEY }) : null;

// Use the IMAGE model, not the text chat model.
const IMAGE_MODEL = 'gemini-2.0-flash-exp'; // or 'gemini-2.5-flash-preview-05-20' / whatever supports image out

async function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result.split(',')[1]);
    r.onerror = reject;
    r.readAsDataURL(blob);
  });
}

/**
 * Generate ONE image. Input = only prompt + optional anchor. No chat history.
 * Call this when the user asks for an image (or when the chat tool generateImage is run).
 */
export async function generateImageFromPrompt(textPrompt, anchorImageBlob = null) {
  if (!ai) throw new Error('API key not configured');

  const parts = [];
  const promptText = anchorImageBlob
    ? `Generate an image based on this description. A reference image is provided below; use it as specified in the description.\n\nDescription: ${textPrompt}`
    : textPrompt;
  parts.push({ text: promptText });

  if (anchorImageBlob) {
    const base64 = await blobToBase64(anchorImageBlob);
    const mime = anchorImageBlob.type || 'image/png';
    parts.push({ inlineData: { mimeType: mime, data: base64 } });
  }

  const response = await ai.models.generateContent({
    model: IMAGE_MODEL,
    contents: [{ parts }],
    config: { responseModalities: ['TEXT', 'IMAGE'] },
  });

  const outParts = response?.candidates?.[0]?.content?.parts || [];
  for (const part of outParts) {
    if (part.inlineData?.data) {
      const bytes = Uint8Array.from(atob(part.inlineData.data), (c) => c.charCodeAt(0));
      return new Blob([bytes], { type: part.inlineData.mimeType || 'image/png' });
    }
  }
  throw new Error('No image in response');
}
```

- **textPrompt:** string (e.g. "a tree in a coffee shop" or "make it rain").
- **anchorImageBlob:** one `Blob` (or `File`) from the user’s attachment, or `null`.
- **No other context** is sent → no token limit issue.

---

## 4. Thumbnail: same function, different prompt

We use the **same** API and same “one request = prompt + anchors” pattern. Only the prompt text changes. In your app you can do:

```javascript
export async function generateThumbnailFromPrompt(textPrompt, anchorImageBlob = null) {
  const thumbnailPrompt = `Create a single eye-catching thumbnail image. Bold, high-contrast. Base it on: ${textPrompt}`;
  return generateImageFromPrompt(thumbnailPrompt, anchorImageBlob);
}
```

Or one function with an optional `style: 'thumbnail'` that appends to the prompt. Important: still **one direct call**, no history.

---

## 5. Chat tool handler: call the function and pass the image to the UI

When the **chat model** calls the tool `generateImage`, your backend/frontend must:

1. Read **only** `args.prompt` (or `args.textPrompt`) and the **current** user attachment (the anchor for this turn).
2. Call `generateImageFromPrompt(args.prompt, anchorBlobForThisTurn)` — **do not** pass the full conversation.
3. Get back a **Blob**.
4. **Pass that Blob to the chat UI** so the message can show the image.

Example (pseudo-code where you handle the tool call):

```javascript
if (functionCall.name === 'generateImage') {
  const prompt = functionCall.args?.prompt || functionCall.args?.textPrompt || '';
  const anchorBlob = getAnchorImageFromCurrentUserMessage(); // only THIS turn's attachment
  const imageBlob = await generateImageFromPrompt(prompt, anchorBlob);
  // CRITICAL: add the image to the assistant message so the UI can show it
  addToAssistantMessage({ type: 'image', blob: imageBlob });
  // and optionally text like "Here's your image:"
}
```

If you don’t add the image to the message (e.g. as `{ type: 'image', blob }`), the user will only see text and “tool used” and no image.

---

## 6. UI: show image in the message, download, lightbox

Your chat message component must support messages that **contain an image blob**.

- **Display:**  
  If the message has an image blob, create a URL and show it:
  `const url = URL.createObjectURL(blob);` then `<img src={url} alt="Generated" />`.  
  Revoke when unmounting: `URL.revokeObjectURL(url)`.

- **Download:**  
  Button that does:
  `const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'generated-' + Date.now() + '.png'; a.click(); URL.revokeObjectURL(a.href);`

- **Lightbox:**  
  When the user clicks the image, set state (e.g. `enlargedBlob = blob`), render a full-screen overlay with `<img src={URL.createObjectURL(enlargedBlob)} />` and a close button. Clear state on close.

If the message only stores “tool used” and the prompt text but not the **blob**, the image will never appear. So the tool handler **must** attach the blob to the message and the UI **must** render it.

---

## 7. Tool definition for the chat model

So the model knows when to call the tool and with what:

```javascript
{
  name: 'generateImage',
  description: 'Generate an image from a text prompt and an optional reference (anchor) image. Call when the user asks to generate or modify an image. The image will be shown in the chat.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      prompt: { type: Type.STRING, description: 'The image description or modification request (e.g. "a tree in a coffee shop", "make it rain")' },
    },
    required: ['prompt'],
  },
}
```

The anchor image is **not** in the tool args; it comes from the **current user message** (the attachment the user sent in the same turn). So when you handle the tool, you take the prompt from `args.prompt` and the image from the last user attachment for that request.

---

## 8. prompt_chat.txt (or your system prompt)

Add something like:

```
Tool: generateImage
Purpose: Generate an image from a text prompt. If the user attached an image, use it as a reference (anchor). Call this when the user asks for an image or to modify an image. The generated image is displayed in the chat and can be downloaded or enlarged.
Parameters: prompt (required) – the description or request (e.g. "a tree in a coffee shop", "make it rain").
```

For thumbnail:

```
Tool: generateThumbnail (optional)
Purpose: Generate a thumbnail image from a text description. Same as generateImage but optimized for a thumbnail style. Use when the user asks for a thumbnail.
Parameters: prompt (required).
```

---

## 9. Checklist

- [ ] One function `generateImageFromPrompt(prompt, anchorBlob)` that calls **only** the image model with **only** prompt + optional anchor (no history).
- [ ] Image model with `responseModalities: ['TEXT', 'IMAGE']` and response parsed to a Blob (base64 → Uint8Array → Blob).
- [ ] When the chat invokes `generateImage`, handler calls that function and **attaches the returned Blob to the assistant message**.
- [ ] Chat UI renders messages that contain an image blob: `<img src={createObjectURL(blob)} />`, plus Download and click-to-enlarge (lightbox).
- [ ] Anchor image taken only from the **current** user message (no resending of old images).
- [ ] Thumbnail: same pattern, different prompt; no extra context.
- [ ] Tool and behavior described in prompt_chat.txt.

---

## 10. Why “I don’t see it” happens

- The tool runs and the API returns an image, but the **message** only stores text like “I generated the image” and the tool call JSON. The **Blob is never stored or passed to the message**.
- So the fix is: **where you handle the tool result, add the image Blob to the message object**, and in the message component **render an `<img>` when the message has an image blob**. After that, add download and lightbox as above.
