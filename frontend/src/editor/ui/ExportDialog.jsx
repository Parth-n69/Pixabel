import { useState, useEffect, useRef } from 'react';
import {
  computeOutputDimensions,
  renderDocumentToBlob,
  downloadBlob,
  saveDocumentToGallery,
} from '../engine/exportEngine.js';
import './ExportDialog.css';

/**
 * ExportDialog — modal dialog for exporting document images (PNG, JPG, WebP)
 * with quality, 1x/2x scale (capped at 4096px), custom JPG background,
 * filename input, and "Save to gallery".
 */
export function ExportDialog({
  isOpen,
  onClose,
  store,
  assetStore,
  onToast,
}) {
  const [format, setFormat] = useState('png'); // 'png' | 'jpeg' | 'webp'
  const [scale, setScale] = useState(1);       // 1 | 2
  const [quality, setQuality] = useState(92);   // 10 - 100
  const [jpegBg, setJpegBg] = useState('#ffffff');
  const [filename, setFilename] = useState('pixabel-art');
  const [isExporting, setIsExporting] = useState(false);
  const [isSavingGallery, setIsSavingGallery] = useState(false);

  const dialogRef = useRef(null);

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const doc = store.getState().document;
  const visibleLayerCount = doc.layers.filter((l) => l.visible).length;
  const { width: outW, height: outH, wasCapped } = computeOutputDimensions(doc, scale);

  const ext = format === 'jpeg' ? 'jpg' : format;

  // ── Download File ───────────────────────────────────────
  const handleDownload = async () => {
    if (isExporting) return;
    setIsExporting(true);

    try {
      const { blob } = await renderDocumentToBlob(doc, assetStore, {
        format,
        scale,
        quality: quality / 100,
        jpegBackground: jpegBg,
      });

      const cleanFilename = (filename.trim() || 'pixabel-art').replace(/\.[^/.]+$/, '');
      downloadBlob(blob, `${cleanFilename}.${ext}`);

      onToast?.(`Exported as ${ext.toUpperCase()} (${outW}×${outH}px)`, 'success');
      onClose();
    } catch (err) {
      console.error('[Export] Download failed:', err);
      onToast?.('Failed to export image. Please try again.', 'error');
    } finally {
      setIsExporting(false);
    }
  };

  // ── Save to Gallery ─────────────────────────────────────
  const handleSaveToGallery = async () => {
    if (isSavingGallery) return;
    setIsSavingGallery(true);

    try {
      const cleanTitle = filename.trim() || doc.name || 'Pixabel Artwork';
      await saveDocumentToGallery(doc, assetStore, {
        scale,
        format: format === 'jpeg' ? 'jpeg' : 'png',
        jpegBackground: jpegBg,
        title: cleanTitle,
      });

      onToast?.('Saved flattened artwork to your gallery!', 'success');
      onClose();
    } catch (err) {
      console.error('[Export] Save to gallery failed:', err);
      onToast?.('Failed to save to gallery.', 'error');
    } finally {
      setIsSavingGallery(false);
    }
  };

  return (
    <div
      className="export-modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="presentation"
    >
      <div
        ref={dialogRef}
        className="export-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="export-dialog-title"
      >
        {/* ── Header ── */}
        <div className="export-modal__header">
          <div className="export-modal__title-row">
            <h2 id="export-dialog-title" className="export-modal__title">
              Export Image
            </h2>
            <span className="export-modal__badge">
              {visibleLayerCount} {visibleLayerCount === 1 ? 'layer' : 'layers'}
            </span>
          </div>
          <button
            type="button"
            className="export-modal__close-btn"
            onClick={onClose}
            aria-label="Close export dialog"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* ── Body ── */}
        <div className="export-modal__body">
          {/* Format selection */}
          <div className="export-field">
            <div className="export-field__label-row">
              <span className="export-field__label">File Format</span>
            </div>
            <div className="export-segmented" role="radiogroup" aria-label="Export format">
              <button
                type="button"
                className={`export-segmented__btn ${format === 'png' ? 'export-segmented__btn--active' : ''}`}
                onClick={() => setFormat('png')}
                role="radio"
                aria-checked={format === 'png'}
              >
                <span>PNG</span>
                <span className="export-segmented__sub">Lossless</span>
              </button>
              <button
                type="button"
                className={`export-segmented__btn ${format === 'jpeg' ? 'export-segmented__btn--active' : ''}`}
                onClick={() => setFormat('jpeg')}
                role="radio"
                aria-checked={format === 'jpeg'}
              >
                <span>JPG</span>
                <span className="export-segmented__sub">Compact</span>
              </button>
              <button
                type="button"
                className={`export-segmented__btn ${format === 'webp' ? 'export-segmented__btn--active' : ''}`}
                onClick={() => setFormat('webp')}
                role="radio"
                aria-checked={format === 'webp'}
              >
                <span>WebP</span>
                <span className="export-segmented__sub">Modern</span>
              </button>
            </div>
          </div>

          {/* Scale selection (1x vs 2x, capped at 4096px) */}
          <div className="export-field">
            <div className="export-field__label-row">
              <span className="export-field__label">Resolution Scale</span>
              <span className="export-field__val">{outW} × {outH} px</span>
            </div>
            <div className="export-segmented export-segmented--2col" role="radiogroup" aria-label="Resolution scale">
              <button
                type="button"
                className={`export-segmented__btn ${scale === 1 ? 'export-segmented__btn--active' : ''}`}
                onClick={() => setScale(1)}
                role="radio"
                aria-checked={scale === 1}
              >
                <span>1× Standard</span>
                <span className="export-segmented__sub">{doc.width} × {doc.height} px</span>
              </button>
              <button
                type="button"
                className={`export-segmented__btn ${scale === 2 ? 'export-segmented__btn--active' : ''}`}
                onClick={() => setScale(2)}
                role="radio"
                aria-checked={scale === 2}
              >
                <span>2× High-Res</span>
                <span className="export-segmented__sub">
                  {Math.round(doc.width * 2)} × {Math.round(doc.height * 2)} px
                </span>
              </button>
            </div>
          </div>

          {/* Quality Slider (JPG and WebP) */}
          {(format === 'jpeg' || format === 'webp') && (
            <div className="export-field">
              <div className="export-field__label-row">
                <label className="export-field__label" htmlFor="export-quality">
                  Compression Quality
                </label>
                <span className="export-field__val">{quality}%</span>
              </div>
              <input
                id="export-quality"
                type="range"
                min="10"
                max="100"
                step="1"
                value={quality}
                className="props-panel__slider"
                onChange={(e) => setQuality(Number(e.target.value))}
                aria-valuetext={`${quality}%`}
              />
            </div>
          )}

          {/* Background color for JPG */}
          {format === 'jpeg' ? (
            <div className="export-field">
              <div className="export-field__label-row">
                <span className="export-field__label">JPG Background Color</span>
                <span className="export-field__val">{jpegBg}</span>
              </div>
              <div className="export-color-presets">
                <button
                  type="button"
                  title="White background"
                  className={`export-color-chip ${jpegBg === '#ffffff' ? 'export-color-chip--active' : ''}`}
                  style={{ background: '#ffffff' }}
                  onClick={() => setJpegBg('#ffffff')}
                />
                <button
                  type="button"
                  title="Dark slate canvas"
                  className={`export-color-chip ${jpegBg === '#1a1a1e' ? 'export-color-chip--active' : ''}`}
                  style={{ background: '#1a1a1e' }}
                  onClick={() => setJpegBg('#1a1a1e')}
                />
                <button
                  type="button"
                  title="Black background"
                  className={`export-color-chip ${jpegBg === '#000000' ? 'export-color-chip--active' : ''}`}
                  style={{ background: '#000000' }}
                  onClick={() => setJpegBg('#000000')}
                />
                <input
                  type="color"
                  value={jpegBg}
                  title="Choose custom background color"
                  className="export-color-input"
                  onChange={(e) => setJpegBg(e.target.value)}
                  aria-label="Custom background color"
                />
              </div>
            </div>
          ) : (
            <div className="export-summary-row" style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
              <span>✓ Transparency preserved (alpha channel active)</span>
            </div>
          )}

          {/* Filename Input */}
          <div className="export-field">
            <div className="export-field__label-row">
              <label className="export-field__label" htmlFor="export-filename">
                File Name
              </label>
            </div>
            <div className="export-input-wrap">
              <input
                id="export-filename"
                type="text"
                className="export-input"
                value={filename}
                onChange={(e) => setFilename(e.target.value)}
                placeholder="pixabel-artwork"
              />
              <span className="export-input-ext">.{ext}</span>
            </div>
          </div>

          {/* Output summary */}
          <div className="export-summary-box">
            <div className="export-summary-row">
              <span className="export-summary-label">Output Dimensions:</span>
              <span className="export-summary-val">{outW} × {outH} px</span>
            </div>
            <div className="export-summary-row">
              <span className="export-summary-label">Layers Exported:</span>
              <span className="export-summary-val">{visibleLayerCount} visible (hidden omitted)</span>
            </div>
            {wasCapped && (
              <div className="export-summary-cap-note">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="13" height="13">
                  <path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <span>Resolution capped at maximum 4096px longest side.</span>
              </div>
            )}
          </div>
        </div>

        {/* ── Footer Actions ── */}
        <div className="export-modal__footer">
          <button
            type="button"
            className="editor-btn"
            onClick={handleSaveToGallery}
            disabled={isExporting || isSavingGallery || visibleLayerCount === 0}
            title="Store flattened image in Pixabel Gallery"
          >
            {isSavingGallery ? (
              <span>Saving…</span>
            ) : (
              <>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                  <circle cx="8.5" cy="8.5" r="1.5" />
                  <polyline points="21 15 16 10 5 21" />
                </svg>
                <span>Save to Gallery</span>
              </>
            )}
          </button>

          <div className="export-modal__footer-right">
            <button
              type="button"
              className="editor-btn editor-btn--ghost"
              onClick={onClose}
              disabled={isExporting || isSavingGallery}
            >
              Cancel
            </button>
            <button
              type="button"
              className="editor-btn editor-btn--gold"
              onClick={handleDownload}
              disabled={isExporting || isSavingGallery || visibleLayerCount === 0}
            >
              {isExporting ? (
                <span>Exporting…</span>
              ) : (
                <>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
                    <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" />
                  </svg>
                  <span>Export & Download</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
