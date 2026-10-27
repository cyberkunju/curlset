import React, { useEffect, useState } from 'react';
import { Search, Sun, Moon } from 'lucide-react';
import { SpringButton } from './ui/SpringButton';

interface BreadcrumbItem {
  label: string;
  onClick?: () => void;
}

interface HeaderProps {
  breadcrumbs: BreadcrumbItem[];
  searchQuery: string;
  onSearchChange: (q: string) => void;
}

export const Header: React.FC<HeaderProps> = ({ breadcrumbs, searchQuery, onSearchChange }) => {
  const [isDark, setIsDark] = useState<boolean>(() => {
    return document.documentElement.classList.contains('dark');
  });

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
      <div className="breadcrumbs">
        {breadcrumbs.map((item, idx) => {
          const isLast = idx === breadcrumbs.length - 1;
          return (
            <React.Fragment key={idx}>
              {idx > 0 && <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>/</span>}
              {isLast ? (
                <span className="breadcrumb-active">{item.label}</span>
              ) : (
                <button
                  onClick={item.onClick}
                  className="breadcrumb-link"
                  style={{ background: 'none', border: 'none', font: 'inherit', padding: 0 }}
                >
                  {item.label}
                </button>
              )}
            </React.Fragment>
          );
        })}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
        <div style={{ position: 'relative', width: '220px' }}>
          <input
            type="text"
            placeholder="Search & filter..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="form-input"
            style={{ paddingLeft: '1.9rem', height: '32px', fontSize: '0.8rem', borderRadius: 'var(--radius-sm)' }}
          />
          <Search
            size={13}
            strokeWidth={2}
            style={{ position: 'absolute', left: '0.65rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }}
          />
        </div>

        <SpringButton
          variant="secondary"
          onClick={toggleTheme}
          title={isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
          style={{ width: '32px', height: '32px', padding: 0, borderRadius: 'var(--radius-sm)' }}
        >
          {isDark ? <Sun size={15} strokeWidth={1.75} /> : <Moon size={15} strokeWidth={1.75} />}
        </SpringButton>
      </div>
    </header>
  );
};
