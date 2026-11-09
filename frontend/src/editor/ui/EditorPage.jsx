import { useEffect, useRef, useState, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { createEditorStore } from '../document/store.js';
import { createDefaultDocument, createDefaultLayer } from '../document/schema.js';
import { AssetStore } from '../engine/assetStore.js';
import { loadImageUrlIntoEditor } from '../engine/imageLoader.js';
import { Storage } from '../../lib/storage.js';
import { saveDraft, loadDraft, clearDraft } from '../document/persistence.js';
import { useToast } from '../../components/Toast.jsx';
import { EditorCanvas } from './EditorCanvas.jsx';
import { EditorToolbar } from './EditorToolbar.jsx';
import { PropertiesPanel } from './PropertiesPanel.jsx';
import { LayersPanel } from './LayersPanel.jsx';
import { ZoomBar } from './ZoomBar.jsx';
import { ExportDialog } from './ExportDialog.jsx';
import { ShortcutsModal } from './ShortcutsModal.jsx';
import './editor.css';
import './LayersPanel.css';
import './PropertiesPanel.css';

function formatRelativeTime(timestamp) {
  if (!timestamp) return 'earlier';
  const diffSec = Math.round((Date.now() - timestamp) / 1000);
  if (diffSec < 60) return 'just now';
  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHours = Math.round(diffMin / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.round(diffHours / 24);
  return `${diffDays}d ago`;
}

/**
 * EditorPage — top-level editor route.
 * Handles document initialization (from gallery record, preset, or empty),
 * coordinates canvas, layers panel, toolbar, zoom controls, export, and draft autosave.
 */
export function EditorPage() {
  const [searchParams] = useSearchParams();
  const { showToast } = useToast();
  const storeRef = useRef(null);
  const assetStoreRef = useRef(null);
  const viewportRef = useRef(null);
  const [ready, setReady] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [isExportOpen, setIsExportOpen] = useState(false);
  const [draftToRestore, setDraftToRestore] = useState(null);
  const [sidebarTab, setSidebarTab] = useState('split');
  const [layerCount, setLayerCount] = useState(0);
  const [isShortcutsOpen, setIsShortcutsOpen] = useState(false);
  const [activeTool, setActiveTool] = useState('move');
  const [liveAnnouncement, setLiveAnnouncement] = useState('');

  const autosaveTimerRef = useRef(null);

  const announce = useCallback((msg) => {
    setLiveAnnouncement('');
    requestAnimationFrame(() => {
      setLiveAnnouncement(msg);
    });
  }, []);

  const handleZoomChange = useCallback((z) => setZoom(z), []);

  const handleSelectTool = useCallback(
    (tool) => {
      setActiveTool(tool);
      viewportRef.current?.setTool(tool);
      announce(tool === 'hand' ? 'Hand tool active' : 'Move tool active');
    },
    [announce]
  );

  const handleUndo = useCallback(() => {
    if (storeRef.current?.getState()._undoStack.length > 0) {
      storeRef.current.getState().undo();
      announce('Undo action');
    }
  }, [announce]);

  const handleRedo = useCallback(() => {
    if (storeRef.current?.getState()._redoStack.length > 0) {
      storeRef.current.getState().redo();
      announce('Redo action');
    }
  }, [announce]);

  // ── Unsaved-changes warning on page leave ─────────────────
  useEffect(() => {
    const handleBeforeUnload = (e) => {
      const undoLen = storeRef.current?.getState()._undoStack?.length || 0;
      if (undoLen > 0) {
        e.preventDefault();
        e.returnValue = '';
        return '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, []);

  // ── Keyboard Shortcuts Listener ──────────────────────────
  useEffect(() => {
    if (!ready || !storeRef.current) return;
    const store = storeRef.current;
    let nudgeDebounceTimer = null;
    let isNudgeActive = false;

    const handleKeyDown = (e) => {
      // Ignore if user is typing in an input, textarea, select, or contenteditable
      const target = e.target;
      const tag = target?.tagName?.toLowerCase();
      if (
        tag === 'input' ||
        tag === 'textarea' ||
        tag === 'select' ||
        target?.isContentEditable
      ) {
        return;
      }

      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
      const cmdOrCtrl = isMac ? e.metaKey : e.ctrlKey;
      const key = e.key;

      // 1. Undo: Ctrl+Z (without shift)
      if (cmdOrCtrl && !e.shiftKey && (key === 'z' || key === 'Z')) {
        e.preventDefault();
        if (store.getState()._undoStack.length > 0) {
          store.getState().undo();
          announce('Undo action');
        }
        return;
      }

      // 2. Redo: Ctrl+Y or Ctrl+Shift+Z
      if (
        (cmdOrCtrl && (key === 'y' || key === 'Y')) ||
        (cmdOrCtrl && e.shiftKey && (key === 'z' || key === 'Z'))
      ) {
        e.preventDefault();
        if (store.getState()._redoStack.length > 0) {
          store.getState().redo();
          announce('Redo action');
        }
        return;
      }

      // 3. Duplicate: Ctrl+D
      if (cmdOrCtrl && (key === 'd' || key === 'D')) {
        e.preventDefault();
        const selId = store.getState().selectedLayerId;
        if (selId) {
          const docBefore = store.getState().document;
          const idx = docBefore.layers.findIndex((l) => l.id === selId);
          if (idx !== -1) {
            store.getState().dispatch({ type: 'duplicateLayer', layerId: selId });
            const docAfter = store.getState().document;
            const newLayer = docAfter.layers[idx + 1];
            if (newLayer) {
              store.getState().setSelectedLayerId(newLayer.id);
            }
            announce(`Layer duplicated: ${docBefore.layers[idx].name}`);
          }
        }
        return;
      }

      // 4. Delete: Delete or Backspace
      if (key === 'Delete' || key === 'Backspace') {
        const selId = store.getState().selectedLayerId;
        if (selId) {
          const layer = store.getState().document.layers.find((l) => l.id === selId);
          if (layer && !layer.locked) {
            e.preventDefault();
            store.getState().dispatch({ type: 'deleteLayer', layerId: selId });
            announce(`Layer deleted: ${layer.name}`);
          }
        }
        return;
      }

      // 5. Reorder: Ctrl+[ (Send backward) and Ctrl+] (Bring forward)
      if (cmdOrCtrl && (key === '[' || key === ']')) {
        e.preventDefault();
        const selId = store.getState().selectedLayerId;
        if (selId) {
          const layers = store.getState().document.layers;
          const fromIdx = layers.findIndex((l) => l.id === selId);
          if (fromIdx !== -1) {
            const delta = key === ']' ? 1 : -1;
            const toIndex = Math.max(0, Math.min(layers.length - 1, fromIdx + delta));
            if (toIndex !== fromIdx) {
              store.getState().dispatch({ type: 'reorderLayer', layerId: selId, toIndex });
              announce(key === ']' ? 'Layer brought forward' : 'Layer sent backward');
            }
          }
        }
        return;
      }

      // 6. Tool switching: V for Move tool, H for Hand tool, ? for Help
      if (!cmdOrCtrl && !e.altKey) {
        if (key === 'v' || key === 'V') {
          e.preventDefault();
          handleSelectTool('move');
          return;
        }
        if (key === 'h' || key === 'H') {
          e.preventDefault();
          handleSelectTool('hand');
          return;
        }
        if (key === '?') {
          e.preventDefault();
          setIsShortcutsOpen(true);
          return;
        }
      }

      // 7. Arrow keys nudge: ArrowUp, ArrowDown, ArrowLeft, ArrowRight
      if (
        key === 'ArrowUp' ||
        key === 'ArrowDown' ||
        key === 'ArrowLeft' ||
        key === 'ArrowRight'
      ) {
        const selId = store.getState().selectedLayerId;
        if (selId) {
          const layer = store.getState().document.layers.find((l) => l.id === selId);
          if (layer && !layer.locked) {
            e.preventDefault();
            const step = e.shiftKey ? 10 : 1;
            let dx = 0;
            let dy = 0;
            if (key === 'ArrowUp') dy = -step;
            else if (key === 'ArrowDown') dy = step;
            else if (key === 'ArrowLeft') dx = -step;
            else if (key === 'ArrowRight') dx = step;

            // Start gesture if not active to coalesce continuous arrow nudges
            if (!isNudgeActive) {
              isNudgeActive = true;
              store.getState().beginGesture();
            }

            store.getState().dispatch({
              type: 'transformLayer',
              layerId: selId,
              x: layer.x + dx,
              y: layer.y + dy,
            });

            if (nudgeDebounceTimer) clearTimeout(nudgeDebounceTimer);
            nudgeDebounceTimer = setTimeout(() => {
              if (isNudgeActive) {
                isNudgeActive = false;
                store.getState().endGesture();
                announce(`Nudged layer ${layer.name}`);
              }
            }, 400);
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      if (nudgeDebounceTimer) clearTimeout(nudgeDebounceTimer);
    };
  }, [ready, announce, handleSelectTool]);

  // Track layer count for tab badge
  useEffect(() => {
    if (!ready || !storeRef.current) return;
    const updateCount = (state) => {
      setLayerCount(state.document.layers.length);
    };
    updateCount(storeRef.current.getState());
    return storeRef.current.subscribe(updateCount);
  }, [ready]);

  // Listen to pixabel:toast global custom events (e.g. downscale alerts)
  useEffect(() => {
    const handleToastEvent = (e) => {
      if (e.detail?.message) {
        showToast(e.detail.message, e.detail.type || 'info');
      }
    };
    window.addEventListener('pixabel:toast', handleToastEvent);
    return () => window.removeEventListener('pixabel:toast', handleToastEvent);
  }, [showToast]);

  // Boot editor and check for autosaved session draft
  useEffect(() => {
    let isMounted = true;
    const assetStore = new AssetStore();
    assetStoreRef.current = assetStore;

    async function initEditor() {
      const imgId = searchParams.get('img');
      let initialDoc = null;

      // 1. If an image ID was passed in URL from gallery, open that image
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

            // Set initial session baseline snapshot with layer 1 loaded
            store.getState().snapshotInitialSessionDoc();

            if (isMounted) setReady(true);
            return;
          }
        } catch (err) {
          console.warn('[Editor] Failed to load generation image from storage:', err);
        }
      }

      // 2. Check if an autosaved session draft exists in IndexedDB
      try {
        const savedDraft = await loadDraft();
        if (savedDraft && savedDraft.document?.layers?.length > 0) {
          if (isMounted) {
            setDraftToRestore(savedDraft);
          }
        }
      } catch (err) {
        console.warn('[Editor] Error checking for draft:', err);
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
      if (autosaveTimerRef.current) {
        clearTimeout(autosaveTimerRef.current);
      }
    };
  }, [searchParams]);

  // Draft autosave of document JSON and assets to IndexedDB (debounced 2 seconds)
  useEffect(() => {
    if (!ready || !storeRef.current || !assetStoreRef.current) return;
    const store = storeRef.current;
    const assetStore = assetStoreRef.current;

    const unsub = store.subscribe((state, prevState) => {
      if (state.document !== prevState.document) {
        if (autosaveTimerRef.current) {
          clearTimeout(autosaveTimerRef.current);
        }
        autosaveTimerRef.current = setTimeout(() => {
          if (state.document.layers.length > 0) {
            saveDraft(state.document, assetStore);
          }
        }, 2000);
      }
    });

    return () => {
      unsub();
      if (autosaveTimerRef.current) {
        clearTimeout(autosaveTimerRef.current);
      }
    };
  }, [ready]);

  // ── Session Restore Handlers ────────────────────────────
  const handleRestoreSession = () => {
    if (!draftToRestore || !storeRef.current || !assetStoreRef.current) return;
    const assetStore = assetStoreRef.current;
    const store = storeRef.current;

    // 1. Populate assetStore with all saved blobs
    for (const item of draftToRestore.assets || []) {
      if (item.assetId && item.blob) {
        assetStore.add(item.assetId, item.blob);
      }
    }

    // 2. Restore document into store
    store.getState().restoreSessionDocument(draftToRestore.document);

    // 3. Zoom viewport to fit restored document
    setTimeout(() => {
      viewportRef.current?.zoomToFit(draftToRestore.document.width, draftToRestore.document.height);
    }, 50);

    setDraftToRestore(null);
    showToast('Restored your previous editing session.', 'success');
  };

  const handleDiscardSession = async () => {
    await clearDraft();
    setDraftToRestore(null);
    showToast('Saved session discarded.', 'info');
  };

  if (!ready || !storeRef.current) {
    return <div className="editor-loading">Loading Pixabel Editor…</div>;
  }

  const doc = storeRef.current.getState().document;

  return (
    <div className="editor-page">
      {/* ── Restore Last Session Prompt Banner ── */}
      {draftToRestore && (
        <div className="editor-restore-banner" role="alert" aria-live="polite">
          <div className="editor-restore-banner__content">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
            <span>
              <strong>Restore your last session?</strong> Found an autosaved session from{' '}
              {formatRelativeTime(draftToRestore.updatedAt)} with {draftToRestore.layerCount}{' '}
              {draftToRestore.layerCount === 1 ? 'layer' : 'layers'}.
            </span>
          </div>
          <div className="editor-restore-banner__actions">
            <button
              type="button"
              className="editor-btn editor-btn--gold editor-btn--sm"
              onClick={handleRestoreSession}
            >
              Restore Session
            </button>
            <button
              type="button"
              className="editor-btn editor-btn--ghost editor-btn--sm"
              onClick={handleDiscardSession}
            >
              Discard
            </button>
          </div>
        </div>
      )}

      {/* ── Screen Reader Live Announcements ── */}
      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
      >
        {liveAnnouncement}
      </div>

      <EditorToolbar
        store={storeRef.current}
        assetStore={assetStoreRef.current}
        viewportRef={viewportRef}
        onOpenExport={() => setIsExportOpen(true)}
        activeTool={activeTool}
        onSelectTool={handleSelectTool}
        onOpenShortcuts={() => setIsShortcutsOpen(true)}
        onUndo={handleUndo}
        onRedo={handleRedo}
      />

      <div className="editor-body">
        <div className="editor-canvas-area">
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
            onFit={() => {
              const currentDoc = storeRef.current?.getState().document;
              if (currentDoc) {
                viewportRef.current?.zoomToFit(currentDoc.width, currentDoc.height);
              }
            }}
            onReset={() => viewportRef.current?.zoomToActual()}
          />
        </div>

        <aside className="editor-sidebar" aria-label="Sidebar">
          <div className="editor-sidebar-header">
            <div className="editor-sidebar-tabs" role="tablist" aria-label="Sidebar tabs">
              <button
                type="button"
                role="tab"
                id="tab-properties"
                aria-selected={sidebarTab === 'properties'}
                aria-controls="panel-properties"
                className={`editor-sidebar-tab ${sidebarTab === 'properties' ? 'editor-sidebar-tab--active' : ''}`}
                onClick={() => setSidebarTab('properties')}
                title="Properties panel"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <line x1="4" y1="21" x2="4" y2="14" />
                  <line x1="4" y1="10" x2="4" y2="3" />
                  <line x1="12" y1="21" x2="12" y2="12" />
                  <line x1="12" y1="8" x2="12" y2="3" />
                  <line x1="20" y1="21" x2="20" y2="16" />
                  <line x1="20" y1="12" x2="20" y2="3" />
                  <line x1="1" y1="14" x2="7" y2="14" />
                  <line x1="9" y1="8" x2="15" y2="8" />
                  <line x1="17" y1="16" x2="23" y2="16" />
                </svg>
                <span>Properties</span>
              </button>
              <button
                type="button"
                role="tab"
                id="tab-layers"
                aria-selected={sidebarTab === 'layers'}
                aria-controls="panel-layers"
                className={`editor-sidebar-tab ${sidebarTab === 'layers' ? 'editor-sidebar-tab--active' : ''}`}
                onClick={() => setSidebarTab('layers')}
                title="Layers panel"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <polygon points="12 2 2 7 12 12 22 7 12 2" />
                  <polyline points="2 17 12 22 22 17" />
                  <polyline points="2 12 12 17 22 12" />
                </svg>
                <span>Layers</span>
                {layerCount > 0 && <span className="editor-sidebar-tab-badge">{layerCount}</span>}
              </button>
              <button
                type="button"
                role="tab"
                id="tab-split"
                aria-selected={sidebarTab === 'split'}
                aria-controls="panel-split"
                className={`editor-sidebar-tab editor-sidebar-tab--split ${sidebarTab === 'split' ? 'editor-sidebar-tab--active' : ''}`}
                onClick={() => setSidebarTab('split')}
                title="Split view (show both panels)"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <rect x="3" y="3" width="18" height="18" rx="2" />
                  <line x1="3" y1="12" x2="21" y2="12" />
                </svg>
                <span>Split</span>
              </button>
            </div>
          </div>

          <div className="editor-sidebar-content">
            {(sidebarTab === 'properties' || sidebarTab === 'split') && (
              <div
                id="panel-properties"
                role="tabpanel"
                aria-labelledby="tab-properties"
                className={`editor-sidebar-pane ${sidebarTab === 'split' ? 'editor-sidebar-pane--split' : 'editor-sidebar-pane--full'}`}
              >
                <PropertiesPanel
                  store={storeRef.current}
                  assetStore={assetStoreRef.current}
                />
              </div>
            )}
            {sidebarTab === 'split' && <div className="editor-sidebar-divider" role="separator" />}
            {(sidebarTab === 'layers' || sidebarTab === 'split') && (
              <div
                id="panel-layers"
                role="tabpanel"
                aria-labelledby="tab-layers"
                className={`editor-sidebar-pane ${sidebarTab === 'split' ? 'editor-sidebar-pane--split' : 'editor-sidebar-pane--full'}`}
              >
                <LayersPanel
                  store={storeRef.current}
                  assetStore={assetStoreRef.current}
                />
              </div>
            )}
          </div>
        </aside>
      </div>

      {/* ── Export & Gallery Modal Dialog ── */}
      <ExportDialog
        isOpen={isExportOpen}
        onClose={() => setIsExportOpen(false)}
        store={storeRef.current}
        assetStore={assetStoreRef.current}
        onToast={showToast}
      />

      {/* ── Keyboard Shortcuts Help Modal ── */}
      <ShortcutsModal
        isOpen={isShortcutsOpen}
        onClose={() => setIsShortcutsOpen(false)}
      />
    </div>
  );
}
