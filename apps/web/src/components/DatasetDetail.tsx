import React, { useEffect, useState } from 'react';
import { fetchDatasetDetail } from '../api';
import { DatasetDetailResponse } from '../types';
import { AnnotationWorkspace } from './AnnotationWorkspace';
import { AIAnnotationModal } from './AIAnnotationModal';
import { ImportModal } from './ImportModal';
import { QualityDashboardModal } from './QualityDashboardModal';

interface DatasetDetailProps {
  datasetId: string;
  onBack: () => void;
}

export const DatasetDetail: React.FC<DatasetDetailProps> = ({ datasetId, onBack }) => {
  const [data, setData] = useState<DatasetDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [isWorkspaceOpen, setIsWorkspaceOpen] = useState(false);
  const [isAIOpen, setIsAIOpen] = useState(false);
  const [isQualityOpen, setIsQualityOpen] = useState(false);


  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const resp = await fetchDatasetDetail(datasetId);
      setData(resp);
    } catch (err: any) {
      setError(err.message || 'Failed to load dataset details');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [datasetId]);

  if (loading) {
    return (
      <div className="loading-container">
        <div className="spinner"></div>
        <div>Loading dataset details and live stats...</div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="empty-state">
        <div className="empty-icon" style={{ color: 'var(--rose)' }}>⚠️</div>
        <h3 className="empty-title">Error Loading Dataset</h3>
        <p className="empty-desc">{error || 'Dataset not found'}</p>
        <button className="btn btn-secondary" onClick={onBack}>Back to Project</button>
      </div>
    );
  }

  const { dataset, stats } = data;
  const labels = dataset.label_schema?.labels || dataset.label_schema?.classes || [];

  if (isWorkspaceOpen) {
    return (
      <AnnotationWorkspace
        dataset={dataset}
        onBack={() => {
          setIsWorkspaceOpen(false);
          loadData();
        }}
      />
    );
  }

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '2rem' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
            <h1 style={{ fontSize: '1.75rem', fontWeight: 800 }}>{dataset.name}</h1>
            <span className="badge badge-indigo">{dataset.task_type.replace('_', ' ')}</span>
            <span className="badge badge-cyan">Schema v{dataset.schema_version}</span>
          </div>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', maxWidth: '720px' }}>
            {dataset.description || 'No dataset description provided.'}
          </p>
          <div style={{ display: 'flex', gap: '1rem', marginTop: '0.75rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            <span>Dataset ID: <code style={{ fontFamily: 'var(--font-mono)' }}>{dataset.id}</code></span>
            <span>Created: {new Date(dataset.created_at).toLocaleDateString()}</span>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button className="btn btn-secondary" onClick={onBack}>
            Back
          </button>
        </div>
      </div>

      {/* Live Statistics Grid */}
      <div style={{ marginBottom: '2.5rem' }}>
        <h2 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Real-Time Annotation Metrics
        </h2>
        <div className="stats-grid">
          <div className="stat-card">
            <span className="stat-value">{stats.total_records}</span>
            <span className="stat-label">Total Records</span>
          </div>
          <div className="stat-card" style={{ borderColor: 'rgba(16, 185, 129, 0.3)' }}>
            <span className="stat-value" style={{ color: 'var(--emerald)' }}>{stats.approved}</span>
            <span className="stat-label">Approved (Human Verified)</span>
          </div>
          <div className="stat-card" style={{ borderColor: 'rgba(99, 102, 241, 0.3)' }}>
            <span className="stat-value" style={{ color: 'var(--text-accent)' }}>{stats.pending_review}</span>
            <span className="stat-label">Pending Review</span>
          </div>
          <div className="stat-card" style={{ borderColor: 'rgba(245, 158, 11, 0.3)' }}>
            <span className="stat-value" style={{ color: 'var(--amber)' }}>{stats.needs_correction}</span>
            <span className="stat-label">Needs Correction</span>
          </div>
          <div className="stat-card" style={{ borderColor: 'rgba(239, 68, 68, 0.3)' }}>
            <span className="stat-value" style={{ color: 'var(--rose)' }}>{stats.rejected}</span>
            <span className="stat-label">Rejected</span>
          </div>
        </div>
      </div>

      {/* Two Column Layout for Instructions & Labels */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '1.5rem', marginBottom: '2.5rem' }}>
        <div className="card" style={{ cursor: 'default' }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span>🏷️</span> Configured Class Labels ({labels.length})
          </h3>
          {labels.length === 0 ? (
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>No classes defined in schema.</p>
          ) : (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
              {labels.map((lbl: string, idx: number) => (
                <span key={idx} className="badge badge-indigo" style={{ padding: '0.35rem 0.75rem', fontSize: '0.85rem' }}>
                  {lbl}
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="card" style={{ cursor: 'default' }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span>📋</span> Annotation Guidelines
          </h3>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', lineHeight: '1.6', whiteSpace: 'pre-wrap' }}>
            {dataset.annotation_instructions || 'No special annotation guidelines specified. Annotators should apply standard labeling principles.'}
          </p>
        </div>
      </div>

      {/* Dataset Workflow Pipeline Quick Actions */}
      <div style={{ marginTop: '2rem', padding: '1.5rem', background: 'rgba(15, 23, 42, 0.6)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}>
        <h3 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '0.5rem' }}>Lifecycle Workbench Actions</h3>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginBottom: '1.25rem' }}>
          Step through the dataset engineering lifecycle from ingestion to versioned export:
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem' }}>
          <button className="btn btn-primary" onClick={() => setIsImportOpen(true)} title="Proceed to Ingestion (Phase 3)">
            <span>📥</span> Import Media & Data
          </button>
          <button className="btn btn-secondary" onClick={() => setIsWorkspaceOpen(true)} title="Open Annotation Workbench (Phase 4)">
            <span>✏️</span> Annotation Workbench
          </button>
          <button className="btn btn-secondary" onClick={() => setIsAIOpen(true)} title="Trigger AI Inference (Phase 5)">
            <span>🤖</span> AI Auto-Labeling
          </button>
          <button className="btn btn-secondary" onClick={() => setIsQualityOpen(true)} title="Run Quality Checks (Phase 6)">
            <span>🛡️</span> Quality Engine
          </button>
          <button className="btn btn-secondary" title="Publish Dataset Version (Phase 7)">
            <span>📌</span> Publish Snapshot
          </button>
          <button className="btn btn-secondary" title="Export Dataset Package (Phase 8)">
            <span>📦</span> Export (CSV / JSONL)
          </button>
        </div>
      </div>

      <ImportModal
        datasetId={datasetId}
        isOpen={isImportOpen}
        onClose={() => setIsImportOpen(false)}
        onImportComplete={() => loadData()}
      />

      <AIAnnotationModal
        datasetId={datasetId}
        isOpen={isAIOpen}
        onClose={() => setIsAIOpen(false)}
        onRunComplete={() => loadData()}
      />

      <QualityDashboardModal
        datasetId={datasetId}
        isOpen={isQualityOpen}
        onClose={() => {
          setIsQualityOpen(false);
          loadData();
        }}
      />
    </div>
  );
};

