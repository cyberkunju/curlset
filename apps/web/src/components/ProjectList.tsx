import React from 'react';
import { Plus, FolderPlus, FolderKanban } from 'lucide-react';
import { Project } from '../types';
import { TriStateView } from './ui/TriStateView';
import { SpringButton } from './ui/SpringButton';

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
  const filtered = projects.filter((p) => {
    const q = searchQuery.toLowerCase();
    return p.name.toLowerCase().includes(q) || (p.description && p.description.toLowerCase().includes(q));
  });

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.75rem' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
            <h1 style={{ fontSize: '1.65rem', fontWeight: 700, letterSpacing: '-0.025em', color: 'var(--text-primary)' }}>
              Project Workspaces
            </h1>
            <span className="badge badge-neutral">{filtered.length} total</span>
          </div>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginTop: '0.25rem' }}>
            Isolated workspaces organizing datasets, media assets, review rules, and cryptographic versions.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
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
        {(items) => (
          <div className="cards-grid">
            {items.map((proj) => (
              <div key={proj.id} className="card" onClick={() => onSelectProject(proj.id)}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.45rem' }}>
                  <h3 className="card-title">{proj.name}</h3>
                  {proj.is_archived && <span className="badge badge-amber">Archived</span>}
                </div>
                <p className="card-desc">{proj.description || 'No description provided.'}</p>
                <div className="card-footer">
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem' }}>{proj.id}</span>
                  <span>{new Date(proj.created_at).toLocaleDateString()}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </TriStateView>
    </div>
  );
};
