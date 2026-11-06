import { useState, useMemo } from 'react';
import { LightboxModal, ConfirmDialog, MODEL_LABELS } from './Modal';
import { useToast } from './Toast';
import { downloadImageFile } from '../lib/download';
import './GalleryTab.css';

export function GalleryTab({
  generations,
  onToggleFavorite,
  onDeleteGeneration,
  onClearAllGenerations,
  onReuseSettings,
  onEditImage,
  onNavigateGenerate,
}) {
  const [filter, setFilter] = useState('all');
  const [activeLightboxRecord, setActiveLightboxRecord] = useState(null);
  const [isClearModalOpen, setIsClearModalOpen] = useState(false);
  const [includeFavoritesInClear, setIncludeFavoritesInClear] = useState(false);
  const [singleDeleteTarget, setSingleDeleteTarget] = useState(null);

  const { showToast } = useToast();

  // Filtered generations list
  const filteredGenerations = useMemo(() => {
    if (filter === 'favorites') {
      return generations.filter((g) => g.favorite);
    }
    if (filter === 'edits') {
      return generations.filter((g) => g.type === 'edit');
    }
    return generations;
  }, [generations, filter]);

  // Favorite count
  const favCount = useMemo(() => {
    return generations.filter((g) => g.favorite).length;
  }, [generations]);

  const nonFavCount = generations.length - favCount;

  // Handle Favorite toggle
  const handleToggleFavorite = async (id) => {
    const newState = await onToggleFavorite(id);
    if (activeLightboxRecord && activeLightboxRecord.id === id) {
      setActiveLightboxRecord((prev) => (prev ? { ...prev, favorite: newState } : null));
    }
    showToast(newState ? 'Added to favorites' : 'Removed from favorites');
  };

  // Handle single delete confirm
  const handleConfirmSingleDelete = async () => {
    if (!singleDeleteTarget) return;
    await onDeleteGeneration(singleDeleteTarget.id);
    if (activeLightboxRecord && activeLightboxRecord.id === singleDeleteTarget.id) {
      setActiveLightboxRecord(null);
    }
    setSingleDeleteTarget(null);
    showToast('Image deleted from history');
  };

  // Handle Clear All confirm
  const handleConfirmClearAll = async () => {
    await onClearAllGenerations(includeFavoritesInClear);
    setIsClearModalOpen(false);
    setIncludeFavoritesInClear(false);
    showToast('History cleared');
  };

  return (
    <div className="gallery-container">
      {/* ── Toolbar ── */}
      <div className="gallery-toolbar">
        <div className="gallery-filters">
          <button
            type="button"
            className={`gallery-filter-btn ${filter === 'all' ? 'active' : ''}`}
            onClick={() => setFilter('all')}
          >
            All
          </button>
          <button
            type="button"
            className={`gallery-filter-btn ${filter === 'favorites' ? 'active' : ''}`}
            onClick={() => setFilter('favorites')}
          >
            <svg
              viewBox="0 0 24 24"
              fill={filter === 'favorites' ? 'currentColor' : 'none'}
              stroke="currentColor"
              strokeWidth="2"
              width="14"
              height="14"
            >
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
            </svg>
            <span>Favorites</span>
          </button>
          <button
            type="button"
            className={`gallery-filter-btn ${filter === 'edits' ? 'active' : ''}`}
            onClick={() => setFilter('edits')}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
              <path d="M12 20h9M16.5 3.5a2.12 2.12 0 013 3L7 19l-4 1 1-4z" />
            </svg>
            <span>Edits</span>
          </button>
        </div>

        {generations.length > 0 && (
          <button
            type="button"
            className="gallery-clear-btn"
            onClick={() => setIsClearModalOpen(true)}
            title="Clear history"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
            </svg>
            <span>Clear history</span>
          </button>
        )}
      </div>

      {/* ── Gallery Content ── */}
      {filteredGenerations.length === 0 ? (
        <div className="gallery-empty">
          <div className="gallery-empty-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="32" height="32">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <polyline points="21 15 16 10 5 21" />
            </svg>
          </div>

          {filter === 'favorites' && (
            <>
              <h3>No favorites yet</h3>
              <p>Star some images to find them here.</p>
            </>
          )}

          {filter === 'edits' && (
            <>
              <h3>No edits yet</h3>
              <p>Use the Edit tab to modify an image.</p>
            </>
          )}

          {filter === 'all' && (
            <>
              <h3>No images yet</h3>
              <p>Go generate something amazing! Your creations will appear here.</p>
              <button
                type="button"
                className="gallery-empty-btn"
                onClick={onNavigateGenerate}
              >
                Start Creating
              </button>
            </>
          )}
        </div>
      ) : (
        <div className="gallery-grid">
          {filteredGenerations.map((rec) => {
            const truncatedPrompt =
              rec.prompt && rec.prompt.length > 60
                ? rec.prompt.slice(0, 60) + '…'
                : rec.prompt || 'Untitled';
            const modelLabel = MODEL_LABELS[rec.model] || rec.model || 'Standard';
            const styleLabel = rec.style && rec.style !== 'none' ? rec.style : '';

            return (
              <div key={rec.id} className="gallery-card">
                <div
                  className="gallery-card-image"
                  onClick={() => setActiveLightboxRecord(rec)}
                  role="button"
                  tabIndex={0}
                  aria-label={`View image: ${rec.prompt}`}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      setActiveLightboxRecord(rec);
                    }
                  }}
                >
                  <img src={rec.image} alt={rec.prompt || 'Gallery image'} loading="lazy" decoding="async" />
                  {rec.type === 'edit' && <span className="gallery-card-badge">Edited</span>}

                  <div className="gallery-card-overlay">
                    <button
                      type="button"
                      className={`gallery-card-action fav-btn ${rec.favorite ? 'active' : ''}`}
                      title={rec.favorite ? 'Favorited' : 'Favorite'}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleToggleFavorite(rec.id);
                      }}
                    >
                      <svg
                        viewBox="0 0 24 24"
                        fill={rec.favorite ? 'currentColor' : 'none'}
                        stroke="currentColor"
                        strokeWidth="2"
                        width="16"
                        height="16"
                      >
                        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                      </svg>
                    </button>

                    <button
                      type="button"
                      className="gallery-card-action"
                      title="Edit this image"
                      onClick={(e) => {
                        e.stopPropagation();
                        onEditImage(rec);
                      }}
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
                        <path d="M12 20h9M16.5 3.5a2.12 2.12 0 013 3L7 19l-4 1 1-4z" />
                      </svg>
                    </button>

                    <button
                      type="button"
                      className="gallery-card-action"
                      title="Download"
                      onClick={(e) => {
                        e.stopPropagation();
                        downloadImageFile(rec.image, rec.prompt, showToast);
                      }}
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
                        <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" />
                      </svg>
                    </button>

                    <button
                      type="button"
                      className="gallery-card-action danger"
                      title="Delete"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSingleDeleteTarget(rec);
                      }}
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
                        <polyline points="3 6 5 6 21 6" />
                        <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
                      </svg>
                    </button>
                  </div>
                </div>

                <div className="gallery-card-info">
                  <div className="gallery-card-prompt">{truncatedPrompt}</div>
                  <div className="gallery-card-meta">
                    <span className="gallery-card-model">{modelLabel}</span>
                    {styleLabel && <span className="gallery-card-style">{styleLabel}</span>}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Lightbox Detail Modal ── */}
      <LightboxModal
        isOpen={Boolean(activeLightboxRecord)}
        onClose={() => setActiveLightboxRecord(null)}
        record={activeLightboxRecord}
        onToggleFavorite={handleToggleFavorite}
        onReuseSettings={onReuseSettings}
        onEditImage={onEditImage}
        onDelete={(rec) => setSingleDeleteTarget(rec)}
        onDownload={(rec) => downloadImageFile(rec.image, rec.prompt, showToast)}
      />

      {/* ── Single Image Delete Confirm Dialog ── */}
      <ConfirmDialog
        isOpen={Boolean(singleDeleteTarget)}
        onClose={() => setSingleDeleteTarget(null)}
        onConfirm={handleConfirmSingleDelete}
        title="Delete Image"
        message="Are you sure you want to delete this image? This cannot be undone."
        confirmText="Delete"
        isDanger={true}
      />

      {/* ── Clear All History Confirm Dialog ── */}
      <ConfirmDialog
        isOpen={isClearModalOpen}
        onClose={() => {
          setIsClearModalOpen(false);
          setIncludeFavoritesInClear(false);
        }}
        onConfirm={handleConfirmClearAll}
        title="Clear All History"
        message={`This will delete ${
          includeFavoritesInClear ? generations.length : nonFavCount
        } image${
          (includeFavoritesInClear ? generations.length : nonFavCount) !== 1 ? 's' : ''
        } from your history.${favCount > 0 && !includeFavoritesInClear ? ' Favorites are kept by default.' : ''}`}
        confirmText="Delete"
        isDanger={true}
      >
        {favCount > 0 && (
          <label className="confirm-checkbox-label">
            <input
              type="checkbox"
              checked={includeFavoritesInClear}
              onChange={(e) => setIncludeFavoritesInClear(e.target.checked)}
            />
            <span>Also delete {favCount} favorited image{favCount > 1 ? 's' : ''}</span>
          </label>
        )}
      </ConfirmDialog>
    </div>
  );
}
