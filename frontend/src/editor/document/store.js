/** @module Zustand store with immer-patch history for Pixabel editor */

import { create } from 'zustand';
import { enablePatches, produceWithPatches, applyPatches } from 'immer';
import { applyAction } from './actions.js';
import { createDefaultDocument, migrate } from './schema.js';
import { serializeDocument } from './serialize.js';

enablePatches();

export const MAX_HISTORY = 100;
export const DEFAULT_MAX_PIXEL_MEMORY_BYTES = 200 * 1024 * 1024; // 200 MB

/**
 * Helper to compute the estimated pixel memory consumed by the undo stack.
 */
function computeUndoStackPixelMemory(undoStack, assetStore) {
  const assetIds = new Set();
  let explicitBytes = 0;

  for (const entry of undoStack) {
    if (typeof entry.pixelBytes === 'number' && entry.pixelBytes > 0) {
      explicitBytes += entry.pixelBytes;
      continue;
    }
    for (const p of entry.patches || []) {
      if (p.path?.[p.path.length - 1] === 'assetId' && typeof p.value === 'string') {
        assetIds.add(p.value);
      }
    }
    for (const p of entry.inversePatches || []) {
      if (p.path?.[p.path.length - 1] === 'assetId' && typeof p.value === 'string') {
        assetIds.add(p.value);
      }
    }
  }

  let assetStoreBytes = 0;
  if (assetStore) {
    for (const id of assetIds) {
      assetStoreBytes += assetStore.getSize(id) || 0;
    }
  }

  return explicitBytes + assetStoreBytes;
}

/**
 * Create an editor store instance.
 * Each call returns an independent store (useful for testing).
 *
 * @param {object} [initialDoc]
 * @param {object|import('../engine/assetStore.js').AssetStore} [optionsOrAssetStore]
 */
export function createEditorStore(initialDoc, optionsOrAssetStore = {}) {
  const options =
    optionsOrAssetStore && typeof optionsOrAssetStore.getBlob === 'function'
      ? { assetStore: optionsOrAssetStore }
      : optionsOrAssetStore || {};

  let activeAssetStore = options.assetStore || null;
  let maxPixelMemoryBytes = options.maxPixelMemoryBytes || DEFAULT_MAX_PIXEL_MEMORY_BYTES;
  const onNotice = options.onNotice || null;

  const initDoc = initialDoc ? migrate(initialDoc) : createDefaultDocument();

  return create((set, get) => {
    /**
     * Enforce pixel memory cap on the undo stack, dropping oldest steps if needed.
     */
    function enforcePixelMemoryLimit(undoStack) {
      let totalMem = computeUndoStackPixelMemory(undoStack, activeAssetStore);
      let dropped = false;

      while (totalMem > maxPixelMemoryBytes && undoStack.length > 1) {
        undoStack.shift();
        dropped = true;
        totalMem = computeUndoStackPixelMemory(undoStack, activeAssetStore);
      }

      if (dropped) {
        const notice = {
          message: 'Pixel history limit reached (~200MB). Oldest undo steps were dropped.',
          type: 'info',
          timestamp: Date.now(),
        };
        set({ lastNotice: notice });
        if (typeof onNotice === 'function') {
          onNotice(notice);
        }
        if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
          window.dispatchEvent(
            new CustomEvent('pixabel:toast', {
              detail: { message: notice.message, type: 'info' },
            }),
          );
        }
      }
    }

    return {
      document: initDoc,
      initialSessionDoc: serializeDocument(initDoc),

      // ── View state (not in history) ──
      selectedLayerId: initDoc?.layers?.[0]?.id ?? null,
      comparingLayerId: null,
      isComparingSession: false,
      lastNotice: null,

      /** Attach an AssetStore instance. */
      setAssetStore(store) {
        activeAssetStore = store;
      },

      /** Get attached AssetStore. */
      getAssetStore: () => activeAssetStore,

      /** Configure max pixel memory bytes. */
      setMaxPixelMemoryBytes(bytes) {
        maxPixelMemoryBytes = bytes;
        const state = get();
        const undoStack = [...state._undoStack];
        enforcePixelMemoryLimit(undoStack);
        set({ _undoStack: undoStack });
      },

      /** Get current pixel history memory in bytes. */
      getPixelHistoryMemory: () => {
        return computeUndoStackPixelMemory(get()._undoStack, activeAssetStore);
      },

      /** Collect unreferenced assets in the attached AssetStore. */
      collectGarbageAssets() {
        if (!activeAssetStore) return [];
        return activeAssetStore.collectGarbage(get());
      },

      /** Set the layer currently being compared (preview original without adjustments). */
      setComparingLayerId(id) {
        set({ comparingLayerId: id });
      },

      /** Toggle or set comparing full document to session start. */
      setIsComparingSession(val) {
        set({ isComparingSession: Boolean(val) });
      },

      /** Snapshot the current document as the session start baseline. */
      snapshotInitialSessionDoc() {
        set({ initialSessionDoc: serializeDocument(get().document) });
      },

      /** Restore a saved session document, resetting undo/redo stacks. */
      restoreSessionDocument(doc) {
        const migrated = migrate(doc);
        set({
          document: migrated,
          initialSessionDoc: serializeDocument(migrated),
          selectedLayerId: migrated.layers[0]?.id ?? null,
          comparingLayerId: null,
          isComparingSession: false,
          _undoStack: [],
          _redoStack: [],
          lastNotice: null,
        });
      },

      // ── History state (not part of the document) ──
      _undoStack: [],
      _redoStack: [],
      _gestureActive: false,
      _gesturePatches: [],
      _gestureInversePatches: [],
      _gesturePixelBytes: 0,

      /** Whether undo is available. */
      canUndo: () => get()._undoStack.length > 0,

      /** Whether redo is available. */
      canRedo: () => get()._redoStack.length > 0,

      /** Set the currently selected layer (view state, not in history). */
      setSelectedLayerId(id) {
        set({ selectedLayerId: id });
      },

      /**
       * Dispatch an action to mutate the document.
       * Patches are recorded automatically for undo / redo.
       */
      dispatch(action) {
        const state = get();
        const [nextDoc, patches, inversePatches] = produceWithPatches(
          state.document,
          (draft) => applyAction(draft, action),
        );

        if (patches.length === 0) return; // no-op

        let stepPixelBytes = action.byteSize || action.pixelBytes || 0;
        if (!stepPixelBytes && action.type === 'setLayerAsset' && activeAssetStore) {
          stepPixelBytes = activeAssetStore.getSize(action.assetId);
        }

        if (state._gestureActive) {
          // Accumulate into the running gesture
          set({
            document: nextDoc,
            _gesturePatches: [...state._gesturePatches, ...patches],
            _gestureInversePatches: [
              ...inversePatches,
              ...state._gestureInversePatches,
            ],
            _gesturePixelBytes: Math.max(state._gesturePixelBytes, stepPixelBytes),
          });
        } else {
          // Normal single-step entry
          const entry = {
            patches,
            inversePatches,
            pixelBytes: stepPixelBytes,
          };
          const undoStack = [...state._undoStack, entry];
          if (undoStack.length > MAX_HISTORY) {
            undoStack.splice(0, undoStack.length - MAX_HISTORY);
          }

          enforcePixelMemoryLimit(undoStack);

          set({
            document: nextDoc,
            _undoStack: undoStack,
            _redoStack: [], // new action clears redo
          });
        }
      },

      /** Start coalescing dispatches into a single undo step (e.g. slider drag, brush stroke). */
      beginGesture() {
        set({
          _gestureActive: true,
          _gesturePatches: [],
          _gestureInversePatches: [],
          _gesturePixelBytes: 0,
        });
      },

      /** Finish coalescing and commit the gesture as one undo entry. */
      endGesture() {
        const state = get();
        if (!state._gestureActive) return;

        if (state._gesturePatches.length > 0) {
          const entry = {
            patches: state._gesturePatches,
            inversePatches: state._gestureInversePatches,
            pixelBytes: state._gesturePixelBytes,
          };
          const undoStack = [...state._undoStack, entry];
          if (undoStack.length > MAX_HISTORY) {
            undoStack.splice(0, undoStack.length - MAX_HISTORY);
          }

          enforcePixelMemoryLimit(undoStack);

          set({
            _gestureActive: false,
            _gesturePatches: [],
            _gestureInversePatches: [],
            _gesturePixelBytes: 0,
            _undoStack: undoStack,
            _redoStack: [],
          });
        } else {
          set({
            _gestureActive: false,
            _gesturePatches: [],
            _gestureInversePatches: [],
            _gesturePixelBytes: 0,
          });
        }
      },

      /** Undo the last action or gesture. */
      undo() {
        const state = get();
        if (state._undoStack.length === 0) return;
        const entry = state._undoStack[state._undoStack.length - 1];
        const nextDoc = applyPatches(state.document, entry.inversePatches);
        set({
          document: nextDoc,
          _undoStack: state._undoStack.slice(0, -1),
          _redoStack: [...state._redoStack, entry],
        });
      },

      /** Redo the last undone action or gesture. */
      redo() {
        const state = get();
        if (state._redoStack.length === 0) return;
        const entry = state._redoStack[state._redoStack.length - 1];
        const nextDoc = applyPatches(state.document, entry.patches);
        set({
          document: nextDoc,
          _redoStack: state._redoStack.slice(0, -1),
          _undoStack: [...state._undoStack, entry],
        });
      },

      /**
       * Commit a pixel edit on a layer.
       * Adds the new asset to AssetStore and dispatches setLayerAsset as ONE history step.
       */
      commitPixelEdit(layerId, blob, editOpts = {}) {
        if (!activeAssetStore) {
          throw new Error('AssetStore not attached to editor store');
        }
        return commitPixelEdit({ getState: get }, activeAssetStore, layerId, blob, editOpts);
      },
    };
  });
}

/**
 * Commit a pixel edit: commits a NEW asset in AssetStore and dispatches
 * setLayerAsset as ONE history step.
 *
 * @param {import('zustand').StoreApi} store
 * @param {import('../engine/assetStore.js').AssetStore} assetStore
 * @param {string} layerId
 * @param {Blob} blob
 * @param {object} [options]
 * @returns {{ assetId: string, objectUrl: string }}
 */
export function commitPixelEdit(store, assetStore, layerId, blob, options = {}) {
  const assetId =
    options.assetId ||
    `asset-pixel-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const objectUrl = assetStore.add(assetId, blob, options);
  const byteSize =
    options.byteSize ||
    blob?.size ||
    (options.bitmap ? (options.bitmap.width || 0) * (options.bitmap.height || 0) * 4 : 0);

  store.getState().dispatch({
    type: 'setLayerAsset',
    layerId,
    assetId,
    byteSize,
  });

  return { assetId, objectUrl };
}
