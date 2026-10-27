import React from 'react';
import { Home, FolderKanban, ShieldCheck, Activity, Layers } from 'lucide-react';
import { SpringButton } from './ui/SpringButton';

interface SidebarProps {
  currentView: string;
  onNavigate: (view: string) => void;
  systemHealth: { status: string; privacy_mode?: string } | null;
}

export const Sidebar: React.FC<SidebarProps> = ({ currentView, onNavigate, systemHealth }) => {
  return (
    <aside className="sidebar">
      <div className="sidebar-header" style={{ cursor: 'pointer' }} onClick={() => onNavigate('landing')}>
        <div className="brand-icon">
          <Layers size={18} strokeWidth={2} />
        </div>
        <div>
          <div className="brand-title">Dataset Engine</div>
          <div className="brand-subtitle">Multimodal Platform</div>
        </div>
      </div>

      <nav className="sidebar-nav">
        <SpringButton
          variant={currentView === 'landing' ? 'primary' : 'ghost'}
          onClick={() => onNavigate('landing')}
          style={{
            width: '100%',
            justifyContent: 'flex-start',
            gap: '0.65rem',
            padding: '0.55rem 0.75rem',
            borderRadius: 'var(--radius-sm)',
            border: 'none',
          }}
        >
          <Home size={17} strokeWidth={1.75} />
          <span>Home / Overview</span>
        </SpringButton>

        <SpringButton
          variant={currentView.startsWith('project') || currentView === 'dataset_detail' ? 'primary' : 'ghost'}
          onClick={() => onNavigate('projects')}
          style={{
            width: '100%',
            justifyContent: 'flex-start',
            gap: '0.65rem',
            padding: '0.55rem 0.75rem',
            borderRadius: 'var(--radius-sm)',
            border: 'none',
          }}
        >
          <FolderKanban size={17} strokeWidth={1.75} />
          <span>Projects & Datasets</span>
        </SpringButton>

        <SpringButton
          variant={currentView === 'governance' ? 'primary' : 'ghost'}
          onClick={() => onNavigate('governance')}
          style={{
            width: '100%',
            justifyContent: 'flex-start',
            gap: '0.65rem',
            padding: '0.55rem 0.75rem',
            borderRadius: 'var(--radius-sm)',
            border: 'none',
          }}
        >
          <ShieldCheck size={17} strokeWidth={1.75} />
          <span>Governance & Quotas</span>
        </SpringButton>

        <SpringButton
          variant={currentView === 'health' ? 'primary' : 'ghost'}
          onClick={() => onNavigate('health')}
          style={{
            width: '100%',
            justifyContent: 'flex-start',
            gap: '0.65rem',
            padding: '0.55rem 0.75rem',
            borderRadius: 'var(--radius-sm)',
            border: 'none',
          }}
        >
          <Activity size={17} strokeWidth={1.75} />
          <span>System Diagnostics</span>
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
  );
};
