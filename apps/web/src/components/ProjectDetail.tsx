import React, { useEffect, useState } from 'react';
import { Plus, ArrowLeft, ShieldCheck, Archive, Database, Layers } from 'lucide-react';
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
      case 'audio_transcription':
        return <span className="badge badge-cyan">Audio Transcription</span>;
      default:
        return <span className="badge badge-neutral">{taskType.replace(/_/g, ' ')}</span>;
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
        <h3 className="empty-title">Error Loading Project</h3>
        <p className="empty-desc">{error || 'Project not found'}</p>
        <SpringButton variant="secondary" onClick={onBack}>
          <ArrowLeft size={15} style={{ marginRight: '4px' }} />
          <span>Back to Projects</span>
        </SpringButton>
      </div>
    );
  }

  return (
    <div>
      {/* Project Header Bar */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '2rem', gap: '1rem', flexWrap: 'wrap' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', marginBottom: '0.4rem' }}>
            <h1 style={{ fontSize: '1.65rem', fontWeight: 700, letterSpacing: '-0.025em', color: 'var(--text-primary)' }}>
              {project.name}
            </h1>
            {project.is_archived && <span className="badge badge-amber">Archived</span>}
          </div>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', maxWidth: '680px', lineHeight: 1.5 }}>
            {project.description || 'No project description.'}
          </p>
          <div style={{ display: 'flex', gap: '1rem', marginTop: '0.65rem', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
            <span>ID: <code style={{ fontFamily: 'var(--font-mono)' }}>{project.id}</code></span>
            <span>Created: {new Date(project.created_at).toLocaleDateString()}</span>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <SpringButton variant="secondary" onClick={() => setIsSettingsOpen(true)} title="Project Governance & Quota Settings">
            <ShieldCheck size={15} strokeWidth={1.75} style={{ marginRight: '4px' }} />
            <span>Governance & Quotas</span>
          </SpringButton>
          {!project.is_archived && (
            <SpringButton variant="secondary" onClick={handleArchive} title="Archive project">
              <Archive size={15} strokeWidth={1.75} style={{ marginRight: '4px' }} />
              <span>Archive</span>
            </SpringButton>
          )}
          <SpringButton variant="primary" onClick={() => setIsModalOpen(true)}>
            <Plus size={15} strokeWidth={2.2} style={{ marginRight: '4px' }} />
            <span>New Dataset</span>
          </SpringButton>
        </div>
      </div>

      {/* Datasets Section */}
      <div style={{ marginTop: '2rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
          <h2 style={{ fontSize: '1.15rem', fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.015em' }}>
            Datasets ({filteredDatasets.length})
          </h2>
        </div>

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
                  <div style={{ width: '45%', height: '18px', backgroundColor: 'var(--bg-elevated)', borderRadius: '4px' }} />
                  <div style={{ width: '80%', height: '12px', backgroundColor: 'var(--bg-elevated)', borderRadius: '4px' }} />
                </div>
              ))}
            </div>
          }
          emptyState={
            <div className="empty-state">
              <div className="empty-icon" style={{ display: 'flex', justifyContent: 'center' }}>
                <Database size={36} strokeWidth={1.5} style={{ color: 'var(--text-muted)' }} />
              </div>
              <h3 className="empty-title">No datasets found</h3>
              <p className="empty-desc">
                {searchQuery
                  ? `No datasets match "${searchQuery}".`
                  : 'This project currently has no datasets. Create your first dataset to start importing and labeling data.'}
              </p>
              {!searchQuery && (
                <SpringButton variant="primary" onClick={() => setIsModalOpen(true)}>
                  <Plus size={15} strokeWidth={2} style={{ marginRight: '4px' }} />
                  <span>Create First Dataset</span>
                </SpringButton>
              )}
            </div>
          }
        >
          {(items) => (
            <div className="cards-grid">
              {items.map((ds) => (
                <div key={ds.id} className="card" onClick={() => onSelectDataset(ds.id)}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.45rem' }}>
                    <h3 className="card-title">{ds.name}</h3>
                    {getTaskBadge(ds.task_type)}
                  </div>
                  <p className="card-desc">{ds.description || 'No description provided.'}</p>
                  <div className="card-footer">
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem' }}>{ds.id}</span>
                    <span className="badge badge-neutral">v{ds.schema_version}</span>
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
          onSelectDataset(newDs.id);
        }}
      />

      {isSettingsOpen && (
        <ProjectSettingsModal
          project={project}
          onClose={() => setIsSettingsOpen(false)}
        />
      )}
    </div>
  );
};
