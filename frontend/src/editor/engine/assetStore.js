/**
 * In-memory store for image asset pixels.
 * Assets are IMMUTABLE versions with reference counting and
 * garbage collection of assets not referenced by the document or any history step.
 *
 * Keeps the 20 most recent versions as in-memory ImageBitmaps;
 * older ones reload from Blobs.
 */

export const MAX_BITMAP_CACHE = 20;

/**
 * Extract asset IDs referenced in Immer patch lists.
 * @param {Array<object>} patches
 * @returns {Set<string>}
 */
export function extractAssetIdsFromPatches(patches = []) {
  const ids = new Set();
  for (const patch of patches) {
    if (!patch) continue;
    const lastKey = patch.path?.[patch.path.length - 1];
    if (lastKey === 'assetId' && typeof patch.value === 'string') {
      ids.add(patch.value);
    }
    if (patch.value && typeof patch.value === 'object') {
      if (typeof patch.value.assetId === 'string') {
        ids.add(patch.value.assetId);
      }
      if (typeof patch.value.mask?.assetId === 'string') {
        ids.add(patch.value.mask.assetId);
      }
    }
  }
  return ids;
}

/**
 * Extract all asset IDs referenced by a document, history stacks, or initial session baseline.
 *
 * @param {object} doc
 * @param {Array<object>} [undoStack=[]]
 * @param {Array<object>} [redoStack=[]]
 * @param {object|null} [initialSessionDoc=null]
 * @returns {Set<string>}
 */
export function getReferencedAssetIds(doc, undoStack = [], redoStack = [], initialSessionDoc = null) {
  const referenced = new Set();

  function scanDoc(d) {
    if (!d || !Array.isArray(d.layers)) return;
    for (const l of d.layers) {
      if (l.assetId) referenced.add(l.assetId);
      if (l.mask?.assetId) referenced.add(l.mask.assetId);
    }
  }

  scanDoc(doc);
  scanDoc(initialSessionDoc);

  function scanStack(stack) {
    if (!Array.isArray(stack)) return;
    for (const entry of stack) {
      if (!entry) continue;
      if (entry.assetId) referenced.add(entry.assetId);
      if (Array.isArray(entry.assetIds)) {
        for (const id of entry.assetIds) referenced.add(id);
      }
      if (entry.patches) {
        for (const id of extractAssetIdsFromPatches(entry.patches)) {
          referenced.add(id);
        }
      }
      if (entry.inversePatches) {
        for (const id of extractAssetIdsFromPatches(entry.inversePatches)) {
          referenced.add(id);
        }
      }
    }
  }

  scanStack(undoStack);
  scanStack(redoStack);

  return referenced;
}

export class AssetStore {
  /**
   * @type {Map<string, {
   *   assetId: string,
   *   blob: Blob,
   *   objectUrl: string,
   *   bitmap: ImageBitmap|null,
   *   refCount: number,
   *   byteSize: number,
   *   createdAt: number,
   *   lastAccessed: number
   * }>}
   */
  #assets = new Map();

  /**
   * LRU list of asset IDs currently holding an in-memory ImageBitmap.
   * Capped at MAX_BITMAP_CACHE (20).
   * @type {string[]}
   */
  #bitmapLRU = [];

  /**
   * Add an asset. Assets are IMMUTABLE: if an asset with this ID already exists,
   * returns the existing objectUrl without mutating the asset.
   *
   * @param {string} assetId
   * @param {Blob} blob
   * @param {object} [options]
   * @param {ImageBitmap} [options.bitmap]
   * @param {number} [options.refCount=1]
   * @param {number} [options.byteSize]
   * @returns {string} object URL
   */
  add(assetId, blob, options = {}) {
    if (this.#assets.has(assetId)) {
      // Immutable version: do not re-create or overwrite
      const existing = this.#assets.get(assetId);
      if (options.bitmap && !existing.bitmap) {
        this.setBitmap(assetId, options.bitmap);
      }
      return existing.objectUrl;
    }

    const objectUrl = URL.createObjectURL(blob);
    const byteSize = options.byteSize || blob?.size || 0;
    const refCount = options.refCount !== undefined ? options.refCount : 1;
    const now = Date.now();

    const entry = {
      assetId,
      blob,
      objectUrl,
      bitmap: null,
      refCount,
      byteSize,
      createdAt: now,
      lastAccessed: now,
    };

    this.#assets.set(assetId, entry);

    if (options.bitmap) {
      this.setBitmap(assetId, options.bitmap);
    }

    return objectUrl;
  }

  /**
   * Retain an asset reference (increments refCount).
   * @param {string} assetId
   * @returns {number} new refCount
   */
  retain(assetId) {
    const entry = this.#assets.get(assetId);
    if (!entry) return 0;
    entry.refCount += 1;
    return entry.refCount;
  }

  /**
   * Release an asset reference (decrements refCount).
   * @param {string} assetId
   * @returns {number} new refCount
   */
  release(assetId) {
    const entry = this.#assets.get(assetId);
    if (!entry) return 0;
    entry.refCount = Math.max(0, entry.refCount - 1);
    return entry.refCount;
  }

  /**
   * Get the current ref count for an asset.
   * @param {string} assetId
   * @returns {number}
   */
  getRefCount(assetId) {
    return this.#assets.get(assetId)?.refCount ?? 0;
  }

  /**
   * Get the object URL for an asset, or null.
   * @param {string} assetId
   * @returns {string|null}
   */
  getUrl(assetId) {
    const entry = this.#assets.get(assetId);
    if (entry) {
      entry.lastAccessed = Date.now();
      return entry.objectUrl;
    }
    return null;
  }

  /**
   * Get the Blob for an asset, or null.
   * @param {string} assetId
   * @returns {Blob|null}
   */
  getBlob(assetId) {
    const entry = this.#assets.get(assetId);
    if (entry) {
      entry.lastAccessed = Date.now();
      return entry.blob;
    }
    return null;
  }

  /**
   * Get or reload the in-memory ImageBitmap for an asset.
   * Respects the 20 most recent versions cap; older ones reload from Blobs.
   *
   * @param {string} assetId
   * @returns {Promise<ImageBitmap|null>}
   */
  async getBitmap(assetId) {
    const entry = this.#assets.get(assetId);
    if (!entry) return null;

    entry.lastAccessed = Date.now();

    // Already cached in memory: touch in LRU
    if (entry.bitmap) {
      this.#touchBitmap(assetId);
      return entry.bitmap;
    }

    // Reload from Blob
    if (typeof createImageBitmap === 'function') {
      try {
        const bitmap = await createImageBitmap(entry.blob);
        entry.bitmap = bitmap;
        this.#touchBitmap(assetId);
        return bitmap;
      } catch (err) {
        console.warn(`[AssetStore] Failed to reload ImageBitmap for ${assetId}:`, err);
        return null;
      }
    } else if (typeof globalThis !== 'undefined' && typeof globalThis.createImageBitmap === 'function') {
      try {
        const bitmap = await globalThis.createImageBitmap(entry.blob);
        entry.bitmap = bitmap;
        this.#touchBitmap(assetId);
        return bitmap;
      } catch {
        return null;
      }
    }

    return null;
  }

  /**
   * Store an active ImageBitmap into the cache, enforcing the 20-bitmap limit.
   * @param {string} assetId
   * @param {ImageBitmap} bitmap
   */
  setBitmap(assetId, bitmap) {
    const entry = this.#assets.get(assetId);
    if (!entry) return;
    entry.bitmap = bitmap;
    entry.lastAccessed = Date.now();
    this.#touchBitmap(assetId);
  }

  /** Touch an asset in the bitmap LRU, evicting the oldest if > 20. */
  #touchBitmap(assetId) {
    const idx = this.#bitmapLRU.indexOf(assetId);
    if (idx !== -1) {
      this.#bitmapLRU.splice(idx, 1);
    }
    this.#bitmapLRU.push(assetId);

    while (this.#bitmapLRU.length > MAX_BITMAP_CACHE) {
      const oldestId = this.#bitmapLRU.shift();
      const oldestEntry = this.#assets.get(oldestId);
      if (oldestEntry?.bitmap) {
        if (typeof oldestEntry.bitmap.close === 'function') {
          try {
            oldestEntry.bitmap.close();
          } catch {
            // Ignore close errors
          }
        }
        oldestEntry.bitmap = null;
      }
    }
  }

  /**
   * Check if an asset currently has an in-memory ImageBitmap loaded.
   * @param {string} assetId
   * @returns {boolean}
   */
  hasBitmap(assetId) {
    return Boolean(this.#assets.get(assetId)?.bitmap);
  }

  /**
   * Number of in-memory ImageBitmaps currently held.
   * @returns {number}
   */
  get cachedBitmapCount() {
    return this.#bitmapLRU.length;
  }

  /** Check if an asset exists. */
  has(assetId) {
    return this.#assets.has(assetId);
  }

  /** Get estimated byte size of an asset. */
  getSize(assetId) {
    return this.#assets.get(assetId)?.byteSize ?? 0;
  }

  /** Total byte size of all stored assets. */
  getTotalByteSize() {
    let total = 0;
    for (const entry of this.#assets.values()) {
      total += entry.byteSize || 0;
    }
    return total;
  }

  /** Remove an asset, close its bitmap, and revoke its object URL. */
  remove(assetId) {
    const entry = this.#assets.get(assetId);
    if (entry) {
      if (entry.bitmap && typeof entry.bitmap.close === 'function') {
        try {
          entry.bitmap.close();
        } catch {
          // ignore
        }
      }
      URL.revokeObjectURL(entry.objectUrl);
      this.#assets.delete(assetId);
      const lruIdx = this.#bitmapLRU.indexOf(assetId);
      if (lruIdx !== -1) this.#bitmapLRU.splice(lruIdx, 1);
    }
  }

  /**
   * Garbage collection: removes assets not referenced by the document or any history step.
   *
   * @param {Set<string>|Array<string>|object} [referencedIdsOrStore]
   *   - A Set or Array of active asset IDs,
   *   - OR a Zustand store / state containing { document, _undoStack, _redoStack },
   *   - OR null to collect assets with refCount <= 0.
   * @returns {string[]} Array of garbage-collected asset IDs
   */
  collectGarbage(referencedIdsOrStore) {
    let keepIds = null;

    if (referencedIdsOrStore) {
      if (referencedIdsOrStore instanceof Set) {
        keepIds = referencedIdsOrStore;
      } else if (Array.isArray(referencedIdsOrStore)) {
        keepIds = new Set(referencedIdsOrStore);
      } else if (typeof referencedIdsOrStore.getState === 'function') {
        // Zustand store instance
        const state = referencedIdsOrStore.getState();
        keepIds = getReferencedAssetIds(
          state.document,
          state._undoStack,
          state._redoStack,
          state.initialSessionDoc,
        );
      } else if (referencedIdsOrStore.document) {
        // Store state object
        keepIds = getReferencedAssetIds(
          referencedIdsOrStore.document,
          referencedIdsOrStore._undoStack,
          referencedIdsOrStore._redoStack,
          referencedIdsOrStore.initialSessionDoc,
        );
      } else if (Array.isArray(referencedIdsOrStore.layers)) {
        // Plain document object
        keepIds = getReferencedAssetIds(referencedIdsOrStore);
      }
    }

    const toRemove = [];

    for (const [id, entry] of this.#assets.entries()) {
      let isReferenced = false;
      if (keepIds !== null) {
        isReferenced = keepIds.has(id);
      } else {
        isReferenced = entry.refCount > 0;
      }

      if (!isReferenced) {
        toRemove.push(id);
      }
    }

    for (const id of toRemove) {
      this.remove(id);
    }

    return toRemove;
  }

  /** Get all entries as an array of [assetId, entry]. */
  entries() {
    return Array.from(this.#assets.entries());
  }

  /** Dispose of all assets, bitmaps, and URLs. */
  dispose() {
    for (const [id] of this.#assets) {
      this.remove(id);
    }
    this.#bitmapLRU = [];
  }
}
