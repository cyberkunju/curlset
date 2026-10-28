import React, { useEffect, useState, useMemo } from 'react';
import {
  Plus,
  ArrowLeft,
  ShieldCheck,
  Archive,
  Database,
  LayoutGrid,
  List,
  ChevronRight,
  Search,
  X,
  Layers,
  PenTool,
} from 'lucide-react';
import { archiveProject, fetchDatasets, fetchProject } from '../api';
import { Dataset, Project, TaskType } from '../types';
import { CreateDatasetModal } from './CreateDatasetModal';
import { ProjectSettingsModal } from './ProjectSettingsModal';
import { TriStateView } from './ui/TriStateView';
import { SpringButton } from './ui/SpringButton';
import { CustomSelect } from './ui/CustomSelect';

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
  const [localSearch, setLocalSearch] = useState('');
  const [selectedTaskType, setSelectedTaskType] = useState<string>('');

  const effectiveSearch = searchQuery || localSearch;

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

  const uniqueTaskTypes = useMemo(() => {
    return Array.from(new Set(datasets.map((d) => d.task_type)));
  }, [datasets]);

  const filteredDatasets = useMemo(() => {
    return datasets.filter((d) => {
      const q = effectiveSearch.toLowerCase().trim();
      const matchesSearch =
        !q ||
        d.name.toLowerCase().includes(q) ||
        (d.description && d.description.toLowerCase().includes(q)) ||
        d.id.toLowerCase().includes(q);
      const matchesType = !selectedTaskType || d.task_type === selectedTaskType;
      return matchesSearch && matchesType;
    });
  }, [datasets, effectiveSearch, selectedTaskType]);

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
    <div style={{ maxWidth: '1280px', margin: '0 auto', width: '100%' }}>
      {/* Project Header Bar */}
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
        <div style={{ minWidth: 0, flex: '1 1 500px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', marginBottom: '0.35rem', flexWrap: 'wrap' }}>
            <h1
              style={{
                fontSize: '1.55rem',
                fontWeight: 700,
                letterSpacing: 'var(--letter-spacing-heading)',
                color: 'var(--text-primary)',
              }}
            >
              {project.name}
            </h1>
            {project.is_archived ? (
              <span className="badge badge-amber">Archived</span>
            ) : (
              <span className="badge badge-emerald">Active</span>
            )}
            <span
              style={{
                fontSize: '0.74rem',
                fontFamily: 'var(--font-mono)',
                padding: '0.15rem 0.5rem',
                borderRadius: 'var(--radius-sm)',
                backgroundColor: 'var(--bg-elevated)',
                border: '1px solid var(--border-hairline)',
                color: 'var(--text-muted)',
              }}
            >
              ID: {project.id.slice(0, 12)}...
            </span>
          </div>

          <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem', maxWidth: '720px', lineHeight: 1.5 }}>
            {project.description || 'No project description provided.'}
          </p>

          <div style={{ display: 'flex', gap: '1.25rem', marginTop: '0.5rem', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
            <span>Created: {new Date(project.created_at).toLocaleDateString()}</span>
            <span>Total Datasets: <strong style={{ color: 'var(--text-primary)' }}>{datasets.length}</strong></span>
          </div>
        </div>

        {/* Action Buttons */}
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <SpringButton variant="secondary" onClick={onBack} title="Return to projects overview">
            <ArrowLeft size={15} strokeWidth={1.75} style={{ marginRight: '4px' }} />
            <span>Projects</span>
          </SpringButton>

          <SpringButton variant="secondary" onClick={() => setIsSettingsOpen(true)} title="Project Governance & Quotas">
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
            <Plus size={16} strokeWidth={2.2} style={{ marginRight: '4px' }} />
            <span>New Dataset</span>
          </SpringButton>
        </div>
      </div>

      {/* Dataset Filter & Toolbar Bar */}
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
        {/* Search Input */}
        <div style={{ position: 'relative', flex: '1 1 220px', minWidth: '180px' }}>
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
            placeholder="Search datasets in this project..."
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
              aria-label="Clear search"
            >
              <X size={13} strokeWidth={2} />
            </button>
          )}
        </div>

        {/* Right Filter & View Mode Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', flexWrap: 'wrap' }}>
          {/* Modality Filter */}
          {uniqueTaskTypes.length > 0 && (
            <CustomSelect
              value={selectedTaskType}
              onChange={(val) => setSelectedTaskType(val)}
              options={[
                { value: '', label: 'All Task Types' },
                ...uniqueTaskTypes.map((t) => ({
                  value: t,
                  label: t.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
                })),
              ]}
              size="sm"
              style={{ minWidth: '160px' }}
              ariaLabel="Filter datasets by task type"
            />
          )}

          {/* Grid vs Table View Mode */}
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

      {/* Dataset Inventory Content */}
      <TriStateView<Dataset[]>
        skeletonName="project-datasets-grid"
        loading={loading}
        data={filteredDatasets}
        isEmpty={(items) => items.length === 0}
        emptyState={
          <div className="empty-state">
            <div className="empty-icon" style={{ display: 'flex', justifyContent: 'center' }}>
              <Database size={36} strokeWidth={1.5} style={{ color: 'var(--text-muted)' }} />
            </div>
            <h3 className="empty-title">No datasets found</h3>
            <p className="empty-desc">
              {effectiveSearch || selectedTaskType
                ? 'No datasets match your active filters. Try clearing the search or modality filter.'
                : 'Create your first dataset to start ingesting media assets, configuring label schemas, and running annotation.'}
            </p>
            {effectiveSearch || selectedTaskType ? (
              <SpringButton
                variant="secondary"
                onClick={() => {
                  setLocalSearch('');
                  setSelectedTaskType('');
                }}
              >
                <span>Reset Filters</span>
              </SpringButton>
            ) : (
              <SpringButton variant="primary" onClick={() => setIsModalOpen(true)}>
                <Plus size={15} strokeWidth={2} style={{ marginRight: '5px' }} />
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
                <div
                  key={ds.id}
                  className="card"
                  onClick={() => onSelectDataset(ds.id)}
                  tabIndex={0}
                  role="button"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onSelectDataset(ds.id);
                    }
                  }}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    minHeight: '150px',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.45rem', gap: '0.5rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', minWidth: 0 }}>
                        <Database size={16} strokeWidth={1.75} style={{ color: 'var(--accent-interactive)', flexShrink: 0 }} />
                        <h3 className="card-title" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {ds.name}
                        </h3>
                      </div>
                      <span className="badge badge-neutral" style={{ flexShrink: 0 }}>v{ds.schema_version}</span>
                    </div>

                    <div style={{ marginBottom: '0.5rem' }}>
                      {getTaskBadge(ds.task_type)}
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
                      }}
                    >
                      {ds.description || 'No description provided.'}
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
                      {ds.id.slice(0, 8)}...
                    </span>
                    <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.2rem' }}>
                      <span>{new Date(ds.created_at).toLocaleDateString()}</span>
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
                    <th>Dataset Name & Description</th>
                    <th>Task Type</th>
                    <th>Schema</th>
                    <th>Created</th>
                    <th style={{ textAlign: 'right' }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((ds) => (
                    <tr
                      key={ds.id}
                      onClick={() => onSelectDataset(ds.id)}
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          onSelectDataset(ds.id);
                        }
                      }}
                      style={{ cursor: 'pointer' }}
                    >
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                          <Database size={15} strokeWidth={1.75} style={{ color: 'var(--accent-interactive)', flexShrink: 0 }} />
                          <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{ds.name}</div>
                        </div>
                        {ds.description && (
                          <div
                            style={{
                              fontSize: '0.8rem',
                              color: 'var(--text-secondary)',
                              marginTop: '2px',
                              maxWidth: '420px',
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                            }}
                          >
                            {ds.description}
                          </div>
                        )}
                      </td>
                      <td>{getTaskBadge(ds.task_type)}</td>
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
                          v{ds.schema_version}
                        </code>
                      </td>
                      <td style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                        {new Date(ds.created_at).toLocaleDateString()}
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
                          <span>Explore</span>
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

      {/* Modals */}
      <CreateDatasetModal
        projectId={projectId}
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onCreated={(dataset) => {
          setIsModalOpen(false);
          setDatasets((prev) => [dataset, ...prev]);
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
