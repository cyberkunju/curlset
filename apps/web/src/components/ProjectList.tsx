import React from 'react';
import { Plus, FolderPlus } from 'lucide-react';
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
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
        <div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 800, letterSpacing: '-0.025em' }}>Projects</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginTop: '0.25rem' }}>
            Workspaces organizing training tasks, multimodal records, and immutable versions.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', color: 'var(--text-secondary)', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={includeArchived}
              onChange={(e) => onToggleArchived(e.target.checked)}
              style={{ cursor: 'pointer' }}
            />
            Show archived
          </label>

          <SpringButton variant="primary" onClick={onOpenCreateModal}>
            <Plus size={16} strokeWidth={2} style={{ marginRight: '4px' }} />
            New Project
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
            <div className="empty-icon">📁</div>
            <h3 className="empty-title">No projects found</h3>
            <p className="empty-desc">
              {searchQuery
                ? `No projects match "${searchQuery}". Try clearing the search.`
                : 'Create your first project workspace to start engineering datasets.'}
            </p>
            {!searchQuery && (
              <SpringButton variant="primary" onClick={onOpenCreateModal}>
                <FolderPlus size={16} strokeWidth={1.75} style={{ marginRight: '4px' }} />
                Create Project
              </SpringButton>
            )}
          </div>
        }
      >
        {(items) => (
          <div className="cards-grid">
            {items.map((proj) => (
              <div key={proj.id} className="card" onClick={() => onSelectProject(proj.id)}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                  <h3 className="card-title">{proj.name}</h3>
                  {proj.is_archived && <span className="badge badge-amber">Archived</span>}
                </div>
                <p className="card-desc">{proj.description || 'No description provided.'}</p>
                <div className="card-footer">
                  <span style={{ fontFamily: 'var(--font-mono)' }}>{proj.id}</span>
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
