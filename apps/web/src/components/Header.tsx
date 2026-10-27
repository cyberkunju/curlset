import React from 'react';

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
  return (
    <header className="top-header">
      <div className="breadcrumbs">
        {breadcrumbs.map((item, idx) => {
          const isLast = idx === breadcrumbs.length - 1;
          return (
            <React.Fragment key={idx}>
              {idx > 0 && <span style={{ color: 'var(--text-muted)' }}>/</span>}
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

      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
        <div style={{ position: 'relative', width: '240px' }}>
          <input
            type="text"
            placeholder="Filter..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="form-input"
            style={{ paddingLeft: '2rem', height: '34px', fontSize: '0.8rem' }}
          />
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }}
          >
            <circle cx="11" cy="11" r="8"/>
            <line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
        </div>
      </div>
    </header>
  );
};
