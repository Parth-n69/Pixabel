import { useEffect, useState, useRef, useCallback } from 'react';

const BLEND_MODES = [
  'normal',
  'multiply',
  'screen',
  'overlay',
  'darken',
  'lighten',
  'color-dodge',
  'color-burn',
  'soft-light',
  'hard-light',
  'difference',
];

/**
 * PropertiesPanel — shows opacity, blend mode, rotate, and flip controls
 * for the currently selected layer.
 */
export function PropertiesPanel({ store }) {
  const [layer, setLayer] = useState(null);
  const [locked, setLocked] = useState(false);
  const gestureActive = useRef(false);

  // Subscribe to store: extract selected layer's relevant properties
  useEffect(() => {
    const update = (state) => {
      const selId = state.selectedLayerId;
      if (!selId) {
        setLayer(null);
        setLocked(false);
        return;
      }
      const l = state.document.layers.find((ly) => ly.id === selId);
      if (!l) {
        setLayer(null);
        setLocked(false);
        return;
      }
      setLayer((prev) => {
        if (
          prev &&
          prev.id === l.id &&
          prev.opacity === l.opacity &&
          prev.blendMode === l.blendMode &&
          prev.rotation === l.rotation &&
          prev.flipX === l.flipX &&
          prev.flipY === l.flipY &&
          prev.locked === l.locked &&
          prev.name === l.name
        ) {
          return prev;
        }
        return {
          id: l.id,
          name: l.name,
          opacity: l.opacity,
          blendMode: l.blendMode,
          rotation: l.rotation,
          flipX: l.flipX,
          flipY: l.flipY,
          locked: l.locked,
        };
      });
      setLocked(l.locked);
    };
    update(store.getState());
    return store.subscribe(update);
  }, [store]);

  const dispatch = useCallback(
    (action) => store.getState().dispatch(action),
    [store],
  );

  // ── Opacity slider with gesture coalescing ──────────────────

  const handleOpacityPointerDown = () => {
    if (locked) return;
    gestureActive.current = true;
    store.getState().beginGesture();
  };

  const handleOpacityChange = (e) => {
    if (!layer || locked) return;
    const val = parseFloat(e.target.value) / 100;
    dispatch({ type: 'setOpacity', layerId: layer.id, opacity: val });
  };

  const handleOpacityPointerUp = () => {
    if (gestureActive.current) {
      gestureActive.current = false;
      store.getState().endGesture();
    }
  };

  // Attach global pointerup so we always close the gesture
  useEffect(() => {
    window.addEventListener('pointerup', handleOpacityPointerUp);
    return () => window.removeEventListener('pointerup', handleOpacityPointerUp);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Blend mode ─────────────────────────────────────────────

  const handleBlendModeChange = (e) => {
    if (!layer || locked) return;
    dispatch({ type: 'setBlendMode', layerId: layer.id, blendMode: e.target.value });
  };

  // ── Rotate & Flip ─────────────────────────────────────────

  const handleRotateCCW = () => {
    if (!layer || locked) return;
    dispatch({ type: 'rotateLayer90', layerId: layer.id, direction: 'ccw' });
  };

  const handleRotateCW = () => {
    if (!layer || locked) return;
    dispatch({ type: 'rotateLayer90', layerId: layer.id, direction: 'cw' });
  };

  const handleFlipH = () => {
    if (!layer || locked) return;
    dispatch({ type: 'flipLayer', layerId: layer.id, axis: 'x' });
  };

  const handleFlipV = () => {
    if (!layer || locked) return;
    dispatch({ type: 'flipLayer', layerId: layer.id, axis: 'y' });
  };

  // ── Render ────────────────────────────────────────────────

  if (!layer) {
    return (
      <div className="props-panel" role="region" aria-label="Properties">
        <div className="props-panel__header">
          <span className="props-panel__title">Properties</span>
        </div>
        <div className="props-panel__empty">No layer selected</div>
      </div>
    );
  }

  const opacityPct = Math.round(layer.opacity * 100);
  const isDisabled = locked;

  return (
    <div className="props-panel" role="region" aria-label="Properties">
      <div className="props-panel__header">
        <span className="props-panel__title">Properties</span>
        {locked && <span className="props-panel__lock-badge">🔒 Locked</span>}
      </div>

      <div className="props-panel__section">
        <label className="props-panel__label" htmlFor="pp-layer-name">
          Layer
        </label>
        <span className="props-panel__value" id="pp-layer-name" title={layer.name}>
          {layer.name}
        </span>
      </div>

      {/* ── Opacity ─────────────────────────────────────── */}
      <div className="props-panel__section">
        <label className="props-panel__label" htmlFor="pp-opacity">
          Opacity
        </label>
        <div className="props-panel__row">
          <input
            id="pp-opacity"
            type="range"
            min="0"
            max="100"
            step="1"
            value={opacityPct}
            disabled={isDisabled}
            className="props-panel__slider"
            onPointerDown={handleOpacityPointerDown}
            onChange={handleOpacityChange}
            aria-valuetext={`${opacityPct}%`}
          />
          <span className="props-panel__pct">{opacityPct}%</span>
        </div>
      </div>

      {/* ── Blend mode ──────────────────────────────────── */}
      <div className="props-panel__section">
        <label className="props-panel__label" htmlFor="pp-blend">
          Blend
        </label>
        <select
          id="pp-blend"
          className="editor-select props-panel__select"
          value={layer.blendMode}
          disabled={isDisabled}
          onChange={handleBlendModeChange}
        >
          {BLEND_MODES.map((m) => (
            <option key={m} value={m}>
              {m.replace(/-/g, ' ')}
            </option>
          ))}
        </select>
      </div>

      {/* ── Transform buttons ───────────────────────────── */}
      <div className="props-panel__section">
        <span className="props-panel__label">Transform</span>
        <div className="props-panel__btn-row">
          <button
            className="editor-btn editor-btn--icon"
            title="Rotate 90° left"
            aria-label="Rotate 90 degrees counter-clockwise"
            disabled={isDisabled}
            onClick={handleRotateCCW}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <polyline points="1 4 1 10 7 10" />
              <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
            </svg>
          </button>
          <button
            className="editor-btn editor-btn--icon"
            title="Rotate 90° right"
            aria-label="Rotate 90 degrees clockwise"
            disabled={isDisabled}
            onClick={handleRotateCW}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <polyline points="23 4 23 10 17 10" />
              <path d="M20.49 15a9 9 0 1 1-2.13-9.36L23 10" />
            </svg>
          </button>
          <div className="props-panel__btn-sep" />
          <button
            className={`editor-btn editor-btn--icon${layer.flipX ? ' editor-btn--active' : ''}`}
            title="Flip horizontal"
            aria-label="Flip horizontal"
            aria-pressed={layer.flipX}
            disabled={isDisabled}
            onClick={handleFlipH}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <line x1="12" y1="2" x2="12" y2="22" strokeDasharray="2 2" />
              <polyline points="5 8 2 12 5 16" />
              <polyline points="19 8 22 12 19 16" />
            </svg>
          </button>
          <button
            className={`editor-btn editor-btn--icon${layer.flipY ? ' editor-btn--active' : ''}`}
            title="Flip vertical"
            aria-label="Flip vertical"
            aria-pressed={layer.flipY}
            disabled={isDisabled}
            onClick={handleFlipV}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <line x1="2" y1="12" x2="22" y2="12" strokeDasharray="2 2" />
              <polyline points="8 5 12 2 16 5" />
              <polyline points="8 19 12 22 16 19" />
            </svg>
          </button>
        </div>
      </div>

      {/* ── Current rotation readout ────────────────────── */}
      <div className="props-panel__section props-panel__section--subtle">
        <span className="props-panel__label">Rotation</span>
        <span className="props-panel__value">{layer.rotation}°</span>
      </div>
    </div>
  );
}
