/**
 * exportEngine — renders the Pixabel document model to offscreen canvas
 * for image export (PNG, JPEG, WebP) and saving to the Gallery.
 *
 * Rules:
 * - Only visible layers are exported
 * - No selection handles or editor UI artifacts
 * - Scale 1x / 2x capped at 4096px on the longest side
 * - JPEG uses custom/document background color (since JPEG lacks alpha)
 * - PNG and WebP preserve transparency (unless doc background is explicitly set)
 * - Quality parameter for JPEG and WebP
 */
import { drawLayerToCtx } from './imageLoader.js';
import { Storage } from '../../lib/storage.js';

const MAX_EXPORT_DIMENSION = 4096;

/**
 * Compute output dimensions for a given document and requested scale,
 * strictly enforcing the 4096px longest side limit.
 *
 * @param {{ width: number, height: number }} doc
 * @param {number} requestedScale
 * @returns {{ width: number, height: number, effectiveScale: number, wasCapped: boolean }}
 */
export function computeOutputDimensions(doc, requestedScale = 1) {
  const baseW = Math.max(1, doc.width || 1024);
  const baseH = Math.max(1, doc.height || 1024);
  let w = Math.round(baseW * requestedScale);
  let h = Math.round(baseH * requestedScale);
  const longest = Math.max(w, h);

  let effectiveScale = requestedScale;
  let wasCapped = false;

  if (longest > MAX_EXPORT_DIMENSION) {
    const ratio = MAX_EXPORT_DIMENSION / longest;
    w = Math.round(w * ratio);
    h = Math.round(h * ratio);
    effectiveScale = w / baseW;
    wasCapped = true;
  }

  return {
    width: w,
    height: h,
    effectiveScale,
    wasCapped,
  };
}

/**
 * Render all visible layers in document order to an offscreen HTMLCanvasElement.
 *
 * @param {object} doc
 * @param {import('./assetStore.js').AssetStore} assetStore
 * @param {object} [options]
 * @param {number} [options.scale=1]
 * @param {'png'|'jpeg'|'webp'} [options.format='png']
 * @param {string} [options.jpegBackground='#ffffff']
 * @returns {Promise<{ canvas: HTMLCanvasElement, width: number, height: number, effectiveScale: number }>}
 */
export async function renderDocumentToCanvas(doc, assetStore, options = {}) {
  const scale = options.scale ?? 1;
  const format = (options.format || 'png').toLowerCase();
  const jpegBg = options.jpegBackground || '#ffffff';

  const { width, height, effectiveScale } = computeOutputDimensions(doc, scale);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');

  // Background rendering
  if (format === 'jpeg' || format === 'jpg') {
    // JPEG has no transparency: fill background
    ctx.fillStyle = jpegBg;
    ctx.fillRect(0, 0, width, height);
  } else if (doc.background && doc.background !== 'transparent') {
    // PNG / WebP: only fill if document has an explicit background color
    ctx.fillStyle = doc.background;
    ctx.fillRect(0, 0, width, height);
  } else {
    // Keep transparent
    ctx.clearRect(0, 0, width, height);
  }

  ctx.save();
  ctx.scale(effectiveScale, effectiveScale);

  // Render ONLY visible layers from bottom to top
  const visibleLayers = doc.layers.filter((l) => l.visible);
  for (const layer of visibleLayers) {
    await drawLayerToCtx(ctx, layer, assetStore);
  }

  ctx.restore();

  return { canvas, width, height, effectiveScale };
}

/**
 * Render document to Blob.
 *
 * @param {object} doc
 * @param {import('./assetStore.js').AssetStore} assetStore
 * @param {object} [options]
 * @param {'png'|'jpeg'|'webp'} [options.format='png']
 * @param {number} [options.quality=0.92]
 * @param {number} [options.scale=1]
 * @param {string} [options.jpegBackground='#ffffff']
 * @returns {Promise<{ blob: Blob, width: number, height: number }>}
 */
export async function renderDocumentToBlob(doc, assetStore, options = {}) {
  const { canvas, width, height } = await renderDocumentToCanvas(doc, assetStore, options);
  const format = (options.format || 'png').toLowerCase();
  const mimeType = format === 'jpeg' || format === 'jpg'
    ? 'image/jpeg'
    : format === 'webp'
    ? 'image/webp'
    : 'image/png';

  const quality = options.quality ?? 0.92;

  const blob = await new Promise((resolve) => {
    canvas.toBlob(resolve, mimeType, quality);
  });

  return { blob, width, height };
}

/**
 * Render document to Base64 data URL.
 */
export async function renderDocumentToDataUrl(doc, assetStore, options = {}) {
  const { canvas, width, height } = await renderDocumentToCanvas(doc, assetStore, options);
  const format = (options.format || 'png').toLowerCase();
  const mimeType = format === 'jpeg' || format === 'jpg'
    ? 'image/jpeg'
    : format === 'webp'
    ? 'image/webp'
    : 'image/png';

  const quality = options.quality ?? 0.92;
  const dataUrl = canvas.toDataURL(mimeType, quality);

  return { dataUrl, width, height };
}

/**
 * Trigger client-side browser download for a Blob.
 *
 * @param {Blob} blob
 * @param {string} filename
 */
export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Save the flattened document directly into Pixabel's gallery history.
 *
 * @param {object} doc
 * @param {import('./assetStore.js').AssetStore} assetStore
 * @param {object} [options]
 * @param {string} [options.title]
 * @param {number} [options.scale=1]
 * @returns {Promise<object>} The stored generation record
 */
export async function saveDocumentToGallery(doc, assetStore, options = {}) {
  const { dataUrl, width, height } = await renderDocumentToDataUrl(doc, assetStore, {
    scale: options.scale || 1,
    format: options.format || 'png',
    jpegBackground: options.jpegBackground || '#ffffff',
  });

  const entry = await Storage.saveGeneration({
    image: dataUrl,
    prompt: options.title || doc.name || 'Pixabel Artwork',
    width,
    height,
    type: 'edit',
  });

  return entry;
}
