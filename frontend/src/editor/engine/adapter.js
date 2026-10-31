/**
 * FabricAdapter — renders the Document into a Fabric.js canvas
 * and dispatches user gestures back to the store.
 *
 * Fabric is only the VIEW. The Document (zustand store) is the
 * single source of truth.
 */
import { Canvas, FabricImage, Rect, Pattern, Point } from 'fabric';

export class FabricAdapter {
  /**
   * @param {HTMLCanvasElement} canvasEl
   * @param {import('zustand').StoreApi} store
   * @param {import('./assetStore.js').AssetStore} assetStore
   */
  constructor(canvasEl, store, assetStore) {
    this._store = store;
    this._assetStore = assetStore;
    /** @type {Map<string, FabricImage>} layerId → fabric object */
    this._objectMap = new Map();
    this._isUserTransforming = false;
    this._checkerRect = null;
    this._bgRect = null;
    this._loading = new Set();

    this._canvas = new Canvas(canvasEl, {
      preserveObjectStacking: true,
      selection: false,
      backgroundColor: 'var(--surface, #111113)',
      controlsAboveOverlay: true,
    });

    // Dark canvas background (editor pasteboard)
    this._canvas.backgroundColor = '#1a1a1e';

    this._initArtboard(store.getState().document);
    this._setupEvents();

    // Initial async layer load
    this._loadAllLayers(store.getState().document);

    // Subscribe to store changes
    this._unsubscribe = store.subscribe((state, prevState) => {
      if (state.document !== prevState.document && !this._isUserTransforming) {
        this._syncLayers(state.document);
      }
    });
  }

  get canvas() {
    return this._canvas;
  }

  // ── Artboard (checkerboard + doc background) ──────────────

  _initArtboard(doc) {
    // Build a tiny checkerboard tile
    const tile = document.createElement('canvas');
    tile.width = 20;
    tile.height = 20;
    const ctx = tile.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, 20, 20);
    ctx.fillStyle = '#e0e0e0';
    ctx.fillRect(0, 0, 10, 10);
    ctx.fillRect(10, 10, 10, 10);

    this._checkerRect = new Rect({
      left: 0,
      top: 0,
      width: doc.width,
      height: doc.height,
      fill: new Pattern({ source: tile, repeat: 'repeat' }),
      selectable: false,
      evented: false,
      hoverCursor: 'default',
    });

    this._bgRect = new Rect({
      left: 0,
      top: 0,
      width: doc.width,
      height: doc.height,
      fill: doc.background || '#ffffff',
      selectable: false,
      evented: false,
      hoverCursor: 'default',
    });

    this._canvas.add(this._checkerRect);
    this._canvas.add(this._bgRect);
  }

  // ── Event wiring ──────────────────────────────────────────

  _setupEvents() {
    // Start of a user transform gesture
    this._canvas.on('object:moving', () => this._ensureGesture());
    this._canvas.on('object:scaling', () => this._ensureGesture());
    this._canvas.on('object:rotating', () => this._ensureGesture());

    // End of transform — dispatch final state, close gesture
    this._canvas.on('object:modified', (e) => {
      const obj = e.target;
      const layerId = obj?._layerId;
      if (!layerId) return;

      // Dispatch the final transform
      this._store.getState().dispatch({
        type: 'transformLayer',
        layerId,
        x: obj.left,
        y: obj.top,
        scaleX: Math.abs(obj.scaleX),
        scaleY: Math.abs(obj.scaleY),
        rotation: ((obj.angle % 360) + 360) % 360,
      });

      // Close the gesture → one undo step
      this._isUserTransforming = false;
      this._store.getState().endGesture();
    });

    // Safety: if mouse up without object:modified, close gesture
    this._canvas.on('mouse:up', () => {
      if (this._isUserTransforming) {
        this._isUserTransforming = false;
        this._store.getState().endGesture();
      }
    });
  }

  _ensureGesture() {
    if (!this._isUserTransforming) {
      this._isUserTransforming = true;
      this._store.getState().beginGesture();
    }
  }

  // ── Layer loading ─────────────────────────────────────────

  async _loadAllLayers(doc) {
    for (const layer of doc.layers) {
      await this._ensureLayerObject(layer);
    }
    this._syncLayers(doc);
  }

  async _ensureLayerObject(layer) {
    if (this._objectMap.has(layer.id) || this._loading.has(layer.id)) return;
    if (!layer.assetId) return;
    const url = this._assetStore.getUrl(layer.assetId);
    if (!url) return;

    this._loading.add(layer.id);
    try {
      const img = await FabricImage.fromURL(url);
      img._layerId = layer.id;
      this._objectMap.set(layer.id, img);
      this._canvas.add(img);
    } finally {
      this._loading.delete(layer.id);
    }
  }

  // ── Sync document → Fabric ────────────────────────────────

  _syncLayers(doc) {
    const docIds = new Set(doc.layers.map((l) => l.id));

    // Remove fabric objects whose layers were deleted
    for (const [id, obj] of this._objectMap) {
      if (!docIds.has(id)) {
        this._canvas.remove(obj);
        this._objectMap.delete(id);
      }
    }

    // Update or create each layer
    for (let i = 0; i < doc.layers.length; i++) {
      const layer = doc.layers[i];
      let obj = this._objectMap.get(layer.id);

      // Need to load a new layer image
      if (!obj && layer.assetId && !this._loading.has(layer.id)) {
        this._ensureLayerObject(layer).then(() => {
          this._syncLayers(this._store.getState().document);
        });
        continue;
      }
      if (!obj) continue;

      obj.set({
        left: layer.x,
        top: layer.y,
        scaleX: layer.scaleX,
        scaleY: layer.scaleY,
        angle: layer.rotation,
        flipX: layer.flipX,
        flipY: layer.flipY,
        opacity: layer.opacity,
        visible: layer.visible,
        selectable: !layer.locked,
        evented: !layer.locked,
        globalCompositeOperation:
          layer.blendMode === 'normal' ? 'source-over' : layer.blendMode,
      });

      // Z-order: checkerRect(0), bgRect(1), then layers
      this._canvas.moveObjectTo(obj, i + 2);
    }

    // Update artboard background if changed
    if (this._bgRect) {
      this._bgRect.set({ fill: doc.background || '#ffffff' });
    }

    this._canvas.requestRenderAll();
  }

  // ── Public helpers ────────────────────────────────────────

  resize(width, height) {
    this._canvas.setDimensions({ width, height });
    this._canvas.requestRenderAll();
  }

  dispose() {
    this._unsubscribe?.();
    this._canvas.dispose();
    this._objectMap.clear();
  }
}

