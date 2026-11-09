# Pixabel — Luxury AI Image Generator & Editor

Generate stunning images from text prompts and edit them with precision using state-of-the-art diffusion models. Pixabel pairs a high-performance Flask API backend with an elegant, responsive React + Vite luxury client interface.

**AI Provider:** Cloudflare Workers AI (free daily tier)

![React](https://img.shields.io/badge/React-19-blue?logo=react)
![Vite](https://img.shields.io/badge/Vite-v8-purple?logo=vite)
![Python](https://img.shields.io/badge/Python-3.9+-blue?logo=python)
![Flask](https://img.shields.io/badge/Flask-3.x-lightgrey?logo=flask)
![License](https://img.shields.io/badge/License-MIT-green)

---

## 🗂️ Project Structure

```
image-gen-application/
├── backend/
│   ├── app.py                  # Flask API server with CORS
│   ├── models_config.py        # Centralized Cloudflare model registry
│   ├── providers/
│   │   └── cloudflare.py       # Cloudflare Workers AI provider
│   ├── .env                    # API keys & config (not committed)
│   ├── .env.example            # Backend env template
│   └── requirements.txt        # Python dependencies
├── frontend/
│   ├── public/                 # Static assets & icons
│   ├── src/
│   │   ├── components/         # Shared UI: Header, Tabs, Modal, Toast, Skeleton, etc.
│   │   ├── context/            # ThemeContext & AuthContext
│   │   ├── hooks/              # useCountdown, useGenerations
│   │   ├── lib/                # api.js, storage.js, supabase.js, autocorrect.js, download.js
│   │   ├── pages/              # Home, Login, ResetPassword, Profile, Terms, Privacy, NotFound
│   │   ├── styles/             # theme.css (luxury tokens, dark/light modes)
│   │   ├── App.jsx             # React Router route definitions
│   │   └── main.jsx            # Application entrypoint
│   ├── .env.local              # Local environment variables (git-ignored)
│   ├── .env.example            # Frontend env template
│   ├── vercel.json             # SPA production rewrite configuration
│   ├── vite.config.js          # Vite config (port 5173)
│   └── package.json            # React & Vite dependencies
└── README.md
```

---

## 🚀 Getting Started

### Prerequisites

- **Node.js 18+** & npm installed
- **Python 3.9+** installed
- A free **Cloudflare** account (for free daily image generation)
- A **Supabase** project for authentication

---

### 1. Backend Setup (Flask)

```bash
cd backend

# Create a virtual environment
python -m venv venv

# Activate it
# Windows:
venv\Scripts\activate
# macOS/Linux:
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt
```

Create `backend/.env` with your credentials:

```ini
# ── Cloudflare Workers AI (free daily tier) ──
CLOUDFLARE_ACCOUNT_ID=your_account_id_here
CLOUDFLARE_API_TOKEN=your_api_token_here

# ── Rate limits (optional — defaults shown) ──
DAILY_LIMIT=20
CF_DAILY_LIMIT=20
CF_PER_MINUTE=5
```

Start the Flask server:

```bash
python app.py
```

The API runs on **http://127.0.0.1:5000**.

---

### 2. Frontend Setup (React + Vite)

```bash
cd frontend

# Install dependencies
npm install

# Start development server
npm run dev
```

The client will be running on **http://localhost:5173**.

Create `frontend/.env.local`:

```ini
VITE_API_URL=http://127.0.0.1:5000
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key_here
```

---

## 🔑 Provider Architecture

Pixabel is built exclusively on **Cloudflare Workers AI**:

| Provider | Status | Badge | Models |
|---|---|---|---|
| **Cloudflare Workers AI** | Active | "Free daily" | FLUX.1 Schnell, SDXL Lightning, Stable Diffusion XL |

- Direct integration via the Cloudflare Workers AI REST API.
- Generates high-resolution images with fast response times.
- Supports image-to-image restyling directly through SDXL Lightning.
- Credentials are read from `backend/.env` only and never exposed to the frontend or logs.

---

## 🎨 Feature Overview

### 1. Generate Tab
- **Cloudflare Models:** FLUX.1 Schnell, SDXL Lightning, and Stable Diffusion XL.
- **Default Model:** FLUX.1 Schnell on Cloudflare Workers AI.
- **Style Presets:** Realistic Photo, Anime, 3D Render, Digital Art, Oil Painting.
- **Aspect Ratios:** Square (1024×1024), Portrait (1024×1536), Landscape (1536×1024).
- **Multiline Prompts:** Auto-expanding prompt input up to 1000 characters with Shift+Enter newlines and seamless clipboard paste.
- **Advanced Controls:** Negative prompt input and AI Quality Enhancer toggle.
- **Prompt Autocorrect:** 100+ word dictionary correcting common prompt typos on space/Enter with toasts.
- **Collapsible Sidebar:** Inspiration prompts and recent creations history.
- **IndexedDB Auto-Save:** Every generation is automatically saved locally with metadata.
- **Rate Limit Display:** "X images left today" shown under the Generate button.

### 2. Gallery Tab
- **Filters:** View All, Favorites, or Edited creations.
- **Hover Card Overlays:** Quick actions for Favorite, Edit, Download, and Delete.
- **Lightbox Modal:** Full-resolution view with generation metadata, negative prompt, and **"Reuse Settings"** button.
- **Clear History Dialog:** Delete local history with option to preserve favorited creations.

### 3. Pixabel Multi-Layer Editor

The Pixabel Editor is a full-featured, non-destructive, multi-layer creative image suite:

- **Layer Stack:** Unlimited image layers with z-index reordering, duplicate, delete, visibility toggles, layer locking, opacity sliders, and standard blend modes (Multiply, Screen, Overlay, etc.).
- **Live Non-Destructive Adjustments:** Fabric.js adjustment filters recomputed dynamically from the pristine original asset (brightness, contrast, saturation, blur, grayscale, sepia, invert).
- **Transforms & Alignment:** Freehand canvas transform handles, 90° clockwise/counter-clockwise rotation, horizontal/vertical flipping, Center on Canvas, and Fit to Canvas shortcuts.
- **AI Restyle (SDXL Lightning):** Non-destructive image-to-image AI editing that preserves original pixels and outputs results onto a dedicated `"AI edit"` layer directly above the selection.
- **Hold to Compare:** Real-time baseline comparison against the session start state or layer original.
- **Floating Canvas Viewport:** Ultra-smooth pan/zoom (5% to 800%) with cursor zoom, pinch-to-zoom, space-drag panning, fit-to-artboard, and 100% reset.
- **Export & Gallery:** Multi-format exporter (PNG, JPG with matte color, WebP), quality slider, 1x/2x scale, longest-side 4096px safety clamp, and direct "Save to Gallery".
- **Session Autosave:** Automatic 2-second debounced IndexedDB draft persistence with "Restore Session" prompts on page refresh.

---

## 🏗️ Pixabel Editor Architecture

The editor is architected around the unidirectional data flow pattern where the Document Store is the single source of truth, and Fabric.js is strictly a reactive view.

```
                    ┌──────────────────────────┐
                    │      Document Store      │
                    │   (Zustand + Immer.js)   │
                    └────────────┬─────────────┘
                                 │
                 ┌───────────────┴───────────────┐
                 ▼                               ▼
       ┌───────────────────┐           ┌───────────────────┐
       │   FabricAdapter   │           │   React UI Tree   │
       │   (Fabric.js)     │           │  (Toolbar/Panels) │
       └─────────┬─────────┘           └───────────────────┘
                 │
                 ▼
       ┌───────────────────┐
       │    AssetStore     │ ◄─── IndexedDB Draft Autosave
       │ (Lossless Blobs)  │
       └───────────────────┘
```

### 1. Document Model & Immer Patch History
- **Document Schema:** Defined in `frontend/src/editor/document/schema.js`. Every document contains an ID, dimensions (clamped at 4096px), background fill, and an ordered array of layers with transform, opacity, blendMode, and adjustment states.
- **Patch-Based History:** Actions in `actions.js` are executed with Immer's `produceWithPatches`. Each user gesture generates minimal forward and inverse JSON patches stored in `_undoStack` and `_redoStack` (capped at 100 steps).
- **Gesture Coalescing:** High-frequency gestures (e.g. dragging an adjustment slider, continuous arrow key nudging) are framed with `beginGesture()` and `endGesture()`. The intermediate states are coalesced into a single undo/redo patch, guaranteeing that one undo returns the user exactly to their baseline.

### 2. AssetStore (Zero Pixel Baking)
- Defined in `frontend/src/editor/engine/assetStore.js`. Raw image files and edited frames are stored as binary `Blob` objects in an in-memory cache keyed by `assetId`.
- Image filters, rotations, and scalings are never baked into pixels during composition. When rendering or exporting, the engine references the clean master asset, preventing generational compression loss.

### 3. Viewport & FabricAdapter
- **FabricAdapter (`frontend/src/editor/engine/adapter.js`):** Subscribes to the document store and synchronizes canvas objects. Renders an artboard with a luxury dark checkerboard transparency pattern (`#26262c` / `#1e1e23`) with champagne gold border accents.
- **ViewportController (`frontend/src/editor/engine/viewport.js`):** Controls canvas zoom (5% to 800%) and panning. Supports Space+drag panning, middle-click pan, wheel zoom toward pointer coordinates, pinch gestures, and dedicated Move (`V`) and Hand (`H`) tools. All pan/zoom operations are throttled via `requestAnimationFrame` for 60/120 FPS performance.

### 4. Live Adjustment Filters
- Adjusted via `PropertiesPanel.jsx` and rendered via Fabric filters (`Brightness`, `Contrast`, `Saturation`, `Blur`, `Grayscale`, `Sepia`, `Invert`).
- Throttled via `requestAnimationFrame` with pending ref cancellation. Fabric objects compute filters directly on hardware using WebGL when available.

### 5. SDXL Lightning AI Restyle
- Accessible in the Properties Panel. Sends the selected layer's data URL to the backend `/edit` endpoint (or Cloudflare Workers AI `sdxl-lightning` img2img).
- Automatically inserts the generated image as a new layer named `"AI edit"` directly above the selected layer, keeping the original layer intact and enabling easy layer toggling, opacity blending, and undo.

### 6. Export Engine & Autosave
- **Export Engine (`frontend/src/editor/engine/exportEngine.js`):** Flattens visible layers into an offscreen canvas at 1x or 2x resolution (capped at 4096px on the longest side). Exports to PNG (preserving transparency), JPG (with user-selected background color), or WebP with configurable quality.
- **Persistence (`frontend/src/editor/document/persistence.js`):** Debounces document and asset saves to IndexedDB after 2 seconds of idle time. Reloading the page prompts the user to restore their editing session.

---

## ⌨️ Keyboard Shortcuts

| Shortcut | Action | Scope / Condition |
|---|---|---|
| <kbd>Ctrl</kbd> + <kbd>Z</kbd> | Undo | Disabled while editing text |
| <kbd>Ctrl</kbd> + <kbd>Y</kbd> / <kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>Z</kbd> | Redo | Disabled while editing text |
| <kbd>Ctrl</kbd> + <kbd>D</kbd> | Duplicate selected layer | Layer selected |
| <kbd>Delete</kbd> / <kbd>Backspace</kbd> | Delete selected layer | Layer unlocked |
| <kbd>Ctrl</kbd> + <kbd>]</kbd> | Bring layer forward | Layer selected |
| <kbd>Ctrl</kbd> + <kbd>[</kbd> | Send layer backward | Layer selected |
| <kbd>↑</kbd> <kbd>↓</kbd> <kbd>←</kbd> <kbd>→</kbd> | Nudge layer 1px (coalesced) | Layer unlocked |
| <kbd>Shift</kbd> + <kbd>Arrow</kbd> | Nudge layer 10px | Layer unlocked |
| <kbd>V</kbd> | Switch to Move tool | Canvas viewport |
| <kbd>H</kbd> | Switch to Hand tool (Pan) | Canvas viewport |
| <kbd>Space</kbd> + Drag | Temporary Pan | Canvas viewport |
| <kbd>Ctrl</kbd> + <kbd>V</kbd> | Paste image from clipboard | Global |
| <kbd>?</kbd> | Open Shortcuts Help modal | Global |

---

## ✅ Feature Parity Checklist (Old Edit Tab vs New Multi-Layer Editor)

Every feature of the original single-canvas Edit tab has been verified in the new architecture:

| Feature from Old Edit Tab | New Editor Status | Notes / Enhancements in New Editor |
|---|---|---|
| **Image Loading from Gallery** | ✅ Verified | Opens via `?img=<id>`, loads into AssetStore, auto-fits viewport. |
| **File Picker (PNG, JPEG, WEBP)** | ✅ Verified | Multi-file support; adds each image as a new layer. |
| **Drag & Drop Upload** | ✅ Verified | Drag-over drop hint on canvas and drop onto layers panel. |
| **Clipboard Paste (Ctrl+V)** | ✅ Verified | Automatically converts pasted images into new layers. |
| **Brightness Adjustment** | ✅ Verified | Non-destructive Fabric filter (-100% to +100%), rAF-throttled. |
| **Contrast Adjustment** | ✅ Verified | Non-destructive Fabric filter (-100% to +100%). |
| **Saturation Adjustment** | ✅ Verified | Non-destructive Fabric filter (-100% to +100%). |
| **Blur Adjustment** | ✅ Verified | Non-destructive Fabric blur filter (0 to 100px). |
| **Grayscale Toggle** | ✅ Verified | Recomputed from original asset without pixel degradation. |
| **Sepia Toggle** | ✅ Verified | Non-destructive live filter toggle. |
| **Invert Toggle** | ✅ Verified | Non-destructive live filter toggle. |
| **Reset Adjustments** | ✅ Verified | Per-layer "Reset" + global "Reset All Adjustments". |
| **90° Rotation (CW / CCW)** | ✅ Verified | Instant 90° rotation buttons with full undo/redo. |
| **Horizontal / Vertical Flip** | ✅ Verified | Non-destructive axis mirroring per layer. |
| **Hold to Compare Original** | ✅ Verified | Compares active layer to original or entire document to session start. |
| **AI Magic Edit (img2img)** | ✅ Verified | SDXL Lightning; creates a new non-destructive layer above selection. |
| **AI Preset Chips & Prompts** | ✅ Verified | Quick-fill chips for style transfer and editing prompts. |
| **Undo / Redo Stack** | ✅ Verified | Upgraded from 10 flat states to 100 Immer patch states with coalescing. |
| **Export / Download** | ✅ Verified | Upgraded with scale (1x/2x), quality, formats (PNG, JPG, WebP), 4096px clamp. |
| **Save to Gallery** | ✅ Verified | Flattens composition and stores in existing local creations gallery. |

### 4. Profile & Preferences
- **Overview:** Deterministic gradient avatar with initials, member since, last sign-in, and generation statistics.
- **Account:** Edit full name and username with client validation.
- **Security:** Current password verification, password strength meter, requirement checklist, and global sign-out across all devices (`scope: 'global'`).
- **Preferences:** Default theme, model, style preset, and aspect ratio saved to user metadata and local storage.

---

## 💎 Design System & Aesthetics

- **Typography:** *Cormorant Garamond* (headings & logo) and *Inter* (UI controls).
- **Color Palette:** Curated dark/light theme tokens with champagne gold accents (`#d4af37`), soft glows, and noise grain overlay.
- **Theme Switcher:** Dark, Light, and System modes with zero-flash initial loading.
- **Animations:** Subtle glassmorphism, shimmers, and accessible `prefers-reduced-motion` overrides.

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| **Frontend Framework** | React 19, Vite 8, React Router v7 |
| **Authentication & Cloud** | Supabase Auth (`@supabase/supabase-js`) |
| **Local Storage** | IndexedDB (`PixableDB` store) |
| **Styling** | Vanilla CSS tokens & variables (Theme System) |
| **Backend API** | Python 3, Flask, flask-cors, requests |
| **AI Provider** | Cloudflare Workers AI (FLUX.1 Schnell, SDXL Lightning, Stable Diffusion XL) |

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).
