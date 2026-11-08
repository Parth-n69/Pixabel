/** @module Zustand store with immer-patch history for Pixabel editor */

import { create } from 'zustand';
import { enablePatches, produceWithPatches, applyPatches } from 'immer';
import { applyAction } from './actions.js';
import { createDefaultDocument } from './schema.js';

enablePatches();

const MAX_HISTORY = 100;

/**
 * Create an editor store instance.
 * Each call returns an independent store (useful for testing).
 */
export function createEditorStore(initialDoc) {
  return create((set, get) => ({
    document: initialDoc ?? createDefaultDocument(),

    // ── View state (not in history) ──
    selectedLayerId: initialDoc?.layers?.[0]?.id ?? null,
    comparingLayerId: null,

    /** Set the layer currently being compared (preview original without adjustments). */
    setComparingLayerId(id) {
      set({ comparingLayerId: id });
    },

    // ── History state (not part of the document) ──
    _undoStack: [],
    _redoStack: [],
    _gestureActive: false,
    _gesturePatches: [],
    _gestureInversePatches: [],

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

      if (state._gestureActive) {
        // Accumulate into the running gesture
        set({
          document: nextDoc,
          _gesturePatches: [...state._gesturePatches, ...patches],
          // Inverse patches prepended so they replay in reverse order
          _gestureInversePatches: [
            ...inversePatches,
            ...state._gestureInversePatches,
          ],
        });
      } else {
        // Normal single-step entry
        const undoStack = [...state._undoStack, { patches, inversePatches }];
        if (undoStack.length > MAX_HISTORY) {
          undoStack.splice(0, undoStack.length - MAX_HISTORY);
        }
        set({
          document: nextDoc,
          _undoStack: undoStack,
          _redoStack: [], // new action clears redo
        });
      }
    },

    /** Start coalescing dispatches into a single undo step (e.g. slider drag). */
    beginGesture() {
      set({
        _gestureActive: true,
        _gesturePatches: [],
        _gestureInversePatches: [],
      });
    },

    /** Finish coalescing and commit the gesture as one undo entry. */
    endGesture() {
      const state = get();
      if (!state._gestureActive) return;

      if (state._gesturePatches.length > 0) {
        const undoStack = [
          ...state._undoStack,
          {
            patches: state._gesturePatches,
            inversePatches: state._gestureInversePatches,
          },
        ];
        if (undoStack.length > MAX_HISTORY) {
          undoStack.splice(0, undoStack.length - MAX_HISTORY);
        }
        set({
          _gestureActive: false,
          _gesturePatches: [],
          _gestureInversePatches: [],
          _undoStack: undoStack,
          _redoStack: [],
        });
      } else {
        set({
          _gestureActive: false,
          _gesturePatches: [],
          _gestureInversePatches: [],
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
  }));
}

