import React, { useState } from 'react';
import { Plus, FolderPlus, FolderKanban, LayoutGrid, List, ArrowUpDown, ChevronRight } from 'lucide-react';
import { Project } from '../types';
import { TriStateView } from './ui/TriStateView';
import { SpringButton } from './ui/SpringButton';
import { CustomSelect } from './ui/CustomSelect';

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

  const filtered = projects
    .filter((p) => {
      const q = searchQuery.toLowerCase();
      return p.name.toLowerCase().includes(q) || (p.description && p.description.toLowerCase().includes(q));
    })
    .sort((a, b) => {
      if (sortBy === 'name') return a.name.localeCompare(b.name);
      if (sortBy === 'date_asc') return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.75rem', gap: '1rem', flexWrap: 'wrap' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
            <h1 style={{ fontSize: '1.65rem', fontWeight: 700, letterSpacing: '-0.025em', color: 'var(--text-primary)' }}>
              Project Workspaces
            </h1>
            <span className="badge badge-neutral">{filtered.length} total</span>
          </div>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginTop: '0.25rem' }}>
            Workspaces organizing training tasks, multimodal records, invariant checks, and immutable versions.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          {/* View mode toggle */}
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
              onClick={() => setViewMode('grid')}
              style={{
                background: viewMode === 'grid' ? 'var(--bg-surface)' : 'transparent',
                border: 'none',
                padding: '4px 8px',
                borderRadius: '4px',
                cursor: 'pointer',
                color: viewMode === 'grid' ? 'var(--text-primary)' : 'var(--text-muted)',
                boxShadow: viewMode === 'grid' ? 'var(--shadow-sm)' : 'none',
              }}
              title="Card Grid View"
            >
              <LayoutGrid size={15} />
            </button>
            <button
              onClick={() => setViewMode('table')}
              style={{
                background: viewMode === 'table' ? 'var(--bg-surface)' : 'transparent',
                border: 'none',
                padding: '4px 8px',
                borderRadius: '4px',
                cursor: 'pointer',
                color: viewMode === 'table' ? 'var(--text-primary)' : 'var(--text-muted)',
                boxShadow: viewMode === 'table' ? 'var(--shadow-sm)' : 'none',
              }}
              title="Structured Table View"
            >
              <List size={15} />
            </button>
          </div>

          {/* Sort order */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            <ArrowUpDown size={14} style={{ color: 'var(--text-muted)' }} />
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

          <label style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', fontSize: '0.82rem', color: 'var(--text-secondary)', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={includeArchived}
              onChange={(e) => onToggleArchived(e.target.checked)}
              style={{ cursor: 'pointer' }}
            />
            Show archived
          </label>

          <SpringButton variant="primary" onClick={onOpenCreateModal}>
            <Plus size={15} strokeWidth={2.2} style={{ marginRight: '4px' }} />
            <span>New Project</span>
          </SpringButton>
        </div>
      </div>

      <TriStateView<Project[]>
        skeletonName="project-list-grid"
        loading={loading}
        data={filtered}
        isEmpty={(items) => items.length === 0}
        boneyardFixture={
          <div className="cards-grid">
            {[1, 2, 3].map((n) => (
              <div
                key={n}
                style={{
                  height: '140px',
                  borderRadius: 'var(--radius-md)',
                  backgroundColor: 'var(--bg-surface)',
                  border: '1px solid var(--border-hairline)',
                  padding: '1.25rem',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                }}
              >
                <div>
                  <div style={{ width: '45%', height: '18px', backgroundColor: 'var(--bg-elevated)', borderRadius: '4px', marginBottom: '0.75rem' }} />
                  <div style={{ width: '80%', height: '12px', backgroundColor: 'var(--bg-elevated)', borderRadius: '4px' }} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <div style={{ width: '25%', height: '10px', backgroundColor: 'var(--bg-elevated)', borderRadius: '4px' }} />
                  <div style={{ width: '20%', height: '10px', backgroundColor: 'var(--bg-elevated)', borderRadius: '4px' }} />
                </div>
              </div>
            ))}
          </div>
        }
        emptyState={
          <div className="empty-state">
            <div className="empty-icon" style={{ display: 'flex', justifyContent: 'center' }}>
              <FolderKanban size={36} strokeWidth={1.5} style={{ color: 'var(--text-muted)' }} />
            </div>
            <h3 className="empty-title">No projects found</h3>
            <p className="empty-desc">
              {searchQuery
                ? `No projects match "${searchQuery}". Try clearing the search query.`
                : 'Create your first project workspace to start engineering multimodal training datasets.'}
            </p>
            {!searchQuery && (
              <SpringButton variant="primary" onClick={onOpenCreateModal}>
                <FolderPlus size={15} strokeWidth={2} style={{ marginRight: '5px' }} />
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
                <div key={proj.id} className="card" onClick={() => onSelectProject(proj.id)}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.45rem' }}>
                    <h3 className="card-title">{proj.name}</h3>
                    {proj.is_archived ? (
                      <span className="badge badge-amber">Archived</span>
                    ) : (
                      <span className="badge badge-emerald">Active</span>
                    )}
                  </div>
                  <p className="card-desc">{proj.description || 'No description provided.'}</p>
                  <div className="card-footer">
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem' }}>{proj.id}</span>
                    <span>{new Date(proj.created_at).toLocaleDateString()}</span>
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
                    <tr key={proj.id} onClick={() => onSelectProject(proj.id)}>
                      <td>
                        <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{proj.name}</div>
                        {proj.description && (
                          <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                            {proj.description}
                          </div>
                        )}
                      </td>
                      <td>
                        <code style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                          {proj.id}
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
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '2px', fontSize: '0.82rem', fontWeight: 600, color: 'var(--accent-interactive)' }}>
                          <span>Open</span>
                          <ChevronRight size={14} />
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
    </div>
  );
};
