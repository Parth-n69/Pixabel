import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  SCHEMA_VERSION,
  DEFAULT_ADJUSTMENTS,
  DEFAULT_TEXT_LAYER,
  DEFAULT_SHAPE_LAYER,
  DEFAULT_PAINT_LAYER,
  DEFAULT_FILL_LAYER,
  createDefaultDocument,
  createDefaultLayer,
  migrate,
} from '../document/schema.js';
import { serializeDocument, loadDocument } from '../document/serialize.js';
import { createEditorStore, commitPixelEdit } from '../document/store.js';
import { AssetStore, getReferencedAssetIds } from '../engine/assetStore.js';

describe('Phase B Step 2: Document Upgrade', () => {
  // ──────────────────────────────────────────────────────────────────────────
  // 1. MIGRATION TESTS
  // ──────────────────────────────────────────────────────────────────────────
  describe('Document Migration to schemaVersion: 2', () => {
    it('migrates unversioned document to schemaVersion 2', () => {
      const v1Doc = {
        id: 'doc-v1',
        width: 1920,
        height: 1080,
        background: '#121212',
        layers: [
          {
            id: 'l1',
            name: 'Photo',
            assetId: 'asset-1',
            opacity: 0.8,
            adjustments: { brightness: 10 },
          },
        ],
      };

      const migrated = migrate(v1Doc);

      expect(migrated.schemaVersion).toBe(2);
      expect(migrated.id).toBe('doc-v1');
      expect(migrated.width).toBe(1920);
      expect(migrated.height).toBe(1080);
      expect(migrated.background).toBe('#121212');

      expect(migrated.layers).toHaveLength(1);
      const layer = migrated.layers[0];
      expect(layer.id).toBe('l1');
      expect(layer.type).toBe('image');
      expect(layer.opacity).toBe(0.8);
      expect(layer.mask).toBeNull();
      expect(layer.clipToBelow).toBe(false);
      expect(layer.adjustments.brightness).toBe(10);
      expect(layer.adjustments.contrast).toBe(0);
      expect(layer.adjustments.blur).toBe(0);
    });

    it('migrates older drafts missing mask, clipToBelow and full adjustments', () => {
      const draftJson = {
        id: 'draft-doc',
        layers: [
          {
            id: 'layer-old',
            name: 'Old Layer',
          },
        ],
      };

      const loaded = loadDocument(draftJson);
      expect(loaded.schemaVersion).toBe(2);
      expect(loaded.layers[0].mask).toBeNull();
      expect(loaded.layers[0].clipToBelow).toBe(false);
      expect(loaded.layers[0].type).toBe('image');
      expect(loaded.layers[0].adjustments).toMatchObject(DEFAULT_ADJUSTMENTS);
    });

    it('clamps oversized documents to max 4096px longest side', () => {
      const hugeDoc = {
        id: 'huge',
        width: 6000,
        height: 3000,
        layers: [],
      };

      const migrated = migrate(hugeDoc);
      expect(Math.max(migrated.width, migrated.height)).toBe(4096);
      expect(migrated.width).toBe(4096);
      expect(migrated.height).toBe(2048);
    });

    it('handles null, undefined or empty objects gracefully', () => {
      const emptyMigrated = migrate(null);
      expect(emptyMigrated.schemaVersion).toBe(2);
      expect(emptyMigrated.layers).toEqual([]);
      expect(emptyMigrated.width).toBe(1920);
      expect(emptyMigrated.height).toBe(1080);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 2. NEW LAYER TYPES ROUND-TRIP
  // ──────────────────────────────────────────────────────────────────────────
  describe('New Layer Types & Round-Trip Serialization', () => {
    it('creates all 5 layer types with required properties', () => {
      // 1. image
      const imageLayer = createDefaultLayer({ type: 'image', assetId: 'img-1' });
      expect(imageLayer.type).toBe('image');
      expect(imageLayer.assetId).toBe('img-1');
      expect(imageLayer.mask).toBeNull();
      expect(imageLayer.clipToBelow).toBe(false);

      // 2. text
      const textLayer = createDefaultLayer({
        type: 'text',
        text: 'Pixabel Luxury',
        fontFamily: 'Cinzel',
        fontSize: 64,
        fontWeight: 'bold',
        fontStyle: 'italic',
        fill: '#d4af37',
        align: 'center',
        lineHeight: 1.4,
        letterSpacing: 2,
        stroke: '#000000',
        strokeWidth: 1,
        shadow: { color: 'rgba(0,0,0,0.5)', blur: 4, offsetX: 2, offsetY: 2 },
      });
      expect(textLayer.type).toBe('text');
      expect(textLayer.text).toBe('Pixabel Luxury');
      expect(textLayer.fontFamily).toBe('Cinzel');
      expect(textLayer.fontSize).toBe(64);
      expect(textLayer.fontWeight).toBe('bold');
      expect(textLayer.fontStyle).toBe('italic');
      expect(textLayer.fill).toBe('#d4af37');
      expect(textLayer.align).toBe('center');
      expect(textLayer.lineHeight).toBe(1.4);
      expect(textLayer.letterSpacing).toBe(2);
      expect(textLayer.stroke).toBe('#000000');
      expect(textLayer.strokeWidth).toBe(1);
      expect(textLayer.shadow).toEqual({
        color: 'rgba(0,0,0,0.5)',
        blur: 4,
        offsetX: 2,
        offsetY: 2,
      });
      expect(textLayer.mask).toBeNull();
      expect(textLayer.clipToBelow).toBe(false);

      // 3. shape
      const shapeLayer = createDefaultLayer({
        type: 'shape',
        shape: 'star',
        width: 300,
        height: 300,
        fill: '#d4af37',
        stroke: '#ffffff',
        strokeWidth: 2,
        cornerRadius: 8,
        points: 5,
        arrowhead: 'none',
      });
      expect(shapeLayer.type).toBe('shape');
      expect(shapeLayer.shape).toBe('star');
      expect(shapeLayer.shapeKind).toBe('star');
      expect(shapeLayer.width).toBe(300);
      expect(shapeLayer.height).toBe(300);
      expect(shapeLayer.fill).toBe('#d4af37');
      expect(shapeLayer.stroke).toBe('#ffffff');
      expect(shapeLayer.strokeWidth).toBe(2);
      expect(shapeLayer.cornerRadius).toBe(8);
      expect(shapeLayer.points).toBe(5);
      expect(shapeLayer.sides).toBe(5);
      expect(shapeLayer.arrowhead).toBe('none');

      // 4. paint
      const paintLayer = createDefaultLayer({
        type: 'paint',
        assetId: 'paint-bitmap-1',
      });
      expect(paintLayer.type).toBe('paint');
      expect(paintLayer.assetId).toBe('paint-bitmap-1');

      // 5. fill
      const fillLayer = createDefaultLayer({
        type: 'fill',
        fill: {
          type: 'linear',
          coords: { x1: 0, y1: 0, x2: 1, y2: 1 },
          colorStops: [
            { offset: 0, color: '#000000' },
            { offset: 1, color: '#1a1a24' },
          ],
        },
      });
      expect(fillLayer.type).toBe('fill');
      expect(fillLayer.fill).toEqual({
        type: 'linear',
        coords: { x1: 0, y1: 0, x2: 1, y2: 1 },
        colorStops: [
          { offset: 0, color: '#000000' },
          { offset: 1, color: '#1a1a24' },
        ],
      });
    });

    it('round-trips all 5 layer types via serializeDocument and loadDocument', () => {
      const doc = createDefaultDocument({ id: 'multi-type-doc' });
      doc.layers.push(
        createDefaultLayer({ type: 'image', assetId: 'img-asset' }),
        createDefaultLayer({
          type: 'text',
          text: 'Title',
          fontFamily: 'Inter',
          fontSize: 32,
          fontWeight: 600,
          fontStyle: 'normal',
          fill: '#fff',
          align: 'right',
          lineHeight: 1.1,
          letterSpacing: 1,
          stroke: '#333',
          strokeWidth: 2,
          shadow: { color: '#000', blur: 5, offsetX: 1, offsetY: 1 },
          mask: { assetId: 'mask-text', enabled: true, inverted: false },
          clipToBelow: true,
        }),
        createDefaultLayer({
          type: 'shape',
          shape: 'arrow',
          width: 150,
          height: 50,
          fill: 'gold',
          stroke: 'black',
          strokeWidth: 3,
          cornerRadius: 0,
          points: 2,
          arrowhead: 'end',
        }),
        createDefaultLayer({ type: 'paint', assetId: 'artboard-paint-1' }),
        createDefaultLayer({ type: 'fill', fill: '#0a0a0f' }),
      );

      const serialized = serializeDocument(doc);
      const loaded = loadDocument(serialized);

      expect(loaded.schemaVersion).toBe(2);
      expect(loaded.layers).toHaveLength(5);
      expect(loaded.layers.map((l) => l.type)).toEqual([
        'image',
        'text',
        'shape',
        'paint',
        'fill',
      ]);

      // Check text layer round-trip
      const textL = loaded.layers[1];
      expect(textL.text).toBe('Title');
      expect(textL.align).toBe('right');
      expect(textL.stroke).toBe('#333');
      expect(textL.mask).toEqual({
        assetId: 'mask-text',
        enabled: true,
        inverted: false,
      });
      expect(textL.clipToBelow).toBe(true);

      // Check shape layer round-trip
      const shapeL = loaded.layers[2];
      expect(shapeL.shape).toBe('arrow');
      expect(shapeL.shapeKind).toBe('arrow');
      expect(shapeL.arrowhead).toBe('end');

      // Check paint layer round-trip
      expect(loaded.layers[3].assetId).toBe('artboard-paint-1');

      // Check fill layer round-trip
      expect(loaded.layers[4].fill).toBe('#0a0a0f');
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 3. ASSETSTORE REFERENCE COUNTING & GARBAGE COLLECTION
  // ──────────────────────────────────────────────────────────────────────────
  describe('AssetStore Reference Counting and Garbage Collection', () => {
    let assetStore;

    beforeEach(() => {
      assetStore = new AssetStore();
    });

    it('assets are immutable versions (re-adding preserves original entry)', () => {
      const blob1 = new Blob(['version-1'], { type: 'image/png' });
      const blob2 = new Blob(['version-2'], { type: 'image/png' });

      const url1 = assetStore.add('asset-v1', blob1);
      const url2 = assetStore.add('asset-v1', blob2);

      expect(url1).toBe(url2);
      expect(assetStore.getBlob('asset-v1')).toBe(blob1);
    });

    it('tracks ref counts with retain and release', () => {
      const blob = new Blob(['data'], { type: 'image/png' });
      assetStore.add('res-1', blob, { refCount: 1 });

      expect(assetStore.getRefCount('res-1')).toBe(1);
      expect(assetStore.retain('res-1')).toBe(2);
      expect(assetStore.release('res-1')).toBe(1);
      expect(assetStore.release('res-1')).toBe(0);
      expect(assetStore.release('res-1')).toBe(0); // clamped to 0
    });

    it('collects unreferenced assets not in document or history', () => {
      const blobA = new Blob(['A'], { type: 'image/png' });
      const blobB = new Blob(['B'], { type: 'image/png' });
      const blobC = new Blob(['C'], { type: 'image/png' });

      assetStore.add('asset-A', blobA);
      assetStore.add('asset-B', blobB);
      assetStore.add('asset-C', blobC);

      const store = createEditorStore(
        createDefaultDocument({
          layers: [createDefaultLayer({ id: 'l1', assetId: 'asset-A' })],
        }),
        assetStore,
      );

      // asset-A is in document, B and C are not
      const collected = assetStore.collectGarbage(store);
      expect(collected.sort()).toEqual(['asset-B', 'asset-C'].sort());
      expect(assetStore.has('asset-A')).toBe(true);
      expect(assetStore.has('asset-B')).toBe(false);
      expect(assetStore.has('asset-C')).toBe(false);
    });

    it('protects assets referenced in undo or redo stacks from GC', () => {
      const blob1 = new Blob(['1'], { type: 'image/png' });
      const blob2 = new Blob(['2'], { type: 'image/png' });
      const blob3 = new Blob(['3'], { type: 'image/png' });

      assetStore.add('asset-1', blob1);
      assetStore.add('asset-2', blob2);
      assetStore.add('asset-3', blob3);

      const store = createEditorStore(
        createDefaultDocument({
          layers: [createDefaultLayer({ id: 'l1', assetId: 'asset-1' })],
        }),
        assetStore,
      );

      // Pixel edit: commits asset-2
      store.getState().dispatch({
        type: 'setLayerAsset',
        layerId: 'l1',
        assetId: 'asset-2',
      });

      // At this point:
      // Document has asset-2
      // Undo stack has step with asset-1 in inversePatches
      // Asset-3 is orphaned

      let collected = assetStore.collectGarbage(store);
      expect(collected).toEqual(['asset-3']);
      expect(assetStore.has('asset-1')).toBe(true);
      expect(assetStore.has('asset-2')).toBe(true);
      expect(assetStore.has('asset-3')).toBe(false);

      // Undo: Document has asset-1, redo stack has asset-2
      store.getState().undo();
      expect(store.getState().document.layers[0].assetId).toBe('asset-1');

      collected = assetStore.collectGarbage(store);
      expect(collected).toEqual([]); // Neither collected because asset-2 is in redo stack!
      expect(assetStore.has('asset-1')).toBe(true);
      expect(assetStore.has('asset-2')).toBe(true);

      // New action clears redo stack!
      const blob4 = new Blob(['4'], { type: 'image/png' });
      assetStore.add('asset-4', blob4);
      store.getState().dispatch({
        type: 'setLayerAsset',
        layerId: 'l1',
        assetId: 'asset-4',
      });

      // Now redo stack is gone, so asset-2 is completely unreferenced
      collected = assetStore.collectGarbage(store);
      expect(collected).toContain('asset-2');
      expect(assetStore.has('asset-2')).toBe(false);
      expect(assetStore.has('asset-1')).toBe(true);
      expect(assetStore.has('asset-4')).toBe(true);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 4. PIXEL HISTORY RULE, LRU BITMAPS & MEMORY CAP
  // ──────────────────────────────────────────────────────────────────────────
  describe('Pixel History Rule, Bitmaps LRU, & Memory Cap', () => {
    let assetStore;
    let store;

    beforeEach(() => {
      assetStore = new AssetStore();
      store = createEditorStore(
        createDefaultDocument({
          layers: [createDefaultLayer({ id: 'l1', assetId: 'base-asset' })],
        }),
        assetStore,
      );
    });

    it('pixel edit commits a NEW asset and dispatches setLayerAsset as ONE history step', () => {
      const editBlob = new Blob(['new-pixel-data'], { type: 'image/png' });
      const { assetId } = commitPixelEdit(store, assetStore, 'l1', editBlob);

      expect(store.getState().document.layers[0].assetId).toBe(assetId);
      expect(store.getState()._undoStack).toHaveLength(1);

      // Undo restores original asset
      store.getState().undo();
      expect(store.getState().document.layers[0].assetId).toBe('base-asset');

      // Redo restores new asset
      store.getState().redo();
      expect(store.getState().document.layers[0].assetId).toBe(assetId);
    });

    it('keeps up to 20 most recent ImageBitmaps in memory, older reload from Blobs', async () => {
      // Create mock bitmaps with close() spies
      const closedBitmaps = [];
      const createMockBitmap = (id) => ({
        id,
        width: 100,
        height: 100,
        close: vi.fn(() => closedBitmaps.push(id)),
      });

      // Add 25 asset versions with bitmaps
      for (let i = 1; i <= 25; i++) {
        const id = `asset-${i}`;
        const blob = new Blob([`bytes-${i}`], { type: 'image/png' });
        assetStore.add(id, blob, { bitmap: createMockBitmap(id) });
      }

      // Max cached bitmap count must be exactly 20
      expect(assetStore.cachedBitmapCount).toBe(20);

      // Oldest 5 bitmaps (1 to 5) should have had their bitmap.close() called and evicted
      expect(closedBitmaps).toEqual([
        'asset-1',
        'asset-2',
        'asset-3',
        'asset-4',
        'asset-5',
      ]);
      expect(assetStore.hasBitmap('asset-1')).toBe(false);
      expect(assetStore.hasBitmap('asset-5')).toBe(false);
      expect(assetStore.hasBitmap('asset-6')).toBe(true);
      expect(assetStore.hasBitmap('asset-25')).toBe(true);

      // Blob is still preserved in store for evicted assets
      expect(assetStore.getBlob('asset-1')).not.toBeNull();
    });

    it('caps pixel-history memory at cap (~200MB threshold) and drops oldest steps with notice', () => {
      const notices = [];
      const limitedStore = createEditorStore(
        createDefaultDocument({
          layers: [createDefaultLayer({ id: 'paint-l', assetId: 'init' })],
        }),
        {
          assetStore,
          maxPixelMemoryBytes: 50 * 1024 * 1024, // 50 MB cap for testing
          onNotice: (n) => notices.push(n),
        },
      );

      // Commit 4 edits of 20 MB each -> total would be 80 MB > 50 MB
      const stepBytes = 20 * 1024 * 1024; // 20 MB per step

      for (let i = 1; i <= 4; i++) {
        const id = `paint-step-${i}`;
        const blob = new Blob([new Uint8Array(100)]);
        assetStore.add(id, blob, { byteSize: stepBytes });
        limitedStore.getState().dispatch({
          type: 'setLayerAsset',
          layerId: 'paint-l',
          assetId: id,
          byteSize: stepBytes,
        });
      }

      // Stack must have dropped the oldest step(s) so total memory <= 50MB (max 2 steps of 20MB)
      const stack = limitedStore.getState()._undoStack;
      expect(stack.length).toBeLessThanOrEqual(2);

      // A small notice was recorded
      expect(notices.length).toBeGreaterThan(0);
      expect(notices[0].message).toContain('Pixel history limit reached');
      expect(limitedStore.getState().lastNotice).not.toBeNull();
      expect(limitedStore.getState().lastNotice.message).toContain('Pixel history limit reached');
    });
  });
});
