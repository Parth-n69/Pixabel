import { useEffect, useState } from 'react';

/**
 * Minimal editor toolbar — Undo / Redo wired to the store.
 */
export function EditorToolbar({ store }) {
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  useEffect(() => {
    const update = (state) => {
      setCanUndo(state._undoStack.length > 0);
      setCanRedo(state._redoStack.length > 0);
    };
    // Initialise
    update(store.getState());
    // Subscribe
    const unsub = store.subscribe(update);
    return unsub;
  }, [store]);

  return (
    <div className="editor-toolbar" role="toolbar" aria-label="Editor toolbar">
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
    </div>
  );
}

