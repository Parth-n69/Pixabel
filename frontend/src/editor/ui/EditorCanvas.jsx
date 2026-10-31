import { useEffect, useRef } from 'react';
import { FabricAdapter } from '../engine/adapter.js';
import { ViewportController } from '../engine/viewport.js';

/**
 * EditorCanvas — mounts a Fabric canvas, wires the adapter and viewport.
 * All canvas work is kept outside React render cycles (refs, rAF).
 */
export function EditorCanvas({ store, assetStore, viewportRef, onZoomChange }) {
  const containerRef = useRef(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Create the raw <canvas> element; Fabric will wrap it
    const el = document.createElement('canvas');
    container.appendChild(el);

    // Measure container
    const rect = container.getBoundingClientRect();

    // Boot Fabric adapter
    const adapter = new FabricAdapter(el, store, assetStore);
    adapter.resize(rect.width, rect.height);

    // Boot viewport controller
    const viewport = new ViewportController(adapter.canvas, onZoomChange);
    if (viewportRef) viewportRef.current = viewport;

    // Fit to document on first mount
    const doc = store.getState().document;
    viewport.zoomToFit(doc.width, doc.height);

    // Resize when the container changes size
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
    // store, assetStore, viewportRef are stable refs — safe to omit
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div ref={containerRef} className="editor-canvas-wrap" />;
}

