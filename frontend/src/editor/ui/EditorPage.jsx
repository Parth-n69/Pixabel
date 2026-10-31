import { useEffect, useRef, useState, useCallback } from 'react';
import { createEditorStore } from '../document/store.js';
import { createDefaultDocument, createDefaultLayer } from '../document/schema.js';
import { AssetStore } from '../engine/assetStore.js';
import { EditorCanvas } from './EditorCanvas.jsx';
import { EditorToolbar } from './EditorToolbar.jsx';
import { ZoomBar } from './ZoomBar.jsx';
import './editor.css';

/**
 * EditorPage — top-level editor route.
 * Creates the document store and asset store, loads a test image,
 * and wires the canvas, toolbar, and zoom bar together.
 */
export function EditorPage() {
  const storeRef = useRef(null);
  const assetStoreRef = useRef(null);
  const viewportRef = useRef(null);
  const [ready, setReady] = useState(false);
  const [zoom, setZoom] = useState(1);

  const handleZoomChange = useCallback((z) => setZoom(z), []);

  useEffect(() => {
    const assetStore = new AssetStore();
    assetStoreRef.current = assetStore;

    // Generate a colourful test image
    const testCanvas = document.createElement('canvas');
    testCanvas.width = 800;
    testCanvas.height = 600;
    const ctx = testCanvas.getContext('2d');

    // Gradient background
    const grad = ctx.createLinearGradient(0, 0, 800, 600);
    grad.addColorStop(0, '#ff6b6b');
    grad.addColorStop(0.33, '#d4af37');
    grad.addColorStop(0.66, '#4ecdc4');
    grad.addColorStop(1, '#45b7d1');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 800, 600);

    // Decorative circles
    for (let i = 0; i < 6; i++) {
      ctx.beginPath();
      ctx.arc(130 + i * 110, 300, 40, 0, Math.PI * 2);
      ctx.fillStyle = `hsla(${i * 60}, 70%, 65%, 0.6)`;
      ctx.fill();
    }

    // Label
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.font = 'bold 40px Inter, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Pixabel Test Image', 400, 180);
    ctx.font = '20px Inter, system-ui, sans-serif';
    ctx.fillText('Move · Scale · Rotate · Undo', 400, 480);

    testCanvas.toBlob((blob) => {
      const assetId = 'test-image-1';
      assetStore.add(assetId, blob);

      const doc = createDefaultDocument({
        id: 'editor-doc',
        width: 800,
        height: 600,
        layers: [
          createDefaultLayer({
            name: 'Test Image',
            assetId,
          }),
        ],
      });

      storeRef.current = createEditorStore(doc);
      setReady(true);
    });

    return () => assetStore.dispose();
  }, []);

  if (!ready) {
    return <div className="editor-loading">Loading editor…</div>;
  }

  const vp = viewportRef.current;
  const doc = storeRef.current.getState().document;

  return (
    <div className="editor-page">
      <EditorToolbar store={storeRef.current} />

      <EditorCanvas
        store={storeRef.current}
        assetStore={assetStoreRef.current}
        viewportRef={viewportRef}
        onZoomChange={handleZoomChange}
      />

      <ZoomBar
        zoom={zoom}
        onZoomIn={() => viewportRef.current?.zoomIn()}
        onZoomOut={() => viewportRef.current?.zoomOut()}
        onFit={() => viewportRef.current?.zoomToFit(doc.width, doc.height)}
        onReset={() => viewportRef.current?.zoomToActual()}
      />
    </div>
  );
}

