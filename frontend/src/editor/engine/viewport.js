/**
 * ViewportController — zoom & pan for the editor canvas.
 * This is view state, NOT part of the document / history.
 *
 * Supports: wheel zoom toward cursor, Space+drag / middle-mouse pan,
 *           pinch-zoom, and programmatic zoom (fit, 100%, ±).
 *
 * Performance-tuned: Panning & zoom notification are coalesced
 * onto requestAnimationFrame ticks for 60/120fps smoothness.
 */
import { Point } from 'fabric';

const MIN_ZOOM = 0.05; // 5%
const MAX_ZOOM = 8;    // 800%
const WHEEL_FACTOR = 1.06;
const STEP_FACTOR = 1.25;

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

export class ViewportController {
  /**
   * @param {import('fabric').Canvas} canvas
   * @param {(zoom: number) => void} onChange
   */
  constructor(canvas, onChange) {
    this._canvas = canvas;
    this._onChange = onChange;
    this._zoom = 1;
    this._spaceHeld = false;
    this._panning = false;
    this._lastPanX = 0;
    this._lastPanY = 0;
    this._pendingPanDx = 0;
    this._pendingPanDy = 0;
    this._rafPanId = null;
    this._rafNotifyId = null;

    this._setupWheel();
    this._setupPan();
    this._setupKeyboard();
    this._setupPinch();
  }

  get zoom() {
    return this._zoom;
  }

  // ── Programmatic API ──────────────────────────────────────

  /** Zoom to an absolute level, optionally toward a canvas point. */
  zoomTo(zoom, point) {
    this._zoom = clamp(zoom, MIN_ZOOM, MAX_ZOOM);
    const p = point
      ? new Point(point.x, point.y)
      : new Point(this._canvas.width / 2, this._canvas.height / 2);
    this._canvas.zoomToPoint(p, this._zoom);
    this._canvas.requestRenderAll();
    this._notify();
  }

  /** Fit the document inside the viewport with 10 % margin. */
  zoomToFit(docWidth, docHeight) {
    const cw = this._canvas.width;
    const ch = this._canvas.height;
    if (!cw || !ch || !docWidth || !docHeight) return;

    this._zoom = clamp(
      Math.min(cw / docWidth, ch / docHeight) * 0.9,
      MIN_ZOOM,
      MAX_ZOOM,
    );
    this._canvas.setViewportTransform([
      this._zoom, 0, 0, this._zoom,
      (cw - docWidth * this._zoom) / 2,
      (ch - docHeight * this._zoom) / 2,
    ]);
    this._canvas.requestRenderAll();
    this._notify();
  }

  /** Zoom to 100 %. */
  zoomToActual() {
    this.zoomTo(1);
    const objs = this._canvas.getObjects();
    const docWidth = objs[0]?.width || 0;
    const docHeight = objs[0]?.height || 0;
    if (docWidth && docHeight) {
      const cw = this._canvas.width;
      const ch = this._canvas.height;
      this._canvas.setViewportTransform([
        1, 0, 0, 1,
        (cw - docWidth) / 2,
        (ch - docHeight) / 2,
      ]);
      this._canvas.requestRenderAll();
    }
  }

  zoomIn() {
    this.zoomTo(this._zoom * STEP_FACTOR);
  }

  zoomOut() {
    this.zoomTo(this._zoom / STEP_FACTOR);
  }

  // ── Wheel zoom toward cursor ──────────────────────────────

  _setupWheel() {
    this._canvas.on('mouse:wheel', (opt) => {
      const e = opt.e;
      e.preventDefault();
      e.stopPropagation();

      const factor = e.deltaY < 0 ? WHEEL_FACTOR : 1 / WHEEL_FACTOR;
      this.zoomTo(this._zoom * factor, { x: e.offsetX, y: e.offsetY });
    });
  }

  // ── Space+drag / middle-mouse pan with rAF batching ───────

  _setupPan() {
    this._canvas.on('mouse:down', (opt) => {
      const e = opt.e;
      if (this._spaceHeld || e.button === 1) {
        this._panning = true;
        this._lastPanX = e.clientX;
        this._lastPanY = e.clientY;
        this._pendingPanDx = 0;
        this._pendingPanDy = 0;
        this._canvas.selection = false;
        this._canvas.setCursor('grabbing');
        e.preventDefault();
      }
    });

    this._canvas.on('mouse:move', (opt) => {
      if (!this._panning) return;
      const e = opt.e;
      const dx = e.clientX - this._lastPanX;
      const dy = e.clientY - this._lastPanY;
      this._lastPanX = e.clientX;
      this._lastPanY = e.clientY;

      this._pendingPanDx += dx;
      this._pendingPanDy += dy;

      if (!this._rafPanId) {
        this._rafPanId = requestAnimationFrame(() => {
          this._rafPanId = null;
          if (!this._panning && this._pendingPanDx === 0 && this._pendingPanDy === 0) return;
          const vpt = this._canvas.viewportTransform.slice();
          vpt[4] += this._pendingPanDx;
          vpt[5] += this._pendingPanDy;
          this._pendingPanDx = 0;
          this._pendingPanDy = 0;
          this._canvas.setViewportTransform(vpt);
          this._canvas.requestRenderAll();
        });
      }
    });

    this._canvas.on('mouse:up', () => {
      if (this._panning) {
        this._panning = false;
        this._canvas.setCursor(this._spaceHeld ? 'grab' : 'default');
      }
    });
  }

  // ── Keyboard (Space for pan mode) ─────────────────────────

  _setupKeyboard() {
    this._onKeyDown = (e) => {
      if (e.code === 'Space' && !e.repeat) {
        const tag = document.activeElement?.tagName?.toLowerCase();
        if (tag === 'input' || tag === 'textarea') return;
        e.preventDefault();
        this._spaceHeld = true;
        this._canvas.setCursor('grab');
        this._canvas.forEachObject((obj) => {
          obj._savedEvented = obj.evented;
          obj.evented = false;
        });
      }
    };

    this._onKeyUp = (e) => {
      if (e.code === 'Space') {
        this._spaceHeld = false;
        this._canvas.setCursor('default');
        this._canvas.forEachObject((obj) => {
          if (obj._savedEvented !== undefined) {
            obj.evented = obj._savedEvented;
            delete obj._savedEvented;
          }
        });
      }
    };

    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
  }

  // ── Pinch-zoom (touch) ────────────────────────────────────

  _setupPinch() {
    const el = this._canvas.upperCanvasEl;
    if (!el) return;

    let initialDist = 0;
    let initialZoom = 1;

    el.addEventListener(
      'touchstart',
      (e) => {
        if (e.touches.length === 2) {
          initialDist = _touchDist(e.touches);
          initialZoom = this._zoom;
          e.preventDefault();
        }
      },
      { passive: false },
    );

    el.addEventListener(
      'touchmove',
      (e) => {
        if (e.touches.length === 2 && initialDist > 0) {
          const dist = _touchDist(e.touches);
          const center = _touchCenter(e.touches, el);
          this.zoomTo(initialZoom * (dist / initialDist), center);
          e.preventDefault();
        }
      },
      { passive: false },
    );

    el.addEventListener('touchend', () => {
      initialDist = 0;
    });
  }

  // ── Helpers (throttled notification to React via rAF) ─────

  _notify() {
    if (this._rafNotifyId) return;
    this._rafNotifyId = requestAnimationFrame(() => {
      this._rafNotifyId = null;
      this._onChange?.(this._zoom);
    });
  }

  dispose() {
    if (this._rafPanId) {
      cancelAnimationFrame(this._rafPanId);
      this._rafPanId = null;
    }
    if (this._rafNotifyId) {
      cancelAnimationFrame(this._rafNotifyId);
      this._rafNotifyId = null;
    }
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup', this._onKeyUp);
  }
}

// ── Touch helpers ─────────────────────────────────────────────

function _touchDist(touches) {
  return Math.hypot(
    touches[1].clientX - touches[0].clientX,
    touches[1].clientY - touches[0].clientY,
  );
}

function _touchCenter(touches, el) {
  const rect = el.getBoundingClientRect();
  return {
    x: (touches[0].clientX + touches[1].clientX) / 2 - rect.left,
    y: (touches[0].clientY + touches[1].clientY) / 2 - rect.top,
  };
}
