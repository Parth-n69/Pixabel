/**
 * imageLoader — shared utility to load image files and manage pixel merges
 * into the AssetStore and dispatch actions to the editor store.
 */
import { createLayerId } from '../document/schema.js';

/**
 * Load an image File/Blob into the editor.
 * Returns { assetId, width, height } on success.
 *
 * @param {File|Blob} fileOrBlob
 * @param {import('../engine/assetStore.js').AssetStore} assetStore
 * @param {import('zustand').StoreApi} store
 * @param {object} [opts]
 * @param {string} [opts.name]  Layer name (defaults to file name or 'Image')
 * @param {boolean} [opts.resizeDoc] If true, resize document to match image
 */
export async function loadImageIntoEditor(fileOrBlob, assetStore, store, opts = {}) {
  const assetId = `img-${createLayerId()}`;
  const url = assetStore.add(assetId, fileOrBlob);

  // Get natural dimensions
  const { width, height } = await getImageSize(url);

  const name = opts.name || (fileOrBlob instanceof File ? fileOrBlob.name.replace(/\.[^/.]+$/, '') : 'Image');

  const doc = store.getState().document;
  const isFirstLayer = doc.layers.length === 0;

  // If the document has no layers, resize to the image's size
  if (opts.resizeDoc || isFirstLayer) {
    store.getState().dispatch({
      type: 'setDocumentSize',
      width,
      height,
    });
  }

  // Calculate position: center if document is larger, else 0,0
  const docWidth = (opts.resizeDoc || isFirstLayer) ? width : doc.width;
  const docHeight = (opts.resizeDoc || isFirstLayer) ? height : doc.height;
  const x = Math.max(0, Math.round((docWidth - width) / 2));
  const y = Math.max(0, Math.round((docHeight - height) / 2));

  store.getState().dispatch({
    type: 'addLayer',
    payload: {
      name,
      assetId,
      x,
      y,
      scaleX: 1,
      scaleY: 1,
    },
  });

  // Select the newly added layer
  const updatedDoc = store.getState().document;
  const newLayer = updatedDoc.layers[updatedDoc.layers.length - 1];
  if (newLayer) {
    store.getState().setSelectedLayerId(newLayer.id);
  }

  return { assetId, width, height };
}

/**
 * Load an image from a data URL or http URL into the editor.
 */
export async function loadImageUrlIntoEditor(imageUrl, assetStore, store, opts = {}) {
  const response = await fetch(imageUrl);
  const blob = await response.blob();
  return loadImageIntoEditor(blob, assetStore, store, opts);
}

/** Get the natural size of an image from its URL. */
export function getImageSize(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = url;
  });
}

/**
 * Merge the given layer down into the layer beneath it with offscreen canvas rendering.
 */
export async function mergeLayersDown(store, assetStore, upperLayerId) {
  const doc = store.getState().document;
  const idx = doc.layers.findIndex((l) => l.id === upperLayerId);
  if (idx <= 0) return;
  const upper = doc.layers[idx];
  const lower = doc.layers[idx - 1];

  const canvas = document.createElement('canvas');
  canvas.width = doc.width;
  canvas.height = doc.height;
  const ctx = canvas.getContext('2d');

  await drawLayerToCtx(ctx, lower, assetStore);
  await drawLayerToCtx(ctx, upper, assetStore);

  const blob = await new Promise((res) => canvas.toBlob(res, 'image/png'));
  const assetId = `merged-${createLayerId()}`;
  assetStore.add(assetId, blob);

  store.getState().dispatch({
    type: 'mergeDown',
    layerId: upperLayerId,
    assetId,
  });

  store.getState().setSelectedLayerId(lower.id);
}

/**
 * Flatten all layers into a single image layer.
 */
export async function flattenAllLayers(store, assetStore) {
  const doc = store.getState().document;
  if (doc.layers.length === 0) return;

  const canvas = document.createElement('canvas');
  canvas.width = doc.width;
  canvas.height = doc.height;
  const ctx = canvas.getContext('2d');

  if (doc.background) {
    ctx.fillStyle = doc.background;
    ctx.fillRect(0, 0, doc.width, doc.height);
  }

  for (const layer of doc.layers) {
    if (layer.visible) {
      await drawLayerToCtx(ctx, layer, assetStore);
    }
  }

  const blob = await new Promise((res) => canvas.toBlob(res, 'image/png'));
  const assetId = `flattened-${createLayerId()}`;
  assetStore.add(assetId, blob);

  store.getState().dispatch({
    type: 'flatten',
    assetId,
  });

  const updated = store.getState().document;
  if (updated.layers[0]) {
    store.getState().setSelectedLayerId(updated.layers[0].id);
  }
}

function drawLayerToCtx(ctx, layer, assetStore) {
  const url = assetStore.getUrl(layer.assetId);
  if (!url) return Promise.resolve();
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      ctx.save();
      ctx.globalAlpha = layer.opacity ?? 1;
      ctx.globalCompositeOperation =
        layer.blendMode === 'normal' || !layer.blendMode ? 'source-over' : layer.blendMode;

      if (layer.adjustments) {
        const adj = layer.adjustments;
        const b = 100 + (adj.brightness || 0);
        const c = 100 + (adj.contrast || 0);
        const s = 100 + (adj.saturation || 0);
        const blur = Math.max(0, (adj.blur || 0) * 0.2);
        const filters = [`brightness(${b}%)`, `contrast(${c}%)`, `saturate(${s}%)`];
        if (blur > 0) filters.push(`blur(${blur}px)`);
        if (adj.grayscale) filters.push('grayscale(100%)');
        if (adj.sepia) filters.push('sepia(100%)');
        if (adj.invert) filters.push('invert(100%)');
        ctx.filter = filters.join(' ');
      }

      ctx.translate(layer.x, layer.y);
      if (layer.rotation) {
        ctx.rotate((layer.rotation * Math.PI) / 180);
      }
      const sx = (layer.scaleX ?? 1) * (layer.flipX ? -1 : 1);
      const sy = (layer.scaleY ?? 1) * (layer.flipY ? -1 : 1);
      ctx.scale(sx, sy);

      ctx.drawImage(img, 0, 0);
      ctx.restore();
      resolve();
    };
    img.onerror = () => resolve();
    img.src = url;
  });
}
