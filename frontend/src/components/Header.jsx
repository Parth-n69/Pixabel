import { useState, useRef, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { Logo } from './Logo';
import { Tabs } from './Tabs';
import './Header.css';
import './Button.css';

export function Header({
  activeTab = 'generate',
  onTabChange,
  galleryCount = 0,
  showTabs = true,
  backToApp = false,
}) {
  const { user, isGuest, signOut } = useAuth();
  const { resolvedTheme, toggleTheme } = useTheme();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  const handleSignOut = async () => {
    setDropdownOpen(false);
    await signOut();
    navigate('/login');
  };

  const displayName = user
    ? user.user_metadata?.full_name || 'User'
    : isGuest
    ? 'Guest'
    : 'Sign in';

  const userEmail = user?.email || (isGuest ? 'Log in to save images' : '');

  return (
    <header className="app-header">
      <div className="header-left">
        <Logo
          onClick={() => {
            if (backToApp) {
              navigate('/?tab=generate');
            } else if (onTabChange) {
              onTabChange('generate');
            } else {
              navigate('/');
            }
          }}
        />
      </div>

      <div className="header-center">
        {showTabs && (
          <Tabs
            activeTab={activeTab}
            onTabChange={onTabChange}
            galleryCount={galleryCount}
          />
        )}
      </div>

      <div className="header-right">
        {backToApp && (
          <Link to="/?tab=generate" className="btn-secondary" style={{ textDecoration: 'none' }}>
            Back to app
          </Link>
        )}

        <button
          type="button"
          className="icon-btn"
          id="theme-toggle-btn"
          onClick={toggleTheme}
          title={`Switch to ${resolvedTheme === 'dark' ? 'light' : 'dark'} mode`}
          aria-label="Toggle theme"
        >
          {resolvedTheme === 'light' ? (
            <svg
              className="sun-icon"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              width="20"
              height="20"
              aria-hidden="true"
            >
              <circle cx="12" cy="12" r="5" />
              <line x1="12" y1="1" x2="12" y2="3" />
              <line x1="12" y1="21" x2="12" y2="23" />
              <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
              <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
              <line x1="1" y1="12" x2="3" y2="12" />
              <line x1="21" y1="12" x2="23" y2="12" />
              <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
              <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
            </svg>
          ) : (
            <svg
              className="moon-icon"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              width="20"
              height="20"
              aria-hidden="true"
            >
              <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" />
            </svg>
          )}
        </button>

        {user || isGuest ? (
          <div className="user-dropdown" ref={dropdownRef}>
            <button
              type="button"
              className="btn-secondary login-btn"
              id="user-profile-btn"
              style={{ display: 'flex', gap: '8px', alignItems: 'center' }}
              onClick={(e) => {
                e.stopPropagation();
                setDropdownOpen((prev) => !prev);
              }}
              aria-expanded={dropdownOpen}
              aria-haspopup="true"
            >
              <span id="user-name-display">{displayName}</span>
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                width="14"
                height="14"
                aria-hidden="true"
              >
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>

            {dropdownOpen && (
              <div className="user-dropdown-menu" id="user-dropdown-menu" role="menu">
                <div className="user-dropdown-info">
                  <strong id="user-dropdown-name">{user ? displayName : 'Guest User'}</strong>
                  {userEmail && (
                    <span id="user-dropdown-email">
                      {userEmail}
                    </span>
                  )}
                </div>

                {user ? (
                  <Link
                    to="/profile"
                    className="user-dropdown-item"
                    onClick={() => setDropdownOpen(false)}
                    role="menuitem"
                  >
                    Profile
                  </Link>
                ) : (
                  <Link
                    to="/login"
                    className="user-dropdown-item"
                    onClick={() => setDropdownOpen(false)}
                    role="menuitem"
                  >
                    Log In
                  </Link>
                )}

                <button
                  type="button"
                  className="user-dropdown-item danger"
                  id="btn-signout"
                  onClick={handleSignOut}
                  role="menuitem"
                >
                  {user ? 'Sign out' : 'Exit Guest Mode'}
                </button>
              </div>
            )}
          </div>
        ) : (
          <button
            type="button"
            className="btn-secondary login-btn"
            onClick={() => navigate('/login')}
          >
            Sign in
          </button>
        )}
      </div>
    </header>
  );
}
