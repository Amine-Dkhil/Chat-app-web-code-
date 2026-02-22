/**
 * Image generation using @google/genai (same as reel_maker / other project).
 * One direct call = prompt + optional anchor. No chat history → no token limit.
 */
import { GoogleGenAI, Modality } from '@google/genai';

const API_KEY = (process.env.REACT_APP_GEMINI_API_KEY || '').trim();
const ai = API_KEY ? new GoogleGenAI({ apiKey: API_KEY }) : null;

const IMAGE_MODELS = [
  'gemini-2.5-flash-image',
  'gemini-3-pro-image-preview',
];

async function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result.split(',')[1]);
    r.onerror = reject;
    r.readAsDataURL(blob);
  });
}

/**
 * Generate an image from a description using Gemini image model.
 * @param {string} description - Image description
 * @param {Blob[]} anchorImages - Optional reference images (we use at most one from chat)
 * @param {string} modelId - Model id, default gemini-2.5-flash-image
 * @returns {Promise<Blob>} Generated image blob
 */
export async function generateImage(description, anchorImages = [], modelId = 'gemini-2.5-flash-image') {
  if (!ai) throw new Error('REACT_APP_GEMINI_API_KEY not configured');

  const parts = [];
  const promptPrefix = anchorImages.length > 0
    ? 'Generate an image based on this description. A reference image is provided below; use it as specified in the description.\n\nDescription: '
    : '';
  parts.push({ text: promptPrefix + (description || '') });

  for (const blob of anchorImages) {
    if (!blob) continue;
    const base64 = await blobToBase64(blob);
    const mime = blob.type || 'image/png';
    parts.push({ inlineData: { mimeType: mime, data: base64 } });
  }

  let lastError = null;
  const modelsToTry = modelId ? [modelId] : IMAGE_MODELS;
  for (const model of modelsToTry) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents: [{ parts }],
        config: { responseModalities: [Modality.TEXT, Modality.IMAGE] },
      });
      const outParts = response?.candidates?.[0]?.content?.parts || [];
      for (const part of outParts) {
        if (part.inlineData?.data) {
          const bytes = Uint8Array.from(atob(part.inlineData.data), (c) => c.charCodeAt(0));
          return new Blob([bytes], { type: part.inlineData.mimeType || 'image/png' });
        }
      }
    } catch (e) {
      lastError = e?.message || String(e);
    }
  }
  throw new Error(lastError || 'No image in response');
}

/**
 * Single prompt + optional single anchor (for chat tool). No history.
 * Tries gemini-2.5-flash-image then gemini-3-pro-image-preview.
 */
export async function generateImageFromPrompt(textPrompt, anchorImageBlob = null) {
  const anchorImages = anchorImageBlob ? [anchorImageBlob] : [];
  let lastErr;
  for (const modelId of IMAGE_MODELS) {
    try {
      return await generateImage(textPrompt, anchorImages, modelId);
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error('No image in response');
}

/**
 * Convert base64 string (from imageParts) to a Blob for use as anchor.
 */
export function base64ToBlob(base64, mimeType = 'image/png') {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mimeType });
}

/**
 * Convert a Blob to { imageBase64, mimeType } for storing in chat message.
 */
export function blobToResult(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => {
      const dataUrl = r.result;
      const base64 = dataUrl.split(',')[1];
      const mime = (blob.type || 'image/png').split(';')[0];
      resolve({ imageBase64: base64, mimeType: mime });
    };
    r.onerror = reject;
    r.readAsDataURL(blob);
  });
}
