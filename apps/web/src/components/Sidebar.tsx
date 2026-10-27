import React from 'react';
import { Home, FolderKanban, ShieldCheck, Activity, Layers, X } from 'lucide-react';
import { SpringButton } from './ui/SpringButton';

interface SidebarProps {
  currentView: string;
  onNavigate: (view: string) => void;
  systemHealth: { status: string; privacy_mode?: string } | null;
  isMobileOpen?: boolean;
  onCloseMobile?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentView,
  onNavigate,
  systemHealth,
  isMobileOpen = false,
  onCloseMobile,
}) => {
  const handleNavClick = (view: string) => {
    onNavigate(view);
    if (onCloseMobile) onCloseMobile();
  };

  return (
    <>
      {isMobileOpen && <div className="sidebar-backdrop" onClick={onCloseMobile} />}
      <aside className={`sidebar ${isMobileOpen ? 'mobile-open' : ''}`}>
        <div className="sidebar-header" style={{ justifyContent: 'space-between' }}>
          <div
            style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', cursor: 'pointer' }}
            onClick={() => handleNavClick('landing')}
          >
            <div className="brand-icon">
              <Layers size={18} strokeWidth={2} />
            </div>
            <div>
              <div className="brand-title">Dataset Engine</div>
              <div className="brand-subtitle">Multimodal Platform</div>
            </div>
          </div>

          {onCloseMobile && (
            <button
              onClick={onCloseMobile}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: 'var(--text-muted)',
                padding: '0.2rem',
                display: isMobileOpen ? 'block' : 'none',
              }}
              aria-label="Close Sidebar"
            >
              <X size={18} />
            </button>
          )}
        </div>

        <nav className="sidebar-nav">
          <SpringButton
            variant={currentView === 'landing' ? 'primary' : 'ghost'}
            onClick={() => handleNavClick('landing')}
            icon={<Home size={17} strokeWidth={1.75} />}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.65rem',
              padding: '0.6rem 0.85rem',
              borderRadius: 'var(--radius-sm)',
              border: 'none',
            }}
          >
            Home / Overview
          </SpringButton>

          <SpringButton
            variant={currentView.startsWith('project') || currentView === 'dataset_detail' ? 'primary' : 'ghost'}
            onClick={() => handleNavClick('projects')}
            icon={<FolderKanban size={17} strokeWidth={1.75} />}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.65rem',
              padding: '0.6rem 0.85rem',
              borderRadius: 'var(--radius-sm)',
              border: 'none',
            }}
          >
            Projects & Datasets
          </SpringButton>

          <SpringButton
            variant={currentView === 'governance' ? 'primary' : 'ghost'}
            onClick={() => handleNavClick('governance')}
            icon={<ShieldCheck size={17} strokeWidth={1.75} />}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.65rem',
              padding: '0.6rem 0.85rem',
              borderRadius: 'var(--radius-sm)',
              border: 'none',
            }}
          >
            Governance & Quotas
          </SpringButton>

          <SpringButton
            variant={currentView === 'health' ? 'primary' : 'ghost'}
            onClick={() => handleNavClick('health')}
            icon={<Activity size={17} strokeWidth={1.75} />}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.65rem',
              padding: '0.6rem 0.85rem',
              borderRadius: 'var(--radius-sm)',
              border: 'none',
            }}
          >
            System Diagnostics
          </SpringButton>
        </nav>

        <div className="sidebar-footer">
          <div className="status-indicator">
            <span className="status-dot"></span>
            <span>{systemHealth?.privacy_mode === 'local_only' ? 'Local Only ($0 AI)' : 'Ready'}</span>
          </div>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--text-muted)' }}>v0.1.0</span>
        </div>
      </aside>
    </>
  );
};
