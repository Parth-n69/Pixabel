import { useEffect, useState, useRef, useCallback } from 'react';
import { DEFAULT_ADJUSTMENTS, createLayerId } from '../document/schema.js';
import { editImage } from '../../lib/api.js';
import { getLayerDataUrl } from '../engine/imageLoader.js';

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

const AI_EDIT_PRESETS = [
  'Oil painting style',
  'Watercolor wash',
  'Cyberpunk neon',
  'Studio Ghibli anime',
  'Pencil sketch',
  'Vintage film photo',
  'Anime style',
  'Make it nighttime',
  'Golden hour glow',
];

/**
 * PropertiesPanel — shows opacity, blend mode, transforms, adjustments,
 * and AI Edit (SDXL Lightning img2img) for the currently selected layer.
 */
export function PropertiesPanel({ store, assetStore }) {
  const [layer, setLayer] = useState(null);
  const [locked, setLocked] = useState(false);
  const [isComparing, setIsComparing] = useState(false);
  const [isComparingSession, setIsComparingSession] = useState(false);

  // AI Edit state
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiStrength, setAiStrength] = useState(75);
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [aiError, setAiError] = useState(null);

  // Gesture coalescing & INP-optimized throttling refs & states
  const gestureActiveRef = useRef(false);
  const rafIdRef = useRef(null);
  const rafOpacityIdRef = useRef(null);
  const pendingAdjustmentRef = useRef(null);
  const pendingOpacityRef = useRef(null);
  const [draggingOpacity, setDraggingOpacity] = useState(null);
  const [draggingAdjustments, setDraggingAdjustments] = useState({});

  // Subscribe to store: extract selected layer's relevant properties
  useEffect(() => {
    const update = (state) => {
      setIsComparingSession((prev) => (prev === state.isComparingSession ? prev : state.isComparingSession));

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
          assetId: l.assetId,
          x: l.x,
          y: l.y,
          scaleX: l.scaleX,
          scaleY: l.scaleY,
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
    if (rafOpacityIdRef.current) {
      cancelAnimationFrame(rafOpacityIdRef.current);
      rafOpacityIdRef.current = null;
    }
    if (pendingOpacityRef.current !== null && layer) {
      dispatch({
        type: 'setOpacity',
        layerId: layer.id,
        opacity: pendingOpacityRef.current,
      });
      pendingOpacityRef.current = null;
    }
    if (pendingAdjustmentRef.current && layer) {
      dispatch({
        type: 'setAdjustments',
        layerId: layer.id,
        adjustments: pendingAdjustmentRef.current,
      });
      pendingAdjustmentRef.current = null;
    }
    setDraggingOpacity(null);
    setDraggingAdjustments({});
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

  // ── Opacity (Throttled with rAF for <16ms INP) ───────────

  const handleOpacityChange = (e) => {
    if (!layer || locked) return;
    const val = parseFloat(e.target.value) / 100;
    setDraggingOpacity(Math.round(val * 100));
    pendingOpacityRef.current = val;

    if (!rafOpacityIdRef.current) {
      rafOpacityIdRef.current = requestAnimationFrame(() => {
        if (pendingOpacityRef.current !== null && layer) {
          dispatch({
            type: 'setOpacity',
            layerId: layer.id,
            opacity: pendingOpacityRef.current,
          });
          pendingOpacityRef.current = null;
        }
        rafOpacityIdRef.current = null;
      });
    }
  };

  // ── Adjustments Slider Changes (Throttled with rAF) ──────

  const handleAdjustmentChange = (key, rawVal) => {
    if (!layer || locked) return;
    const val = Number(rawVal);
    setDraggingAdjustments((prev) => ({ ...prev, [key]: val }));
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

  // ── Compare Layer Filters (Hold) ────────────────────────

  const startComparing = () => {
    if (!layer) return;
    setIsComparing(true);
    store.getState().setComparingLayerId(layer.id);
  };

  const stopComparing = () => {
    setIsComparing(false);
    store.getState().setComparingLayerId(null);
  };

  // ── AI Edit (SDXL Lightning img2img) ────────────────────

  const handleApplyAiEdit = async () => {
    const prompt = aiPrompt.trim();
    if (!prompt || !layer || !assetStore || isAiLoading || locked) return;

    setIsAiLoading(true);
    setAiError(null);

    try {
      // 1. Export the selected layer's image with adjustments to base64
      const dataUrl = await getLayerDataUrl(layer, assetStore);

      // 2. Call backend Flask /edit endpoint
      const res = await editImage({
        image: dataUrl,
        prompt,
        strength: aiStrength / 100,
      });

      // 3. Register resulting blob into assetStore
      const resBlob = await (await fetch(res.image)).blob();
      const newAssetId = `img-${createLayerId()}`;
      assetStore.add(newAssetId, resBlob);

      // 4. Insert result as a NEW layer right above the selected layer named "AI edit"
      const currentDoc = store.getState().document;
      const currentIdx = currentDoc.layers.findIndex((l) => l.id === layer.id);
      const insertIdx = currentIdx >= 0 ? currentIdx + 1 : currentDoc.layers.length;

      dispatch({
        type: 'addLayer',
        payload: {
          name: 'AI edit',
          assetId: newAssetId,
          x: layer.x,
          y: layer.y,
          scaleX: layer.scaleX,
          scaleY: layer.scaleY,
          rotation: layer.rotation,
          flipX: layer.flipX,
          flipY: layer.flipY,
          opacity: 1,
          blendMode: 'normal',
        },
        index: insertIdx,
      });

      // 5. Select the newly created AI edit layer
      const updatedDoc = store.getState().document;
      const createdLayer = updatedDoc.layers[insertIdx];
      if (createdLayer) {
        store.getState().setSelectedLayerId(createdLayer.id);
      }
    } catch (err) {
      if (err.code === 'CF_RATE_LIMIT') {
        setAiError(err.message || 'Rate limit reached for Cloudflare. Please wait 10 seconds.');
      } else if (err.code === 'LIMIT_REACHED') {
        setAiError(err.message || 'Your daily limit of generations is used up. Try again tomorrow.');
      } else if (err.code === 'CF_AUTH') {
        setAiError(err.message || 'Cloudflare credentials are not configured. AI edit is unavailable.');
      } else {
        setAiError(err.message || 'AI edit failed. Please check your connection and try again.');
      }
    } finally {
      setIsAiLoading(false);
    }
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

  const handleCenter = () => {
    if (!layer || locked) return;
    const doc = store.getState().document;
    const curScaleX = layer.scaleX ?? 1;
    const curScaleY = layer.scaleY ?? 1;
    const layerW = (layer.width || 1024) * curScaleX;
    const layerH = (layer.height || 1024) * curScaleY;
    const x = Math.round((doc.width - layerW) / 2);
    const y = Math.round((doc.height - layerH) / 2);
    dispatch({ type: 'transformLayer', layerId: layer.id, x, y });
  };

  const handleFit = () => {
    if (!layer || locked) return;
    const doc = store.getState().document;
    const rawW = layer.width || 1024;
    const rawH = layer.height || 1024;
    if (rawW <= 0 || rawH <= 0) return;
    const scale = Math.min(doc.width / rawW, doc.height / rawH);
    const layerW = rawW * scale;
    const layerH = rawH * scale;
    const x = Math.round((doc.width - layerW) / 2);
    const y = Math.round((doc.height - layerH) / 2);
    dispatch({
      type: 'transformLayer',
      layerId: layer.id,
      scaleX: scale,
      scaleY: scale,
      x,
      y,
    });
  };

  // ── Render ──────────────────────────────────────────────

  if (!layer) {
    return (
      <div className="props-panel" role="region" aria-label="Properties">
        <div className="props-panel__header">
          <span className="props-panel__title">Properties</span>
        </div>
        <div className="props-panel__empty">No layer selected</div>

        {/* Global session compare button even if no layer is currently selected */}
        <div className="props-panel__section" style={{ borderTop: '1px solid var(--border)' }}>
          <button
            type="button"
            className={`editor-btn props-panel__compare-btn${isComparingSession ? ' editor-btn--active' : ''}`}
            title="Hold to preview document as it was when the editing session started"
            onPointerDown={() => store.getState().setIsComparingSession(true)}
            onPointerUp={() => store.getState().setIsComparingSession(false)}
            onPointerLeave={() => store.getState().setIsComparingSession(false)}
            onTouchStart={() => store.getState().setIsComparingSession(true)}
            onTouchEnd={() => store.getState().setIsComparingSession(false)}
          >
            {isComparingSession ? '👁 Viewing Session Baseline…' : '👁 Hold to Compare (Session Start)'}
          </button>
        </div>
      </div>
    );
  }

  const opacityPct =
    draggingOpacity !== null ? draggingOpacity : Math.round(layer.opacity * 100);
  const adj = {
    ...(layer.adjustments || DEFAULT_ADJUSTMENTS),
    ...draggingAdjustments,
  };
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
          <div className="props-panel__btn-sep" />
          <button
            className="editor-btn editor-btn--icon"
            title="Center on canvas"
            aria-label="Center layer on canvas"
            disabled={isDisabled}
            onClick={handleCenter}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          </button>
          <button
            className="editor-btn editor-btn--icon"
            title="Fit to canvas"
            aria-label="Fit layer to canvas dimensions"
            disabled={isDisabled}
            onClick={handleFit}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <polyline points="15 3 21 3 21 9" />
              <polyline points="9 21 3 21 3 15" />
              <line x1="21" y1="3" x2="14" y2="10" />
              <line x1="3" y1="21" x2="10" y2="14" />
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

        {/* Compare Layer Adjustments (Hold) */}
        <div style={{ marginTop: '10px' }}>
          <button
            type="button"
            className={`editor-btn props-panel__compare-btn${isComparing ? ' editor-btn--active' : ''}`}
            title="Hold to preview layer without adjustments"
            disabled={isDisabled}
            onPointerDown={startComparing}
            onPointerUp={stopComparing}
            onPointerLeave={stopComparing}
            onTouchStart={startComparing}
            onTouchEnd={stopComparing}
          >
            {isComparing ? '👁 Viewing Layer Unfiltered…' : '👁 Compare Layer (Hold)'}
          </button>
        </div>
      </div>

      {/* ── AI Edit Section ─────────────────────────────── */}
      <div className="props-panel__section">
        <div className="props-panel__sec-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span className="props-panel__label" style={{ marginBottom: 0 }}>
              AI Edit
            </span>
            <span className="props-panel__ai-badge">SDXL</span>
          </div>
        </div>

        {/* Prompt Input */}
        <div className="props-panel__field">
          <label className="props-panel__adj-label" htmlFor="pp-ai-prompt">
            Describe edit / restyle
          </label>
          <textarea
            id="pp-ai-prompt"
            className="props-panel__textarea"
            rows={2}
            placeholder="e.g. oil painting style, watercolor, cyberpunk..."
            value={aiPrompt}
            disabled={isDisabled || isAiLoading}
            onChange={(e) => setAiPrompt(e.target.value)}
          />
        </div>

        {/* Preset Chips */}
        <div className="props-panel__chips">
          {AI_EDIT_PRESETS.map((preset) => (
            <button
              key={preset}
              type="button"
              className="props-panel__chip"
              disabled={isDisabled || isAiLoading}
              onClick={() => setAiPrompt(preset)}
            >
              {preset}
            </button>
          ))}
        </div>

        {/* Strength Slider */}
        <div className="props-panel__adj-item" style={{ marginTop: '10px' }}>
          <div className="props-panel__adj-title-row">
            <label className="props-panel__adj-label" htmlFor="pp-ai-strength">
              Transformation Strength
            </label>
            <span className="props-panel__pct">{aiStrength}%</span>
          </div>
          <input
            id="pp-ai-strength"
            type="range"
            min="10"
            max="100"
            step="1"
            value={aiStrength}
            disabled={isDisabled || isAiLoading}
            className="props-panel__slider"
            onChange={(e) => setAiStrength(Number(e.target.value))}
            aria-valuetext={`${aiStrength}%`}
          />
        </div>

        {/* Friendly Error Alert */}
        {aiError && (
          <div className="props-panel__error" role="alert">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14" aria-hidden="true">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <span>{aiError}</span>
          </div>
        )}

        {/* Apply Button */}
        <button
          type="button"
          className="editor-btn editor-btn--gold props-panel__apply-ai-btn"
          disabled={isDisabled || isAiLoading || !aiPrompt.trim()}
          onClick={handleApplyAiEdit}
        >
          {isAiLoading ? (
            <>
              <div className="props-panel__spinner" aria-hidden="true" />
              <span>Restyling with SDXL…</span>
            </>
          ) : (
            <>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14" aria-hidden="true">
                <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
              </svg>
              <span>Apply AI Edit (New Layer)</span>
            </>
          )}
        </button>

        {isAiLoading && (
          <p className="props-panel__loading-sub">
            Generating with Cloudflare SDXL Lightning. This usually takes 10–25s…
          </p>
        )}
      </div>

      {/* ── Compare Session Baseline ─────────────────────── */}
      <div className="props-panel__section">
        <button
          type="button"
          className={`editor-btn props-panel__compare-btn${isComparingSession ? ' editor-btn--active' : ''}`}
          title="Hold to preview document as it was when the editing session started"
          onPointerDown={() => store.getState().setIsComparingSession(true)}
          onPointerUp={() => store.getState().setIsComparingSession(false)}
          onPointerLeave={() => store.getState().setIsComparingSession(false)}
          onTouchStart={() => store.getState().setIsComparingSession(true)}
          onTouchEnd={() => store.getState().setIsComparingSession(false)}
        >
          {isComparingSession ? '👁 Viewing Session Baseline…' : '👁 Hold to Compare (Session Start)'}
        </button>
      </div>

      {/* ── Current rotation readout ────────────────────── */}
      <div className="props-panel__section props-panel__section--subtle">
        <span className="props-panel__label">Rotation</span>
        <span className="props-panel__value">{layer.rotation}°</span>
      </div>
    </div>
  );
}
