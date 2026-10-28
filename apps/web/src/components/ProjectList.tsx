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
import { ProjectListSkeleton } from './ui/ProjectListSkeleton';
import { Skeleton } from 'boneyard-js/react';

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
                letterSpacing: '-0.025em',
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
              }}
            >
              {filtered.length} {filtered.length === 1 ? 'project' : 'projects'}
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

      {/* Boneyard-powered Skeleton Integration */}
      <Skeleton name="project-list" loading={loading} fallback={<ProjectListSkeleton />}>
        {/* Real Summary Metrics Bar */}
        <div
          style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: '0.85rem',
          marginBottom: '1.5rem',
        }}
      >
        <div
          style={{
            padding: '0.75rem 1rem',
            backgroundColor: 'var(--bg-surface)',
            border: '1px solid var(--border-hairline)',
            borderRadius: 'var(--radius-md)',
            boxShadow: 'var(--shadow-sm)',
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
          }}
        >
          <div
            style={{
              padding: '0.45rem',
              borderRadius: 'var(--radius-sm)',
              backgroundColor: 'var(--bg-elevated)',
              color: 'var(--text-primary)',
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
            <div style={{ fontSize: '1.15rem', fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>
              {totalCount}
            </div>
          </div>
        </div>

        <div
          style={{
            padding: '0.75rem 1rem',
            backgroundColor: 'var(--bg-surface)',
            border: '1px solid var(--border-hairline)',
            borderRadius: 'var(--radius-md)',
            boxShadow: 'var(--shadow-sm)',
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
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
            <div style={{ fontSize: '1.15rem', fontWeight: 700, color: 'var(--emerald)', fontFamily: 'var(--font-mono)' }}>
              {activeCount}
            </div>
          </div>
        </div>

        <div
          style={{
            padding: '0.75rem 1rem',
            backgroundColor: 'var(--bg-surface)',
            border: '1px solid var(--border-hairline)',
            borderRadius: 'var(--radius-md)',
            boxShadow: 'var(--shadow-sm)',
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
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
            <div style={{ fontSize: '1.15rem', fontWeight: 700, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
              {archivedCount}
            </div>
          </div>
        </div>
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
                background: viewMode === 'grid' ? 'var(--bg-surface)' : 'transparent',
                border: 'none',
                padding: '4px 8px',
                borderRadius: '4px',
                cursor: 'pointer',
                color: viewMode === 'grid' ? 'var(--text-primary)' : 'var(--text-muted)',
                boxShadow: viewMode === 'grid' ? 'var(--shadow-sm)' : 'none',
                display: 'flex',
                alignItems: 'center',
              }}
              title="Card Grid View"
              aria-label="Grid view"
            >
              <LayoutGrid size={15} strokeWidth={1.75} />
            </button>
            <button
              type="button"
              onClick={() => setViewMode('table')}
              style={{
                background: viewMode === 'table' ? 'var(--bg-surface)' : 'transparent',
                border: 'none',
                padding: '4px 8px',
                borderRadius: '4px',
                cursor: 'pointer',
                color: viewMode === 'table' ? 'var(--text-primary)' : 'var(--text-muted)',
                boxShadow: viewMode === 'table' ? 'var(--shadow-sm)' : 'none',
                display: 'flex',
                alignItems: 'center',
              }}
              title="Structured Table View"
              aria-label="Table view"
            >
              <List size={15} strokeWidth={1.75} />
            </button>
          </div>
        </div>
      </div>

      {/* Main TriState View: Skeleton, Empty, or Populated Content */}
      <TriStateView<Project[]>
        skeletonName="project-list-grid"
        loading={loading}
        data={filtered}
        isEmpty={(items) => items.length === 0}
        boneyardFixture={<ProjectListSkeleton />}
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
        {(items) =>
          viewMode === 'grid' ? (
            <div className="cards-grid">
              {items.map((proj) => (
                <div
                  key={proj.id}
                  className="card"
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
                    minHeight: '145px',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.45rem', gap: '0.5rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', minWidth: 0 }}>
                        <FolderKanban size={16} strokeWidth={1.75} style={{ color: 'var(--accent-interactive)', flexShrink: 0 }} />
                        <h3 className="card-title" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
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
                        fontSize: '0.84rem',
                        lineHeight: 1.45,
                        color: 'var(--text-secondary)',
                      }}
                    >
                      {proj.description || 'No project description provided.'}
                    </p>
                  </div>

                  <div className="card-footer" style={{ marginTop: '0.85rem', paddingTop: '0.65rem' }}>
                    <span
                      style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: '0.74rem',
                        color: 'var(--text-muted)',
                        backgroundColor: 'var(--bg-elevated)',
                        padding: '0.1rem 0.35rem',
                        borderRadius: 'var(--radius-sm)',
                        border: '1px solid var(--border-hairline)',
                      }}
                    >
                      {proj.id.slice(0, 8)}...
                    </span>
                    <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.2rem' }}>
                      <span>{new Date(proj.created_at).toLocaleDateString()}</span>
                      <ChevronRight size={13} strokeWidth={1.75} />
                    </span>
                  </div>
                </div>
              ))}
            </div>
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
          )
        }
      </TriStateView>
      </Skeleton>
    </div>
  );
};
