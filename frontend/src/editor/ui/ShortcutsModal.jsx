import { useEffect } from 'react';
import './ShortcutsModal.css';

const SHORTCUT_GROUPS = [
  {
    title: 'Tools & Navigation',
    shortcuts: [
      { keys: ['V'], desc: 'Move / Selection tool' },
      { keys: ['H'], desc: 'Hand tool (click & drag to pan)' },
      { keys: ['Space', 'Drag'], desc: 'Temporary pan while held' },
      { keys: ['Scroll'], desc: 'Zoom toward cursor' },
    ],
  },
  {
    title: 'Edit & History',
    shortcuts: [
      { keys: ['Ctrl', 'Z'], desc: 'Undo' },
      { keys: ['Ctrl', 'Y'], desc: 'Redo (or Ctrl+Shift+Z)' },
      { keys: ['Ctrl', 'D'], desc: 'Duplicate selected layer' },
      { keys: ['Delete'], desc: 'Delete selected layer' },
      { keys: ['Ctrl', 'V'], desc: 'Paste image from clipboard' },
    ],
  },
  {
    title: 'Layer Arrangement & Nudge',
    shortcuts: [
      { keys: ['Ctrl', ']'], desc: 'Bring layer forward' },
      { keys: ['Ctrl', '['], desc: 'Send layer backward' },
      { keys: ['↑', '↓', '←', '→'], desc: 'Nudge layer 1px' },
      { keys: ['Shift', 'Arrows'], desc: 'Nudge layer 10px' },
    ],
  },
];

export function ShortcutsModal({ isOpen, onClose }) {
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="shortcuts-modal-overlay"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="shortcuts-modal-title"
    >
      <div
        className="shortcuts-modal-card"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="shortcuts-modal-header">
          <div className="shortcuts-modal-title-group">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18">
              <rect x="2" y="4" width="20" height="16" rx="2" />
              <path d="M6 8h.01M10 8h.01M14 8h.01M18 8h.01M8 12h.01M12 12h.01M16 12h.01M7 16h10" />
            </svg>
            <h2 id="shortcuts-modal-title">Keyboard Shortcuts</h2>
          </div>
          <button
            type="button"
            className="editor-btn editor-btn--icon editor-btn--ghost"
            onClick={onClose}
            aria-label="Close shortcuts modal"
          >
            ✕
          </button>
        </div>

        <div className="shortcuts-modal-body">
          {SHORTCUT_GROUPS.map((group) => (
            <div key={group.title} className="shortcuts-modal-group">
              <h3 className="shortcuts-modal-group-title">{group.title}</h3>
              <ul className="shortcuts-modal-list">
                {group.shortcuts.map((s, i) => (
                  <li key={i} className="shortcuts-modal-item">
                    <span className="shortcuts-modal-desc">{s.desc}</span>
                    <div className="shortcuts-modal-keys">
                      {s.keys.map((k, j) => (
                        <span key={j}>
                          <kbd className="shortcuts-key">{k}</kbd>
                          {j < s.keys.length - 1 && <span className="shortcuts-key-plus">+</span>}
                        </span>
                      ))}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="shortcuts-modal-footer">
          <span className="shortcuts-modal-note">Shortcuts are disabled while typing in text inputs.</span>
          <button
            type="button"
            className="editor-btn editor-btn--gold"
            onClick={onClose}
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}

