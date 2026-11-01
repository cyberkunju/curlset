import React, { useState, useMemo } from 'react';
import {
  Plus,
  FolderKanban,
  LayoutGrid,
  List,
  ArrowUpDown,
  ChevronRight,
  FolderOpen,
  Archive,
  Search,
  X,
  Layers,
} from 'lucide-react';
import { Project } from '../types';
import { TriStateView } from './ui/TriStateView';
import { SpringButton } from './ui/SpringButton';
import { CustomSelect } from './ui/CustomSelect';
import { ProjectCardsSkeleton } from './ui/ProjectListSkeleton';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';

// Prepared spring physics configurations from docs/UI_MOTION_AND_LOADING_SPEC.md
const CARD_SPRING = {
  type: 'spring' as const,
  stiffness: 440,
  damping: 28,
  mass: 0.7,
};

const STAGGER_CONTAINER_VARIANTS = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.035,
    },
  },
};

const CARD_VARIANTS = {
  hidden: { opacity: 0, y: 8, scale: 0.99 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: CARD_SPRING,
  },
};

declare global {
  interface Window {
    __HAS_LOADED_PROJECTS_ONCE__?: boolean;
  }
}

interface ProjectListProps {
  projects: Project[];
  loading: boolean;
  onSelectProject: (projectId: string) => void;
  onOpenCreateModal: () => void;
  includeArchived: boolean;
  onToggleArchived: (val: boolean) => void;
  searchQuery: string;
}

export const ProjectList: React.FC<ProjectListProps> = ({
  projects,
  loading,
  onSelectProject,
  onOpenCreateModal,
  includeArchived,
  onToggleArchived,
  searchQuery,
}) => {
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');
  const [sortBy, setSortBy] = useState<'date_desc' | 'date_asc' | 'name'>('date_desc');
  const [localSearch, setLocalSearch] = useState('');
  const shouldReduceMotion = useReducedMotion();

  // Skeleton is only active while data is actually being fetched from the database
  const [isInitialMounting, setIsInitialMounting] = useState(() => {
    if (typeof window !== 'undefined' && window.__HAS_LOADED_PROJECTS_ONCE__) return false;
    return loading;
  });

  React.useEffect(() => {
    if (isInitialMounting && !loading) {
      setIsInitialMounting(false);
      if (typeof window !== 'undefined') {
        window.__HAS_LOADED_PROJECTS_ONCE__ = true;
      }
    }
  }, [isInitialMounting, loading]);

  const isDataLoading = loading || isInitialMounting;

  const effectiveSearch = searchQuery || localSearch;

  const totalCount = projects.length;
  const activeCount = useMemo(() => projects.filter((p) => !p.is_archived).length, [projects]);
  const archivedCount = useMemo(() => projects.filter((p) => p.is_archived).length, [projects]);

  const filtered = useMemo(() => {
    return projects
      .filter((p) => {
        const q = effectiveSearch.toLowerCase().trim();
        if (!q) return true;
        return (
          p.name.toLowerCase().includes(q) ||
          (p.description && p.description.toLowerCase().includes(q)) ||
          p.id.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => {
        if (sortBy === 'name') return a.name.localeCompare(b.name);
        if (sortBy === 'date_asc') return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      });
  }, [projects, effectiveSearch, sortBy]);

  return (
    <div style={{ maxWidth: '1280px', margin: '0 auto', width: '100%' }}>
      {/* Top Header & Action Bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          marginBottom: '1.5rem',
          gap: '1rem',
          flexWrap: 'wrap',
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
            <h1
              style={{
                fontSize: '1.55rem',
                fontWeight: 700,
                letterSpacing: 'var(--letter-spacing-heading)',
                color: 'var(--text-primary)',
              }}
            >
              Project Workspaces
            </h1>
            <span
              style={{
                fontSize: '0.75rem',
                fontFamily: 'var(--font-mono)',
                padding: '0.15rem 0.5rem',
                borderRadius: '9999px',
                backgroundColor: 'var(--bg-elevated)',
                border: '1px solid var(--border-hairline)',
                color: 'var(--text-secondary)',
                display: 'inline-flex',
                alignItems: 'center',
                minHeight: '22px',
              }}
            >
              {isDataLoading ? (
                <span className="boneyard-bone" style={{ width: '55px', height: '10px', borderRadius: '9999px' }} />
              ) : (
                `${filtered.length} ${filtered.length === 1 ? 'project' : 'projects'}`
              )}
            </span>
          </div>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.86rem', marginTop: '0.2rem' }}>
            Workspaces organizing multimodal dataset splits, validation invariants, review queues, and published snapshots.
          </p>
        </div>

        {/* Primary Action Button */}
        <SpringButton variant="primary" onClick={onOpenCreateModal} style={{ padding: '0.55rem 1.1rem', fontSize: '0.88rem' }}>
          <Plus size={16} strokeWidth={2.2} style={{ marginRight: '5px' }} />
          <span>New Project</span>
        </SpringButton>
      </div>

      {/* Real Summary Metrics Bar (Stable card shells with skeleton on dynamic values) */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: '0.85rem',
          marginBottom: '1.5rem',
        }}
      >
        <motion.div
          whileHover={
            shouldReduceMotion
              ? undefined
              : {
                  y: -1.5,
                  borderColor: 'var(--brand-border)',
                  boxShadow: 'var(--shadow-md), 0 0 12px var(--brand-tint)',
                  transition: { type: 'spring', stiffness: 450, damping: 28 },
                }
          }
          style={{
            padding: '0.75rem 1rem',
            backgroundColor: 'var(--bg-surface)',
            border: '1px solid var(--border-hairline)',
            borderRadius: 'var(--radius-md)',
            boxShadow: 'var(--shadow-sm)',
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
            transition: 'border-color 0.15s ease',
          }}
        >
          <div
            style={{
              padding: '0.45rem',
              borderRadius: 'var(--radius-sm)',
              backgroundColor: 'var(--brand-tint)',
              color: 'var(--brand-primary)',
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <Layers size={16} strokeWidth={1.75} />
          </div>
          <div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600, letterSpacing: '0.04em' }}>
              Total Workspaces
            </div>
            <div style={{ fontSize: '1.15rem', fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', minHeight: '1.4rem', display: 'flex', alignItems: 'center' }}>
              {isDataLoading ? (
                <span className="boneyard-bone" style={{ width: '32px', height: '18px', borderRadius: '4px' }} />
              ) : (
                totalCount
              )}
            </div>
          </div>
        </motion.div>

        <motion.div
          whileHover={
            shouldReduceMotion
              ? undefined
              : {
                  y: -1.5,
                  borderColor: 'rgba(16, 185, 129, 0.3)',
                  boxShadow: 'var(--shadow-md), 0 0 12px rgba(16, 185, 129, 0.12)',
                  transition: { type: 'spring', stiffness: 450, damping: 28 },
                }
          }
          style={{
            padding: '0.75rem 1rem',
            backgroundColor: 'var(--bg-surface)',
            border: '1px solid var(--border-hairline)',
            borderRadius: 'var(--radius-md)',
            boxShadow: 'var(--shadow-sm)',
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
            transition: 'border-color 0.15s ease',
          }}
        >
          <div
            style={{
              padding: '0.45rem',
              borderRadius: 'var(--radius-sm)',
              backgroundColor: 'rgba(16, 185, 129, 0.08)',
              color: 'var(--emerald)',
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <FolderOpen size={16} strokeWidth={1.75} />
          </div>
          <div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600, letterSpacing: '0.04em' }}>
              Active Projects
            </div>
            <div style={{ fontSize: '1.15rem', fontWeight: 700, color: 'var(--emerald)', fontFamily: 'var(--font-mono)', minHeight: '1.4rem', display: 'flex', alignItems: 'center' }}>
              {isDataLoading ? (
                <span className="boneyard-bone" style={{ width: '32px', height: '18px', borderRadius: '4px' }} />
              ) : (
                activeCount
              )}
            </div>
          </div>
        </motion.div>

        <motion.div
          whileHover={
            shouldReduceMotion
              ? undefined
              : {
                  y: -1.5,
                  borderColor: 'rgba(245, 158, 11, 0.3)',
                  boxShadow: 'var(--shadow-md), 0 0 12px rgba(245, 158, 11, 0.12)',
                  transition: { type: 'spring', stiffness: 450, damping: 28 },
                }
          }
          style={{
            padding: '0.75rem 1rem',
            backgroundColor: 'var(--bg-surface)',
            border: '1px solid var(--border-hairline)',
            borderRadius: 'var(--radius-md)',
            boxShadow: 'var(--shadow-sm)',
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
            transition: 'border-color 0.15s ease',
          }}
        >
          <div
            style={{
              padding: '0.45rem',
              borderRadius: 'var(--radius-sm)',
              backgroundColor: 'rgba(245, 158, 11, 0.08)',
              color: 'var(--amber)',
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <Archive size={16} strokeWidth={1.75} />
          </div>
          <div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600, letterSpacing: '0.04em' }}>
              Archived
            </div>
            <div style={{ fontSize: '1.15rem', fontWeight: 700, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', minHeight: '1.4rem', display: 'flex', alignItems: 'center' }}>
              {isDataLoading ? (
                <span className="boneyard-bone" style={{ width: '32px', height: '18px', borderRadius: '4px' }} />
              ) : (
                archivedCount
              )}
            </div>
          </div>
        </motion.div>
      </div>

      {/* Filter and Control Bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0.65rem 0.85rem',
          backgroundColor: 'var(--bg-surface)',
          border: '1px solid var(--border-hairline)',
          borderRadius: 'var(--radius-md)',
          boxShadow: 'var(--shadow-sm)',
          marginBottom: '1.25rem',
          gap: '0.75rem',
          flexWrap: 'wrap',
        }}
      >
        {/* Inline Search Input */}
        <div style={{ position: 'relative', flex: '1 1 240px', minWidth: '200px' }}>
          <Search
            size={14}
            strokeWidth={1.75}
            style={{
              position: 'absolute',
              left: '0.65rem',
              top: '50%',
              transform: 'translateY(-50%)',
              color: 'var(--text-muted)',
            }}
          />
          <input
            type="text"
            placeholder="Filter projects by title, description, or ID..."
            value={localSearch}
            onChange={(e) => setLocalSearch(e.target.value)}
            style={{
              width: '100%',
              paddingLeft: '1.9rem',
              paddingRight: localSearch ? '1.8rem' : '0.65rem',
              height: '32px',
              fontSize: '0.82rem',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--border-hairline)',
              backgroundColor: 'var(--bg-elevated)',
              color: 'var(--text-primary)',
              outline: 'none',
              fontFamily: 'inherit',
            }}
          />
          {localSearch && (
            <button
              type="button"
              onClick={() => setLocalSearch('')}
              style={{
                position: 'absolute',
                right: '0.5rem',
                top: '50%',
                transform: 'translateY(-50%)',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: 'var(--text-muted)',
                padding: '2px',
                display: 'flex',
                alignItems: 'center',
              }}
              aria-label="Clear filter"
            >
              <X size={13} strokeWidth={2} />
            </button>
          )}
        </div>

        {/* Right Controls Group */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', flexWrap: 'wrap' }}>
          {/* Sort order select */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            <ArrowUpDown size={14} strokeWidth={1.75} style={{ color: 'var(--text-muted)' }} />
            <CustomSelect
              value={sortBy}
              onChange={(val) => setSortBy(val as any)}
              options={[
                { value: 'date_desc', label: 'Newest First' },
                { value: 'date_asc', label: 'Oldest First' },
                { value: 'name', label: 'Name (A-Z)' },
              ]}
              size="sm"
              style={{ minWidth: '135px' }}
              ariaLabel="Sort projects"
            />
          </div>

          {/* Show archived toggle */}
          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.45rem',
              fontSize: '0.82rem',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              userSelect: 'none',
            }}
          >
            <input
              type="checkbox"
              checked={includeArchived}
              onChange={(e) => onToggleArchived(e.target.checked)}
              style={{ cursor: 'pointer' }}
            />
            <span>Show archived</span>
          </label>

          {/* Grid vs Table toggle */}
          <div
            style={{
              display: 'inline-flex',
              backgroundColor: 'var(--bg-elevated)',
              padding: '2px',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--border-hairline)',
            }}
          >
            <button
              type="button"
              onClick={() => setViewMode('grid')}
              style={{
                position: 'relative',
                background: 'transparent',
                border: 'none',
                padding: '4px 8px',
                borderRadius: '4px',
                cursor: 'pointer',
                color: viewMode === 'grid' ? 'var(--text-primary)' : 'var(--text-muted)',
                display: 'flex',
                alignItems: 'center',
              }}
              title="Card Grid View"
              aria-label="Grid view"
            >
              {viewMode === 'grid' && (
                <motion.div
                  layoutId="projectListViewToggleIndicator"
                  transition={{ type: 'spring' as const, stiffness: 480, damping: 36 }}
                  style={{
                    position: 'absolute',
                    inset: 0,
                    background: 'var(--bg-surface)',
                    borderRadius: 'inherit',
                    boxShadow: 'var(--shadow-xs)',
                    zIndex: 0,
                  }}
                />
              )}
              <span style={{ position: 'relative', zIndex: 1, display: 'flex', alignItems: 'center' }}>
                <LayoutGrid size={15} strokeWidth={1.75} />
              </span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('table')}
              style={{
                position: 'relative',
                background: 'transparent',
                border: 'none',
                padding: '4px 8px',
                borderRadius: '4px',
                cursor: 'pointer',
                color: viewMode === 'table' ? 'var(--text-primary)' : 'var(--text-muted)',
                display: 'flex',
                alignItems: 'center',
              }}
              title="Structured Table View"
              aria-label="Table view"
            >
              {viewMode === 'table' && (
                <motion.div
                  layoutId="projectListViewToggleIndicator"
                  transition={{ type: 'spring' as const, stiffness: 480, damping: 36 }}
                  style={{
                    position: 'absolute',
                    inset: 0,
                    background: 'var(--bg-surface)',
                    borderRadius: 'inherit',
                    boxShadow: 'var(--shadow-xs)',
                    zIndex: 0,
                  }}
                />
              )}
              <span style={{ position: 'relative', zIndex: 1, display: 'flex', alignItems: 'center' }}>
                <List size={15} strokeWidth={1.75} />
              </span>
            </button>
          </div>
        </div>
      </div>

      {/* Main TriState View: Boneyard Skeleton on database cards, Empty, or Populated Content */}
      <TriStateView<Project[]>
        skeletonName="project-cards-grid"
        minHeight={420}
        loading={isDataLoading}
        data={filtered}
        isEmpty={(items) => items.length === 0}
        boneyardFixture={<ProjectCardsSkeleton />}
        emptyState={
          <div className="empty-state">
            <div className="empty-icon" style={{ display: 'flex', justifyContent: 'center' }}>
              <FolderKanban size={36} strokeWidth={1.5} style={{ color: 'var(--text-muted)' }} />
            </div>
            <h3 className="empty-title">No projects found</h3>
            <p className="empty-desc">
              {effectiveSearch
                ? `No projects match "${effectiveSearch}". Try clearing the search query.`
                : 'Create your first project workspace to start engineering multimodal training datasets.'}
            </p>
            {effectiveSearch ? (
              <SpringButton variant="secondary" onClick={() => setLocalSearch('')}>
                <span>Clear Search Filter</span>
              </SpringButton>
            ) : (
              <SpringButton variant="primary" onClick={onOpenCreateModal}>
                <Plus size={15} strokeWidth={2} style={{ marginRight: '5px' }} />
                <span>Create First Project</span>
              </SpringButton>
            )}
          </div>
        }
      >
        {(items) => (
          <AnimatePresence mode="wait">
            <motion.div
              key={`${viewMode}-${effectiveSearch}-${sortBy}-${includeArchived}`}
              initial={{ opacity: 0.35 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0.35 }}
              transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            >
              {viewMode === 'grid' ? (
                <motion.div
                  className="cards-grid"
                  variants={shouldReduceMotion ? undefined : STAGGER_CONTAINER_VARIANTS}
                  initial="hidden"
                  animate="visible"
                >
                  {items.map((proj) => (
                    <motion.div
                      key={proj.id}
                      variants={shouldReduceMotion ? undefined : CARD_VARIANTS}
                      whileHover={
                        shouldReduceMotion
                          ? undefined
                          : {
                              y: -2.5,
                              borderColor: 'var(--brand-border)',
                              boxShadow: 'var(--shadow-md), 0 0 14px var(--brand-tint)',
                              transition: CARD_SPRING,
                            }
                      }
                      whileTap={
                        shouldReduceMotion
                          ? undefined
                          : {
                              scale: 0.985,
                              transition: { type: 'spring', stiffness: 540, damping: 22 },
                            }
                      }
                      onClick={() => onSelectProject(proj.id)}
                      tabIndex={0}
                      role="button"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          onSelectProject(proj.id);
                        }
                      }}
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between',
                        minHeight: '148px',
                        cursor: 'pointer',
                        backgroundColor: 'var(--bg-surface)',
                        color: 'var(--text-primary)',
                        border: '1px solid var(--border-hairline)',
                        borderRadius: 'var(--radius-md)',
                        boxShadow: 'var(--shadow-sm)',
                        padding: '1.25rem',
                        outline: 'none',
                        transition: 'border-color 0.2s ease',
                      }}
                    >
                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem', gap: '0.65rem' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem', minWidth: 0 }}>
                            <div
                              style={{
                                width: '28px',
                                height: '28px',
                                borderRadius: 'var(--radius-sm)',
                                backgroundColor: 'var(--brand-tint)',
                                border: '1px solid var(--brand-border)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                color: 'var(--brand-primary)',
                                flexShrink: 0,
                              }}
                            >
                              <FolderKanban size={15} strokeWidth={1.85} />
                            </div>
                            <h3
                              className="card-title"
                              style={{
                                margin: 0,
                                fontSize: '0.96rem',
                                fontWeight: 650,
                                letterSpacing: 'var(--letter-spacing-heading)',
                                whiteSpace: 'nowrap',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                color: 'var(--text-primary)',
                              }}
                            >
                              {proj.name}
                            </h3>
                          </div>
                          {proj.is_archived ? (
                            <span className="badge badge-amber" style={{ flexShrink: 0 }}>Archived</span>
                          ) : (
                            <span className="badge badge-emerald" style={{ flexShrink: 0 }}>Active</span>
                          )}
                        </div>
                        <p
                          className="card-desc"
                          style={{
                            display: '-webkit-box',
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: 'vertical',
                            overflow: 'hidden',
                            fontSize: '0.82rem',
                            lineHeight: 1.45,
                            color: 'var(--text-secondary)',
                            margin: '0 0 0.5rem 0',
                          }}
                        >
                          {proj.description || 'No project description provided.'}
                        </p>
                      </div>

                      <div
                        className="card-footer"
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          marginTop: '0.85rem',
                          paddingTop: '0.65rem',
                          borderTop: '1px solid var(--border-hairline)',
                        }}
                      >
                        <span
                          style={{
                            fontFamily: 'var(--font-mono)',
                            fontSize: '0.72rem',
                            color: 'var(--text-muted)',
                            backgroundColor: 'var(--bg-elevated)',
                            padding: '0.12rem 0.45rem',
                            borderRadius: 'var(--radius-sm)',
                            border: '1px solid var(--border-hairline)',
                          }}
                        >
                          {proj.id.slice(0, 10)}...
                        </span>
                        <span
                          style={{
                            fontSize: '0.75rem',
                            color: 'var(--text-muted)',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.25rem',
                            fontFamily: 'var(--font-mono)',
                          }}
                        >
                          <span>{new Date(proj.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                          <ChevronRight size={13} strokeWidth={1.75} />
                        </span>
                      </div>
                    </motion.div>
                  ))}
                </motion.div>
              ) : (
                <div className="data-table-container">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Project Name & Description</th>
                        <th>Identifier</th>
                        <th>Status</th>
                        <th>Created</th>
                        <th style={{ textAlign: 'right' }}>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((proj) => (
                        <tr
                          key={proj.id}
                          onClick={() => onSelectProject(proj.id)}
                          tabIndex={0}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              onSelectProject(proj.id);
                            }
                          }}
                          style={{ cursor: 'pointer' }}
                        >
                          <td>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                              <FolderKanban size={15} strokeWidth={1.75} style={{ color: 'var(--accent-interactive)', flexShrink: 0 }} />
                              <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{proj.name}</div>
                            </div>
                            {proj.description && (
                              <div
                                style={{
                                  fontSize: '0.8rem',
                                  color: 'var(--text-secondary)',
                                  marginTop: '2px',
                                  maxWidth: '480px',
                                  whiteSpace: 'nowrap',
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                }}
                              >
                                {proj.description}
                              </div>
                            )}
                          </td>
                          <td>
                            <code
                              style={{
                                fontFamily: 'var(--font-mono)',
                                fontSize: '0.78rem',
                                color: 'var(--text-muted)',
                                backgroundColor: 'var(--bg-elevated)',
                                padding: '0.15rem 0.4rem',
                                borderRadius: 'var(--radius-sm)',
                                border: '1px solid var(--border-hairline)',
                              }}
                            >
                              {proj.id.slice(0, 12)}...
                            </code>
                          </td>
                          <td>
                            {proj.is_archived ? (
                              <span className="badge badge-amber">Archived</span>
                            ) : (
                              <span className="badge badge-emerald">Active</span>
                            )}
                          </td>
                          <td style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                            {new Date(proj.created_at).toLocaleDateString()}
                          </td>
                          <td style={{ textAlign: 'right' }}>
                            <span
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '2px',
                                fontSize: '0.82rem',
                                fontWeight: 600,
                                color: 'var(--accent-interactive)',
                              }}
                            >
                              <span>Open</span>
                              <ChevronRight size={14} strokeWidth={2} />
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        )}
      </TriStateView>
    </div>
  );
};
