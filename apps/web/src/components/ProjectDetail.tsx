import React, { useEffect, useState } from 'react';
import { Plus, ArrowLeft, ShieldCheck, Archive, Database, LayoutGrid, List, ChevronRight } from 'lucide-react';
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
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');

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
        return <span className="badge badge-blue">Image Classification</span>;
      case 'text_classification':
        return <span className="badge badge-blue">Text Classification</span>;
      case 'object_detection':
        return <span className="badge badge-amber">Object Detection</span>;
      case 'paired_image_text':
        return <span className="badge badge-emerald">Paired Image-Text</span>;
      case 'audio_transcription':
        return <span className="badge badge-blue">Audio Transcription</span>;
      default:
        return <span className="badge badge-neutral">{taskType.replace(/_/g, ' ')}</span>;
    }
  };

  const filteredDatasets = datasets.filter((d) => {
    const q = searchQuery.toLowerCase();
    return d.name.toLowerCase().includes(q) || (d.description && d.description.toLowerCase().includes(q));
  });

  const uniqueTaskTypes = Array.from(new Set(datasets.map((d) => d.task_type)));

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
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '1.75rem', gap: '1rem', flexWrap: 'wrap' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', marginBottom: '0.35rem' }}>
            <h1 style={{ fontSize: '1.65rem', fontWeight: 700, letterSpacing: '-0.025em', color: 'var(--text-primary)' }}>
              {project.name}
            </h1>
            {project.is_archived ? (
              <span className="badge badge-amber">Archived</span>
            ) : (
              <span className="badge badge-emerald">Active</span>
            )}
          </div>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', maxWidth: '680px', lineHeight: 1.5 }}>
            {project.description || 'No project description provided.'}
          </p>
          <div style={{ display: 'flex', gap: '1rem', marginTop: '0.65rem', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
            <span>Project ID: <code style={{ fontFamily: 'var(--font-mono)' }}>{project.id}</code></span>
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

      {/* Summary Chips */}
      <div
        style={{
          display: 'flex',
          gap: '1rem',
          alignItems: 'center',
          padding: '0.85rem 1.25rem',
          backgroundColor: 'var(--bg-surface)',
          border: '1px solid var(--border-hairline)',
          borderRadius: 'var(--radius-md)',
          marginBottom: '2rem',
          fontSize: '0.85rem',
          flexWrap: 'wrap',
          boxShadow: 'var(--shadow-sm)',
        }}
      >
        <div>
          <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem', textTransform: 'uppercase', fontWeight: 600 }}>Total Datasets: </span>
          <strong style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>{datasets.length}</strong>
        </div>
        <div style={{ width: '1px', height: '16px', backgroundColor: 'var(--border-hairline)' }} />
        <div>
          <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem', textTransform: 'uppercase', fontWeight: 600 }}>Task Modalities: </span>
          <strong style={{ color: 'var(--text-primary)' }}>{uniqueTaskTypes.length > 0 ? uniqueTaskTypes.join(', ') : 'None'}</strong>
        </div>
      </div>

      {/* Datasets Section */}
      <div style={{ marginTop: '1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
          <h2 style={{ fontSize: '1.15rem', fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.015em' }}>
            Project Datasets ({filteredDatasets.length})
          </h2>

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
          {(items) =>
            viewMode === 'grid' ? (
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
            ) : (
              <div className="data-table-container">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Dataset Name & Description</th>
                      <th>Task Modality</th>
                      <th>Schema</th>
                      <th>Identifier</th>
                      <th>Created</th>
                      <th style={{ textAlign: 'right' }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((ds) => (
                      <tr key={ds.id} onClick={() => onSelectDataset(ds.id)}>
                        <td>
                          <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{ds.name}</div>
                          {ds.description && (
                            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                              {ds.description}
                            </div>
                          )}
                        </td>
                        <td>{getTaskBadge(ds.task_type)}</td>
                        <td>
                          <span className="badge badge-neutral">v{ds.schema_version}</span>
                        </td>
                        <td>
                          <code style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                            {ds.id}
                          </code>
                        </td>
                        <td style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                          {new Date(ds.created_at).toLocaleDateString()}
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
