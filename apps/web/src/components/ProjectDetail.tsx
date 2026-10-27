import React, { useEffect, useState } from 'react';
import { Plus, ArrowLeft, ShieldCheck, Archive } from 'lucide-react';
import { archiveProject, fetchDatasets, fetchProject } from '../api';
import { Dataset, Project } from '../types';
import { CreateDatasetModal } from './CreateDatasetModal';
import { ProjectSettingsModal } from './ProjectSettingsModal';
import { TriStateView } from './ui/TriStateView';
import { SpringButton } from './ui/SpringButton';

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
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

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
          <SpringButton variant="secondary" onClick={() => setIsSettingsOpen(true)} title="Project Governance & Quota Settings">
            <ShieldCheck size={16} strokeWidth={1.75} style={{ marginRight: '4px' }} />
            Governance & Quotas
          </SpringButton>
          {!project.is_archived && (
            <SpringButton variant="secondary" onClick={handleArchive} title="Archive project">
              <Archive size={16} strokeWidth={1.75} style={{ marginRight: '4px' }} />
              Archive
            </SpringButton>
          )}
          <SpringButton variant="primary" onClick={() => setIsModalOpen(true)}>
            <Plus size={16} strokeWidth={2} style={{ marginRight: '4px' }} />
            New Dataset
          </SpringButton>
        </div>
      </div>

      <div style={{ marginTop: '2.5rem' }}>
        <h2 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '1rem' }}>
          Datasets ({filteredDatasets.length})
        </h2>

        <TriStateView<Dataset[]>
          skeletonName="project-datasets-grid"
          loading={loading}
          data={filteredDatasets}
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
                    <div style={{ width: '30%', height: '10px', backgroundColor: 'var(--bg-elevated)', borderRadius: '4px' }} />
                    <div style={{ width: '25%', height: '10px', backgroundColor: 'var(--bg-elevated)', borderRadius: '4px' }} />
                  </div>
                </div>
              ))}
            </div>
          }
          emptyState={
            <div className="empty-state">
              <div className="empty-icon">📊</div>
              <h3 className="empty-title">No datasets created yet</h3>
              <p className="empty-desc">
                Add your first dataset under this project to start ingesting files and defining annotation schemas.
              </p>
              <SpringButton variant="primary" onClick={() => setIsModalOpen(true)}>
                <Plus size={16} strokeWidth={2} style={{ marginRight: '4px' }} />
                Create Dataset
              </SpringButton>
            </div>
          }
        >
          {(items) => (
            <div className="cards-grid">
              {items.map((ds) => (
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
        </TriStateView>
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

      {isSettingsOpen && project && (
        <ProjectSettingsModal
          project={project}
          onClose={() => setIsSettingsOpen(false)}
        />
      )}
    </div>
  );
};
