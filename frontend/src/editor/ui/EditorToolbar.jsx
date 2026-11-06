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
export function EditorToolbar({ store, assetStore, viewportRef }) {
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
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
        <Link to="/" className="editor-btn editor-btn--ghost" title="Back to Pixabel Studio">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
          <span>Studio</span>
        </Link>
      </div>

      <div className="editor-toolbar__separator" />

      <div className="editor-toolbar__group">
        <button
          className="editor-btn"
          disabled={!canUndo}
          onClick={() => store.getState().undo()}
          aria-label="Undo"
          title="Undo (Ctrl+Z)"
        >
          ↩ Undo
        </button>
        <button
          className="editor-btn"
          disabled={!canRedo}
          onClick={() => store.getState().redo()}
          aria-label="Redo"
          title="Redo (Ctrl+Shift+Z)"
        >
          ↪ Redo
        </button>
      </div>

      <div className="editor-toolbar__separator" />

      <div className="editor-toolbar__group">
        <button
          className="editor-btn editor-btn--gold"
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
    </div>
  );
}
