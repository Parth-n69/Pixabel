/** @module Document schema, types and migration for Pixabel editor */

export const SCHEMA_VERSION = 2;

export const DEFAULT_ADJUSTMENTS = Object.freeze({
  brightness: 0,
  contrast: 0,
  saturation: 0,
  hue: 0,
  temperature: 0,
  tint: 0,
  exposure: 0,
  highlights: 0,
  shadows: 0,
  whites: 0,
  blacks: 0,
  clarity: 0,
  vibrance: 0,
  sharpness: 0,
  blur: 0,
  noise: 0,
  vignette: 0,
  grayscale: false,
  sepia: false,
  invert: false,
});

export const DEFAULT_LAYER_BASE = Object.freeze({
  visible: true,
  locked: false,
  opacity: 1,
  blendMode: 'normal',
  x: 0,
  y: 0,
  scaleX: 1,
  scaleY: 1,
  rotation: 0,
  flipX: false,
  flipY: false,
  mask: null, // null | { assetId: string, enabled: boolean, inverted: boolean }
  clipToBelow: false,
});

export const DEFAULT_IMAGE_LAYER = Object.freeze({
  type: 'image',
  name: 'Layer',
  assetId: null,
});

export const DEFAULT_TEXT_LAYER = Object.freeze({
  type: 'text',
  name: 'Text',
  text: 'Text',
  fontFamily: 'Inter',
  fontSize: 48,
  fontWeight: 'normal',
  fontStyle: 'normal',
  fill: '#ffffff',
  align: 'left',
  lineHeight: 1.2,
  letterSpacing: 0,
  stroke: null,
  strokeWidth: 0,
  shadow: null, // null | { color: string, blur: number, offsetX: number, offsetY: number }
});

export const DEFAULT_SHAPE_LAYER = Object.freeze({
  type: 'shape',
  name: 'Shape',
  shape: 'rectangle',     // 'rectangle' | 'ellipse' | 'circle' | 'triangle' | 'star' | 'polygon' | 'line' | 'arrow'
  shapeKind: 'rectangle', // alias for shape kind
  width: 200,
  height: 200,
  fill: '#d4af37',
  stroke: '#000000',
  strokeWidth: 0,
  cornerRadius: 0,
  points: 5,              // points / sides
  sides: 5,
  arrowhead: 'none',      // 'none' | 'start' | 'end' | 'both'
});

export const DEFAULT_PAINT_LAYER = Object.freeze({
  type: 'paint',
  name: 'Paint',
  assetId: null,
});

export const DEFAULT_FILL_LAYER = Object.freeze({
  type: 'fill',
  name: 'Fill',
  fill: '#1a1a1e', // solid color e.g. '#ffffff' or gradient object
});

let _counter = 0;

/** Generate a unique layer ID. */
export function createLayerId() {
  return `layer-${Date.now()}-${++_counter}`;
}

/** Generate a unique document ID. */
export function createDocumentId() {
  return `doc-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Create a layer with sensible defaults based on its type, overridden by `overrides`.
 * Supported types: 'image' | 'text' | 'shape' | 'paint' | 'fill'
 */
export function createDefaultLayer(overrides = {}) {
  const type = overrides.type || 'image';
  let typeDefaults;

  switch (type) {
    case 'text':
      typeDefaults = DEFAULT_TEXT_LAYER;
      break;
    case 'shape':
      typeDefaults = DEFAULT_SHAPE_LAYER;
      break;
    case 'paint':
      typeDefaults = DEFAULT_PAINT_LAYER;
      break;
    case 'fill':
      typeDefaults = DEFAULT_FILL_LAYER;
      break;
    case 'image':
    default:
      typeDefaults = DEFAULT_IMAGE_LAYER;
      break;
  }

  const layer = {
    id: createLayerId(),
    ...DEFAULT_LAYER_BASE,
    ...typeDefaults,
    adjustments: { ...DEFAULT_ADJUSTMENTS },
    ...overrides,
  };

  // Ensure default adjustments are merged
  if (overrides.adjustments) {
    layer.adjustments = { ...DEFAULT_ADJUSTMENTS, ...overrides.adjustments };
  }

  // Ensure shape and shapeKind stay in sync if shape layer
  if (layer.type === 'shape') {
    const kind = overrides.shapeKind || overrides.shape || layer.shapeKind || layer.shape || 'rectangle';
    layer.shape = kind;
    layer.shapeKind = kind;
    const pts = overrides.points ?? overrides.sides ?? layer.points ?? 5;
    layer.points = pts;
    layer.sides = pts;
    layer.arrowhead = overrides.arrowhead ?? layer.arrowhead ?? 'none';
  }

  // Reserved fields check
  layer.mask = overrides.mask
    ? {
        assetId: overrides.mask.assetId ?? null,
        enabled: overrides.mask.enabled ?? true,
        inverted: Boolean(overrides.mask.inverted),
      }
    : null;
  layer.clipToBelow = Boolean(overrides.clipToBelow);

  return layer;
}

/** Create a document with sensible defaults, overridden by `overrides`. */
export function createDefaultDocument(overrides = {}) {
  return {
    id: createDocumentId(),
    schemaVersion: SCHEMA_VERSION,
    width: 1920,
    height: 1080,
    background: '#ffffff',
    layers: [],
    ...overrides,
  };
}

/**
 * Clamp document dimensions to maximum allowable (4096px).
 */
export function clampDocumentDimensions(width, height, maxDim = 4096) {
  let w = Number(width) || 1920;
  let h = Number(height) || 1080;
  if (w > maxDim || h > maxDim) {
    const ratio = maxDim / Math.max(w, h);
    w = Math.round(w * ratio);
    h = Math.round(h * ratio);
  }
  return {
    width: Math.max(1, w),
    height: Math.max(1, h),
  };
}

/**
 * Migrate older documents or autosave drafts to schemaVersion: 2.
 * Ensures backward compatibility with unversioned / v1 docs and drafts.
 *
 * @param {object} doc - Raw document object
 * @returns {object} Migrated document with schemaVersion: 2
 */
export function migrate(doc) {
  if (!doc || typeof doc !== 'object') {
    return createDefaultDocument();
  }

  const { width, height } = clampDocumentDimensions(doc.width ?? 1920, doc.height ?? 1080);

  const rawLayers = Array.isArray(doc.layers) ? doc.layers : [];
  const migratedLayers = rawLayers.map((rawLayer) => {
    const type = rawLayer.type || 'image';
    return createDefaultLayer({
      ...rawLayer,
      type,
      // Ensure reserved fields exist
      mask: rawLayer.mask
        ? {
            assetId: rawLayer.mask.assetId ?? null,
            enabled: rawLayer.mask.enabled ?? true,
            inverted: Boolean(rawLayer.mask.inverted),
          }
        : null,
      clipToBelow: Boolean(rawLayer.clipToBelow),
      // Ensure adjustments
      adjustments: {
        ...DEFAULT_ADJUSTMENTS,
        ...(rawLayer.adjustments || {}),
      },
    });
  });

  return {
    id: doc.id || createDocumentId(),
    schemaVersion: SCHEMA_VERSION,
    width,
    height,
    background: doc.background !== undefined ? doc.background : '#ffffff',
    layers: migratedLayers,
  };
}
