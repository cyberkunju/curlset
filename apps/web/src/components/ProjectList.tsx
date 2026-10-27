import React, { useState } from 'react';
import { Project } from '../types';

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

          <button className="btn btn-primary" onClick={onOpenCreateModal}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="12" y1="5" x2="12" y2="19"/>
              <line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            New Project
          </button>
        </div>
      </div>

      {loading ? (
        <div className="loading-container">
          <div className="spinner"></div>
          <div>Loading projects...</div>
        </div>
      ) : filtered.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">📁</div>
          <h3 className="empty-title">No projects found</h3>
          <p className="empty-desc">
            {searchQuery
              ? `No projects match "${searchQuery}". Try clearing the search.`
              : 'Create your first project workspace to start engineering datasets.'}
          </p>
          {!searchQuery && (
            <button className="btn btn-primary" onClick={onOpenCreateModal}>
              Create Project
            </button>
          )}
        </div>
      ) : (
        <div className="cards-grid">
          {filtered.map((proj) => (
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
    </div>
  );
};
