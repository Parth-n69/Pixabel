/** @module Document schema and factory functions for Pixabel editor */

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

/** Create a layer with sensible defaults, overridden by `overrides`. */
export function createDefaultLayer(overrides = {}) {
  return {
    id: createLayerId(),
    type: 'image',
    name: 'Layer',
    assetId: null,
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
    adjustments: { ...DEFAULT_ADJUSTMENTS },
    ...overrides,
  };
}

/** Create a document with sensible defaults, overridden by `overrides`. */
export function createDefaultDocument(overrides = {}) {
  return {
    id: createDocumentId(),
    width: 1920,
    height: 1080,
    background: '#ffffff',
    layers: [],
    ...overrides,
  };
}

