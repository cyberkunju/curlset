import React from 'react';
import { FolderKanban, ShieldCheck, Activity, Layers } from 'lucide-react';
import { SpringButton } from './ui/SpringButton';

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
          <Layers size={20} strokeWidth={1.75} color="#FAFAFA" />
        </div>
        <div>
          <div className="brand-title">Dataset Workbench</div>
        </div>
      </div>

      <nav className="sidebar-nav" style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', padding: '0.5rem' }}>
        <SpringButton
          variant={currentView.startsWith('project') ? 'primary' : 'ghost'}
          onClick={() => onNavigate('projects')}
          style={{
            width: '100%',
            justifyContent: 'flex-start',
            gap: '0.75rem',
            padding: '0.6rem 0.85rem',
            borderRadius: 'var(--radius-sm)',
            border: 'none',
          }}
        >
          <FolderKanban size={18} strokeWidth={1.75} />
          Projects & Datasets
        </SpringButton>

        <SpringButton
          variant={currentView === 'governance' ? 'primary' : 'ghost'}
          onClick={() => onNavigate('governance')}
          style={{
            width: '100%',
            justifyContent: 'flex-start',
            gap: '0.75rem',
            padding: '0.6rem 0.85rem',
            borderRadius: 'var(--radius-sm)',
            border: 'none',
          }}
        >
          <ShieldCheck size={18} strokeWidth={1.75} />
          Governance & Quotas
        </SpringButton>

        <SpringButton
          variant={currentView === 'health' ? 'primary' : 'ghost'}
          onClick={() => onNavigate('health')}
          style={{
            width: '100%',
            justifyContent: 'flex-start',
            gap: '0.75rem',
            padding: '0.6rem 0.85rem',
            borderRadius: 'var(--radius-sm)',
            border: 'none',
          }}
        >
          <Activity size={18} strokeWidth={1.75} />
          System Health
        </SpringButton>
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
