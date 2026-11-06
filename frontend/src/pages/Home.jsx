import { useState, useEffect, useRef, useCallback } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Header } from '../components/Header';
import { ModelPickerModal, MODEL_LABELS, buildModelLabels } from '../components/Modal';
import { GenerationShimmer } from '../components/Skeleton';
import { GalleryTab } from '../components/GalleryTab';
import { EditTab } from '../components/EditTab';
import { useGenerations } from '../hooks/useGenerations';
import { useToast } from '../components/Toast';
import { generateImage, getBackendStatus, getModelList } from '../lib/api';
import { autocorrectLastWord } from '../lib/autocorrect';
import { downloadImageFile } from '../lib/download';
import './Home.css';

const PRESET_PROMPTS = [
  'Ethereal crystal cavern glowing with violet bioluminescent light, cinematic reflections on underground water, ultra detailed 8k',
  'Cyberpunk street vendor in neon-lit rainy Tokyo alleyway, steam rising from ramen bowls, atmospheric volumetric lighting',
  'Minimalist architectural pavilion in Japanese zen rock garden, mist in morning light, wabi-sabi aesthetics, sharp photography',
  'Renaissance oil portrait of an astronaut floating among stars, intricate gold-leaf embroidery on modern spacesuit',
  'Whimsical miniature village inside a mossy glass terrarium, tiny glowing lanterns, macro lens photography, soft bokeh',
];

const WELCOME_CHIPS = [
  { label: 'Cyberpunk Tokyo', prompt: PRESET_PROMPTS[1] },
  { label: 'Crystal Cavern', prompt: PRESET_PROMPTS[0] },
  { label: 'Zen Garden', prompt: PRESET_PROMPTS[2] },
  { label: 'Terrarium', prompt: PRESET_PROMPTS[4] },
];

const STYLE_MODIFIERS = {
  'Realistic Photo': ', photorealistic, professional photography, sharp focus, natural lighting, 8k',
  'Anime': ', anime style, vibrant colors, cel shading, Studio Ghibli inspired',
  '3D Render': ', 3D render, octane render, unreal engine, highly detailed, cinematic lighting',
  'Digital Art': ', digital art, concept art, trending on artstation, highly detailed',
  'Oil Painting': ', oil painting, textured brushstrokes, classical art style, museum quality',
};

const ASPECT_RATIOS = [
  { label: 'Square', value: '1024x1024' },
  { label: 'Portrait', value: '1024x1536' },
  { label: 'Landscape', value: '1536x1024' },
];

function formatTime(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  const now = new Date();
  const diffMs = now - d;
  const diffMin = Math.floor(diffMs / 60000);
  const diffHr = Math.floor(diffMs / 3600000);
  const diffDay = Math.floor(diffMs / 86400000);

  if (diffMin < 1) return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffDay < 7) return `${diffDay}d ago`;
  return d.toLocaleDateString();
}

const MAX_PROMPT_LENGTH = 1000;

export function Home() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const activeTab = searchParams.get('tab') || 'generate';
  const {
    generations,
    addGeneration,
    removeGeneration,
    toggleFav,
    clearGenerations,
    totalCount,
  } = useGenerations();
  const { showToast, showAutocorrect } = useToast();

  // Navigation tab change
  const handleTabChange = (tab) => {
    setSearchParams({ tab });
  };

  // Dynamic model list from /models endpoint
  const [dynamicModels, setDynamicModels] = useState([]);
  const [modelLabels, setModelLabels] = useState(MODEL_LABELS);

  // Generation options state
  const [selectedModel, setSelectedModel] = useState(() => {
    return localStorage.getItem('default_model') || 'cf-flux-schnell';
  });
  const [activeStyle, setActiveStyle] = useState(() => {
    return localStorage.getItem('default_style') || 'none';
  });
  const [activeRatio, setActiveRatio] = useState(() => {
    return localStorage.getItem('default_aspect') || '1024x1024';
  });
  const [negativePrompt, setNegativePrompt] = useState('');
  const [enhancerActive, setEnhancerActive] = useState(false);
  const [isOptionsOpen, setIsOptionsOpen] = useState(false);
  const [isModelModalOpen, setIsModelModalOpen] = useState(false);

  // Chat and Generation state
  const [promptText, setPromptText] = useState('');
  const [isChatActive, setIsChatActive] = useState(false);
  const [messages, setMessages] = useState([]);
  const [isGenerating, setIsGenerating] = useState(false);

  // Credits state
  const [credits, setCredits] = useState({
    remaining: 20,
    dailyLimit: 20,
    cfRemaining: 20,
    cfDailyLimit: 20,
    status: 'ok',
  });

  // Mobile sidebar state
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Textarea refs
  const promptInputRef = useRef(null);
  const chatScrollRef = useRef(null);

  // Fetch models list on mount
  useEffect(() => {
    let active = true;
    getModelList()
      .then((data) => {
        if (active && data.models && data.models.length > 0) {
          setDynamicModels(data.models);
          setModelLabels(buildModelLabels(data.models));

          // Update selected model to the backend default if current one is not available
          const availableKeys = data.models.map((m) => m.key);
          setSelectedModel((prev) => {
            const stored = localStorage.getItem('default_model');
            if (stored && availableKeys.includes(stored)) return stored;
            if (availableKeys.includes(prev)) return prev;
            return data.default || availableKeys[0] || prev;
          });

          if (data.cf_remaining !== undefined) {
            setCredits((prev) => ({
              ...prev,
              cfRemaining: data.cf_remaining,
              cfDailyLimit: data.cf_daily_limit || prev.cfDailyLimit,
            }));
          }
        }
      })
      .catch(() => {
        // Fall back to static list
      });
    return () => { active = false; };
  }, []);

  // Fetch credits on mount
  const refreshCredits = useCallback(async () => {
    try {
      const data = await getBackendStatus();
      setCredits({
        remaining: data.remaining ?? 20,
        dailyLimit: data.daily_limit ?? 20,
        cfRemaining: data.cf_remaining ?? 20,
        cfDailyLimit: data.cf_daily_limit ?? 20,
        status: 'ok',
      });
    } catch {
      setCredits((prev) => ({ ...prev, status: 'offline' }));
    }
  }, []);

  useEffect(() => {
    let active = true;
    getBackendStatus()
      .then((data) => {
        if (active) {
          setCredits({
            remaining: data.remaining ?? 20,
            dailyLimit: data.daily_limit ?? 20,
            cfRemaining: data.cf_remaining ?? 20,
            cfDailyLimit: data.cf_daily_limit ?? 20,
            status: 'ok',
          });
        }
      })
      .catch(() => {
        if (active) {
          setCredits((prev) => ({ ...prev, status: 'offline' }));
        }
      });
    return () => {
      active = false;
    };
  }, []);

  // Scroll to bottom on new messages
  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [messages]);

  // Auto-resize textarea whenever promptText changes or chat view activates
  useEffect(() => {
    if (promptInputRef.current) {
      promptInputRef.current.style.height = 'auto';
      promptInputRef.current.style.height = `${Math.min(
        promptInputRef.current.scrollHeight,
        220
      )}px`;
    }
  }, [promptText, isChatActive]);

  // Handle textarea text changes with truncation support
  const handlePromptInputChange = (e) => {
    const val = e.target.value;
    if (val.length > MAX_PROMPT_LENGTH) {
      setPromptText(val.slice(0, MAX_PROMPT_LENGTH));
    } else {
      setPromptText(val);
    }
  };

  // Handle pasting multiline prompts cleanly without clipping
  const handlePromptPaste = (e) => {
    const pastedText = e.clipboardData?.getData('text');
    if (!pastedText) return;

    e.preventDefault();
    const target = e.target;
    const start = target.selectionStart ?? 0;
    const end = target.selectionEnd ?? 0;
    const current = target.value || '';

    const combined = current.slice(0, start) + pastedText + current.slice(end);
    const trimmed = combined.slice(0, MAX_PROMPT_LENGTH);
    setPromptText(trimmed);

    const newCursorPos = Math.min(start + pastedText.length, MAX_PROMPT_LENGTH);
    setTimeout(() => {
      if (promptInputRef.current) {
        promptInputRef.current.selectionStart = promptInputRef.current.selectionEnd = newCursorPos;
      }
    }, 0);
  };

  // Autocorrect on Space or Enter; Shift+Enter inserts newline, Enter submits
  const handlePromptKeyDown = (e) => {
    if (e.key === ' ' || (e.key === 'Enter' && !e.shiftKey)) {
      const target = e.target;
      const cursorPos = target.selectionStart;
      const res = autocorrectLastWord(target.value, cursorPos);
      if (res) {
        setPromptText(res.newText);
        showAutocorrect(res.original, res.corrected);
        setTimeout(() => {
          target.selectionStart = target.selectionEnd = res.newCursorPos;
        }, 0);
      }
    }

    // Submit on Enter (without Shift) or Ctrl/Cmd + Enter
    if ((e.key === 'Enter' && !e.shiftKey) || (e.key === 'Enter' && (e.ctrlKey || e.metaKey))) {
      e.preventDefault();
      handleGenerate();
    }
  };

  // Reset Chat to Welcome Screen
  const handleNewCreation = () => {
    setMessages([]);
    setIsChatActive(false);
    setPromptText('');
    setSidebarOpen(false);
    if (promptInputRef.current) {
      promptInputRef.current.style.height = 'auto';
      promptInputRef.current.focus();
    }
  };

  // Clicking a history item in sidebar loads it into chat
  const handleSelectHistoryItem = (record) => {
    setMessages([
      { role: 'user', content: record.prompt },
      {
        role: 'ai',
        content: `Here's your image for "${record.prompt.slice(0, 60)}${
          record.prompt.length > 60 ? '…' : ''
        }"`,
        image: record.image,
        recordId: record.id,
      },
    ]);
    setIsChatActive(true);
    setSidebarOpen(false);
  };

  // Reuse settings from gallery or history
  const handleReuseSettings = (record) => {
    setSearchParams({ tab: 'generate' });
    setPromptText(record.prompt || '');
    if (record.model) {
      setSelectedModel(record.model);
    }
    if (record.style) {
      setActiveStyle(record.style);
    }
    if (record.width && record.height) {
      setActiveRatio(`${record.width}x${record.height}`);
    }
    if (record.negativePrompt !== undefined) {
      setNegativePrompt(record.negativePrompt);
    }
    const hasCustomSettings =
      (record.style && record.style !== 'none') ||
      Boolean(record.negativePrompt) ||
      (record.width && record.height && `${record.width}x${record.height}` !== '1024x1024');
    if (hasCustomSettings) {
      setIsOptionsOpen(true);
    }
    setIsChatActive(false);
    setMessages([]);
    setTimeout(() => {
      if (promptInputRef.current) {
        promptInputRef.current.style.height = 'auto';
        promptInputRef.current.style.height = Math.min(promptInputRef.current.scrollHeight, 150) + 'px';
        promptInputRef.current.focus();
      }
    }, 50);
  };

  // Open editor with selected record as layer 1
  const handleEditImage = (record) => {
    navigate(`/editor?img=${record.id || ''}`);
  };

  // Determine if currently selected model is Cloudflare
  const isCfModel = selectedModel.startsWith('cf-');

  // Core Generation Function
  const handleGenerate = async (customPrompt = null) => {
    const promptToSend = (customPrompt !== null ? customPrompt : promptText).trim();
    if (!promptToSend || isGenerating) return;

    setIsGenerating(true);
    setIsChatActive(true);
    setPromptText('');
    if (promptInputRef.current) {
      promptInputRef.current.style.height = 'auto';
    }

    // Prepare final prompt with style modifiers and enhancer
    let finalPrompt = promptToSend;
    if (activeStyle !== 'none' && STYLE_MODIFIERS[activeStyle]) {
      finalPrompt += STYLE_MODIFIERS[activeStyle];
    }
    if (enhancerActive) {
      finalPrompt += ', 8k resolution, award winning, masterpiece, ultra high quality, volumetric lighting';
    }

    const [width, height] = activeRatio.split('x').map(Number);
    const modelName = modelLabels[selectedModel] || selectedModel;
    const styleLabel = activeStyle !== 'none' ? ` (${activeStyle} style)` : '';

    // Add user message & loading AI message
    const userMsg = { role: 'user', content: promptToSend };
    const loadingAiMsg = {
      role: 'ai',
      loading: true,
      content: `Generating with ${modelName}${styleLabel}…`,
    };

    setMessages((prev) => [...prev, userMsg, loadingAiMsg]);

    try {
      const data = await generateImage({
        prompt: finalPrompt,
        model: selectedModel,
        negative_prompt: negativePrompt.trim(),
        width,
        height,
      });

      // Update remaining credits
      if (data.remaining !== undefined) {
        setCredits((prev) => ({
          ...prev,
          remaining: data.remaining,
          dailyLimit: data.daily_limit || prev.dailyLimit,
          cfRemaining: data.cf_remaining !== undefined ? data.cf_remaining : prev.cfRemaining,
          cfDailyLimit: data.cf_daily_limit || prev.cfDailyLimit,
        }));
      }

      // Save to IndexedDB
      const savedRecord = await addGeneration({
        image: data.image,
        prompt: promptToSend,
        negativePrompt: negativePrompt.trim(),
        model: selectedModel,
        style: activeStyle,
        width,
        height,
      });

      // Replace loading message with completed image
      const shortPrompt =
        promptToSend.slice(0, 60) + (promptToSend.length > 60 ? '…' : '');

      setMessages((prev) => {
        const updated = [...prev];
        updated[updated.length - 1] = {
          role: 'ai',
          content: `Here's your image for "${shortPrompt}"`,
          image: data.image,
          recordId: savedRecord?.id,
          note: data.note || null,
        };
        return updated;
      });
    } catch (err) {
      if (err.code === 'LIMIT_REACHED') {
        setCredits((prev) => ({ ...prev, remaining: 0 }));
      }
      if (err.code === 'CF_RATE_LIMIT') {
        setCredits((prev) => ({ ...prev, cfRemaining: 0 }));
      }
      setMessages((prev) => {
        const updated = [...prev];
        updated[updated.length - 1] = {
          role: 'ai',
          error: true,
          content: err.message || 'Generation failed. Please try again.',
        };
        return updated;
      });
    } finally {
      setIsGenerating(false);
      refreshCredits();
    }
  };

  // Compute CF remaining text
  const cfRemainingText = isCfModel
    ? `${credits.cfRemaining} image${credits.cfRemaining !== 1 ? 's' : ''} left today`
    : null;
  const cfRemainingClass = credits.cfRemaining === 0
    ? 'depleted'
    : credits.cfRemaining <= 3
    ? 'low'
    : '';

  // Shared toolbar rendering (used in both welcome screen and chat input bar)
  const renderToolbar = () => (
    <div className="input-toolbar">
      <div className="toolbar-left">
        <button
          type="button"
          className="model-picker-btn"
          onClick={() => setIsModelModalOpen(true)}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
          </svg>
          <span>{modelLabels[selectedModel] || selectedModel}</span>
          <svg className="chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="12" height="12">
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>

        <button
          type="button"
          className={`options-toggle-btn ${isOptionsOpen ? 'active' : ''}`}
          onClick={() => setIsOptionsOpen((prev) => !prev)}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
            <line x1="4" y1="21" x2="4" y2="14" />
            <line x1="4" y1="10" x2="4" y2="3" />
            <line x1="12" y1="21" x2="12" y2="12" />
            <line x1="12" y1="8" x2="12" y2="3" />
            <line x1="20" y1="21" x2="20" y2="16" />
            <line x1="20" y1="12" x2="20" y2="3" />
            <line x1="1" y1="14" x2="7" y2="14" />
            <line x1="9" y1="8" x2="15" y2="8" />
            <line x1="17" y1="16" x2="23" y2="16" />
          </svg>
          <span>Options</span>
        </button>

        <button
          type="button"
          className={`enhancer-toggle-btn ${enhancerActive ? 'active' : ''}`}
          onClick={() => setEnhancerActive((prev) => !prev)}
          title="Toggle AI prompt quality enhancement"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
            <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
          </svg>
          <span>Enhancer {enhancerActive ? 'ON' : 'OFF'}</span>
        </button>
      </div>

      <div className="toolbar-right">
        {cfRemainingText && (
          <span className={`cf-remaining-badge ${cfRemainingClass}`}>
            {cfRemainingText}
          </span>
        )}
        <span
          className={`char-count ${
            promptText.length >= MAX_PROMPT_LENGTH
              ? 'at-limit'
              : promptText.length >= MAX_PROMPT_LENGTH * 0.85
              ? 'near-limit'
              : ''
          }`}
        >
          {promptText.length} / {MAX_PROMPT_LENGTH}
        </span>
      </div>
    </div>
  );

  // Shared options panel rendering
  const renderOptionsPanel = () => (
    isOptionsOpen && (
      <div className="generation-options">
        <div className="options-row">
          <div className="options-group">
            <label>Style Preset</label>
            <div className="preset-buttons">
              {['none', 'Realistic Photo', 'Anime', '3D Render', 'Digital Art', 'Oil Painting'].map(
                (style) => (
                  <button
                    key={style}
                    type="button"
                    className={`preset-btn ${activeStyle === style ? 'active' : ''}`}
                    onClick={() => setActiveStyle(style)}
                  >
                    {style === 'none' ? 'None' : style}
                  </button>
                )
              )}
            </div>
          </div>
        </div>

        <div className="options-row">
          <div className="options-group">
            <label>Aspect Ratio</label>
            <div className="preset-buttons">
              {ASPECT_RATIOS.map((ratio) => (
                <button
                  key={ratio.value}
                  type="button"
                  className={`preset-btn ${activeRatio === ratio.value ? 'active' : ''}`}
                  onClick={() => setActiveRatio(ratio.value)}
                >
                  {ratio.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="options-group w-full">
          <label>Negative Prompt</label>
          <input
            type="text"
            className="negative-prompt-input"
            placeholder="Elements you want to exclude (e.g. blurry, watermark, distortion)"
            value={negativePrompt}
            onChange={(e) => setNegativePrompt(e.target.value)}
          />
        </div>
      </div>
    )
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', width: '100vw' }}>
      <Header
        activeTab={activeTab}
        onTabChange={handleTabChange}
        galleryCount={totalCount}
      />

      <div className="app-body">
        {/* Mobile Sidebar Toggle */}
        <button
          type="button"
          className="mobile-sidebar-toggle"
          onClick={() => setSidebarOpen((prev) => !prev)}
          aria-label="Toggle navigation drawer"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="20" height="20">
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        </button>

        {sidebarOpen && (
          <div
            className="sidebar-backdrop"
            onClick={() => setSidebarOpen(false)}
            aria-hidden="true"
          />
        )}

        {/* ── SIDEBAR ── */}
        <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
          <div className="sidebar-header">
            <button
              type="button"
              className="new-chat-btn"
              onClick={handleNewCreation}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              <span>New creation</span>
            </button>
          </div>

          <div className="sidebar-scroll-area">
            <div className="sidebar-section-label">Inspiration</div>
            {PRESET_PROMPTS.map((prompt, idx) => (
              <button
                key={idx}
                type="button"
                className="sidebar-item"
                disabled={isGenerating}
                onClick={() => {
                  setPromptText(prompt);
                  handleGenerate(prompt);
                  setSidebarOpen(false);
                }}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="16" height="16">
                  <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
                </svg>
                <span>{prompt.slice(0, 32)}…</span>
              </button>
            ))}

            <div className="sidebar-section-label" style={{ marginTop: '12px' }}>
              Recent Creations
            </div>
            {generations.map((rec) => (
              <button
                key={rec.id}
                type="button"
                className="sidebar-item history-item"
                onClick={() => handleSelectHistoryItem(rec)}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="16" height="16">
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                  <circle cx="8.5" cy="8.5" r="1.5" />
                  <path d="M21 15l-5-5L5 21" />
                </svg>
                <div className="history-text">
                  <span className="history-prompt">
                    {rec.prompt.length > 28 ? rec.prompt.slice(0, 28) + '…' : rec.prompt}
                  </span>
                  <span className="history-time">{formatTime(rec.createdAt)}</span>
                </div>
              </button>
            ))}
          </div>

          <div className="sidebar-footer">
            <div
              className={`credits-badge ${
                credits.remaining === 0
                  ? 'depleted'
                  : credits.remaining <= 1
                  ? 'low'
                  : ''
              }`}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
                <circle cx="12" cy="12" r="10" />
                <path d="M12 6v6l4 2" />
              </svg>
              <span>
                {credits.status === 'offline'
                  ? 'Backend offline'
                  : `${credits.remaining}/${credits.dailyLimit} left today`}
              </span>
            </div>
            <div className="sidebar-meta">
              Model: <strong>{modelLabels[selectedModel] || selectedModel}</strong>
            </div>
          </div>
        </aside>

        {/* ── WORKSPACE ── */}
        <main className="chat-main">
          {activeTab === 'generate' && (
            <>
              <div className="chat-scroll" ref={chatScrollRef}>
                {!isChatActive ? (
                  /* ── WELCOME SCREEN ── */
                  <div className="welcome-screen">
                    <div className="welcome-icon">
                      <img
                        src="/assets/logo.png"
                        alt="Pixabel Studio"
                        className="welcome-logo-img"
                      />
                    </div>
                    <h2>What will you imagine today?</h2>
                    <p className="welcome-sub">
                      Experience luxury AI generation with state-of-the-art models and fine-tuned presets.
                    </p>

                    {/* Centered Input Area */}
                    <div className="welcome-input-area">
                      {/* Generation Options Panel if open */}
                      {renderOptionsPanel()}

                      <div className="input-bar-inner">
                        <textarea
                          ref={promptInputRef}
                          rows={1}
                          className="prompt-textarea"
                          placeholder="Describe the image you want to create…"
                          value={promptText}
                          onChange={handlePromptInputChange}
                          onKeyDown={handlePromptKeyDown}
                          onPaste={handlePromptPaste}
                          autoFocus
                        />
                        <button
                          type="button"
                          className="send-btn"
                          disabled={isGenerating || promptText.trim().length === 0}
                          onClick={() => handleGenerate()}
                          aria-label="Generate Image"
                        >
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
                            <line x1="22" y1="2" x2="11" y2="13" />
                            <polygon points="22 2 15 22 11 13 2 9 22 2" />
                          </svg>
                        </button>
                      </div>

                      {renderToolbar()}
                    </div>

                    {/* Quick Inspiration Chips */}
                    <div className="welcome-chips">
                      {WELCOME_CHIPS.map((chip, idx) => (
                        <button
                          key={idx}
                          type="button"
                          className="chip"
                          disabled={isGenerating}
                          onClick={() => {
                            setPromptText(chip.prompt);
                            handleGenerate(chip.prompt);
                          }}
                        >
                          {chip.label}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  /* ── CHAT MESSAGES STREAM ── */
                  <div className="chat-messages">
                    {messages.map((msg, index) => (
                      <div key={index} className="message">
                        <div className={`msg-avatar ${msg.role}`}>
                          {msg.role === 'ai' ? (
                            <img src="/assets/logo.png" alt="AI" className="avatar-logo" />
                          ) : (
                            'Y'
                          )}
                        </div>

                        <div className="msg-body">
                          <div className="msg-label">
                            {msg.role === 'user' ? 'You' : 'Pixabel'}
                          </div>

                          {msg.loading ? (
                            <GenerationShimmer content={msg.content} />
                          ) : msg.error ? (
                            <div className="msg-error">{msg.content}</div>
                          ) : (
                            <div className="msg-text">{msg.content}</div>
                          )}

                          {msg.image && (
                            <>
                              <div className="msg-image-wrap">
                                <img src={msg.image} alt={msg.content || 'Generated image'} />
                              </div>
                              {msg.note && (
                                <div className="msg-note">{msg.note}</div>
                              )}
                              <div className="msg-actions">
                                <button
                                  type="button"
                                  className="msg-action-btn"
                                  onClick={() => downloadImageFile(msg.image, msg.content, showToast)}
                                >
                                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
                                    <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" />
                                  </svg>
                                  <span>Download</span>
                                </button>
                                <button
                                  type="button"
                                  className="msg-action-btn"
                                  onClick={() => {
                                    navigate(`/editor?img=${msg.recordId || ''}`);
                                  }}
                                >
                                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
                                    <path d="M12 20h9M16.5 3.5a2.12 2.12 0 013 3L7 19l-4 1 1-4z" />
                                  </svg>
                                  <span>Edit this image</span>
                                </button>
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Bottom Input Bar when Chat Active */}
              {isChatActive && (
                <div className="input-bar">
                  {renderOptionsPanel()}

                  <div className="input-bar-inner">
                    <textarea
                      ref={promptInputRef}
                      rows={1}
                      className="prompt-textarea"
                      placeholder="Send a prompt to create an image…"
                      value={promptText}
                      onChange={handlePromptInputChange}
                      onKeyDown={handlePromptKeyDown}
                      onPaste={handlePromptPaste}
                    />
                    <button
                      type="button"
                      className="send-btn"
                      disabled={isGenerating || promptText.trim().length === 0}
                      onClick={() => handleGenerate()}
                      aria-label="Send prompt"
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
                        <line x1="22" y1="2" x2="11" y2="13" />
                        <polygon points="22 2 15 22 11 13 2 9 22 2" />
                      </svg>
                    </button>
                  </div>

                  {renderToolbar()}
                </div>
              )}
            </>
          )}

          {activeTab === 'gallery' && (
            <GalleryTab
              generations={generations}
              onToggleFavorite={toggleFav}
              onDeleteGeneration={removeGeneration}
              onClearAllGenerations={clearGenerations}
              onReuseSettings={handleReuseSettings}
              onEditImage={handleEditImage}
              onNavigateGenerate={() => handleTabChange('generate')}
            />
          )}

          {activeTab === 'edit' && (
            <EditTab
              initialRecord={
                searchParams.get('img')
                  ? generations.find((g) => String(g.id) === String(searchParams.get('img')))
                  : null
              }
              onSaveToGallery={addGeneration}
            />
          )}
        </main>
      </div>

      {/* Model Picker Modal */}
      <ModelPickerModal
        isOpen={isModelModalOpen}
        onClose={() => setIsModelModalOpen(false)}
        selectedModel={selectedModel}
        onSelectModel={(modelKey) => setSelectedModel(modelKey)}
        dynamicModels={dynamicModels}
      />
    </div>
  );
}
