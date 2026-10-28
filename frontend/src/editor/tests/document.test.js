import { describe, it, expect, beforeEach } from 'vitest';
import { createEditorStore } from '../document/store.js';
import { createDefaultDocument, DEFAULT_ADJUSTMENTS } from '../document/schema.js';
import { serializeDocument, loadDocument } from '../document/serialize.js';

describe('Pixabel Document Store', () => {
  /** @type {ReturnType<typeof createEditorStore>} */
  let store;

  const getDoc = () => store.getState().document;
  const dispatch = (action) => store.getState().dispatch(action);
  const undo = () => store.getState().undo();
  const redo = () => store.getState().redo();

  beforeEach(() => {
    store = createEditorStore(createDefaultDocument({ id: 'test-doc' }));
  });

  /** Add a layer and return its id. */
  function addLayer(name = 'Layer') {
    dispatch({ type: 'addLayer', payload: { name } });
    return getDoc().layers[getDoc().layers.length - 1].id;
  }

  // ── addLayer ──────────────────────────────────────────────────────

  describe('addLayer', () => {
    it('adds a layer to the document', () => {
      addLayer('BG');
      expect(getDoc().layers).toHaveLength(1);
      expect(getDoc().layers[0].name).toBe('BG');
      expect(getDoc().layers[0].type).toBe('image');
      expect(getDoc().layers[0].opacity).toBe(1);
      expect(getDoc().layers[0].visible).toBe(true);
    });

    it('adds at a specific index', () => {
      addLayer('A');
      addLayer('C');
      dispatch({ type: 'addLayer', payload: { name: 'B' }, index: 1 });
      expect(getDoc().layers.map((l) => l.name)).toEqual(['A', 'B', 'C']);
    });

    it('undo / redo', () => {
      addLayer('X');
      expect(getDoc().layers).toHaveLength(1);
      undo();
      expect(getDoc().layers).toHaveLength(0);
      redo();
      expect(getDoc().layers).toHaveLength(1);
      expect(getDoc().layers[0].name).toBe('X');
    });
  });

  // ── deleteLayer ────────────────────────────────────────────────────

  describe('deleteLayer', () => {
    it('removes a layer', () => {
      const id = addLayer('Gone');
      dispatch({ type: 'deleteLayer', layerId: id });
      expect(getDoc().layers).toHaveLength(0);
    });

    it('undo / redo', () => {
      const id = addLayer('Keep');
      dispatch({ type: 'deleteLayer', layerId: id });
      undo();
      expect(getDoc().layers).toHaveLength(1);
      expect(getDoc().layers[0].name).toBe('Keep');
      redo();
      expect(getDoc().layers).toHaveLength(0);
    });
  });

  // ── duplicateLayer ──────────────────────────────────────────────────

  describe('duplicateLayer', () => {
    it('duplicates with a new id and " copy" suffix', () => {
      const id = addLayer('Original');
      dispatch({ type: 'duplicateLayer', layerId: id });
      expect(getDoc().layers).toHaveLength(2);
      expect(getDoc().layers[1].name).toBe('Original copy');
      expect(getDoc().layers[1].id).not.toBe(id);
    });

    it('preserves layer properties', () => {
      const id = addLayer('Src');
      dispatch({ type: 'setOpacity', layerId: id, opacity: 0.4 });
      dispatch({
        type: 'setAdjustments',
        layerId: id,
        adjustments: { brightness: 25 },
      });
      dispatch({ type: 'duplicateLayer', layerId: id });
      const copy = getDoc().layers[1];
      expect(copy.opacity).toBeCloseTo(0.4);
      expect(copy.adjustments.brightness).toBe(25);
    });

    it('undo / redo', () => {
      const id = addLayer('Src');
      dispatch({ type: 'duplicateLayer', layerId: id });
      expect(getDoc().layers).toHaveLength(2);
      undo();
      expect(getDoc().layers).toHaveLength(1);
      redo();
      expect(getDoc().layers).toHaveLength(2);
    });
  });

  // ── reorderLayer ────────────────────────────────────────────────────

  describe('reorderLayer', () => {
    it('moves a layer to a new index', () => {
      addLayer('A');
      addLayer('B');
      const idC = addLayer('C');
      dispatch({ type: 'reorderLayer', layerId: idC, toIndex: 0 });
      expect(getDoc().layers.map((l) => l.name)).toEqual(['C', 'A', 'B']);
    });

    it('clamps out-of-bounds high index', () => {
      const idA = addLayer('A');
      addLayer('B');
      dispatch({ type: 'reorderLayer', layerId: idA, toIndex: 999 });
      expect(getDoc().layers.map((l) => l.name)).toEqual(['B', 'A']);
    });

    it('clamps out-of-bounds low index', () => {
      addLayer('A');
      const idB = addLayer('B');
      dispatch({ type: 'reorderLayer', layerId: idB, toIndex: -5 });
      expect(getDoc().layers.map((l) => l.name)).toEqual(['B', 'A']);
    });

    it('same-index is a no-op (no undo entry)', () => {
      const idA = addLayer('A');
      addLayer('B');
      const stackBefore = store.getState()._undoStack.length;
      dispatch({ type: 'reorderLayer', layerId: idA, toIndex: 0 });
      expect(store.getState()._undoStack.length).toBe(stackBefore);
    });

    it('single-layer document', () => {
      const id = addLayer('Solo');
      dispatch({ type: 'reorderLayer', layerId: id, toIndex: 0 });
      expect(getDoc().layers).toHaveLength(1);
    });

    it('undo / redo', () => {
      addLayer('A');
      addLayer('B');
      const idC = addLayer('C');
      dispatch({ type: 'reorderLayer', layerId: idC, toIndex: 0 });
      undo();
      expect(getDoc().layers.map((l) => l.name)).toEqual(['A', 'B', 'C']);
      redo();
      expect(getDoc().layers.map((l) => l.name)).toEqual(['C', 'A', 'B']);
    });
  });

  // ── renameLayer ──────────────────────────────────────────────────────

  describe('renameLayer', () => {
    it('renames a layer', () => {
      const id = addLayer('Old');
      dispatch({ type: 'renameLayer', layerId: id, name: 'New' });
      expect(getDoc().layers[0].name).toBe('New');
    });

    it('undo / redo', () => {
      const id = addLayer('Before');
      dispatch({ type: 'renameLayer', layerId: id, name: 'After' });
      undo();
      expect(getDoc().layers[0].name).toBe('Before');
      redo();
      expect(getDoc().layers[0].name).toBe('After');
    });
  });

  // ── setVisible ──────────────────────────────────────────────────────

  describe('setVisible', () => {
    it('toggles visibility', () => {
      const id = addLayer('V');
      dispatch({ type: 'setVisible', layerId: id, visible: false });
      expect(getDoc().layers[0].visible).toBe(false);
    });

    it('undo / redo', () => {
      const id = addLayer('V');
      dispatch({ type: 'setVisible', layerId: id, visible: false });
      undo();
      expect(getDoc().layers[0].visible).toBe(true);
      redo();
      expect(getDoc().layers[0].visible).toBe(false);
    });
  });

  // ── setLocked ────────────────────────────────────────────────────────

  describe('setLocked', () => {
    it('locks a layer', () => {
      const id = addLayer('L');
      dispatch({ type: 'setLocked', layerId: id, locked: true });
      expect(getDoc().layers[0].locked).toBe(true);
    });

    it('undo / redo', () => {
      const id = addLayer('L');
      dispatch({ type: 'setLocked', layerId: id, locked: true });
      undo();
      expect(getDoc().layers[0].locked).toBe(false);
      redo();
      expect(getDoc().layers[0].locked).toBe(true);
    });
  });

  // ── setOpacity ──────────────────────────────────────────────────────

  describe('setOpacity', () => {
    it('sets opacity', () => {
      const id = addLayer('O');
      dispatch({ type: 'setOpacity', layerId: id, opacity: 0.5 });
      expect(getDoc().layers[0].opacity).toBe(0.5);
    });

    it('clamps to [0, 1]', () => {
      const id = addLayer('O');
      dispatch({ type: 'setOpacity', layerId: id, opacity: 1.5 });
      expect(getDoc().layers[0].opacity).toBe(1);
      dispatch({ type: 'setOpacity', layerId: id, opacity: -0.5 });
      expect(getDoc().layers[0].opacity).toBe(0);
    });

    it('undo / redo', () => {
      const id = addLayer('O');
      dispatch({ type: 'setOpacity', layerId: id, opacity: 0.3 });
      undo();
      expect(getDoc().layers[0].opacity).toBe(1);
      redo();
      expect(getDoc().layers[0].opacity).toBeCloseTo(0.3);
    });
  });

  // ── setBlendMode ────────────────────────────────────────────────────

  describe('setBlendMode', () => {
    it('sets blend mode', () => {
      const id = addLayer('B');
      dispatch({ type: 'setBlendMode', layerId: id, blendMode: 'multiply' });
      expect(getDoc().layers[0].blendMode).toBe('multiply');
    });

    it('undo / redo', () => {
      const id = addLayer('B');
      dispatch({ type: 'setBlendMode', layerId: id, blendMode: 'screen' });
      undo();
      expect(getDoc().layers[0].blendMode).toBe('normal');
      redo();
      expect(getDoc().layers[0].blendMode).toBe('screen');
    });
  });

  // ── transformLayer ────────────────────────────────────────────────

  describe('transformLayer', () => {
    it('sets position and scale partially', () => {
      const id = addLayer('T');
      dispatch({
        type: 'transformLayer',
        layerId: id,
        x: 10,
        y: 20,
        scaleX: 2,
      });
      const l = getDoc().layers[0];
      expect(l.x).toBe(10);
      expect(l.y).toBe(20);
      expect(l.scaleX).toBe(2);
      expect(l.scaleY).toBe(1); // unchanged
    });

    it('undo / redo', () => {
      const id = addLayer('T');
      dispatch({ type: 'transformLayer', layerId: id, x: 100, y: 200 });
      undo();
      expect(getDoc().layers[0].x).toBe(0);
      expect(getDoc().layers[0].y).toBe(0);
      redo();
      expect(getDoc().layers[0].x).toBe(100);
      expect(getDoc().layers[0].y).toBe(200);
    });
  });

  // ── flipLayer ────────────────────────────────────────────────────────

  describe('flipLayer', () => {
    it('toggles flipX', () => {
      const id = addLayer('F');
      dispatch({ type: 'flipLayer', layerId: id, axis: 'x' });
      expect(getDoc().layers[0].flipX).toBe(true);
      dispatch({ type: 'flipLayer', layerId: id, axis: 'x' });
      expect(getDoc().layers[0].flipX).toBe(false);
    });

    it('toggles flipY', () => {
      const id = addLayer('F');
      dispatch({ type: 'flipLayer', layerId: id, axis: 'y' });
      expect(getDoc().layers[0].flipY).toBe(true);
    });

    it('undo / redo', () => {
      const id = addLayer('F');
      dispatch({ type: 'flipLayer', layerId: id, axis: 'x' });
      undo();
      expect(getDoc().layers[0].flipX).toBe(false);
      redo();
      expect(getDoc().layers[0].flipX).toBe(true);
    });
  });

  // ── rotateLayer90 ────────────────────────────────────────────────────

  describe('rotateLayer90', () => {
    it('rotates clockwise', () => {
      const id = addLayer('R');
      dispatch({ type: 'rotateLayer90', layerId: id, direction: 'cw' });
      expect(getDoc().layers[0].rotation).toBe(90);
    });

    it('rotates counter-clockwise from 0', () => {
      const id = addLayer('R');
      dispatch({ type: 'rotateLayer90', layerId: id, direction: 'ccw' });
      expect(getDoc().layers[0].rotation).toBe(270);
    });

    it('full 360 wraps to 0', () => {
      const id = addLayer('R');
      for (let i = 0; i < 4; i++) {
        dispatch({ type: 'rotateLayer90', layerId: id, direction: 'cw' });
      }
      expect(getDoc().layers[0].rotation).toBe(0);
    });

    it('undo / redo', () => {
      const id = addLayer('R');
      dispatch({ type: 'rotateLayer90', layerId: id, direction: 'cw' });
      undo();
      expect(getDoc().layers[0].rotation).toBe(0);
      redo();
      expect(getDoc().layers[0].rotation).toBe(90);
    });
  });

  // ── setAdjustments ──────────────────────────────────────────────────

  describe('setAdjustments', () => {
    it('merges adjustments without overwriting others', () => {
      const id = addLayer('A');
      dispatch({
        type: 'setAdjustments',
        layerId: id,
        adjustments: { brightness: 50, contrast: 20 },
      });
      expect(getDoc().layers[0].adjustments.brightness).toBe(50);
      expect(getDoc().layers[0].adjustments.contrast).toBe(20);
      expect(getDoc().layers[0].adjustments.saturation).toBe(0);
    });

    it('undo / redo', () => {
      const id = addLayer('A');
      dispatch({
        type: 'setAdjustments',
        layerId: id,
        adjustments: { brightness: 75 },
      });
      undo();
      expect(getDoc().layers[0].adjustments.brightness).toBe(0);
      redo();
      expect(getDoc().layers[0].adjustments.brightness).toBe(75);
    });
  });

  // ── resetAdjustments ────────────────────────────────────────────────

  describe('resetAdjustments', () => {
    it('resets all adjustments to defaults', () => {
      const id = addLayer('A');
      dispatch({
        type: 'setAdjustments',
        layerId: id,
        adjustments: { brightness: 50, contrast: 30, saturation: -10 },
      });
      dispatch({ type: 'resetAdjustments', layerId: id });
      expect(getDoc().layers[0].adjustments).toEqual(DEFAULT_ADJUSTMENTS);
    });

    it('undo / redo', () => {
      const id = addLayer('A');
      dispatch({
        type: 'setAdjustments',
        layerId: id,
        adjustments: { brightness: 50 },
      });
      dispatch({ type: 'resetAdjustments', layerId: id });
      undo();
      expect(getDoc().layers[0].adjustments.brightness).toBe(50);
      redo();
      expect(getDoc().layers[0].adjustments.brightness).toBe(0);
    });
  });

  // ── mergeDown ──────────────────────────────────────────────────────

  describe('mergeDown', () => {
    it('merges upper layer into the layer below', () => {
      addLayer('Lower');
      const upperId = addLayer('Upper');
      dispatch({ type: 'mergeDown', layerId: upperId });
      expect(getDoc().layers).toHaveLength(1);
      expect(getDoc().layers[0].name).toBe('Lower + Upper');
      expect(getDoc().layers[0].assetId).toMatch(/^merged-/);
      expect(getDoc().layers[0].opacity).toBe(1);
      expect(getDoc().layers[0].blendMode).toBe('normal');
    });

    it('throws when no layer below', () => {
      const id = addLayer('Solo');
      expect(() => dispatch({ type: 'mergeDown', layerId: id })).toThrow(
        'no layer below',
      );
    });

    it('undo / redo', () => {
      const lowerId = addLayer('Lo');
      const upperId = addLayer('Up');
      dispatch({ type: 'mergeDown', layerId: upperId });
      expect(getDoc().layers).toHaveLength(1);
      undo();
      expect(getDoc().layers).toHaveLength(2);
      expect(getDoc().layers[0].name).toBe('Lo');
      expect(getDoc().layers[1].name).toBe('Up');
      redo();
      expect(getDoc().layers).toHaveLength(1);
      expect(getDoc().layers[0].name).toBe('Lo + Up');
    });
  });

  // ── flatten ──────────────────────────────────────────────────────────

  describe('flatten', () => {
    it('flattens all layers into one', () => {
      addLayer('A');
      addLayer('B');
      addLayer('C');
      dispatch({ type: 'flatten' });
      expect(getDoc().layers).toHaveLength(1);
      expect(getDoc().layers[0].name).toBe('Flattened');
      expect(getDoc().layers[0].assetId).toMatch(/^flattened-/);
    });

    it('no-op on empty document', () => {
      dispatch({ type: 'flatten' });
      expect(getDoc().layers).toHaveLength(0);
    });

    it('undo / redo', () => {
      addLayer('A');
      addLayer('B');
      dispatch({ type: 'flatten' });
      expect(getDoc().layers).toHaveLength(1);
      undo();
      expect(getDoc().layers).toHaveLength(2);
      expect(getDoc().layers.map((l) => l.name)).toEqual(['A', 'B']);
      redo();
      expect(getDoc().layers).toHaveLength(1);
      expect(getDoc().layers[0].name).toBe('Flattened');
    });
  });

  // ── Gesture coalescing ──────────────────────────────────────────────

  describe('gesture coalescing', () => {
    it('50-step slider drag becomes one undo step', () => {
      const id = addLayer('Slider');
      dispatch({ type: 'setOpacity', layerId: id, opacity: 0 });
      // undoStack = [addLayer, setOpacity(0)] = 2
      expect(store.getState()._undoStack).toHaveLength(2);

      // Simulate 50-step slider drag from 0 → 1
      store.getState().beginGesture();
      for (let i = 1; i <= 50; i++) {
        dispatch({ type: 'setOpacity', layerId: id, opacity: i / 50 });
      }
      store.getState().endGesture();

      expect(getDoc().layers[0].opacity).toBe(1);
      // undoStack = [addLayer, setOpacity(0), gesture] = 3
      expect(store.getState()._undoStack).toHaveLength(3);

      // One undo reverts the whole 50-step gesture
      undo();
      expect(getDoc().layers[0].opacity).toBe(0);

      // Redo restores it
      redo();
      expect(getDoc().layers[0].opacity).toBe(1);
    });

    it('empty gesture adds no undo entry', () => {
      addLayer('X');
      const stackBefore = store.getState()._undoStack.length;
      store.getState().beginGesture();
      store.getState().endGesture();
      expect(store.getState()._undoStack.length).toBe(stackBefore);
    });
  });

  // ── History limit ──────────────────────────────────────────────────

  describe('history limit', () => {
    it('caps undo stack at 100', () => {
      const id = addLayer('L');
      // Already 1 entry (addLayer). Add 105 more renames.
      for (let i = 0; i < 105; i++) {
        dispatch({ type: 'renameLayer', layerId: id, name: `Name ${i}` });
      }
      // Total 106 dispatches, capped at 100
      expect(store.getState()._undoStack.length).toBe(100);

      // The oldest entries were pruned, but undo still works
      undo();
      expect(getDoc().layers[0].name).toBe('Name 103');
    });
  });

  // ── Serialize / load round-trip ───────────────────────────────────

  describe('serialize / load round-trip', () => {
    it('round-trips a document with layers and adjustments', () => {
      const id = addLayer('Photo');
      dispatch({ type: 'setOpacity', layerId: id, opacity: 0.7 });
      dispatch({ type: 'transformLayer', layerId: id, x: 42, y: 99 });
      dispatch({
        type: 'setAdjustments',
        layerId: id,
        adjustments: { brightness: 30 },
      });
      dispatch({ type: 'flipLayer', layerId: id, axis: 'x' });
      addLayer('Overlay');

      const json = serializeDocument(getDoc());
      const loaded = loadDocument(json);

      expect(loaded.id).toBe(getDoc().id);
      expect(loaded.width).toBe(getDoc().width);
      expect(loaded.height).toBe(getDoc().height);
      expect(loaded.background).toBe(getDoc().background);
      expect(loaded.layers).toHaveLength(2);

      const l0 = loaded.layers[0];
      expect(l0.name).toBe('Photo');
      expect(l0.opacity).toBeCloseTo(0.7);
      expect(l0.x).toBe(42);
      expect(l0.y).toBe(99);
      expect(l0.flipX).toBe(true);
      expect(l0.adjustments.brightness).toBe(30);
      expect(l0.adjustments.contrast).toBe(0);

      expect(loaded.layers[1].name).toBe('Overlay');
    });

    it('fills defaults for missing fields', () => {
      const minimal = {
        id: 'min',
        width: 800,
        height: 600,
        layers: [{ id: 'l1' }],
      };
      const loaded = loadDocument(minimal);
      expect(loaded.background).toBe('#ffffff');
      expect(loaded.layers[0].id).toBe('l1');
      expect(loaded.layers[0].visible).toBe(true);
      expect(loaded.layers[0].locked).toBe(false);
      expect(loaded.layers[0].opacity).toBe(1);
      expect(loaded.layers[0].blendMode).toBe('normal');
      expect(loaded.layers[0].adjustments).toEqual(DEFAULT_ADJUSTMENTS);
    });

    it('rejects invalid input', () => {
      expect(() => loadDocument(null)).toThrow('Invalid document JSON');
      expect(() => loadDocument('string')).toThrow('Invalid document JSON');
    });
  });

  // ── canUndo / canRedo ──────────────────────────────────────────────

  describe('canUndo / canRedo', () => {
    it('reports correctly', () => {
      expect(store.getState().canUndo()).toBe(false);
      expect(store.getState().canRedo()).toBe(false);

      addLayer('X');
      expect(store.getState().canUndo()).toBe(true);
      expect(store.getState().canRedo()).toBe(false);

      undo();
      expect(store.getState().canUndo()).toBe(false);
      expect(store.getState().canRedo()).toBe(true);
    });
  });

  // ── New action clears redo ──────────────────────────────────────────

  describe('new action clears redo', () => {
    it('dispatching after undo clears redo stack', () => {
      const id = addLayer('A');
      dispatch({ type: 'renameLayer', layerId: id, name: 'B' });
      undo();
      expect(store.getState().canRedo()).toBe(true);

      dispatch({ type: 'renameLayer', layerId: id, name: 'C' });
      expect(store.getState().canRedo()).toBe(false);
    });
  });
});
