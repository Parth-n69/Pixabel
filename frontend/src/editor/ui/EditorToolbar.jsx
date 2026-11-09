import { useEffect, useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import { loadImageIntoEditor } from '../engine/imageLoader.js';

const PRESETS = [
  { label: 'Square (1024 × 1024)', width: 1024, height: 1024 },
  { label: 'Portrait (1024 × 1536)', width: 1024, height: 1536 },
  { label: 'Landscape (1536 × 1024)', width: 1536, height: 1024 },
];

/**
 * EditorToolbar — Undo / Redo, Add Image, Document Presets, and Studio link.
 */
export function EditorToolbar({
  store,
  assetStore,
  viewportRef,
  onOpenExport,
  activeTool = 'move',
  onSelectTool,
  onOpenShortcuts,
  onUndo,
  onRedo,
}) {
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [isComparingSession, setIsComparingSession] = useState(false);
  const [docSize, setDocSize] = useState({
    width: store.getState().document.width,
    height: store.getState().document.height,
  });
  const fileInputRef = useRef(null);

  useEffect(() => {
    const update = (state) => {
      const nextCanUndo = state._undoStack.length > 0;
      const nextCanRedo = state._redoStack.length > 0;
      setCanUndo((prev) => (prev === nextCanUndo ? prev : nextCanUndo));
      setCanRedo((prev) => (prev === nextCanRedo ? prev : nextCanRedo));
      setIsComparingSession((prev) => (prev === state.isComparingSession ? prev : state.isComparingSession));
      setDocSize((prev) => {
        if (prev.width === state.document.width && prev.height === state.document.height) {
          return prev;
        }
        return { width: state.document.width, height: state.document.height };
      });
    };
    update(store.getState());
    const unsub = store.subscribe(update);
    return unsub;
  }, [store]);

  const handleFileChange = async (e) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    for (const file of files) {
      if (file.type.startsWith('image/')) {
        await loadImageIntoEditor(file, assetStore, store);
      }
    }
    e.target.value = '';
    const doc = store.getState().document;
    viewportRef?.current?.zoomToFit(doc.width, doc.height);
  };

  const handlePresetSelect = (e) => {
    const val = e.target.value;
    if (!val) return;
    const [w, h] = val.split('x').map(Number);
    if (w && h) {
      store.getState().dispatch({
        type: 'setDocumentSize',
        width: w,
        height: h,
      });
      setTimeout(() => {
        viewportRef?.current?.zoomToFit(w, h);
      }, 50);
    }
  };

  return (
    <div className="editor-toolbar" role="toolbar" aria-label="Editor toolbar">
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="image/png,image/jpeg,image/webp"
        style={{ display: 'none' }}
        onChange={handleFileChange}
      />

      <div className="editor-toolbar__group">
        <Link
          to="/"
          className="editor-btn editor-btn--ghost"
          title="Back to Pixabel Studio"
          onClick={(e) => {
            if (canUndo && !window.confirm('You have unsaved changes. Return to Pixabel Studio?')) {
              e.preventDefault();
            }
          }}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
          <span>Studio</span>
        </Link>
      </div>

      <div className="editor-toolbar__separator" />

      {/* ── Tool selection (Move vs Hand) ── */}
      <div className="editor-toolbar__group" role="radiogroup" aria-label="Tool selection">
        <button
          type="button"
          role="radio"
          aria-checked={activeTool === 'move'}
          className={`editor-btn editor-btn--icon ${activeTool === 'move' ? 'editor-btn--active' : ''}`}
          onClick={() => onSelectTool?.('move')}
          title="Move tool (V)"
          aria-label="Move / Selection tool (V)"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
            <path d="M5 3l14 9-7 2-3 7L5 3z" />
          </svg>
        </button>
        <button
          type="button"
          role="radio"
          aria-checked={activeTool === 'hand'}
          className={`editor-btn editor-btn--icon ${activeTool === 'hand' ? 'editor-btn--active' : ''}`}
          onClick={() => onSelectTool?.('hand')}
          title="Hand tool (H) — click & drag to pan"
          aria-label="Hand tool (H)"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
            <path d="M18 11V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v3M14 9V4a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v7M10 11V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v8M6 14v-2a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v6a7 7 0 0 0 7 7h4a7 7 0 0 0 7-7v-6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2" />
          </svg>
        </button>
      </div>

      <div className="editor-toolbar__separator" />

      <div className="editor-toolbar__group">
        <button
          className="editor-btn"
          disabled={!canUndo}
          onClick={() => (onUndo ? onUndo() : store.getState().undo())}
          aria-label="Undo"
          title="Undo (Ctrl+Z)"
        >
          ↩ Undo
        </button>
        <button
          className="editor-btn"
          disabled={!canRedo}
          onClick={() => (onRedo ? onRedo() : store.getState().redo())}
          aria-label="Redo"
          title="Redo (Ctrl+Shift+Z or Ctrl+Y)"
        >
          ↪ Redo
        </button>
        <button
          type="button"
          className={`editor-btn ${isComparingSession ? 'editor-btn--active' : ''}`}
          onPointerDown={() => store.getState().setIsComparingSession(true)}
          onPointerUp={() => store.getState().setIsComparingSession(false)}
          onPointerLeave={() => store.getState().setIsComparingSession(false)}
          onTouchStart={() => store.getState().setIsComparingSession(true)}
          onTouchEnd={() => store.getState().setIsComparingSession(false)}
          aria-label="Hold to compare against session start"
          title="Hold to preview document when editing session started"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
          <span>{isComparingSession ? 'Viewing Original…' : 'Hold to Compare'}</span>
        </button>
      </div>

      <div className="editor-toolbar__separator" />

      <div className="editor-toolbar__group">
        <button
          type="button"
          className="editor-btn"
          onClick={() => fileInputRef.current?.click()}
          title="Add image layer from your device"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          <span>Add Image</span>
        </button>
      </div>

      <div className="editor-toolbar__separator" />

      <div className="editor-toolbar__group">
        <button
          type="button"
          className="editor-btn editor-btn--gold"
          onClick={onOpenExport}
          title="Export image or save to gallery"
          aria-label="Export image"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" />
          </svg>
          <span>Export</span>
        </button>
      </div>

      <div className="editor-toolbar__separator" />

      <div className="editor-toolbar__group">
        <label htmlFor="editor-preset-select" className="sr-only">
          Document Preset
        </label>
        <select
          id="editor-preset-select"
          className="editor-select"
          value={`${docSize.width}x${docSize.height}`}
          onChange={handlePresetSelect}
          aria-label="Document size preset"
        >
          {PRESETS.map((p) => (
            <option key={p.label} value={`${p.width}x${p.height}`}>
              {p.label}
            </option>
          ))}
          {!PRESETS.some((p) => p.width === docSize.width && p.height === docSize.height) && (
            <option value={`${docSize.width}x${docSize.height}`}>
              Custom ({docSize.width} × {docSize.height})
            </option>
          )}
        </select>
        <span className="editor-toolbar__dim" title="Current document dimensions">
          {docSize.width} × {docSize.height}
        </span>
      </div>

      <div className="editor-toolbar__separator" />

      <div className="editor-toolbar__group">
        <button
          type="button"
          className="editor-btn editor-btn--icon"
          onClick={onOpenShortcuts}
          title="Keyboard shortcuts (?)"
          aria-label="Keyboard shortcuts"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
            <circle cx="12" cy="12" r="10" />
            <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3M12 17h.01" />
          </svg>
        </button>
      </div>
    </div>
  );
}
