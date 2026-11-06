import { useState, useEffect, useRef, useCallback } from 'react';
import { restyleImage } from '../lib/api';
import { downloadImageFile } from '../lib/download';
import { useToast } from './Toast';
import './EditTab.css';

const RESTYLE_PRESETS = [
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

const DEFAULT_BASE_EDITS = {
  brightness: 100,
  contrast: 100,
  saturation: 100,
  blur: 0,
  grayscale: false,
  sepia: false,
  invert: false,
  rotation: 0,
  flipH: 1,
  flipV: 1,
};

export function EditTab({
  initialRecord,
  onSaveToGallery,
}) {
  const [sourceImage, setSourceImage] = useState(null);
  const [originalImageSrc, setOriginalImageSrc] = useState(null);
  const [parentId, setParentId] = useState(null);
  const [editHistory, setEditHistory] = useState([]);
  const [baseEdits, setBaseEdits] = useState(DEFAULT_BASE_EDITS);

  // Restyle state (Cloudflare SDXL Lightning img2img)
  const [restylePrompt, setRestylePrompt] = useState('');
  const [restyleStrength, setRestyleStrength] = useState(75);
  const [isRestyleLoading, setIsRestyleLoading] = useState(false);

  // Compare overlay
  const [isComparing, setIsComparing] = useState(false);

  // Drag over state
  const [isDragOver, setIsDragOver] = useState(false);

  const { showToast } = useToast();

  const canvasRef = useRef(null);
  const dropZoneRef = useRef(null);
  const fileInputRef = useRef(null);

  // Load an image into the editor
  const loadImage = useCallback((src, recId = null) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      setSourceImage(img);
      setOriginalImageSrc(src);
      setParentId(recId);
      setEditHistory([src]);
      setBaseEdits(DEFAULT_BASE_EDITS);
    };
    img.src = src;
  }, []);

  // Check for initial record passed via props
  useEffect(() => {
    if (initialRecord?.image) {
      loadImage(initialRecord.image, initialRecord.id);
    }
  }, [initialRecord, loadImage]);

  // Redraw the canvas applying rotation, flips, and base CSS filters
  const drawCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const dropZone = dropZoneRef.current;
    if (!canvas || !dropZone || !sourceImage) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rad = (baseEdits.rotation * Math.PI) / 180;
    const cos = Math.abs(Math.cos(rad));
    const sin = Math.abs(Math.sin(rad));
    const w = sourceImage.width * cos + sourceImage.height * sin;
    const h = sourceImage.width * sin + sourceImage.height * cos;

    const containerW = Math.max(dropZone.clientWidth - 48, 200);
    const containerH = Math.max(dropZone.clientHeight - 48, 200);

    let scale = Math.min(containerW / w, containerH / h);
    if (scale > 1) scale = 1;

    canvas.width = Math.round(w * scale);
    canvas.height = Math.round(h * scale);

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();

    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate(rad);
    ctx.scale(baseEdits.flipH * scale, baseEdits.flipV * scale);

    let filterStr = `brightness(${baseEdits.brightness}%) contrast(${baseEdits.contrast}%) saturate(${baseEdits.saturation}%) blur(${baseEdits.blur}px)`;
    if (baseEdits.grayscale) filterStr += ' grayscale(100%)';
    if (baseEdits.sepia) filterStr += ' sepia(100%)';
    if (baseEdits.invert) filterStr += ' invert(100%)';
    ctx.filter = filterStr;

    ctx.drawImage(sourceImage, -sourceImage.width / 2, -sourceImage.height / 2);
    ctx.restore();
  }, [sourceImage, baseEdits]);

  useEffect(() => {
    drawCanvas();
  }, [drawCanvas]);

  // Handle window resize with rAF throttling
  useEffect(() => {
    let rafId = null;
    const handleResize = () => {
      if (rafId) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        drawCanvas();
        rafId = null;
      });
    };
    window.addEventListener('resize', handleResize);
    return () => {
      if (rafId) cancelAnimationFrame(rafId);
      window.removeEventListener('resize', handleResize);
    };
  }, [drawCanvas]);

  // File handling
  const handleFile = (file) => {
    if (!file) return;
    if (!file.type.match(/image\/(png|jpeg|webp)/)) {
      showToast('Invalid file format. Please upload PNG, JPEG, or WEBP.');
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      showToast('File is too large (max 8MB).');
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      if (e.target?.result) {
        loadImage(e.target.result);
        showToast('Image loaded');
      }
    };
    reader.readAsDataURL(file);
  };

  // Drag & drop handlers
  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  // Reset basic edits
  const handleReset = () => {
    setBaseEdits(DEFAULT_BASE_EDITS);
    showToast('Adjustments reset');
  };

  // Undo last change
  const handleUndo = () => {
    if (editHistory.length > 1) {
      const nextHistory = [...editHistory];
      nextHistory.pop();
      const lastState = nextHistory[nextHistory.length - 1];
      const img = new Image();
      img.onload = () => {
        setSourceImage(img);
        setEditHistory(nextHistory);
        setBaseEdits(DEFAULT_BASE_EDITS);
        showToast('Undone to previous state');
      };
      img.src = lastState;
    }
  };

  // Restyle Apply (Cloudflare SDXL Lightning img2img)
  const handleApplyRestyle = async () => {
    const prompt = restylePrompt.trim();
    if (!prompt || !sourceImage || isRestyleLoading) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const dataUrl = canvas.toDataURL('image/png');
    setIsRestyleLoading(true);

    try {
      const res = await restyleImage({
        image: dataUrl,
        prompt,
        strength: restyleStrength / 100,
      });

      const newImg = new Image();
      newImg.onload = () => {
        setSourceImage(newImg);
        setBaseEdits(DEFAULT_BASE_EDITS);
        setEditHistory((prev) => {
          const updated = [...prev, res.image];
          return updated.slice(-10);
        });
        showToast('AI Restyle applied successfully!');
      };
      newImg.src = res.image;
    } catch (err) {
      if (err.code === 'CF_RATE_LIMIT' || err.code === 'LIMIT_REACHED') {
        showToast(err.message || 'Rate limited. Please wait.');
      } else {
        showToast(err.message || 'Restyle failed. Please try again.');
      }
    } finally {
      setIsRestyleLoading(false);
    }
  };

  // Save to Gallery
  const handleSaveToGallery = async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const dataUrl = canvas.toDataURL('image/png');
    if (onSaveToGallery) {
      try {
        await onSaveToGallery({
          image: dataUrl,
          prompt: restylePrompt.trim() || 'Edited image',
          parentId: parentId || undefined,
        });
        showToast('Saved to your gallery!');
      } catch (err) {
        showToast('Failed to save to gallery: ' + err.message);
      }
    }
  };

  // Download Image
  const handleDownload = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dataUrl = canvas.toDataURL('image/png');
    downloadImageFile(dataUrl, restylePrompt.trim() || 'Edited_Image', showToast);
  };

  const isAnyLoading = isRestyleLoading;
  const hasImage = Boolean(sourceImage);

  return (
    <div className="edit-container">
      {/* ── Left Canvas Viewport ── */}
      <div className="edit-left">
        <div
          ref={dropZoneRef}
          className={`edit-canvas-wrapper ${isDragOver ? 'drag-over' : ''} ${
            hasImage ? 'has-image' : ''
          }`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          {!hasImage ? (
            <div className="edit-empty-state">
              <div className="edit-empty-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="32" height="32">
                  <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12" />
                </svg>
              </div>
              <p>Drag and drop an image here</p>
              <span className="or-divider">or</span>
              <button
                type="button"
                className="export-btn primary"
                onClick={() => fileInputRef.current?.click()}
              >
                Browse Files
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png, image/jpeg, image/webp"
                style={{ display: 'none' }}
                onChange={(e) => {
                  if (e.target.files && e.target.files[0]) {
                    handleFile(e.target.files[0]);
                  }
                }}
              />
            </div>
          ) : (
            <>
              <canvas ref={canvasRef} className="edit-canvas" />

              {/* Compare Overlay */}
              {isComparing && originalImageSrc && (
                <div className="edit-compare-overlay">
                  <span className="edit-compare-badge">Original</span>
                  <img src={originalImageSrc} alt="Original comparison preview" />
                </div>
              )}
            </>
          )}
        </div>

        {hasImage && (
          <div className="edit-image-actions">
            <button
              type="button"
              className="edit-action-btn"
              title="Undo last change"
              disabled={editHistory.length <= 1 || isAnyLoading}
              onClick={handleUndo}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
                <polyline points="1 4 1 10 7 10" />
                <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
              </svg>
              <span>Undo</span>
            </button>

            <button
              type="button"
              className="edit-action-btn"
              title="Reset all basic adjustments"
              disabled={isAnyLoading}
              onClick={handleReset}
            >
              Reset
            </button>

            <button
              type="button"
              className={`edit-action-btn ${isComparing ? 'active' : ''}`}
              title="Hold or click to compare original"
              onMouseDown={() => setIsComparing(true)}
              onMouseUp={() => setIsComparing(false)}
              onMouseLeave={() => setIsComparing(false)}
              onTouchStart={() => setIsComparing(true)}
              onTouchEnd={() => setIsComparing(false)}
            >
              Compare (Hold)
            </button>
          </div>
        )}
      </div>

      {/* ── Right Controls Panel ── */}
      <div className="edit-right">
        {/* AI Restyle Section (Cloudflare Workers AI img2img) */}
        <div className="edit-section">
          <h3 className="edit-section-title">
            <span>AI Restyle</span>
            <span className="edit-mode-badge free">Free daily</span>
          </h3>
          <p className="edit-section-hint">Powered by Cloudflare SDXL Lightning img2img</p>

          <div className="edit-field">
            <label>Describe the new style</label>
            <textarea
              className="edit-prompt-input"
              rows={2}
              placeholder="e.g. oil painting, watercolor wash, cyberpunk neon, anime style..."
              value={restylePrompt}
              onChange={(e) => setRestylePrompt(e.target.value)}
              disabled={!hasImage || isAnyLoading}
            />
          </div>

          <div className="slider-group">
            <label>
              <span>Transformation Strength</span>
              <span>{restyleStrength}%</span>
            </label>
            <input
              type="range"
              min="10"
              max="100"
              value={restyleStrength}
              disabled={!hasImage || isAnyLoading}
              onChange={(e) => setRestyleStrength(Number(e.target.value))}
            />
            <div className="strength-labels">
              <span>Subtle</span>
              <span>Strong</span>
            </div>
          </div>

          <div className="edit-chips">
            {RESTYLE_PRESETS.map((chip) => (
              <button
                key={chip}
                type="button"
                className="edit-chip"
                disabled={!hasImage || isAnyLoading}
                onClick={() => setRestylePrompt(chip)}
              >
                {chip}
              </button>
            ))}
          </div>

          <button
            type="button"
            className="export-btn primary w-full"
            style={{ width: '100%', marginTop: '4px' }}
            disabled={!hasImage || isAnyLoading || !restylePrompt.trim()}
            onClick={handleApplyRestyle}
          >
            {isRestyleLoading ? 'Restyling…' : 'Apply AI Restyle'}
          </button>

          {isRestyleLoading && (
            <div className="edit-loading-indicator">
              <div className="edit-spinner" />
              <span>Restyling via Cloudflare... this can take 15–30s</span>
            </div>
          )}
        </div>

        {/* Basic Tools */}
        <div className="edit-section">
          <h3 className="edit-section-title">Basic Tools</h3>

          <div className="basic-tools-row">
            <button
              type="button"
              className="tool-btn"
              title="Rotate Left (-90°)"
              disabled={!hasImage || isAnyLoading}
              onClick={() =>
                setBaseEdits((prev) => ({
                  ...prev,
                  rotation: (prev.rotation - 90 + 360) % 360,
                }))
              }
            >
              ↺
            </button>
            <button
              type="button"
              className="tool-btn"
              title="Rotate Right (+90°)"
              disabled={!hasImage || isAnyLoading}
              onClick={() =>
                setBaseEdits((prev) => ({
                  ...prev,
                  rotation: (prev.rotation + 90) % 360,
                }))
              }
            >
              ↻
            </button>
            <button
              type="button"
              className="tool-btn"
              title="Flip Horizontal"
              disabled={!hasImage || isAnyLoading}
              onClick={() =>
                setBaseEdits((prev) => ({
                  ...prev,
                  flipH: prev.flipH * -1,
                }))
              }
            >
              ↔
            </button>
            <button
              type="button"
              className="tool-btn"
              title="Flip Vertical"
              disabled={!hasImage || isAnyLoading}
              onClick={() =>
                setBaseEdits((prev) => ({
                  ...prev,
                  flipV: prev.flipV * -1,
                }))
              }
            >
              ↕
            </button>
          </div>

          <div className="slider-group">
            <label>
              <span>Brightness</span>
              <span>{baseEdits.brightness}%</span>
            </label>
            <input
              type="range"
              min="0"
              max="200"
              value={baseEdits.brightness}
              disabled={!hasImage || isAnyLoading}
              onChange={(e) =>
                setBaseEdits((prev) => ({ ...prev, brightness: Number(e.target.value) }))
              }
            />
          </div>

          <div className="slider-group">
            <label>
              <span>Contrast</span>
              <span>{baseEdits.contrast}%</span>
            </label>
            <input
              type="range"
              min="0"
              max="200"
              value={baseEdits.contrast}
              disabled={!hasImage || isAnyLoading}
              onChange={(e) =>
                setBaseEdits((prev) => ({ ...prev, contrast: Number(e.target.value) }))
              }
            />
          </div>

          <div className="slider-group">
            <label>
              <span>Saturation</span>
              <span>{baseEdits.saturation}%</span>
            </label>
            <input
              type="range"
              min="0"
              max="200"
              value={baseEdits.saturation}
              disabled={!hasImage || isAnyLoading}
              onChange={(e) =>
                setBaseEdits((prev) => ({ ...prev, saturation: Number(e.target.value) }))
              }
            />
          </div>

          <div className="slider-group">
            <label>
              <span>Blur</span>
              <span>{baseEdits.blur}px</span>
            </label>
            <input
              type="range"
              min="0"
              max="20"
              value={baseEdits.blur}
              disabled={!hasImage || isAnyLoading}
              onChange={(e) =>
                setBaseEdits((prev) => ({ ...prev, blur: Number(e.target.value) }))
              }
            />
          </div>

          <div className="filter-buttons">
            <button
              type="button"
              className={`filter-btn ${baseEdits.grayscale ? 'active' : ''}`}
              disabled={!hasImage || isAnyLoading}
              onClick={() =>
                setBaseEdits((prev) => ({ ...prev, grayscale: !prev.grayscale }))
              }
            >
              Grayscale
            </button>
            <button
              type="button"
              className={`filter-btn ${baseEdits.sepia ? 'active' : ''}`}
              disabled={!hasImage || isAnyLoading}
              onClick={() => setBaseEdits((prev) => ({ ...prev, sepia: !prev.sepia }))}
            >
              Sepia
            </button>
            <button
              type="button"
              className={`filter-btn ${baseEdits.invert ? 'active' : ''}`}
              disabled={!hasImage || isAnyLoading}
              onClick={() => setBaseEdits((prev) => ({ ...prev, invert: !prev.invert }))}
            >
              Invert
            </button>
          </div>
        </div>

        {/* Export */}
        <div className="edit-section">
          <h3 className="edit-section-title">Export</h3>
          <div className="export-buttons">
            <button
              type="button"
              className="export-btn"
              disabled={!hasImage || isAnyLoading}
              onClick={handleSaveToGallery}
            >
              Save to Gallery
            </button>
            <button
              type="button"
              className="export-btn primary"
              disabled={!hasImage || isAnyLoading}
              onClick={handleDownload}
            >
              Download
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
