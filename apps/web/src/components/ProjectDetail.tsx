import React, { useEffect, useState } from 'react';
import { archiveProject, fetchDatasets, fetchProject } from '../api';
import { Dataset, Project } from '../types';
import { CreateDatasetModal } from './CreateDatasetModal';

interface ProjectDetailProps {
  projectId: string;
  onSelectDataset: (datasetId: string) => void;
  onBack: () => void;
  searchQuery: string;
}

export const ProjectDetail: React.FC<ProjectDetailProps> = ({
  projectId,
  onSelectDataset,
  onBack,
  searchQuery,
}) => {
  const [project, setProject] = useState<Project | null>(null);
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [projData, dsData] = await Promise.all([
        fetchProject(projectId),
        fetchDatasets(projectId),
      ]);
      setProject(projData);
      setDatasets(dsData);
    } catch (err: any) {
      setError(err.message || 'Failed to load project details');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [projectId]);

  const handleArchive = async () => {
    if (!window.confirm('Are you sure you want to archive this project?')) return;
    try {
      await archiveProject(projectId);
      loadData();
    } catch (err: any) {
      alert(err.message || 'Failed to archive project');
    }
  };

  const getTaskBadge = (taskType: string) => {
    switch (taskType) {
      case 'image_classification':
        return <span className="badge badge-indigo">Image Classification</span>;
      case 'text_classification':
        return <span className="badge badge-cyan">Text Classification</span>;
      case 'object_detection':
        return <span className="badge badge-amber">Object Detection</span>;
      case 'paired_image_text':
        return <span className="badge badge-emerald">Paired Image-Text</span>;
      default:
        return <span className="badge badge-indigo">{taskType}</span>;
    }
  };

  const filteredDatasets = datasets.filter((d) => {
    const q = searchQuery.toLowerCase();
    return d.name.toLowerCase().includes(q) || (d.description && d.description.toLowerCase().includes(q));
  });

  if (loading) {
    return (
      <div className="loading-container">
        <div className="spinner"></div>
        <div>Loading project datasets...</div>
      </div>
    );
  }

  if (error || !project) {
    return (
      <div className="empty-state">
        <div className="empty-icon" style={{ color: 'var(--rose)' }}>⚠️</div>
        <h3 className="empty-title">Error Loading Project</h3>
        <p className="empty-desc">{error || 'Project not found'}</p>
        <button className="btn btn-secondary" onClick={onBack}>Back to Projects</button>
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '2rem' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
            <h1 style={{ fontSize: '1.75rem', fontWeight: 800 }}>{project.name}</h1>
            {project.is_archived && <span className="badge badge-amber">Archived</span>}
          </div>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', maxWidth: '720px' }}>
            {project.description || 'No project description.'}
          </p>
          <div style={{ display: 'flex', gap: '1rem', marginTop: '0.75rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            <span>ID: <code style={{ fontFamily: 'var(--font-mono)' }}>{project.id}</code></span>
            <span>Created: {new Date(project.created_at).toLocaleDateString()}</span>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem' }}>
          {!project.is_archived && (
            <button className="btn btn-secondary" onClick={handleArchive} title="Archive project">
              Archive
            </button>
          )}
          <button className="btn btn-primary" onClick={() => setIsModalOpen(true)}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="12" y1="5" x2="12" y2="19"/>
              <line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            New Dataset
          </button>
        </div>
      </div>

      <div style={{ marginTop: '2.5rem' }}>
        <h2 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '1rem' }}>
          Datasets ({filteredDatasets.length})
        </h2>

        {filteredDatasets.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">📊</div>
            <h3 className="empty-title">No datasets created yet</h3>
            <p className="empty-desc">
              Add your first dataset under this project to start ingesting files and defining annotation schemas.
            </p>
            <button className="btn btn-primary" onClick={() => setIsModalOpen(true)}>
              Create Dataset
            </button>
          </div>
        ) : (
          <div className="cards-grid">
            {filteredDatasets.map((ds) => (
              <div key={ds.id} className="card" onClick={() => onSelectDataset(ds.id)}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
                  <h3 className="card-title">{ds.name}</h3>
                  {getTaskBadge(ds.task_type)}
                </div>
                <p className="card-desc">{ds.description || 'No dataset description provided.'}</p>
                <div className="card-footer">
                  <span style={{ fontFamily: 'var(--font-mono)' }}>Schema v{ds.schema_version}</span>
                  <span>{new Date(ds.created_at).toLocaleDateString()}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <CreateDatasetModal
        projectId={projectId}
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onCreated={(newDs) => {
          setIsModalOpen(false);
          setDatasets([newDs, ...datasets]);
        }}
      />
    </div>
  );
};
