import { useEffect, useState, useRef, useCallback } from 'react';
import {
  loadImageIntoEditor,
  mergeLayersDown,
  flattenAllLayers,
} from '../engine/imageLoader.js';

/**
 * LayersPanel — layer list with thumbnails, reorder, rename, visibility,
 * lock, and action buttons.  Top layer first.
 */
export function LayersPanel({ store, assetStore }) {
  const [layers, setLayers] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState('');
  const [dragIdx, setDragIdx] = useState(null);
  const [dragOverIdx, setDragOverIdx] = useState(null);
  const renameRef = useRef(null);

  // Subscribe to store
  useEffect(() => {
    const update = (state) => {
      setLayers([...state.document.layers].reverse());
      setSelectedId(state.selectedLayerId);
    };
    update(store.getState());
    return store.subscribe(update);
  }, [store]);

  const dispatch = useCallback(
    (action) => store.getState().dispatch(action),
    [store],
  );

  const select = useCallback(
    (id) => store.getState().setSelectedLayerId(id),
    [store],
  );

  // ── Rename ──────────────────────────────────────────────────

  const startRename = (layer) => {
    setEditingId(layer.id);
    setEditName(layer.name);
    setTimeout(() => renameRef.current?.select(), 0);
  };

  const commitRename = () => {
    if (editingId && editName.trim()) {
      dispatch({ type: 'renameLayer', layerId: editingId, name: editName.trim() });
    }
    setEditingId(null);
  };

  // ── Drag-and-drop reorder ──────────────────────────────────

  const handleDragStart = (e, idx) => {
    setDragIdx(idx);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', ''); // required by Firefox
  };

  const handleDragOver = (e, idx) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverIdx(idx);
  };

  const handleDrop = (e, dropIdx) => {
    e.preventDefault();
    if (dragIdx === null || dragIdx === dropIdx) {
      setDragIdx(null);
      setDragOverIdx(null);
      return;
    }
    // layers array is reversed for display; convert back to doc indices
    const docLength = layers.length;
    const fromDoc = docLength - 1 - dragIdx;
    const toDoc = docLength - 1 - dropIdx;
    const layerId = layers[dragIdx].id;
    dispatch({ type: 'reorderLayer', layerId, toIndex: toDoc });
    setDragIdx(null);
    setDragOverIdx(null);
  };

  const handleDragEnd = () => {
    setDragIdx(null);
    setDragOverIdx(null);
  };

  // ── Move up/down (keyboard accessible) ──────────────────────

  const moveUp = (layer) => {
    const docIdx = store.getState().document.layers.findIndex((l) => l.id === layer.id);
    if (docIdx < store.getState().document.layers.length - 1) {
      dispatch({ type: 'reorderLayer', layerId: layer.id, toIndex: docIdx + 1 });
    }
  };

  const moveDown = (layer) => {
    const docIdx = store.getState().document.layers.findIndex((l) => l.id === layer.id);
    if (docIdx > 0) {
      dispatch({ type: 'reorderLayer', layerId: layer.id, toIndex: docIdx - 1 });
    }
  };

  // ── Action buttons ──────────────────────────────────────────

  const handleAddImage = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/png,image/jpeg,image/webp';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      await loadImageIntoEditor(file, assetStore, store);
    };
    input.click();
  };

  const handleDuplicate = () => {
    if (!selectedId) return;
    dispatch({ type: 'duplicateLayer', layerId: selectedId });
  };

  const handleDelete = () => {
    if (!selectedId) return;
    dispatch({ type: 'deleteLayer', layerId: selectedId });
    // Select next layer
    const doc = store.getState().document;
    if (doc.layers.length > 0) {
      select(doc.layers[doc.layers.length - 1].id);
    } else {
      select(null);
    }
  };

  const handleMergeDown = async () => {
    if (!selectedId) return;
    const docIdx = store.getState().document.layers.findIndex((l) => l.id === selectedId);
    if (docIdx <= 0) return;
    await mergeLayersDown(store, assetStore, selectedId);
  };

  const handleFlatten = async () => {
    await flattenAllLayers(store, assetStore);
  };

  // Can merge down if selected is above index 0
  const canMerge = (() => {
    if (!selectedId) return false;
    const doc = store.getState().document;
    const idx = doc.layers.findIndex((l) => l.id === selectedId);
    return idx > 0;
  })();

  // ── Thumbnail helper ────────────────────────────────────────

  const getThumbnailUrl = (layer) => {
    if (!layer.assetId) return null;
    return assetStore.getUrl(layer.assetId);
  };

  // ── Render ──────────────────────────────────────────────────

  return (
    <div className="layers-panel" role="region" aria-label="Layers">
      <div className="layers-panel__header">
        <span className="layers-panel__title">Layers</span>
      </div>

      {layers.length === 0 ? (
        <div className="layers-panel__empty">
          <p>No layers yet</p>
          <button className="editor-btn editor-btn--gold" onClick={handleAddImage}>
            + Add Image
          </button>
        </div>
      ) : (
        <ul className="layers-panel__list" role="listbox" aria-label="Layer list">
          {layers.map((layer, idx) => {
            const isSelected = layer.id === selectedId;
            const isDragTarget = dragOverIdx === idx && dragIdx !== idx;

            return (
              <li
                key={layer.id}
                role="option"
                aria-selected={isSelected}
                className={
                  'layers-panel__item' +
                  (isSelected ? ' layers-panel__item--selected' : '') +
                  (isDragTarget ? ' layers-panel__item--dragover' : '') +
                  (dragIdx === idx ? ' layers-panel__item--dragging' : '')
                }
                onClick={() => select(layer.id)}
                draggable
                onDragStart={(e) => handleDragStart(e, idx)}
                onDragOver={(e) => handleDragOver(e, idx)}
                onDrop={(e) => handleDrop(e, idx)}
                onDragEnd={handleDragEnd}
              >
                {/* Thumbnail */}
                <div className="layers-panel__thumb">
                  {getThumbnailUrl(layer) ? (
                    <img
                      src={getThumbnailUrl(layer)}
                      alt=""
                      draggable={false}
                    />
                  ) : (
                    <div className="layers-panel__thumb-empty" />
                  )}
                </div>

                {/* Name (double-click to rename) */}
                <div className="layers-panel__name">
                  {editingId === layer.id ? (
                    <input
                      ref={renameRef}
                      className="layers-panel__rename-input"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      onBlur={commitRename}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') commitRename();
                        if (e.key === 'Escape') setEditingId(null);
                      }}
                      onClick={(e) => e.stopPropagation()}
                      aria-label="Rename layer"
                    />
                  ) : (
                    <span
                      className="layers-panel__name-text"
                      onDoubleClick={(e) => {
                        e.stopPropagation();
                        startRename(layer);
                      }}
                      title="Double-click to rename"
                    >
                      {layer.name}
                    </span>
                  )}
                </div>

                {/* Controls */}
                <div className="layers-panel__controls">
                  {/* Move up/down */}
                  <button
                    className="layers-panel__ctrl-btn"
                    title="Move up"
                    aria-label={`Move ${layer.name} up`}
                    disabled={idx === 0}
                    onClick={(e) => { e.stopPropagation(); moveUp(layer); }}
                  >
                    ▲
                  </button>
                  <button
                    className="layers-panel__ctrl-btn"
                    title="Move down"
                    aria-label={`Move ${layer.name} down`}
                    disabled={idx === layers.length - 1}
                    onClick={(e) => { e.stopPropagation(); moveDown(layer); }}
                  >
                    ▼
                  </button>
                  {/* Visibility */}
                  <button
                    className={
                      'layers-panel__ctrl-btn' +
                      (layer.visible ? '' : ' layers-panel__ctrl-btn--off')
                    }
                    title={layer.visible ? 'Hide layer' : 'Show layer'}
                    aria-label={`${layer.visible ? 'Hide' : 'Show'} ${layer.name}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      dispatch({ type: 'setVisible', layerId: layer.id, visible: !layer.visible });
                    }}
                  >
                    {layer.visible ? '👁' : '👁‍🗨'}
                  </button>
                  {/* Lock */}
                  <button
                    className={
                      'layers-panel__ctrl-btn' +
                      (layer.locked ? ' layers-panel__ctrl-btn--on' : '')
                    }
                    title={layer.locked ? 'Unlock layer' : 'Lock layer'}
                    aria-label={`${layer.locked ? 'Unlock' : 'Lock'} ${layer.name}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      dispatch({ type: 'setLocked', layerId: layer.id, locked: !layer.locked });
                    }}
                  >
                    {layer.locked ? '🔒' : '🔓'}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {/* Action buttons */}
      <div className="layers-panel__actions">
        <button className="editor-btn" onClick={handleAddImage} title="Add image">
          + Add
        </button>
        <button
          className="editor-btn"
          onClick={handleDuplicate}
          disabled={!selectedId}
          title="Duplicate layer"
        >
          ⧉ Dup
        </button>
        <button
          className="editor-btn"
          onClick={handleDelete}
          disabled={!selectedId}
          title="Delete layer"
        >
          ✕ Del
        </button>
        <button
          className="editor-btn"
          onClick={handleMergeDown}
          disabled={!canMerge}
          title="Merge down"
        >
          ⤓ Merge
        </button>
        <button
          className="editor-btn"
          onClick={handleFlatten}
          disabled={layers.length < 2}
          title="Flatten all layers"
        >
          ⊟ Flat
        </button>
      </div>
    </div>
  );
}

