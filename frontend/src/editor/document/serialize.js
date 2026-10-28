/** @module Serialization helpers for the Pixabel document model */

import { createDefaultDocument, createDefaultLayer, DEFAULT_ADJUSTMENTS } from './schema.js';

/**
 * Produce a plain, JSON-safe snapshot of the document.
 * Safe to persist, send over the network, or store in localStorage.
 */
export function serializeDocument(doc) {
  return JSON.parse(JSON.stringify(doc));
}

/**
 * Load a document from parsed JSON, filling in any missing defaults.
 * Always returns a fully-valid document shape.
 */
export function loadDocument(json) {
  if (!json || typeof json !== 'object') {
    throw new Error('Invalid document JSON');
  }
  return createDefaultDocument({
    id: json.id,
    width: json.width,
    height: json.height,
    background: json.background ?? '#ffffff',
    layers: (json.layers ?? []).map((l) =>
      createDefaultLayer({
        ...l,
        adjustments: { ...DEFAULT_ADJUSTMENTS, ...(l.adjustments ?? {}) },
      }),
    ),
  });
}
