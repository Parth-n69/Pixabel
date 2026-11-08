/**
 * FabricAdapter — renders the Document into a Fabric.js canvas
 * and dispatches user gestures back to the store.
 *
 * Fabric is only the VIEW. The Document (zustand store) is the
 * single source of truth.
 */
import { Canvas, FabricImage, Rect, Pattern, Point, filters } from 'fabric';

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
      backgroundColor: '#1a1a1e',
      controlsAboveOverlay: true,
      renderOnAddRemove: false,
      enableRetinaScaling: true,
      imageSmoothingEnabled: true,
    });

    this._initArtboard(store.getState().document);
    this._setupEvents();

    // Initial async layer load
    this._loadAllLayers(store.getState().document);

    // Subscribe to store changes
    this._unsubscribe = store.subscribe((state, prevState) => {
      // Session comparison takes precedence over live document
      if (state.isComparingSession !== prevState.isComparingSession) {
        if (state.isComparingSession) {
          if (this._canvas.getActiveObject()) {
            this._canvas.discardActiveObject();
          }
          this._syncLayers(state.initialSessionDoc || state.document, null);
        } else {
          this._syncLayers(state.document, state.comparingLayerId);
          this._syncSelection(state.selectedLayerId);
        }
        return;
      }

      if (state.isComparingSession) {
        return;
      }

      if (
        (state.document !== prevState.document || state.comparingLayerId !== prevState.comparingLayerId) &&
        !this._isUserTransforming
      ) {
        this._syncLayers(state.document, state.comparingLayerId);
      }
      if (state.selectedLayerId !== prevState.selectedLayerId) {
        this._syncSelection(state.selectedLayerId);
      }
    });
  }

  get canvas() {
    return this._canvas;
  }

  // ── Artboard (checkerboard + doc background) ──────────────

  _initArtboard(doc) {
    // Build a subtle dark luxury checkerboard tile for transparency
    const tile = document.createElement('canvas');
    tile.width = 24;
    tile.height = 24;
    const ctx = tile.getContext('2d');
    ctx.fillStyle = '#26262c';
    ctx.fillRect(0, 0, 24, 24);
    ctx.fillStyle = '#1e1e23';
    ctx.fillRect(0, 0, 12, 12);
    ctx.fillRect(12, 12, 12, 12);

    this._checkerRect = new Rect({
      originX: 'left',
      originY: 'top',
      left: 0,
      top: 0,
      width: doc.width,
      height: doc.height,
      fill: new Pattern({ source: tile, repeat: 'repeat' }),
      stroke: 'rgba(212, 175, 55, 0.35)',
      strokeWidth: 1,
      selectable: false,
      evented: false,
      hoverCursor: 'default',
    });

    const isTransparent = !doc.background || doc.background === 'transparent';
    this._bgRect = new Rect({
      originX: 'left',
      originY: 'top',
      left: 0,
      top: 0,
      width: doc.width,
      height: doc.height,
      fill: isTransparent ? 'transparent' : doc.background,
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
    // Defer state dispatch via rAF so the pointerup interaction paints immediately (< 16ms INP)
    this._canvas.on('object:modified', (e) => {
      const obj = e.target;
      const layerId = obj?._layerId;
      if (!layerId) return;

      const left = obj.left;
      const top = obj.top;
      const scaleX = Math.abs(obj.scaleX);
      const scaleY = Math.abs(obj.scaleY);
      const rotation = ((obj.angle % 360) + 360) % 360;

      requestAnimationFrame(() => {
        this._store.getState().dispatch({
          type: 'transformLayer',
          layerId,
          x: left,
          y: top,
          scaleX,
          scaleY,
          rotation,
        });

        this._isUserTransforming = false;
        this._store.getState().endGesture();
      });
    });

    // Safety: if mouse up without object:modified, close gesture
    this._canvas.on('mouse:up', () => {
      if (this._isUserTransforming) {
        requestAnimationFrame(() => {
          this._isUserTransforming = false;
          this._store.getState().endGesture();
        });
      }
    });

    // Selection events from canvas to store (deferred so control handle rendering is instantaneous)
    this._canvas.on('selection:created', (e) => {
      const target = e.selected?.[0] || e.target;
      if (target?._layerId) {
        requestAnimationFrame(() => {
          this._store.getState().setSelectedLayerId(target._layerId);
        });
      }
    });
    this._canvas.on('selection:updated', (e) => {
      const target = e.selected?.[0] || e.target;
      if (target?._layerId) {
        requestAnimationFrame(() => {
          this._store.getState().setSelectedLayerId(target._layerId);
        });
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
      img.set({
        originX: 'left',
        originY: 'top',
        objectCaching: false,
      });
      img.setCoords();
      this._objectMap.set(layer.id, img);
      this._canvas.add(img);
    } finally {
      this._loading.delete(layer.id);
    }
  }

  // ── Sync document → Fabric ────────────────────────────────

  _syncLayers(doc, comparingLayerId = null) {
    const liveDoc = this._store.getState().document;
    const liveIds = new Set(liveDoc.layers.map((l) => l.id));
    const activeDocIds = new Set(doc.layers.map((l) => l.id));

    // Remove fabric objects whose layers were deleted from the document
    for (const [id, obj] of this._objectMap) {
      if (!liveIds.has(id)) {
        this._canvas.remove(obj);
        this._objectMap.delete(id);
      } else if (!activeDocIds.has(id)) {
        // Hide object if it is temporarily omitted from the active view (e.g. session comparison baseline)
        obj.set({ visible: false, selectable: false, evented: false });
        obj.setCoords();
      }
    }

    // Update or create each layer
    for (let i = 0; i < doc.layers.length; i++) {
      const layer = doc.layers[i];
      let obj = this._objectMap.get(layer.id);

      // Need to load a new layer image
      if (!obj && layer.assetId && !this._loading.has(layer.id)) {
        this._ensureLayerObject(layer).then(() => {
          this._syncLayers(this._store.getState().document, this._store.getState().comparingLayerId);
        });
        continue;
      }
      if (!obj) continue;

      obj.set({
        originX: 'left',
        originY: 'top',
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
      obj.setCoords();

      // Sync adjustments to Fabric filters (bypass if currently being compared to original)
      const isComparing = comparingLayerId === layer.id;
      const adj = isComparing ? {} : (layer.adjustments || {});
      const adjKey = `${adj.brightness || 0}|${adj.contrast || 0}|${adj.saturation || 0}|${adj.blur || 0}|${Boolean(adj.grayscale)}|${Boolean(adj.sepia)}|${Boolean(adj.invert)}|${isComparing}`;
      if (obj._lastAdjKey !== adjKey) {
        obj._lastAdjKey = adjKey;
        const filterList = [];
        if (!isComparing) {
          if (adj.brightness) {
            filterList.push(new filters.Brightness({ brightness: adj.brightness / 100 }));
          }
          if (adj.contrast) {
            filterList.push(new filters.Contrast({ contrast: adj.contrast / 100 }));
          }
          if (adj.saturation) {
            filterList.push(new filters.Saturation({ saturation: adj.saturation / 100 }));
          }
          if (adj.blur) {
            filterList.push(new filters.Blur({ blur: Math.min(1, Math.max(0, adj.blur / 100)) }));
          }
          if (adj.grayscale) {
            filterList.push(new filters.Grayscale());
          }
          if (adj.sepia) {
            filterList.push(new filters.Sepia());
          }
          if (adj.invert) {
            filterList.push(new filters.Invert());
          }
        }
        obj.filters = filterList;
        obj.applyFilters();
      }

      // Z-order: checkerRect(0), bgRect(1), then layers
      const targetIndex = i + 2;
      const objs = this._canvas.getObjects();
      if (objs[targetIndex] !== obj) {
        this._canvas.moveObjectTo(obj, targetIndex);
      }
    }

    // Update artboard size and background if changed
    if (this._checkerRect) {
      this._checkerRect.set({ width: doc.width, height: doc.height });
      this._checkerRect.setCoords();
    }
    if (this._bgRect) {
      const isTransparent = !doc.background || doc.background === 'transparent';
      this._bgRect.set({
        width: doc.width,
        height: doc.height,
        fill: isTransparent ? 'transparent' : doc.background,
      });
      this._bgRect.setCoords();
    }

    this._canvas.requestRenderAll();
  }

  _syncSelection(selectedId) {
    if (!selectedId) {
      if (this._canvas.getActiveObject()) {
        this._canvas.discardActiveObject();
        this._canvas.requestRenderAll();
      }
      return;
    }
    const obj = this._objectMap.get(selectedId);
    if (obj && obj.selectable && this._canvas.getActiveObject() !== obj) {
      this._canvas.setActiveObject(obj);
      this._canvas.requestRenderAll();
    }
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

