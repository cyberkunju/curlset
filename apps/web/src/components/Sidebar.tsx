import React from 'react';

interface SidebarProps {
  currentView: string;
  onNavigate: (view: string) => void;
  systemHealth: { status: string; privacy_mode?: string } | null;
}

export const Sidebar: React.FC<SidebarProps> = ({ currentView, onNavigate, systemHealth }) => {
  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <div className="brand-icon">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
          </svg>
        </div>
        <div>
          <div className="brand-title">Dataset Workbench</div>
        </div>
      </div>

      <nav className="sidebar-nav">
        <button
          className={`nav-item ${currentView.startsWith('project') ? 'active' : ''}`}
          onClick={() => onNavigate('projects')}
          style={{ width: '100%', border: 'none', textAlign: 'left' }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
          </svg>
          Projects & Datasets
        </button>

        <button
          className={`nav-item ${currentView === 'governance' ? 'active' : ''}`}
          onClick={() => onNavigate('governance')}
          style={{ width: '100%', border: 'none', textAlign: 'left' }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
          </svg>
          Governance & Quotas
        </button>

        <button
          className={`nav-item ${currentView === 'health' ? 'active' : ''}`}
          onClick={() => onNavigate('health')}
          style={{ width: '100%', border: 'none', textAlign: 'left' }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 12h-4l-3 9L9 3l-3 9H2"/>
          </svg>
          System Health
        </button>
      </nav>

      <div className="sidebar-footer">
        <div className="status-indicator">
          <span className="status-dot"></span>
          <span>{systemHealth?.privacy_mode === 'local_only' ? 'Local Only ($0 AI)' : 'Ready'}</span>
        </div>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem' }}>v0.1.0</span>
      </div>
    </aside>
  );
};
