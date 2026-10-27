import React, { useEffect, useState } from 'react';
import { Search, Sun, Moon, Menu } from 'lucide-react';
import { SpringButton } from './ui/SpringButton';

export interface BreadcrumbItem {
  label: string;
  onClick?: () => void;
}

interface HeaderProps {
  breadcrumbs: BreadcrumbItem[];
  onOpenCommandPalette: () => void;
  onToggleMobileSidebar?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  breadcrumbs,
  onOpenCommandPalette,
  onToggleMobileSidebar,
}) => {
  const [isDark, setIsDark] = useState<boolean>(() => {
    return document.documentElement.classList.contains('dark');
  });

  const [isMac, setIsMac] = useState(false);

  useEffect(() => {
    if (typeof navigator !== 'undefined') {
      setIsMac(/(Mac|iPhone|iPod|iPad)/i.test(navigator.platform || navigator.userAgent));
    }
  }, []);

  const toggleTheme = () => {
    if (document.documentElement.classList.contains('dark')) {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
      setIsDark(false);
    } else {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
      setIsDark(true);
    }
  };

  useEffect(() => {
    const saved = localStorage.getItem('theme');
    if (saved === 'dark') {
      document.documentElement.classList.add('dark');
      setIsDark(true);
    }
  }, []);

  return (
    <header className="top-header">
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', minWidth: 0, flex: 1 }}>
        {onToggleMobileSidebar && (
          <button
            type="button"
            className="mobile-sidebar-toggle"
            onClick={onToggleMobileSidebar}
            aria-label="Toggle Navigation Sidebar"
            style={{
              width: '32px',
              height: '32px',
              padding: 0,
              background: 'transparent',
              border: '1px solid var(--border-hairline)',
              borderRadius: 'var(--radius-sm)',
              cursor: 'pointer',
              color: 'var(--text-secondary)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <Menu size={18} strokeWidth={1.75} />
          </button>
        )}

        <nav aria-label="Breadcrumb" className="breadcrumbs" style={{ minWidth: 0, overflow: 'hidden' }}>
          <ol style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', listStyle: 'none', margin: 0, padding: 0 }}>
            {breadcrumbs.map((item, idx) => {
              const isLast = idx === breadcrumbs.length - 1;
              return (
                <li key={idx} style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', minWidth: 0 }}>
                  {idx > 0 && (
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem', userSelect: 'none' }}>
                      /
                    </span>
                  )}
                  {isLast ? (
                    <span
                      aria-current="page"
                      className="breadcrumb-active"
                      style={{
                        fontWeight: 600,
                        fontSize: '0.86rem',
                        color: 'var(--text-primary)',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        maxWidth: '220px',
                      }}
                    >
                      {item.label}
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={item.onClick}
                      className="breadcrumb-link"
                      style={{
                        background: 'none',
                        border: 'none',
                        font: 'inherit',
                        fontSize: '0.86rem',
                        color: 'var(--text-secondary)',
                        cursor: item.onClick ? 'pointer' : 'default',
                        padding: '0.15rem 0.3rem',
                        borderRadius: 'var(--radius-sm)',
                        whiteSpace: 'nowrap',
                        transition: 'color 0.15s ease',
                      }}
                      onMouseEnter={(e) => {
                        if (item.onClick) e.currentTarget.style.color = 'var(--text-primary)';
                      }}
                      onMouseLeave={(e) => {
                        if (item.onClick) e.currentTarget.style.color = 'var(--text-secondary)';
                      }}
                    >
                      {item.label}
                    </button>
                  )}
                </li>
              );
            })}
          </ol>
        </nav>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', flexShrink: 0 }}>
        {/* Command Palette Trigger Button */}
        <button
          type="button"
          onClick={onOpenCommandPalette}
          className="command-palette-trigger"
          aria-label="Open command palette (Ctrl+K)"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '0.75rem',
            padding: '0.4rem 0.65rem',
            height: '32px',
            backgroundColor: 'var(--bg-elevated)',
            border: '1px solid var(--border-hairline)',
            borderRadius: 'var(--radius-sm)',
            cursor: 'pointer',
            color: 'var(--text-muted)',
            fontSize: '0.82rem',
            width: '210px',
            transition: 'all 0.15s ease',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = 'var(--border-strong)';
            e.currentTarget.style.color = 'var(--text-secondary)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = 'var(--border-hairline)';
            e.currentTarget.style.color = 'var(--text-muted)';
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', overflow: 'hidden' }}>
            <Search size={14} strokeWidth={1.75} style={{ flexShrink: 0 }} />
            <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>Search or jump to...</span>
          </div>
          <kbd
            style={{
              fontSize: '0.68rem',
              fontFamily: 'var(--font-mono)',
              padding: '0.1rem 0.35rem',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--border-hairline)',
              backgroundColor: 'var(--bg-surface)',
              color: 'var(--text-muted)',
              lineHeight: 1.2,
              flexShrink: 0,
            }}
          >
            {isMac ? '⌘K' : 'Ctrl K'}
          </kbd>
        </button>

        {/* Theme Toggle */}
        <SpringButton
          variant="secondary"
          onClick={toggleTheme}
          aria-label={isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
          title={isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
          style={{ width: '32px', height: '32px', padding: 0, borderRadius: 'var(--radius-sm)' }}
        >
          {isDark ? <Sun size={15} strokeWidth={1.75} /> : <Moon size={15} strokeWidth={1.75} />}
        </SpringButton>
      </div>
    </header>
  );
};
