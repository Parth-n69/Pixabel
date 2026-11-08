import { useEffect, useState, useRef, useCallback } from 'react';
import { DEFAULT_ADJUSTMENTS } from '../document/schema.js';

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
 * PropertiesPanel — shows opacity, blend mode, transforms, and adjustments
 * (brightness, contrast, saturation, blur, grayscale, sepia, invert)
 * for the currently selected layer.
 */
export function PropertiesPanel({ store }) {
  const [layer, setLayer] = useState(null);
  const [locked, setLocked] = useState(false);
  const [isComparing, setIsComparing] = useState(false);

  const gestureActiveRef = useRef(false);
  const rafIdRef = useRef(null);
  const pendingAdjustmentRef = useRef(null);

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
        const adj = l.adjustments || DEFAULT_ADJUSTMENTS;
        const prevAdj = prev?.adjustments;
        const adjEqual =
          prevAdj &&
          prevAdj.brightness === adj.brightness &&
          prevAdj.contrast === adj.contrast &&
          prevAdj.saturation === adj.saturation &&
          prevAdj.blur === adj.blur &&
          prevAdj.grayscale === adj.grayscale &&
          prevAdj.sepia === adj.sepia &&
          prevAdj.invert === adj.invert;

        if (
          prev &&
          prev.id === l.id &&
          prev.opacity === l.opacity &&
          prev.blendMode === l.blendMode &&
          prev.rotation === l.rotation &&
          prev.flipX === l.flipX &&
          prev.flipY === l.flipY &&
          prev.locked === l.locked &&
          prev.name === l.name &&
          adjEqual
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
          adjustments: { ...adj },
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

  // ── Unified Slider Gesture Coalescing & rAF Throttling ──

  const handleSliderPointerDown = () => {
    if (locked) return;
    gestureActiveRef.current = true;
    store.getState().beginGesture();
  };

  const handleSliderPointerUp = useCallback(() => {
    if (rafIdRef.current) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }
    if (pendingAdjustmentRef.current && layer) {
      dispatch({
        type: 'setAdjustments',
        layerId: layer.id,
        adjustments: pendingAdjustmentRef.current,
      });
      pendingAdjustmentRef.current = null;
    }
    if (gestureActiveRef.current) {
      gestureActiveRef.current = false;
      store.getState().endGesture();
    }
  }, [dispatch, layer]);

  // Global pointerup so releasing outside control always closes gesture cleanly
  useEffect(() => {
    window.addEventListener('pointerup', handleSliderPointerUp);
    return () => window.removeEventListener('pointerup', handleSliderPointerUp);
  }, [handleSliderPointerUp]);

  // ── Opacity ─────────────────────────────────────────────

  const handleOpacityChange = (e) => {
    if (!layer || locked) return;
    const val = parseFloat(e.target.value) / 100;
    dispatch({ type: 'setOpacity', layerId: layer.id, opacity: val });
  };

  // ── Adjustments Slider Changes (Throttled with rAF) ──────

  const handleAdjustmentChange = (key, rawVal) => {
    if (!layer || locked) return;
    const val = Number(rawVal);
    pendingAdjustmentRef.current = {
      ...(pendingAdjustmentRef.current || {}),
      [key]: val,
    };

    if (!rafIdRef.current) {
      rafIdRef.current = requestAnimationFrame(() => {
        if (pendingAdjustmentRef.current && layer) {
          dispatch({
            type: 'setAdjustments',
            layerId: layer.id,
            adjustments: pendingAdjustmentRef.current,
          });
          pendingAdjustmentRef.current = null;
        }
        rafIdRef.current = null;
      });
    }
  };

  // ── Filter Toggles ──────────────────────────────────────

  const handleToggleAdjustment = (key) => {
    if (!layer || locked) return;
    const current = Boolean(layer.adjustments?.[key]);
    dispatch({
      type: 'setAdjustments',
      layerId: layer.id,
      adjustments: { [key]: !current },
    });
  };

  // ── Reset Buttons ───────────────────────────────────────

  const handleResetLayer = () => {
    if (!layer || locked) return;
    dispatch({ type: 'resetAdjustments', layerId: layer.id });
  };

  const handleResetAll = () => {
    dispatch({ type: 'resetAllAdjustments' });
  };

  // ── Compare (Hold) ──────────────────────────────────────

  const startComparing = () => {
    if (!layer) return;
    setIsComparing(true);
    store.getState().setComparingLayerId(layer.id);
  };

  const stopComparing = () => {
    setIsComparing(false);
    store.getState().setComparingLayerId(null);
  };

  // ── Blend mode ──────────────────────────────────────────

  const handleBlendModeChange = (e) => {
    if (!layer || locked) return;
    dispatch({ type: 'setBlendMode', layerId: layer.id, blendMode: e.target.value });
  };

  // ── Rotate & Flip ───────────────────────────────────────

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

  // ── Render ──────────────────────────────────────────────

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
  const adj = layer.adjustments || DEFAULT_ADJUSTMENTS;
  const isDisabled = locked;

  const formatPct = (val) => (val > 0 ? `+${val}%` : `${val}%`);

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
            onPointerDown={handleSliderPointerDown}
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

      {/* ── Adjustments Section ─────────────────────────── */}
      <div className="props-panel__section">
        <div className="props-panel__sec-header">
          <span className="props-panel__label" style={{ marginBottom: 0 }}>
            Adjustments
          </span>
          <div className="props-panel__actions-row">
            <button
              type="button"
              className="editor-btn props-panel__tiny-btn"
              title="Reset selected layer adjustments"
              disabled={isDisabled}
              onClick={handleResetLayer}
            >
              Reset
            </button>
            <button
              type="button"
              className="editor-btn props-panel__tiny-btn"
              title="Reset adjustments on all layers"
              onClick={handleResetAll}
            >
              Reset All
            </button>
          </div>
        </div>

        {/* Brightness */}
        <div className="props-panel__adj-item">
          <div className="props-panel__adj-title-row">
            <label className="props-panel__adj-label" htmlFor="pp-adj-brightness">
              Brightness
            </label>
            <span className="props-panel__pct">{formatPct(adj.brightness || 0)}</span>
          </div>
          <input
            id="pp-adj-brightness"
            type="range"
            min="-100"
            max="100"
            step="1"
            value={adj.brightness || 0}
            disabled={isDisabled}
            className="props-panel__slider"
            onPointerDown={handleSliderPointerDown}
            onChange={(e) => handleAdjustmentChange('brightness', e.target.value)}
            aria-valuetext={formatPct(adj.brightness || 0)}
          />
        </div>

        {/* Contrast */}
        <div className="props-panel__adj-item">
          <div className="props-panel__adj-title-row">
            <label className="props-panel__adj-label" htmlFor="pp-adj-contrast">
              Contrast
            </label>
            <span className="props-panel__pct">{formatPct(adj.contrast || 0)}</span>
          </div>
          <input
            id="pp-adj-contrast"
            type="range"
            min="-100"
            max="100"
            step="1"
            value={adj.contrast || 0}
            disabled={isDisabled}
            className="props-panel__slider"
            onPointerDown={handleSliderPointerDown}
            onChange={(e) => handleAdjustmentChange('contrast', e.target.value)}
            aria-valuetext={formatPct(adj.contrast || 0)}
          />
        </div>

        {/* Saturation */}
        <div className="props-panel__adj-item">
          <div className="props-panel__adj-title-row">
            <label className="props-panel__adj-label" htmlFor="pp-adj-saturation">
              Saturation
            </label>
            <span className="props-panel__pct">{formatPct(adj.saturation || 0)}</span>
          </div>
          <input
            id="pp-adj-saturation"
            type="range"
            min="-100"
            max="100"
            step="1"
            value={adj.saturation || 0}
            disabled={isDisabled}
            className="props-panel__slider"
            onPointerDown={handleSliderPointerDown}
            onChange={(e) => handleAdjustmentChange('saturation', e.target.value)}
            aria-valuetext={formatPct(adj.saturation || 0)}
          />
        </div>

        {/* Blur */}
        <div className="props-panel__adj-item">
          <div className="props-panel__adj-title-row">
            <label className="props-panel__adj-label" htmlFor="pp-adj-blur">
              Blur
            </label>
            <span className="props-panel__pct">{(adj.blur || 0)}px</span>
          </div>
          <input
            id="pp-adj-blur"
            type="range"
            min="0"
            max="100"
            step="1"
            value={adj.blur || 0}
            disabled={isDisabled}
            className="props-panel__slider"
            onPointerDown={handleSliderPointerDown}
            onChange={(e) => handleAdjustmentChange('blur', e.target.value)}
            aria-valuetext={`${adj.blur || 0}px`}
          />
        </div>

        {/* Filter Toggles */}
        <div className="props-panel__toggles-row">
          <button
            type="button"
            className={`editor-btn props-panel__toggle-btn${adj.grayscale ? ' editor-btn--active' : ''}`}
            title="Toggle Grayscale filter"
            aria-pressed={Boolean(adj.grayscale)}
            disabled={isDisabled}
            onClick={() => handleToggleAdjustment('grayscale')}
          >
            Grayscale
          </button>
          <button
            type="button"
            className={`editor-btn props-panel__toggle-btn${adj.sepia ? ' editor-btn--active' : ''}`}
            title="Toggle Sepia filter"
            aria-pressed={Boolean(adj.sepia)}
            disabled={isDisabled}
            onClick={() => handleToggleAdjustment('sepia')}
          >
            Sepia
          </button>
          <button
            type="button"
            className={`editor-btn props-panel__toggle-btn${adj.invert ? ' editor-btn--active' : ''}`}
            title="Toggle Invert filter"
            aria-pressed={Boolean(adj.invert)}
            disabled={isDisabled}
            onClick={() => handleToggleAdjustment('invert')}
          >
            Invert
          </button>
        </div>

        {/* Compare (Hold) Button */}
        <div style={{ marginTop: '10px' }}>
          <button
            type="button"
            className={`editor-btn props-panel__compare-btn${isComparing ? ' editor-btn--active' : ''}`}
            title="Hold to preview original image without adjustments"
            disabled={isDisabled}
            onPointerDown={startComparing}
            onPointerUp={stopComparing}
            onPointerLeave={stopComparing}
            onTouchStart={startComparing}
            onTouchEnd={stopComparing}
          >
            {isComparing ? '👁 Viewing Original…' : '👁 Compare (Hold)'}
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
