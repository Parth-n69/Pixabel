
import { serializeDocument, loadDocument } from './serialize.js';

const DB_NAME = 'PixabelEditorDB';
const DB_VERSION = 1;
const STORE_NAME = 'drafts';
const DRAFT_KEY = 'autosave_session';

let _dbPromise = null;

function getDB() {
  if (_dbPromise) return _dbPromise;

  _dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      return reject(new Error('IndexedDB not supported'));
    }

    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };

    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror = (e) => {
      console.warn('[EditorPersistence] IndexedDB open error:', e.target.error);
      reject(e.target.error);
    };
  });

  return _dbPromise;
}

function promisifyRequest(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/**
 * Save the current editor document and its asset blobs to IndexedDB.
 *
 * @param {object} doc - Document object
 * @param {import('../engine/assetStore.js').AssetStore} assetStore
 * @returns {Promise<boolean>}
 */
export async function saveDraft(doc, assetStore) {
  if (!doc || !doc.layers || doc.layers.length === 0) {
    // Nothing meaningful to save
    return false;
  }

  try {
    const db = await getDB();
    const serializedDoc = serializeDocument(doc);

    // Collect blobs for every asset referenced in layers
    const assets = [];
    const neededIds = new Set(doc.layers.map((l) => l.assetId).filter(Boolean));

    for (const assetId of neededIds) {
      const blob = assetStore.getBlob(assetId);
      if (blob) {
        assets.push({ assetId, blob });
      }
    }

    const draftEntry = {
      id: DRAFT_KEY,
      document: serializedDoc,
      assets,
      updatedAt: Date.now(),
      layerCount: doc.layers.length,
      width: doc.width,
      height: doc.height,
    };

    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    await promisifyRequest(store.put(draftEntry));
    return true;
  } catch (err) {
    console.warn('[EditorPersistence] Failed to autosave draft:', err);
    return false;
  }
}

/**
 * Load the autosaved draft from IndexedDB.
 *
 * @returns {Promise<{ document: object, assets: Array<{ assetId: string, blob: Blob }>, updatedAt: number }|null>}
 */
export async function loadDraft() {
  try {
    const db = await getDB();
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const result = await promisifyRequest(store.get(DRAFT_KEY));

    if (!result || !result.document) {
      return null;
    }

    const doc = loadDocument(result.document);
    return {
      document: doc,
      assets: result.assets || [],
      updatedAt: result.updatedAt || Date.now(),
      layerCount: result.layerCount || doc.layers.length,
    };
  } catch (err) {
    console.warn('[EditorPersistence] Failed to load draft:', err);
    return null;
  }
}

/**
 * Delete the autosaved draft from IndexedDB.
 *
 * @returns {Promise<boolean>}
 */
export async function clearDraft() {
  try {
    const db = await getDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    await promisifyRequest(store.delete(DRAFT_KEY));
    return true;
  } catch (err) {
    console.warn('[EditorPersistence] Failed to clear draft:', err);
    return false;
  }
}
