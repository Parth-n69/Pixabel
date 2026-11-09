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

### 3. Edit Tab
- **Image Input:** Drag-and-drop zone and file picker supporting PNG, JPEG, and WEBP (up to 8MB).
- **AI Restyle:** Powered by Cloudflare Workers AI (SDXL Lightning img2img) with transformation strength slider (10–100%) and preset chips.
- **Basic Tools:** Rotate (-90° / +90°), flip horizontal / vertical.
- **Adjustments:** Sliders for brightness (0–200%), contrast (0–200%), saturation (0–200%), and blur (0–20px).
- **Filters:** Grayscale, Sepia, and Invert toggles.
- **Compare:** Hold-to-compare overlay to preview original vs. modified state.
- **History & Export:** 10-state undo stack, save edited image to gallery, or download.

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
