import React, { useState, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search,
  Home,
  FolderKanban,
  ShieldCheck,
  Activity,
  FolderPlus,
  ArrowRight,
  Database,
  X,
} from 'lucide-react';
import { Project } from '../../types';

export interface CommandItem {
  id: string;
  title: string;
  subtitle?: string;
  category: 'Navigation' | 'Actions' | 'Projects' | 'Datasets';
  icon: React.ReactNode;
  onSelect: () => void;
  keywords?: string[];
}

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  projects: Project[];
  onNavigate: (view: string) => void;
  onSelectProject: (projectId: string) => void;
  onOpenCreateProject: () => void;
}

const SPRING_PALETTE = {
  type: 'spring' as const,
  stiffness: 500,
  damping: 32,
  mass: 0.5,
};

export const CommandPalette: React.FC<CommandPaletteProps> = ({
  isOpen,
  onClose,
  projects,
  onNavigate,
  onSelectProject,
  onOpenCreateProject,
}) => {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Focus input on open & reset state
  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [isOpen]);

  // Build command list based on real state
  const commands: CommandItem[] = useMemo(() => {
    const items: CommandItem[] = [
      {
        id: 'nav-home',
        title: 'Home / Overview',
        subtitle: 'Platform overview, lifecycle, and documentation',
        category: 'Navigation',
        icon: <Home size={16} strokeWidth={1.75} />,
        onSelect: () => onNavigate('landing'),
        keywords: ['overview', 'landing', 'start', 'intro'],
      },
      {
        id: 'nav-projects',
        title: 'Projects & Datasets',
        subtitle: 'Browse all project workspaces and dataset splits',
        category: 'Navigation',
        icon: <FolderKanban size={16} strokeWidth={1.75} />,
        onSelect: () => onNavigate('projects'),
        keywords: ['browse', 'workspaces', 'all'],
      },
      {
        id: 'nav-governance',
        title: 'Governance & Quotas',
        subtitle: 'Storage limits, record quotas, and audit history',
        category: 'Navigation',
        icon: <ShieldCheck size={16} strokeWidth={1.75} />,
        onSelect: () => onNavigate('governance'),
        keywords: ['quotas', 'storage', 'audit', 'rbac', 'security'],
      },
      {
        id: 'nav-health',
        title: 'System Diagnostics',
        subtitle: 'API status, model provider connectivity, and health',
        category: 'Navigation',
        icon: <Activity size={16} strokeWidth={1.75} />,
        onSelect: () => onNavigate('health'),
        keywords: ['health', 'status', 'ping', 'providers', 'diagnostics'],
      },
      {
        id: 'action-create-project',
        title: 'Create New Project',
        subtitle: 'Initialize a new project workspace container',
        category: 'Actions',
        icon: <FolderPlus size={16} strokeWidth={1.75} />,
        onSelect: () => onOpenCreateProject(),
        keywords: ['new', 'add', 'create', 'initialize'],
      },
    ];

    // Add real projects from loaded state
    projects.forEach((proj) => {
      items.push({
        id: `project-${proj.id}`,
        title: proj.name,
        subtitle: proj.description ? proj.description : `Project ID: ${proj.id.slice(0, 8)}...`,
        category: 'Projects',
        icon: <FolderKanban size={16} strokeWidth={1.75} />,
        onSelect: () => onSelectProject(proj.id),
        keywords: [proj.name.toLowerCase(), proj.description?.toLowerCase() || ''],
      });
    });

    return items;
  }, [projects, onNavigate, onSelectProject, onOpenCreateProject]);

  // Filter commands by query
  const filteredCommands = useMemo(() => {
    if (!query.trim()) return commands;
    const lower = query.toLowerCase().trim();
    return commands.filter((cmd) => {
      if (cmd.title.toLowerCase().includes(lower)) return true;
      if (cmd.subtitle?.toLowerCase().includes(lower)) return true;
      if (cmd.category.toLowerCase().includes(lower)) return true;
      if (cmd.keywords?.some((k) => k.includes(lower))) return true;
      return false;
    });
  }, [commands, query]);

  // Keep selected index within bounds
  useEffect(() => {
    if (selectedIndex >= filteredCommands.length) {
      setSelectedIndex(Math.max(0, filteredCommands.length - 1));
    }
  }, [filteredCommands.length, selectedIndex]);

  // Keyboard navigation within palette
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1) % Math.max(1, filteredCommands.length));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev - 1 + filteredCommands.length) % Math.max(1, filteredCommands.length));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filteredCommands[selectedIndex]) {
        filteredCommands[selectedIndex].onSelect();
        onClose();
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  };

  // Group filtered commands by category
  const grouped = useMemo(() => {
    const map = new Map<string, CommandItem[]>();
    filteredCommands.forEach((item) => {
      if (!map.has(item.category)) {
        map.set(item.category, []);
      }
      map.get(item.category)!.push(item);
    });
    return map;
  }, [filteredCommands]);

  let runningIndex = 0;

  return (
    <AnimatePresence>
      {isOpen && (
        <div
          className="modal-overlay command-palette-overlay"
          onClick={(e) => {
            if (e.target === e.currentTarget) onClose();
          }}
          role="dialog"
          aria-modal="true"
          aria-label="Command Palette"
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.55)',
            backdropFilter: 'blur(3px)',
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'center',
            zIndex: 1100,
            padding: '4rem 1.25rem 2rem 1.25rem',
          }}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.97, y: -12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: -8 }}
            transition={SPRING_PALETTE}
            className="command-palette-card"
            style={{
              width: '100%',
              maxWidth: '640px',
              backgroundColor: 'var(--bg-surface)',
              border: '1px solid var(--border-hairline)',
              borderRadius: 'var(--radius-lg)',
              boxShadow: 'var(--shadow-xl)',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
              maxHeight: '75vh',
            }}
          >
            {/* Search Input Bar */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem',
                padding: '0.85rem 1.15rem',
                borderBottom: '1px solid var(--border-hairline)',
                background: 'var(--bg-elevated)',
              }}
            >
              <Search size={18} strokeWidth={1.75} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
              <input
                ref={inputRef}
                type="text"
                placeholder="Type a command or search workspaces..."
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setSelectedIndex(0);
                }}
                onKeyDown={handleKeyDown}
                style={{
                  flex: 1,
                  background: 'transparent',
                  border: 'none',
                  outline: 'none',
                  fontSize: '0.95rem',
                  color: 'var(--text-primary)',
                  fontFamily: 'inherit',
                }}
              />
              <span
                style={{
                  fontSize: '0.7rem',
                  fontFamily: 'var(--font-mono)',
                  color: 'var(--text-muted)',
                  padding: '0.2rem 0.45rem',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--border-hairline)',
                  background: 'var(--bg-surface)',
                  flexShrink: 0,
                }}
              >
                ESC
              </span>
            </div>

            {/* Results List */}
            <div
              ref={listRef}
              style={{
                overflowY: 'auto',
                padding: '0.65rem 0.5rem',
                flex: 1,
              }}
            >
              {filteredCommands.length === 0 ? (
                <div style={{ padding: '2.5rem 1rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                  <Search size={24} strokeWidth={1.75} style={{ margin: '0 auto 0.5rem', opacity: 0.5 }} />
                  <p style={{ fontSize: '0.88rem', fontWeight: 500 }}>No matching commands or projects</p>
                  <p style={{ fontSize: '0.78rem', marginTop: '0.25rem' }}>Try searching for "projects", "governance", or a project title</p>
                </div>
              ) : (
                Array.from(grouped.entries()).map(([category, items]) => (
                  <div key={category} style={{ marginBottom: '0.65rem' }}>
                    <div
                      style={{
                        fontSize: '0.7rem',
                        fontWeight: 700,
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em',
                        color: 'var(--text-muted)',
                        padding: '0.35rem 0.65rem',
                        fontFamily: 'var(--font-mono)',
                      }}
                    >
                      {category}
                    </div>
                    {items.map((item) => {
                      const itemIndex = runningIndex++;
                      const isSelected = itemIndex === selectedIndex;
                      return (
                        <div
                          key={item.id}
                          onClick={() => {
                            item.onSelect();
                            onClose();
                          }}
                          onMouseEnter={() => setSelectedIndex(itemIndex)}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '0.55rem 0.75rem',
                            borderRadius: 'var(--radius-sm)',
                            cursor: 'pointer',
                            backgroundColor: isSelected ? 'var(--bg-elevated)' : 'transparent',
                            color: isSelected ? 'var(--text-primary)' : 'var(--text-secondary)',
                            transition: 'all 0.1s ease',
                            border: `1px solid ${isSelected ? 'var(--border-hairline)' : 'transparent'}`,
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', minWidth: 0 }}>
                            <div
                              style={{
                                color: isSelected ? 'var(--accent-interactive)' : 'var(--text-muted)',
                                display: 'flex',
                                alignItems: 'center',
                                flexShrink: 0,
                              }}
                            >
                              {item.icon}
                            </div>
                            <div style={{ minWidth: 0 }}>
                              <div style={{ fontSize: '0.875rem', fontWeight: isSelected ? 600 : 500, color: 'var(--text-primary)' }}>
                                {item.title}
                              </div>
                              {item.subtitle && (
                                <div
                                  style={{
                                    fontSize: '0.75rem',
                                    color: 'var(--text-muted)',
                                    whiteSpace: 'nowrap',
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    maxWidth: '460px',
                                  }}
                                >
                                  {item.subtitle}
                                </div>
                              )}
                            </div>
                          </div>

                          {isSelected && (
                            <ArrowRight size={14} strokeWidth={2} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                          )}
                        </div>
                      );
                    })}
                  </div>
                ))
              )}
            </div>

            {/* Footer Navigation Hints */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '0.55rem 1.15rem',
                borderTop: '1px solid var(--border-hairline)',
                background: 'var(--bg-elevated)',
                fontSize: '0.72rem',
                color: 'var(--text-muted)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
                <span><kbd style={{ fontFamily: 'var(--font-mono)' }}>↑↓</kbd> navigate</span>
                <span><kbd style={{ fontFamily: 'var(--font-mono)' }}>↵</kbd> select</span>
                <span><kbd style={{ fontFamily: 'var(--font-mono)' }}>esc</kbd> close</span>
              </div>
              <span style={{ fontFamily: 'var(--font-mono)' }}>{filteredCommands.length} results</span>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
