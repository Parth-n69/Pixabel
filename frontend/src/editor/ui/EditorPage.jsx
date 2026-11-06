import { useEffect, useRef, useState, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { createEditorStore } from '../document/store.js';
import { createDefaultDocument, createDefaultLayer } from '../document/schema.js';
import { AssetStore } from '../engine/assetStore.js';
import { loadImageUrlIntoEditor } from '../engine/imageLoader.js';
import { Storage } from '../../lib/storage.js';
import { EditorCanvas } from './EditorCanvas.jsx';
import { EditorToolbar } from './EditorToolbar.jsx';
import { LayersPanel } from './LayersPanel.jsx';
import { ZoomBar } from './ZoomBar.jsx';
import './editor.css';
import './LayersPanel.css';

/**
 * EditorPage — top-level editor route.
 * Handles document initialization (from gallery record, preset, or empty),
 * coordinates canvas, layers panel, toolbar, and zoom controls.
 */
export function EditorPage() {
  const [searchParams] = useSearchParams();
  const storeRef = useRef(null);
  const assetStoreRef = useRef(null);
  const viewportRef = useRef(null);
  const [ready, setReady] = useState(false);
  const [zoom, setZoom] = useState(1);

  const handleZoomChange = useCallback((z) => setZoom(z), []);

  useEffect(() => {
    let isMounted = true;
    const assetStore = new AssetStore();
    assetStoreRef.current = assetStore;

    async function initEditor() {
      const imgId = searchParams.get('img');
      let initialDoc = null;

      if (imgId) {
        try {
          const record = await Storage.getGeneration(imgId);
          if (record && record.image) {
            const w = record.width || 1024;
            const h = record.height || 1024;
            initialDoc = createDefaultDocument({
              id: `editor-doc-${imgId}`,
              width: w,
              height: h,
              background: 'transparent',
              layers: [],
            });
            const store = createEditorStore(initialDoc);
            storeRef.current = store;

            // Load the record image into assetStore and add layer
            await loadImageUrlIntoEditor(record.image, assetStore, store, {
              name: record.prompt ? record.prompt.slice(0, 30) : 'Generated Image',
              resizeDoc: true,
            });

            if (isMounted) setReady(true);
            return;
          }
        } catch (err) {
          console.warn('[Editor] Failed to load generation image from storage:', err);
        }
      }

      // Default new empty document (1024x1024 preset)
      initialDoc = createDefaultDocument({
        id: 'editor-doc',
        width: 1024,
        height: 1024,
        background: 'transparent',
        layers: [],
      });

      storeRef.current = createEditorStore(initialDoc);
      if (isMounted) setReady(true);
    }

    initEditor();

    return () => {
      isMounted = false;
      assetStore.dispose();
    };
  }, [searchParams]);

  if (!ready || !storeRef.current) {
    return <div className="editor-loading">Loading Pixabel Editor…</div>;
  }

  const doc = storeRef.current.getState().document;

  return (
    <div className="editor-page">
      <EditorToolbar
        store={storeRef.current}
        assetStore={assetStoreRef.current}
        viewportRef={viewportRef}
      />

      <div className="editor-body">
        <EditorCanvas
          store={storeRef.current}
          assetStore={assetStoreRef.current}
          viewportRef={viewportRef}
          onZoomChange={handleZoomChange}
        />

        <LayersPanel
          store={storeRef.current}
          assetStore={assetStoreRef.current}
        />
      </div>

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
