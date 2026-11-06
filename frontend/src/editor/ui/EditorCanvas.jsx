import { useEffect, useRef, useState, useCallback } from 'react';
import { FabricAdapter } from '../engine/adapter.js';
import { ViewportController } from '../engine/viewport.js';
import { loadImageIntoEditor } from '../engine/imageLoader.js';

const PRESETS = [
  { label: 'Square (1024 × 1024)', width: 1024, height: 1024 },
  { label: 'Portrait (1024 × 1536)', width: 1024, height: 1536 },
  { label: 'Landscape (1536 × 1024)', width: 1536, height: 1024 },
];

/**
 * EditorCanvas — mounts a Fabric canvas, wires the adapter and viewport,
 * handles drag & drop and paste onto the canvas, and displays the empty state
 * when no layers are present.
 */
export function EditorCanvas({ store, assetStore, viewportRef, onZoomChange }) {
  const containerRef = useRef(null);
  const fileInputRef = useRef(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [layerCount, setLayerCount] = useState(
    store.getState().document.layers.length
  );
  const [docDimensions, setDocDimensions] = useState({
    width: store.getState().document.width,
    height: store.getState().document.height,
  });

  // Track layer count and document size (skip state updates if unchanged to prevent re-renders)
  useEffect(() => {
    const unsub = store.subscribe((state) => {
      setLayerCount((prev) => (prev === state.document.layers.length ? prev : state.document.layers.length));
      setDocDimensions((prev) => {
        if (prev.width === state.document.width && prev.height === state.document.height) {
          return prev;
        }
        return { width: state.document.width, height: state.document.height };
      });
    });
    return unsub;
  }, [store]);

  // Boot canvas & FabricAdapter
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const el = document.createElement('canvas');
    container.appendChild(el);

    const rect = container.getBoundingClientRect();
    const adapter = new FabricAdapter(el, store, assetStore);
    adapter.resize(rect.width, rect.height);

    const viewport = new ViewportController(adapter.canvas, onZoomChange);
    if (viewportRef) viewportRef.current = viewport;

    const doc = store.getState().document;
    viewport.zoomToFit(doc.width, doc.height);

    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      if (width > 0 && height > 0) {
        adapter.resize(width, height);
      }
    });
    ro.observe(container);

    return () => {
      ro.disconnect();
      viewport.dispose();
      adapter.dispose();
      if (el.parentNode) el.parentNode.removeChild(el);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Handle files (from input, drop, or paste)
  const handleFiles = useCallback(
    async (files) => {
      if (!files || files.length === 0) return;
      for (const file of files) {
        if (file.type.startsWith('image/')) {
          await loadImageIntoEditor(file, assetStore, store);
        }
      }
      // Re-fit canvas after adding first image
      const doc = store.getState().document;
      viewportRef.current?.zoomToFit(doc.width, doc.height);
    },
    [assetStore, store, viewportRef]
  );

  // Drag and Drop
  const handleDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    setIsDragOver(true);
  };

  const handleDragLeave = (e) => {
    if (e.currentTarget.contains(e.relatedTarget)) return;
    setIsDragOver(false);
  };

  const handleDrop = async (e) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      await handleFiles(e.dataTransfer.files);
    }
  };

  // Paste (Ctrl+V) listener
  useEffect(() => {
    const handlePaste = async (e) => {
      // Don't intercept if user is typing in an input/textarea
      const tag = document.activeElement?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea') return;

      const items = e.clipboardData?.items;
      if (!items) return;

      const imageFiles = [];
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.startsWith('image/')) {
          const file = items[i].getAsFile();
          if (file) imageFiles.push(file);
        }
      }

      if (imageFiles.length > 0) {
        e.preventDefault();
        await handleFiles(imageFiles);
      }
    };

    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [handleFiles]);

  // Set document preset
  const handleSetPreset = (w, h) => {
    store.getState().dispatch({
      type: 'setDocumentSize',
      width: w,
      height: h,
    });
    setTimeout(() => {
      viewportRef.current?.zoomToFit(w, h);
    }, 50);
  };

  return (
    <div
      ref={containerRef}
      className={`editor-canvas-wrap ${isDragOver ? 'editor-canvas-wrap--dragover' : ''}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="image/png,image/jpeg,image/webp"
        style={{ display: 'none' }}
        onChange={(e) => {
          if (e.target.files) handleFiles(e.target.files);
          e.target.value = '';
        }}
      />

      {/* Drag & drop overlay indicator */}
      {isDragOver && (
        <div className="editor-canvas-drop-hint">
          <div className="editor-canvas-drop-hint__box">
            <span>Drop images to add as layers</span>
          </div>
        </div>
      )}

      {/* Empty State when there are no layers */}
      {layerCount === 0 && (
        <div className="editor-canvas-empty-state">
          <div className="editor-canvas-empty-card">
            <div className="editor-canvas-empty-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="40" height="40">
                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12" />
              </svg>
            </div>
            <h2>No layers in document</h2>
            <p className="editor-canvas-empty-sub">
              Drag and drop images here, paste with <kbd>Ctrl+V</kbd>, or choose an image file.
            </p>

            <button
              type="button"
              className="editor-btn editor-btn--gold editor-btn--lg"
              onClick={() => fileInputRef.current?.click()}
            >
              Browse Image Files
            </button>

            <div className="editor-canvas-empty-presets">
              <span className="editor-canvas-empty-presets-label">Document Presets:</span>
              <div className="editor-canvas-empty-presets-btns">
                {PRESETS.map((p) => (
                  <button
                    key={p.label}
                    type="button"
                    className={`editor-btn ${
                      docDimensions.width === p.width && docDimensions.height === p.height
                        ? 'editor-btn--active'
                        : ''
                    }`}
                    onClick={() => handleSetPreset(p.width, p.height)}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
