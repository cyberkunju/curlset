import React, { useEffect } from 'react';
import { Home, FolderKanban, ShieldCheck, Activity, Layers, X, PanelLeftClose, PanelLeftOpen, KeyRound } from 'lucide-react';
import { SpringButton } from './ui/SpringButton';

interface SidebarProps {
  currentView: string;
  onNavigate: (view: string) => void;
  systemHealth: { status: string; privacy_mode?: string } | null;
  isMobileOpen?: boolean;
  onCloseMobile?: () => void;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentView,
  onNavigate,
  systemHealth,
  isMobileOpen = false,
  onCloseMobile,
  isCollapsed = false,
  onToggleCollapse,
}) => {
  // Close mobile drawer on Escape key
  useEffect(() => {
    if (!isMobileOpen || !onCloseMobile) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCloseMobile();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isMobileOpen, onCloseMobile]);

  // Lock body scroll when mobile drawer is open
  useEffect(() => {
    if (isMobileOpen) {
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = '';
      };
    }
  }, [isMobileOpen]);

  const handleNavClick = (view: string) => {
    onNavigate(view);
    if (onCloseMobile) onCloseMobile();
  };

  const navItems = [
    {
      id: 'landing',
      label: 'Home / Overview',
      icon: <Home size={17} strokeWidth={1.75} />,
      isActive: currentView === 'landing',
    },
    {
      id: 'projects',
      label: 'Projects & Datasets',
      icon: <FolderKanban size={17} strokeWidth={1.75} />,
      isActive: currentView.startsWith('project') || currentView === 'dataset_detail',
    },
    {
      id: 'governance',
      label: 'Governance & Quotas',
      icon: <ShieldCheck size={17} strokeWidth={1.75} />,
      isActive: currentView === 'governance',
    },
    {
      id: 'providers',
      label: 'Model Providers & Keys',
      icon: <KeyRound size={17} strokeWidth={1.75} />,
      isActive: currentView === 'providers',
    },
    {
      id: 'health',
      label: 'System Diagnostics',
      icon: <Activity size={17} strokeWidth={1.75} />,
      isActive: currentView === 'health',
    },
  ];

  return (
    <>
      {isMobileOpen && (
        <div
          className="sidebar-backdrop"
          onClick={onCloseMobile}
          role="presentation"
          aria-hidden="true"
        />
      )}
      <aside
        className={`sidebar ${isMobileOpen ? 'mobile-open' : ''} ${isCollapsed ? 'collapsed' : ''}`}
        aria-label="Application Navigation"
      >
        {/* Header */}
        <div className="sidebar-header" style={{ justifyContent: isCollapsed ? 'center' : 'space-between' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.65rem',
              cursor: 'pointer',
              minWidth: 0,
            }}
            onClick={() => handleNavClick('landing')}
            title="Dataset Engine Multimodal Platform"
          >
            <div className="brand-icon" style={{ flexShrink: 0 }}>
              <Layers size={18} strokeWidth={2} />
            </div>
            {!isCollapsed && (
              <div style={{ minWidth: 0, overflow: 'hidden' }}>
                <div className="brand-title" style={{ whiteSpace: 'nowrap' }}>Dataset Engine</div>
                <div className="brand-subtitle" style={{ whiteSpace: 'nowrap' }}>Multimodal Platform</div>
              </div>
            )}
          </div>

          {/* Desktop/Tablet Collapse Toggle */}
          {onToggleCollapse && !isMobileOpen && (
            <button
              type="button"
              className="sidebar-collapse-btn"
              onClick={onToggleCollapse}
              aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              style={{
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                color: 'var(--text-muted)',
                padding: '0.25rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: 'var(--radius-sm)',
                transition: 'color 0.15s ease',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--text-primary)')}
              onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-muted)')}
            >
              {isCollapsed ? <PanelLeftOpen size={16} strokeWidth={1.75} /> : <PanelLeftClose size={16} strokeWidth={1.75} />}
            </button>
          )}

          {/* Mobile Close Button */}
          {onCloseMobile && isMobileOpen && (
            <button
              type="button"
              onClick={onCloseMobile}
              style={{
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                color: 'var(--text-muted)',
                padding: '0.25rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
              aria-label="Close navigation sidebar"
            >
              <X size={18} strokeWidth={1.75} />
            </button>
          )}
        </div>

        {/* Navigation items */}
        <nav className="sidebar-nav">
          {navItems.map((item) => (
            <SpringButton
              key={item.id}
              variant={item.isActive ? 'primary' : 'ghost'}
              onClick={() => handleNavClick(item.id)}
              aria-label={item.label}
              title={isCollapsed ? item.label : undefined}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: isCollapsed ? 'center' : 'flex-start',
                gap: isCollapsed ? 0 : '0.65rem',
                padding: isCollapsed ? '0.65rem 0' : '0.6rem 0.85rem',
                borderRadius: 'var(--radius-sm)',
                border: 'none',
                textAlign: 'left',
              }}
            >
              <span style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
                {item.icon}
              </span>
              {!isCollapsed && (
                <span
                  style={{
                    fontSize: '0.875rem',
                    fontWeight: item.isActive ? 600 : 500,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {item.label}
                </span>
              )}
            </SpringButton>
          ))}
        </nav>
      </aside>
    </>
  );
};
