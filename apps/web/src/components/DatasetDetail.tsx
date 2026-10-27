import React, { useEffect, useState } from 'react';
import {
  ArrowLeft,
  HardDrive,
  Cpu,
  FileCheck2,
  GitCompare,
  Download,
  PenTool,
  Bot,
  Tag,
  FileText,
  Database,
  ExternalLink,
  ChevronRight,
} from 'lucide-react';
import { fetchDatasetDetail, fetchDatasetQueue } from '../api';
import { DatasetDetailResponse } from '../types';
import { AnnotationWorkspace } from './AnnotationWorkspace';
import { AIAnnotationModal } from './AIAnnotationModal';
import { ImportModal } from './ImportModal';
import { QualityDashboardModal } from './QualityDashboardModal';
import { VersionSnapshotsModal } from './VersionSnapshotsModal';
import { ExportModal } from './ExportModal';
import { SourceDiscoveryModal } from './SourceDiscoveryModal';
import { SyntheticGenerationModal } from './SyntheticGenerationModal';
import { EvaluationModal } from './EvaluationModal';
import { AugmentationModal } from './AugmentationModal';
import { VersionDiffModal } from './VersionDiffModal';
import { ClusterMapModal } from './ClusterMapModal';
import { SpringButton } from './ui/SpringButton';
import { CustomSelect } from './ui/CustomSelect';

interface DatasetDetailProps {
  datasetId: string;
  onBack: () => void;
}

export const DatasetDetail: React.FC<DatasetDetailProps> = ({ datasetId, onBack }) => {
  const [data, setData] = useState<DatasetDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Modals state
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [isWorkspaceOpen, setIsWorkspaceOpen] = useState(false);
  const [isAIOpen, setIsAIOpen] = useState(false);
  const [isQualityOpen, setIsQualityOpen] = useState(false);
  const [isVersionsOpen, setIsVersionsOpen] = useState(false);
  const [isExportOpen, setIsExportOpen] = useState(false);
  const [isSourcesOpen, setIsSourcesOpen] = useState(false);
  const [isSynthesisOpen, setIsSynthesisOpen] = useState(false);
  const [isEvaluationOpen, setIsEvaluationOpen] = useState(false);
  const [isAugmentationOpen, setIsAugmentationOpen] = useState(false);
  const [isDiffOpen, setIsDiffOpen] = useState(false);
  const [isClusterMapOpen, setIsClusterMapOpen] = useState(false);

  // Live Records Preview Explorer state
  const [sampleRecords, setSampleRecords] = useState<any[]>([]);
  const [recordsLoading, setRecordsLoading] = useState(false);
  const [sampleSplit, setSampleSplit] = useState<string>('');

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

  const loadSampleRecords = async () => {
    setRecordsLoading(true);
    try {
      const q = await fetchDatasetQueue(datasetId, sampleSplit || undefined, undefined, 10, 0);
      setSampleRecords(q.items);
    } catch (err) {
      console.error('Failed to load sample records:', err);
    } finally {
      setRecordsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    loadSampleRecords();
  }, [datasetId, sampleSplit]);

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
        <h3 className="empty-title">Error Loading Dataset</h3>
        <p className="empty-desc">{error || 'Dataset not found'}</p>
        <SpringButton variant="secondary" onClick={onBack}>
          <ArrowLeft size={15} style={{ marginRight: '4px' }} />
          <span>Back to Project</span>
        </SpringButton>
      </div>
    );
  }

  const { dataset, stats } = data;
  const labels = dataset.label_schema?.labels || dataset.label_schema?.classes || [];

  const reviewedCount = stats.approved + stats.needs_correction;
  const reviewPct = stats.total_records > 0 ? Math.round((reviewedCount / stats.total_records) * 100) : 0;

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
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '2rem', gap: '1rem', flexWrap: 'wrap' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', marginBottom: '0.4rem' }}>
            <h1 style={{ fontSize: '1.65rem', fontWeight: 700, letterSpacing: '-0.025em', color: 'var(--text-primary)' }}>
              {dataset.name}
            </h1>
            <span className="badge badge-blue">{dataset.task_type.replace(/_/g, ' ')}</span>
            <span className="badge badge-neutral">Schema v{dataset.schema_version}</span>
          </div>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', maxWidth: '720px', lineHeight: 1.5 }}>
            {dataset.description || 'No dataset description provided.'}
          </p>
          <div style={{ display: 'flex', gap: '1rem', marginTop: '0.65rem', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
            <span>Dataset ID: <code style={{ fontFamily: 'var(--font-mono)' }}>{dataset.id}</code></span>
            <span>Created: {new Date(dataset.created_at).toLocaleDateString()}</span>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '0.65rem', alignItems: 'center' }}>
          <SpringButton variant="secondary" onClick={onBack}>
            <ArrowLeft size={15} style={{ marginRight: '4px' }} />
            <span>Back</span>
          </SpringButton>
          <SpringButton variant="primary" onClick={() => setIsWorkspaceOpen(true)}>
            <PenTool size={15} style={{ marginRight: '6px' }} />
            <span>Launch Annotation Workbench</span>
          </SpringButton>
        </div>
      </div>

      {/* Real-Time Annotation Metrics Grid */}
      <div style={{ marginBottom: '2rem' }}>
        <h2 style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
          Real-Time Annotation Metrics
        </h2>
        <div className="stats-grid">
          <div className="stat-card">
            <span className="stat-value">{stats.total_records}</span>
            <span className="stat-label">Total Records</span>
          </div>
          <div className="stat-card">
            <span className="stat-value" style={{ color: 'var(--emerald)' }}>{stats.approved}</span>
            <span className="stat-label">Approved (Verified)</span>
          </div>
          <div className="stat-card">
            <span className="stat-value" style={{ color: 'var(--accent-interactive)' }}>{stats.pending_review}</span>
            <span className="stat-label">Pending Review</span>
          </div>
          <div className="stat-card">
            <span className="stat-value" style={{ color: 'var(--amber)' }}>{stats.needs_correction}</span>
            <span className="stat-label">Needs Correction</span>
          </div>
          <div className="stat-card">
            <span className="stat-value" style={{ color: 'var(--rose)' }}>{stats.rejected}</span>
            <span className="stat-label">Rejected</span>
          </div>
        </div>
      </div>

      {/* Two Column Layout for Labels & Guidelines */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.25rem', marginBottom: '2.5rem' }}>
        <div className="card" style={{ cursor: 'default' }}>
          <h3 style={{ fontSize: '0.95rem', fontWeight: 700, marginBottom: '0.65rem', display: 'flex', alignItems: 'center', gap: '0.45rem', color: 'var(--text-primary)' }}>
            <Tag size={16} strokeWidth={1.75} />
            <span>Configured Classes ({labels.length})</span>
          </h3>
          {labels.length === 0 ? (
            <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>No classes defined in schema.</p>
          ) : (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
              {labels.map((lbl: string, idx: number) => (
                <span key={idx} className="badge badge-blue" style={{ padding: '0.25rem 0.65rem', fontSize: '0.8rem' }}>
                  {lbl}
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="card" style={{ cursor: 'default' }}>
          <h3 style={{ fontSize: '0.95rem', fontWeight: 700, marginBottom: '0.65rem', display: 'flex', alignItems: 'center', gap: '0.45rem', color: 'var(--text-primary)' }}>
            <FileText size={16} strokeWidth={1.75} />
            <span>Annotation Guidelines</span>
          </h3>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', lineHeight: '1.55', whiteSpace: 'pre-wrap' }}>
            {dataset.annotation_instructions || 'No special annotation guidelines specified. Annotators should apply standard labeling criteria.'}
          </p>
        </div>
      </div>

      {/* 5-Stage Dataset Engineering Pipeline Section */}
      <div style={{ marginBottom: '3rem' }}>
        <div style={{ marginBottom: '1.25rem' }}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
            Dataset Engineering Lifecycle Hub
          </h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginTop: '0.25rem' }}>
            Step through the 5 structured engineering stages with real-time pipeline telemetry.
          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.25rem' }}>
          {/* Stage 1 */}
          <div className="pipeline-stage-card">
            <div>
              <div className="pipeline-stage-header" style={{ justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                  <span className="pipeline-stage-num">01</span>
                  <HardDrive size={18} strokeWidth={1.75} style={{ color: 'var(--text-primary)' }} />
                  <h3 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)' }}>Ingestion & Sources</h3>
                </div>
                {stats.total_records > 0 ? (
                  <span className="badge badge-emerald">{stats.total_records} Ingested</span>
                ) : (
                  <span className="badge badge-amber">No Records</span>
                )}
              </div>
              <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: '1.25rem' }}>
                Import local files, ZIP archives, URL feeds with SSRF defense, and document source rights & license attribution.
              </p>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              <SpringButton variant="primary" onClick={() => setIsImportOpen(true)}>
                <span>Import Media</span>
              </SpringButton>
              <SpringButton variant="secondary" onClick={() => setIsSourcesOpen(true)}>
                <span>Sources & Rights</span>
              </SpringButton>
            </div>
          </div>

          {/* Stage 2 */}
          <div className="pipeline-stage-card">
            <div>
              <div className="pipeline-stage-header" style={{ justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                  <span className="pipeline-stage-num">02</span>
                  <PenTool size={18} strokeWidth={1.75} style={{ color: 'var(--text-primary)' }} />
                  <h3 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)' }}>Annotation & AI</h3>
                </div>
                <span className="badge badge-blue">{reviewPct}% Reviewed</span>
              </div>
              <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: '0.75rem' }}>
                Label bounding boxes with <strong>Sobel magnetic edge-snap</strong>, transcribe audio, or run local Ollama auto-labeling.
              </p>
              <div style={{ marginBottom: '1.25rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', marginBottom: '4px', color: 'var(--text-muted)' }}>
                  <span>Human/Model Reviewed</span>
                  <span>{reviewedCount}/{stats.total_records} records</span>
                </div>
                <div className="progress-track">
                  <div className="progress-fill" style={{ width: `${reviewPct}%` }} />
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              <SpringButton variant="primary" onClick={() => setIsWorkspaceOpen(true)}>
                <span>Open Workbench</span>
              </SpringButton>
              <SpringButton variant="secondary" onClick={() => setIsAIOpen(true)}>
                <Bot size={14} style={{ marginRight: '4px' }} />
                <span>AI Auto-Label</span>
              </SpringButton>
            </div>
          </div>

          {/* Stage 3 */}
          <div className="pipeline-stage-card">
            <div>
              <div className="pipeline-stage-header" style={{ justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                  <span className="pipeline-stage-num">03</span>
                  <FileCheck2 size={18} strokeWidth={1.75} style={{ color: 'var(--text-primary)' }} />
                  <h3 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)' }}>Quality & Invariants</h3>
                </div>
                {stats.rejected > 0 ? (
                  <span className="badge badge-rose">{stats.rejected} Flagged</span>
                ) : (
                  <span className="badge badge-emerald">Invariants Healthy</span>
                )}
              </div>
              <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: '1.25rem' }}>
                Detect train/val split leakage, apply geometry-aware spatial transforms, and generate diverse synthetic samples.
              </p>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              <SpringButton variant="secondary" onClick={() => setIsQualityOpen(true)}>
                <span>Quality Checks</span>
              </SpringButton>
              <SpringButton variant="secondary" onClick={() => setIsAugmentationOpen(true)}>
                <span>Spatial Augment</span>
              </SpringButton>
              <SpringButton variant="secondary" onClick={() => setIsSynthesisOpen(true)}>
                <span>Synthesize Data</span>
              </SpringButton>
            </div>
          </div>

          {/* Stage 4 */}
          <div className="pipeline-stage-card">
            <div>
              <div className="pipeline-stage-header" style={{ justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                  <span className="pipeline-stage-num">04</span>
                  <GitCompare size={18} strokeWidth={1.75} style={{ color: 'var(--text-primary)' }} />
                  <h3 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)' }}>Versioning & Diff</h3>
                </div>
                {stats.approved > 0 ? (
                  <span className="badge badge-emerald">{stats.approved} Verified</span>
                ) : (
                  <span className="badge badge-neutral">Draft State</span>
                )}
              </div>
              <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: '1.25rem' }}>
                Publish frozen SHA-256 manifests, compare visual bounding-box deltas ($v_1$ vs $v_2$), and evaluate baseline models.
              </p>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              <SpringButton variant="secondary" onClick={() => setIsVersionsOpen(true)}>
                <span>Snapshots</span>
              </SpringButton>
              <SpringButton variant="secondary" onClick={() => setIsDiffOpen(true)}>
                <span>Visual Git-Diff</span>
              </SpringButton>
              <SpringButton variant="secondary" onClick={() => setIsClusterMapOpen(true)}>
                <span>2D Cluster Map</span>
              </SpringButton>
              <SpringButton variant="secondary" onClick={() => setIsEvaluationOpen(true)}>
                <span>Evaluation</span>
              </SpringButton>
            </div>
          </div>

          {/* Stage 5 */}
          <div className="pipeline-stage-card" style={{ borderLeft: '3px solid var(--accent-primary)' }}>
            <div>
              <div className="pipeline-stage-header" style={{ justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                  <span className="pipeline-stage-num">05</span>
                  <Download size={18} strokeWidth={1.75} style={{ color: 'var(--text-primary)' }} />
                  <h3 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)' }}>Framework Exports</h3>
                </div>
                {stats.approved > 0 ? (
                  <span className="badge badge-blue">Ready for Export</span>
                ) : (
                  <span className="badge badge-neutral">Requires Approvals</span>
                )}
              </div>
              <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: '1.25rem' }}>
                Export 1-click bundles for Unsloth, Axolotl, LLaMA-Factory, or Ultralytics YOLO with live multimodal token simulation.
              </p>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              <SpringButton variant="primary" onClick={() => setIsExportOpen(true)}>
                <span>Export Presets & Simulator</span>
              </SpringButton>
            </div>
          </div>
        </div>
      </div>

      {/* Dataset Records Explorer Table */}
      <div style={{ marginBottom: '3rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.75rem' }}>
          <div>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.02em', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Database size={18} style={{ color: 'var(--accent-interactive)' }} /> Dataset Records Explorer
            </h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginTop: '0.2rem' }}>
              Inspect individual samples, assigned splits, and verified review decisions.
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <CustomSelect
              value={sampleSplit}
              onChange={(val) => setSampleSplit(val)}
              options={[
                { value: '', label: 'All Splits' },
                { value: 'train', label: 'Train' },
                { value: 'val', label: 'Val' },
                { value: 'test', label: 'Test' },
              ]}
              size="sm"
              style={{ minWidth: '130px' }}
              ariaLabel="Filter samples by split"
            />

            <SpringButton variant="secondary" onClick={() => setIsWorkspaceOpen(true)} style={{ fontSize: '0.825rem', padding: '0.4rem 0.75rem' }}>
              <span>Open in Full Workbench</span>
              <ChevronRight size={14} style={{ marginLeft: '4px' }} />
            </SpringButton>
          </div>
        </div>

        {recordsLoading ? (
          <div className="card" style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
            Loading records preview...
          </div>
        ) : sampleRecords.length === 0 ? (
          <div className="card" style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--text-muted)' }}>
            <p style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: '0.4rem' }}>No records found in this dataset</p>
            <p style={{ fontSize: '0.85rem', marginBottom: '1rem' }}>Import media assets in Stage 01 to populate records.</p>
            <SpringButton variant="primary" onClick={() => setIsImportOpen(true)}>
              <span>Import Media Now</span>
            </SpringButton>
          </div>
        ) : (
          <div className="data-table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th style={{ width: '60px' }}>#</th>
                  <th>Record Key / UUID</th>
                  <th>Split</th>
                  <th>Label / Payload</th>
                  <th>Review Status</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {sampleRecords.map((rec, idx) => {
                  const statusClass =
                    rec.review_status === 'approved'
                      ? 'badge-emerald'
                      : rec.review_status === 'rejected'
                      ? 'badge-rose'
                      : rec.review_status === 'needs_correction'
                      ? 'badge-amber'
                      : rec.review_status === 'pending_review'
                      ? 'badge-blue'
                      : 'badge-neutral';

                  return (
                    <tr key={rec.id}>
                      <td style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: '0.78rem' }}>
                        #{idx + 1}
                      </td>
                      <td>
                        <div style={{ fontWeight: 600, fontSize: '0.85rem', color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>
                          {rec.external_key || rec.id.slice(0, 12)}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                          ID: {rec.id.slice(0, 8)}...
                        </div>
                      </td>
                      <td>
                        <span className="badge badge-neutral" style={{ textTransform: 'uppercase', fontSize: '0.72rem' }}>
                          {rec.split || 'train'}
                        </span>
                      </td>
                      <td>
                        {rec.annotation_payload?.label ? (
                          <span className="badge badge-blue">{rec.annotation_payload.label}</span>
                        ) : rec.annotation_payload?.text ? (
                          <span style={{ fontSize: '0.825rem', color: 'var(--text-secondary)' }}>
                            {rec.annotation_payload.text.slice(0, 40)}...
                          </span>
                        ) : (
                          <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>Unlabeled</span>
                        )}
                      </td>
                      <td>
                        <span className={`badge ${statusClass}`} style={{ fontSize: '0.75rem' }}>
                          {rec.review_status.replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <button
                          className="btn btn-secondary"
                          onClick={() => setIsWorkspaceOpen(true)}
                          style={{ padding: '0.25rem 0.6rem', fontSize: '0.78rem' }}
                        >
                          Annotate →
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modals */}
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

      <VersionSnapshotsModal
        datasetId={datasetId}
        isOpen={isVersionsOpen}
        onClose={() => {
          setIsVersionsOpen(false);
          loadData();
        }}
      />

      <VersionDiffModal
        datasetId={datasetId}
        isOpen={isDiffOpen}
        onClose={() => setIsDiffOpen(false)}
      />

      <ExportModal
        datasetId={datasetId}
        isOpen={isExportOpen}
        onClose={() => setIsExportOpen(false)}
        onOpenVersions={() => setIsVersionsOpen(true)}
      />

      <AugmentationModal
        datasetId={datasetId}
        isOpen={isAugmentationOpen}
        onClose={() => setIsAugmentationOpen(false)}
        onAugmentationComplete={() => loadData()}
      />

      <ClusterMapModal
        datasetId={datasetId}
        isOpen={isClusterMapOpen}
        onClose={() => setIsClusterMapOpen(false)}
        onSynthesizeGap={() => setIsSynthesisOpen(true)}
      />

      <SourceDiscoveryModal
        datasetId={datasetId}
        isOpen={isSourcesOpen}
        onClose={() => setIsSourcesOpen(false)}
        onImportComplete={() => loadData()}
      />

      <SyntheticGenerationModal
        datasetId={datasetId}
        labels={labels}
        isOpen={isSynthesisOpen}
        onClose={() => setIsSynthesisOpen(false)}
        onGenerationComplete={() => loadData()}
      />

      <EvaluationModal
        datasetId={datasetId}
        isOpen={isEvaluationOpen}
        onClose={() => setIsEvaluationOpen(false)}
        onOpenSynthesize={() => setIsSynthesisOpen(true)}
      />
    </div>
  );
};
