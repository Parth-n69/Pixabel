/** @module Serialization helpers for the Pixabel document model */

import { migrate, SCHEMA_VERSION } from './schema.js';

export { migrate, SCHEMA_VERSION };

/**
 * Produce a plain, JSON-safe snapshot of the document.
 * Safe to persist, send over the network, or store in localStorage.
 */
export function serializeDocument(doc) {
  return JSON.parse(JSON.stringify(doc));
}

/**
 * Load a document from parsed JSON, migrating older versions to schemaVersion: 2
 * and filling in any missing defaults.
 * Always returns a fully-valid document shape.
 */
export function loadDocument(json) {
  if (!json || typeof json !== 'object') {
    throw new Error('Invalid document JSON');
  }
  return migrate(json);
}
