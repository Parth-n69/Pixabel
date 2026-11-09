/**
 * In-memory store for image asset pixels.
 * Maps assetId → { blob, objectUrl }.
 * Image pixels live here, NOT in the document JSON.
 */
export class AssetStore {
  /** @type {Map<string, { blob: Blob, objectUrl: string }>} */
  #assets = new Map();

  /**
   * Add (or replace) an asset. Returns the object URL.
   * @param {string} assetId
   * @param {Blob} blob
   * @returns {string} object URL
   */
  add(assetId, blob) {
    this.remove(assetId);
    const objectUrl = URL.createObjectURL(blob);
    this.#assets.set(assetId, { blob, objectUrl });
    return objectUrl;
  }

  /** Get the object URL for an asset, or null. */
  getUrl(assetId) {
    return this.#assets.get(assetId)?.objectUrl ?? null;
  }

  /** Get the Blob for an asset, or null. */
  getBlob(assetId) {
    return this.#assets.get(assetId)?.blob ?? null;
  }

  /** Check if an asset exists. */
  has(assetId) {
    return this.#assets.has(assetId);
  }

  /** Remove an asset and revoke its object URL. */
  remove(assetId) {
    const entry = this.#assets.get(assetId);
    if (entry) {
      URL.revokeObjectURL(entry.objectUrl);
      this.#assets.delete(assetId);
    }
  }

  /** Get all entries as an array of [assetId, { blob, objectUrl }]. */
  entries() {
    return Array.from(this.#assets.entries());
  }

  /** Dispose of all assets. */
  dispose() {
    for (const [id] of this.#assets) this.remove(id);
  }
}

