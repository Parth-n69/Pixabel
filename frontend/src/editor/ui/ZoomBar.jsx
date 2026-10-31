/**
 * ZoomBar — zoom controls at the bottom of the editor.
 * [−]  50%  [+]  [Fit]  [100%]
 */
export function ZoomBar({ zoom, onZoomIn, onZoomOut, onFit, onReset }) {
  const pct = Math.round((zoom ?? 1) * 100);

  return (
    <div
      className="editor-zoom-bar"
      role="toolbar"
      aria-label="Zoom controls"
    >
      <button
        className="editor-btn editor-btn--icon"
        onClick={onZoomOut}
        aria-label="Zoom out"
        title="Zoom out"
      >
        −
      </button>

      <span className="editor-zoom-bar__percent" aria-live="polite">
        {pct}%
      </span>

      <button
        className="editor-btn editor-btn--icon"
        onClick={onZoomIn}
        aria-label="Zoom in"
        title="Zoom in"
      >
        +
      </button>

      <button className="editor-btn" onClick={onFit} title="Fit canvas">
        Fit
      </button>

      <button className="editor-btn" onClick={onReset} title="Zoom to 100%">
        100%
      </button>
    </div>
  );
}

