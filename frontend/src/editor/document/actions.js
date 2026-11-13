/** @module Action reducers for the Pixabel document model */

import { current } from 'immer';
import { createDefaultLayer, createLayerId, DEFAULT_ADJUSTMENTS, migrate } from './schema.js';

/**
 * Apply an action to an immer draft of the document.
 * Called inside produceWithPatches — must only mutate `draft`.
 */
export function applyAction(draft, action) {
  switch (action.type) {
    case 'addLayer': {
      const layer = createDefaultLayer(action.payload);
      const index = action.index ?? draft.layers.length;
      draft.layers.splice(index, 0, layer);
      break;
    }

    case 'deleteLayer': {
      const idx = requireLayerIndex(draft, action.layerId);
      draft.layers.splice(idx, 1);
      break;
    }

    case 'duplicateLayer': {
      const idx = requireLayerIndex(draft, action.layerId);
      const plain = JSON.parse(JSON.stringify(current(draft.layers[idx])));
      plain.id = createLayerId();
      plain.name = `${plain.name} copy`;
      draft.layers.splice(idx + 1, 0, plain);
      break;
    }

    case 'reorderLayer': {
      const fromIdx = requireLayerIndex(draft, action.layerId);
      const toIdx = clamp(action.toIndex, 0, draft.layers.length - 1);
      if (fromIdx === toIdx) break;
      const [layer] = draft.layers.splice(fromIdx, 1);
      draft.layers.splice(toIdx, 0, layer);
      break;
    }

    case 'renameLayer': {
      const layer = requireLayer(draft, action.layerId);
      layer.name = action.name;
      break;
    }

    case 'setVisible': {
      const layer = requireLayer(draft, action.layerId);
      layer.visible = action.visible;
      break;
    }

    case 'setLocked': {
      const layer = requireLayer(draft, action.layerId);
      layer.locked = action.locked;
      break;
    }

    case 'setOpacity': {
      const layer = requireLayer(draft, action.layerId);
      layer.opacity = clamp(action.opacity, 0, 1);
      break;
    }

    case 'setBlendMode': {
      const layer = requireLayer(draft, action.layerId);
      layer.blendMode = action.blendMode;
      break;
    }

    case 'setLayerAsset': {
      const layer = requireLayer(draft, action.layerId);
      layer.assetId = action.assetId;
      break;
    }

    case 'setLayerMask': {
      const layer = requireLayer(draft, action.layerId);
      layer.mask = action.mask
        ? {
            assetId: action.mask.assetId ?? null,
            enabled: action.mask.enabled ?? true,
            inverted: Boolean(action.mask.inverted),
          }
        : null;
      break;
    }

    case 'setClipToBelow': {
      const layer = requireLayer(draft, action.layerId);
      layer.clipToBelow = Boolean(action.clipToBelow);
      break;
    }

    case 'updateLayer': {
      const layer = requireLayer(draft, action.layerId);
      const props = action.properties || action.payload || {};
      Object.assign(layer, props);
      if (layer.type === 'shape' && (props.shape || props.shapeKind)) {
        const kind = props.shape || props.shapeKind;
        layer.shape = kind;
        layer.shapeKind = kind;
      }
      break;
    }

    case 'transformLayer': {
      const layer = requireLayer(draft, action.layerId);
      if (action.x !== undefined) layer.x = action.x;
      if (action.y !== undefined) layer.y = action.y;
      if (action.scaleX !== undefined) layer.scaleX = action.scaleX;
      if (action.scaleY !== undefined) layer.scaleY = action.scaleY;
      if (action.rotation !== undefined) layer.rotation = action.rotation;
      break;
    }

    case 'flipLayer': {
      const layer = requireLayer(draft, action.layerId);
      if (action.axis === 'x') layer.flipX = !layer.flipX;
      else if (action.axis === 'y') layer.flipY = !layer.flipY;
      break;
    }

    case 'rotateLayer90': {
      const layer = requireLayer(draft, action.layerId);
      const delta = action.direction === 'cw' ? 90 : -90;
      layer.rotation = ((layer.rotation + delta) % 360 + 360) % 360;
      break;
    }

    case 'setAdjustments': {
      const layer = requireLayer(draft, action.layerId);
      Object.assign(layer.adjustments, action.adjustments);
      break;
    }

    case 'resetAdjustments': {
      const layer = requireLayer(draft, action.layerId);
      layer.adjustments = { ...DEFAULT_ADJUSTMENTS };
      break;
    }

    case 'resetAllAdjustments': {
      for (const layer of draft.layers) {
        layer.adjustments = { ...DEFAULT_ADJUSTMENTS };
      }
      break;
    }

    case 'mergeDown': {
      const idx = requireLayerIndex(draft, action.layerId);
      if (idx === 0) throw new Error('Cannot merge down: no layer below');
      const upper = draft.layers[idx];
      const lower = draft.layers[idx - 1];
      lower.name = `${lower.name} + ${upper.name}`;
      lower.assetId = action.assetId || `merged-${createLayerId()}`;
      lower.opacity = 1;
      lower.blendMode = 'normal';
      draft.layers.splice(idx, 1);
      break;
    }

    case 'flatten': {
      if (draft.layers.length === 0) break;
      const flat = createDefaultLayer({
        name: 'Flattened',
        assetId: action.assetId || `flattened-${createLayerId()}`,
      });
      draft.layers.length = 0;
      draft.layers.push(flat);
      break;
    }

    case 'setDocumentSize': {
      const MAX_DIM = 4096;
      let w = action.width;
      let h = action.height;
      if (w > MAX_DIM || h > MAX_DIM) {
        const ratio = MAX_DIM / Math.max(w, h);
        w = Math.round(w * ratio);
        h = Math.round(h * ratio);
      }
      if (w > 0) draft.width = w;
      if (h > 0) draft.height = h;
      break;
    }

    case 'loadDocument': {
      if (action.document) {
        const doc = migrate(action.document);
        draft.id = doc.id;
        draft.schemaVersion = doc.schemaVersion;
        draft.width = doc.width;
        draft.height = doc.height;
        draft.background = doc.background;
        draft.layers = doc.layers.map((l) => ({ ...l }));
      }
      break;
    }

    default:
      throw new Error(`Unknown action type: ${action.type}`);
  }
}

// ── Helpers ──────────────────────────────────────────────────────────

function requireLayerIndex(draft, layerId) {
  const idx = draft.layers.findIndex((l) => l.id === layerId);
  if (idx === -1) throw new Error(`Layer not found: ${layerId}`);
  return idx;
}

function requireLayer(draft, layerId) {
  return draft.layers[requireLayerIndex(draft, layerId)];
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
