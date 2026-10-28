import React, { useEffect, useState, useMemo } from 'react';
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
  ChevronLeft,
  ChevronDown,
  ChevronUp,
  Search,
  X,
  LayoutGrid,
  List,
  CheckCircle2,
  Clock,
  AlertTriangle,
  XCircle,
  HelpCircle,
  Sparkles,
  RefreshCw,
  Copy,
  Check,
  Layers,
} from 'lucide-react';
import { fetchDatasetDetail, fetchDatasetQueue, fetchRecordDetail } from '../api';
import { DatasetDetailResponse, RecordQueueItem } from '../types';
import { AnnotationWorkspace } from './AnnotationWorkspace';
import { SpringButton } from './ui/SpringButton';
import { CustomSelect } from './ui/CustomSelect';

const AIAnnotationModal = React.lazy(() => import('./AIAnnotationModal').then(m => ({ default: m.AIAnnotationModal })));
const ImportModal = React.lazy(() => import('./ImportModal').then(m => ({ default: m.ImportModal })));
const QualityDashboardModal = React.lazy(() => import('./QualityDashboardModal').then(m => ({ default: m.QualityDashboardModal })));
const VersionSnapshotsModal = React.lazy(() => import('./VersionSnapshotsModal').then(m => ({ default: m.VersionSnapshotsModal })));
const ExportModal = React.lazy(() => import('./ExportModal').then(m => ({ default: m.ExportModal })));
const SourceDiscoveryModal = React.lazy(() => import('./SourceDiscoveryModal').then(m => ({ default: m.SourceDiscoveryModal })));
const SyntheticGenerationModal = React.lazy(() => import('./SyntheticGenerationModal').then(m => ({ default: m.SyntheticGenerationModal })));
const EvaluationModal = React.lazy(() => import('./EvaluationModal').then(m => ({ default: m.EvaluationModal })));
const AugmentationModal = React.lazy(() => import('./AugmentationModal').then(m => ({ default: m.AugmentationModal })));
const VersionDiffModal = React.lazy(() => import('./VersionDiffModal').then(m => ({ default: m.VersionDiffModal })));
const ClusterMapModal = React.lazy(() => import('./ClusterMapModal').then(m => ({ default: m.ClusterMapModal })));

interface DatasetDetailProps {
  datasetId: string;
  onBack: () => void;
}

const PAGE_SIZE = 20;

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

  // Collapsible guidelines panel state
  const [isGuidelinesOpen, setIsGuidelinesOpen] = useState(false);
  const [copiedId, setCopiedId] = useState(false);

  // Live Records Preview Explorer state
  const [records, setRecords] = useState<RecordQueueItem[]>([]);
  const [totalRecords, setTotalRecords] = useState<number>(0);
  const [recordsLoading, setRecordsLoading] = useState(false);
  const [recordsError, setRecordsError] = useState<string | null>(null);
  const [splitFilter, setSplitFilter] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [page, setPage] = useState<number>(0);
  const [viewMode, setViewMode] = useState<'table' | 'grid'>('table');

  // Finding record navigation & filter exclusion communication
  const [highlightedRecordId, setHighlightedRecordId] = useState<string | null>(null);
  const [targetRecordLoading, setTargetRecordLoading] = useState<boolean>(false);
  const [targetRecordNotice, setTargetRecordNotice] = useState<{
    type: 'excluded_by_filter' | 'not_found' | 'error';
    recordId: string;
    recSplit?: string;
    recStatus?: string;
    message: string;
  } | null>(null);

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

  const loadRecords = async (
    targetPage = page,
    split = splitFilter,
    status = statusFilter,
    search = searchQuery
  ) => {
    setRecordsLoading(true);
    setRecordsError(null);
    try {
      const q = await fetchDatasetQueue(
        datasetId,
        split || undefined,
        status || undefined,
        PAGE_SIZE,
        targetPage * PAGE_SIZE,
        search.trim() || undefined
      );
      setRecords(q.items || []);
      setTotalRecords(q.total || 0);
    } catch (err: any) {
      console.error('Failed to load dataset records:', err);
      setRecordsError(err.message || 'Failed to load records');
    } finally {
      setRecordsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [datasetId]);

  useEffect(() => {
    loadRecords(page, splitFilter, statusFilter, searchQuery);
  }, [datasetId, page, splitFilter, statusFilter, searchQuery]);

  // Auto-scroll to located target finding record
  useEffect(() => {
    if (highlightedRecordId && records.some((r) => r.id === highlightedRecordId)) {
      const el = document.getElementById(`record-${highlightedRecordId}`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  }, [highlightedRecordId, records]);

  const handleCopyId = (id: string) => {
    navigator.clipboard.writeText(id);
    setCopiedId(true);
    setTimeout(() => setCopiedId(false), 2000);
  };

  const handleSplitChange = (val: string) => {
    setSplitFilter(val);
    setPage(0);
  };

  const handleStatusChange = (val: string) => {
    setStatusFilter(val);
    setPage(0);
  };

  const handleResetFilters = () => {
    setSplitFilter('');
    setStatusFilter('');
    setSearchQuery('');
    setHighlightedRecordId(null);
    setTargetRecordNotice(null);
    setPage(0);
  };

  // Locate affected record from quality dashboard findings regardless of server page
  const handleLocateRecord = async (targetId: string) => {
    setIsQualityOpen(false);
    setTargetRecordNotice(null);
    setTargetRecordLoading(true);

    try {
      // 1. Fetch exact record detail to check dataset membership, split, and status
      const recordDetail = await fetchRecordDetail(targetId);
      if (!recordDetail || recordDetail.dataset_id !== datasetId) {
        setTargetRecordNotice({
          type: 'not_found',
          recordId: targetId,
          message: `Record "${targetId}" does not belong to dataset "${datasetId}".`,
        });
        setTargetRecordLoading(false);
        return;
      }

      const recSplit = recordDetail.split || 'unassigned';
      const recStatus = recordDetail.annotation?.status || 'unannotated';

      const splitMismatch = Boolean(splitFilter && splitFilter !== recSplit);
      const statusMismatch = Boolean(statusFilter && statusFilter !== recStatus);

      if (splitMismatch || statusMismatch) {
        // Record exists in dataset, but is excluded by active filters
        setTargetRecordNotice({
          type: 'excluded_by_filter',
          recordId: targetId,
          recSplit,
          recStatus,
          message: `Target record "${targetId}" is in split "${recSplit}" with review status "${recStatus}", but is excluded by current active filters.`,
        });
      } else {
        // Record matches active filters or filters are open
        setTargetRecordNotice(null);
        setSearchQuery(targetId);
        setHighlightedRecordId(targetId);
        setPage(0);
      }
    } catch (err: any) {
      setTargetRecordNotice({
        type: 'error',
        recordId: targetId,
        message: err.message || `Failed to locate record "${targetId}".`,
      });
    } finally {
      setTargetRecordLoading(false);
    }
  };

  // Filtered records from server queue
  const filteredRecords = records;

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
  const totalPages = Math.ceil(totalRecords / PAGE_SIZE) || 1;

  if (isWorkspaceOpen) {
    return (
      <AnnotationWorkspace
        dataset={dataset}
        onBack={() => {
          setIsWorkspaceOpen(false);
          loadData();
          loadRecords(page, splitFilter, statusFilter);
        }}
      />
    );
  }

  return (
    <div>
      {/* Breadcrumb & Navigation Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '1.25rem', gap: '1rem', flexWrap: 'wrap' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', marginBottom: '0.35rem', flexWrap: 'wrap' }}>
            <button
              onClick={onBack}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.35rem',
                fontSize: '0.85rem',
                color: 'var(--text-secondary)',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: 0,
              }}
              title="Return to Project"
            >
              <ArrowLeft size={16} />
              <span>Project</span>
            </button>
            <span style={{ color: 'var(--text-muted)' }}>/</span>
            <h1 style={{ fontSize: '1.5rem', fontWeight: 700, letterSpacing: '-0.025em', color: 'var(--text-primary)', margin: 0 }}>
              {dataset.name}
            </h1>
            <span className="badge badge-blue">{dataset.task_type.replace(/_/g, ' ')}</span>
            <span className="badge badge-neutral">Schema v{dataset.schema_version}</span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            <span>
              ID:{' '}
              <button
                onClick={() => handleCopyId(dataset.id)}
                style={{
                  background: 'var(--bg-elevated)',
                  border: '1px solid var(--border-hairline)',
                  borderRadius: '3px',
                  padding: '0.1rem 0.4rem',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '0.75rem',
                  color: 'var(--text-primary)',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.25rem',
                }}
                title="Click to copy full ID"
              >
                {copiedId ? <Check size={11} style={{ color: 'var(--emerald)' }} /> : <Copy size={11} />}
                <span>{dataset.id.slice(0, 8)}...</span>
              </button>
            </span>
            <span>Created {new Date(dataset.created_at).toLocaleDateString()}</span>
            {dataset.description && (
              <span style={{ color: 'var(--text-secondary)' }}>• {dataset.description}</span>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', gap: '0.65rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <SpringButton
            variant="secondary"
            onClick={() => setIsGuidelinesOpen(!isGuidelinesOpen)}
            style={{ fontSize: '0.85rem' }}
          >
            <Tag size={15} strokeWidth={1.75} style={{ marginRight: '5px' }} />
            <span>Schema & Classes ({labels.length})</span>
            {isGuidelinesOpen ? (
              <ChevronUp size={14} style={{ marginLeft: '4px' }} />
            ) : (
              <ChevronDown size={14} style={{ marginLeft: '4px' }} />
            )}
          </SpringButton>

          <SpringButton
            variant="primary"
            onClick={() => setIsWorkspaceOpen(true)}
            style={{ fontSize: '0.875rem' }}
          >
            <PenTool size={15} strokeWidth={1.75} style={{ marginRight: '6px' }} />
            <span>Launch Annotation Workbench</span>
          </SpringButton>
        </div>
      </div>

      {/* Collapsible Schema & Annotation Guidelines Drawer */}
      {isGuidelinesOpen && (
        <div
          style={{
            background: 'var(--bg-surface)',
            border: '1px solid var(--border-hairline)',
            borderRadius: 'var(--radius-md)',
            padding: '1.25rem',
            marginBottom: '1.25rem',
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
            gap: '1.25rem',
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', marginBottom: '0.5rem', fontWeight: 600, fontSize: '0.875rem' }}>
              <Tag size={15} strokeWidth={1.75} style={{ color: 'var(--accent-interactive)' }} />
              <span>Configured Classes ({labels.length})</span>
            </div>
            {labels.length === 0 ? (
              <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>No classes defined in schema.</p>
            ) : (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                {labels.map((lbl: string, idx: number) => (
                  <span key={idx} className="badge badge-blue" style={{ padding: '0.2rem 0.55rem', fontSize: '0.78rem' }}>
                    {lbl}
                  </span>
                ))}
              </div>
            )}
          </div>

          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', marginBottom: '0.5rem', fontWeight: 600, fontSize: '0.875rem' }}>
              <FileText size={15} strokeWidth={1.75} style={{ color: 'var(--accent-interactive)' }} />
              <span>Annotation Guidelines</span>
            </div>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.825rem', lineHeight: 1.5, margin: 0, whiteSpace: 'pre-wrap' }}>
              {dataset.annotation_instructions || 'Standard verification guidelines apply. Label with boundary precision.'}
            </p>
          </div>
        </div>
      )}

      {/* Real-Time Metrics & Review Progress Ribbon */}
      <div
        style={{
          background: 'var(--bg-surface)',
          border: '1px solid var(--border-hairline)',
          borderRadius: 'var(--radius-md)',
          padding: '0.85rem 1.25rem',
          marginBottom: '1.25rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '1rem',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Total Records
            </div>
            <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>
              {stats.total_records}
            </div>
          </div>

          <div style={{ width: '1px', height: '28px', background: 'var(--border-hairline)' }} />

          <div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Approved
            </div>
            <div style={{ fontSize: '1.15rem', fontWeight: 700, color: 'var(--emerald)', fontFamily: 'var(--font-mono)' }}>
              {stats.approved}
            </div>
          </div>

          <div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Pending Review
            </div>
            <div style={{ fontSize: '1.15rem', fontWeight: 700, color: 'var(--accent-interactive)', fontFamily: 'var(--font-mono)' }}>
              {stats.pending_review}
            </div>
          </div>

          <div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Needs Correction
            </div>
            <div style={{ fontSize: '1.15rem', fontWeight: 700, color: 'var(--amber)', fontFamily: 'var(--font-mono)' }}>
              {stats.needs_correction}
            </div>
          </div>

          <div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Rejected
            </div>
            <div style={{ fontSize: '1.15rem', fontWeight: 700, color: 'var(--rose)', fontFamily: 'var(--font-mono)' }}>
              {stats.rejected}
            </div>
          </div>
        </div>

        <div style={{ minWidth: '220px', flex: '1', maxWidth: '340px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', marginBottom: '0.35rem', color: 'var(--text-secondary)' }}>
            <span>Review Progress</span>
            <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{reviewPct}% ({reviewedCount}/{stats.total_records})</span>
          </div>
          <div className="progress-track" style={{ height: '6px' }}>
            <div className="progress-fill" style={{ width: `${reviewPct}%` }} />
          </div>
        </div>
      </div>

      {/* Compact 5-Stage Dataset Engineering Lifecycle Dock */}
      <div className="lifecycle-dock">
        {/* Stage 1 */}
        <div className="lifecycle-stage">
          <div className="lifecycle-stage-top">
            <div className="lifecycle-stage-title">
              <span className="pipeline-stage-num">01</span>
              <HardDrive size={15} strokeWidth={1.75} />
              <span>Ingestion</span>
            </div>
            {stats.total_records > 0 ? (
              <span className="badge badge-emerald">{stats.total_records} Ingested</span>
            ) : (
              <span className="badge badge-amber">No Records</span>
            )}
          </div>
          <div className="lifecycle-stage-actions">
            <SpringButton variant="secondary" onClick={() => setIsImportOpen(true)} style={{ fontSize: '0.78rem', padding: '0.3rem 0.6rem' }}>
              <span>Import Media</span>
            </SpringButton>
            <SpringButton variant="secondary" onClick={() => setIsSourcesOpen(true)} style={{ fontSize: '0.78rem', padding: '0.3rem 0.6rem' }}>
              <span>Sources & Rights</span>
            </SpringButton>
          </div>
        </div>

        {/* Stage 2 */}
        <div className="lifecycle-stage">
          <div className="lifecycle-stage-top">
            <div className="lifecycle-stage-title">
              <span className="pipeline-stage-num">02</span>
              <PenTool size={15} strokeWidth={1.75} />
              <span>Annotation</span>
            </div>
            <span className="badge badge-blue">{reviewPct}%</span>
          </div>
          <div className="lifecycle-stage-actions">
            <SpringButton variant="secondary" onClick={() => setIsWorkspaceOpen(true)} style={{ fontSize: '0.78rem', padding: '0.3rem 0.6rem' }}>
              <span>Workbench</span>
            </SpringButton>
            <SpringButton variant="secondary" onClick={() => setIsAIOpen(true)} style={{ fontSize: '0.78rem', padding: '0.3rem 0.6rem' }}>
              <Bot size={13} style={{ marginRight: '3px' }} />
              <span>AI Auto-Label</span>
            </SpringButton>
          </div>
        </div>

        {/* Stage 3 */}
        <div className="lifecycle-stage">
          <div className="lifecycle-stage-top">
            <div className="lifecycle-stage-title">
              <span className="pipeline-stage-num">03</span>
              <FileCheck2 size={15} strokeWidth={1.75} />
              <span>Quality</span>
            </div>
            {stats.rejected > 0 ? (
              <span className="badge badge-rose">{stats.rejected} Flagged</span>
            ) : (
              <span className="badge badge-emerald">Healthy</span>
            )}
          </div>
          <div className="lifecycle-stage-actions">
            <SpringButton variant="secondary" onClick={() => setIsQualityOpen(true)} style={{ fontSize: '0.78rem', padding: '0.3rem 0.6rem' }}>
              <span>Quality</span>
            </SpringButton>
            <SpringButton variant="secondary" onClick={() => setIsAugmentationOpen(true)} style={{ fontSize: '0.78rem', padding: '0.3rem 0.6rem' }}>
              <span>Augment</span>
            </SpringButton>
            <SpringButton variant="secondary" onClick={() => setIsSynthesisOpen(true)} style={{ fontSize: '0.78rem', padding: '0.3rem 0.6rem' }}>
              <span>Synthesize</span>
            </SpringButton>
          </div>
        </div>

        {/* Stage 4 */}
        <div className="lifecycle-stage">
          <div className="lifecycle-stage-top">
            <div className="lifecycle-stage-title">
              <span className="pipeline-stage-num">04</span>
              <GitCompare size={15} strokeWidth={1.75} />
              <span>Versioning</span>
            </div>
            {stats.approved > 0 ? (
              <span className="badge badge-emerald">Verified</span>
            ) : (
              <span className="badge badge-neutral">Draft</span>
            )}
          </div>
          <div className="lifecycle-stage-actions">
            <SpringButton variant="secondary" onClick={() => setIsVersionsOpen(true)} style={{ fontSize: '0.78rem', padding: '0.3rem 0.6rem' }}>
              <span>Snapshots</span>
            </SpringButton>
            <SpringButton variant="secondary" onClick={() => setIsDiffOpen(true)} style={{ fontSize: '0.78rem', padding: '0.3rem 0.6rem' }}>
              <span>Visual Diff</span>
            </SpringButton>
            <SpringButton variant="secondary" onClick={() => setIsClusterMapOpen(true)} style={{ fontSize: '0.78rem', padding: '0.3rem 0.6rem' }}>
              <span>Clusters</span>
            </SpringButton>
            <SpringButton variant="secondary" onClick={() => setIsEvaluationOpen(true)} style={{ fontSize: '0.78rem', padding: '0.3rem 0.6rem' }}>
              <span>Evaluation</span>
            </SpringButton>
          </div>
        </div>

        {/* Stage 5 */}
        <div className="lifecycle-stage" style={{ borderLeft: '3px solid var(--accent-interactive)' }}>
          <div className="lifecycle-stage-top">
            <div className="lifecycle-stage-title">
              <span className="pipeline-stage-num">05</span>
              <Download size={15} strokeWidth={1.75} />
              <span>Exports</span>
            </div>
            {stats.approved > 0 ? (
              <span className="badge badge-blue">Ready</span>
            ) : (
              <span className="badge badge-neutral">Pending</span>
            )}
          </div>
          <div className="lifecycle-stage-actions">
            <SpringButton variant="primary" onClick={() => setIsExportOpen(true)} style={{ fontSize: '0.78rem', padding: '0.3rem 0.65rem' }}>
              <span>Export Presets & Simulator</span>
            </SpringButton>
          </div>
        </div>
      </div>

      {/* Dataset Records Explorer — Primary Working Surface */}
      <div style={{ marginBottom: '2.5rem' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '0.85rem',
            flexWrap: 'wrap',
            gap: '0.75rem',
          }}
        >
          <div>
            <h2
              style={{
                fontSize: '1.15rem',
                fontWeight: 700,
                color: 'var(--text-primary)',
                letterSpacing: '-0.02em',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                margin: 0,
              }}
            >
              <Database size={17} style={{ color: 'var(--accent-interactive)' }} />
              <span>Dataset Records Explorer</span>
            </h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.825rem', marginTop: '0.2rem', margin: 0 }}>
              Showing {filteredRecords.length} {searchQuery ? `(matching "${searchQuery}")` : ''} of {totalRecords} records in dataset
            </p>
          </div>

          {/* Filtering and View Controls */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
            {/* Search Input */}
            <div style={{ position: 'relative', width: '220px' }}>
              <Search
                size={14}
                style={{
                  position: 'absolute',
                  left: '0.65rem',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: 'var(--text-muted)',
                  pointerEvents: 'none',
                }}
              />
              <input
                type="text"
                placeholder="Search key, text, label..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{
                  width: '100%',
                  height: '32px',
                  padding: '0 1.75rem 0 2rem',
                  fontSize: '0.825rem',
                  background: 'var(--bg-surface)',
                  border: '1px solid var(--border-hairline)',
                  borderRadius: 'var(--radius-sm)',
                  color: 'var(--text-primary)',
                  boxSizing: 'border-box',
                }}
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  style={{
                    position: 'absolute',
                    right: '0.45rem',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none',
                    border: 'none',
                    color: 'var(--text-muted)',
                    cursor: 'pointer',
                    padding: 0,
                    display: 'flex',
                  }}
                  title="Clear search"
                >
                  <X size={14} />
                </button>
              )}
            </div>

            {/* Split Filter */}
            <CustomSelect
              value={splitFilter}
              onChange={handleSplitChange}
              options={[
                { value: '', label: 'All Splits' },
                { value: 'train', label: 'Train' },
                { value: 'val', label: 'Validation' },
                { value: 'test', label: 'Test' },
                { value: 'unassigned', label: 'Unassigned' },
              ]}
              size="sm"
              style={{ minWidth: '120px' }}
              ariaLabel="Filter records by split"
            />

            {/* Status Filter */}
            <CustomSelect
              value={statusFilter}
              onChange={handleStatusChange}
              options={[
                { value: '', label: 'All Review Statuses' },
                { value: 'unannotated', label: 'Unannotated' },
                { value: 'pending_review', label: 'Pending Review' },
                { value: 'approved', label: 'Approved' },
                { value: 'needs_correction', label: 'Needs Correction' },
                { value: 'rejected', label: 'Rejected' },
              ]}
              size="sm"
              style={{ minWidth: '150px' }}
              ariaLabel="Filter records by review status"
            />

            {/* View Mode Toggle */}
            <div style={{ display: 'flex', background: 'var(--bg-elevated)', border: '1px solid var(--border-hairline)', borderRadius: 'var(--radius-sm)', padding: '2px' }}>
              <button
                onClick={() => setViewMode('table')}
                style={{
                  background: viewMode === 'table' ? 'var(--bg-surface)' : 'transparent',
                  border: 'none',
                  borderRadius: '3px',
                  padding: '0.25rem 0.5rem',
                  cursor: 'pointer',
                  color: viewMode === 'table' ? 'var(--text-primary)' : 'var(--text-muted)',
                  display: 'flex',
                  alignItems: 'center',
                }}
                title="Table view"
              >
                <List size={14} />
              </button>
              <button
                onClick={() => setViewMode('grid')}
                style={{
                  background: viewMode === 'grid' ? 'var(--bg-surface)' : 'transparent',
                  border: 'none',
                  borderRadius: '3px',
                  padding: '0.25rem 0.5rem',
                  cursor: 'pointer',
                  color: viewMode === 'grid' ? 'var(--text-primary)' : 'var(--text-muted)',
                  display: 'flex',
                  alignItems: 'center',
                }}
                title="Grid view"
              >
                <LayoutGrid size={14} />
              </button>
            </div>

            {/* Refresh */}
            <button
              onClick={() => loadRecords(page, splitFilter, statusFilter)}
              style={{
                background: 'var(--bg-surface)',
                border: '1px solid var(--border-hairline)',
                borderRadius: 'var(--radius-sm)',
                padding: '0.35rem 0.5rem',
                cursor: 'pointer',
                color: 'var(--text-secondary)',
                display: 'flex',
                alignItems: 'center',
              }}
              title="Refresh records"
            >
              <RefreshCw size={14} />
            </button>
          </div>
        </div>

        {/* Target Record Navigation Feedback Banner */}
        {targetRecordLoading && (
          <div
            style={{
              padding: '0.65rem 1rem',
              borderRadius: 'var(--radius-sm)',
              marginBottom: '1rem',
              background: 'var(--bg-elevated)',
              border: '1px solid var(--border-hairline)',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              fontSize: '0.8rem',
              color: 'var(--text-secondary)',
            }}
          >
            <div className="spinner" style={{ width: '14px', height: '14px' }}></div>
            <span>Locating target finding record in dataset queue...</span>
          </div>
        )}

        {targetRecordNotice && (
          <div
            style={{
              padding: '0.75rem 1rem',
              borderRadius: 'var(--radius-sm)',
              marginBottom: '1rem',
              background:
                targetRecordNotice.type === 'not_found' || targetRecordNotice.type === 'error'
                  ? 'rgba(239, 68, 68, 0.08)'
                  : 'rgba(245, 158, 11, 0.08)',
              border: `1px solid ${
                targetRecordNotice.type === 'not_found' || targetRecordNotice.type === 'error'
                  ? 'var(--rose)'
                  : 'var(--amber)'
              }`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '1rem',
              fontSize: '0.825rem',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <AlertTriangle
                size={16}
                strokeWidth={1.75}
                style={{
                  color:
                    targetRecordNotice.type === 'not_found' || targetRecordNotice.type === 'error'
                      ? 'var(--rose)'
                      : 'var(--amber)',
                  flexShrink: 0,
                }}
              />
              <span style={{ color: 'var(--text-primary)' }}>{targetRecordNotice.message}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }}>
              {targetRecordNotice.type === 'excluded_by_filter' && (
                <button
                  type="button"
                  className="btn btn-primary"
                  style={{ padding: '0.25rem 0.65rem', fontSize: '0.75rem' }}
                  onClick={() => {
                    setSplitFilter('');
                    setStatusFilter('');
                    setSearchQuery(targetRecordNotice.recordId);
                    setHighlightedRecordId(targetRecordNotice.recordId);
                    setPage(0);
                    setTargetRecordNotice(null);
                  }}
                >
                  Clear Filters & Show Record
                </button>
              )}
              <button
                type="button"
                className="btn btn-secondary"
                style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}
                onClick={() => setTargetRecordNotice(null)}
              >
                Dismiss
              </button>
            </div>
          </div>
        )}

        {/* Records Content Area */}
        {recordsLoading ? (
          <div className="card" style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
            <div className="spinner" style={{ margin: '0 auto 0.75rem auto' }}></div>
            <div>Loading records...</div>
          </div>
        ) : recordsError ? (
          <div className="card" style={{ padding: '2rem', textAlign: 'center', color: 'var(--rose)' }}>
            <AlertTriangle size={24} style={{ margin: '0 auto 0.5rem auto' }} />
            <p style={{ fontWeight: 600 }}>Failed to load records</p>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>{recordsError}</p>
            <SpringButton variant="secondary" onClick={() => loadRecords(page, splitFilter, statusFilter)}>
              <span>Try Again</span>
            </SpringButton>
          </div>
        ) : totalRecords === 0 ? (
          <div className="card" style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
            <Database size={32} style={{ margin: '0 auto 0.75rem auto', color: 'var(--text-muted)', opacity: 0.6 }} />
            <p style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: '0.4rem', fontSize: '1rem' }}>
              No records in this dataset
            </p>
            <p style={{ fontSize: '0.85rem', marginBottom: '1.25rem', maxWidth: '420px', margin: '0 auto 1.25rem auto' }}>
              Import media files or raw archives in Stage 01 to populate records and start engineering your dataset.
            </p>
            <SpringButton variant="primary" onClick={() => setIsImportOpen(true)}>
              <HardDrive size={15} style={{ marginRight: '6px' }} />
              <span>Import Media Assets</span>
            </SpringButton>
          </div>
        ) : filteredRecords.length === 0 ? (
          <div className="card" style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--text-muted)' }}>
            <FilterIcon size={24} style={{ margin: '0 auto 0.5rem auto', color: 'var(--text-muted)' }} />
            <p style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: '0.4rem' }}>
              No records match your filters
            </p>
            <p style={{ fontSize: '0.85rem', marginBottom: '1rem' }}>
              Adjust or clear your search term, split, or review status filters.
            </p>
            <SpringButton variant="secondary" onClick={handleResetFilters}>
              <span>Reset All Filters</span>
            </SpringButton>
          </div>
        ) : viewMode === 'table' ? (
          <div className="data-table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th style={{ width: '48px' }}>#</th>
                  <th>Record Key / UUID</th>
                  <th>Split</th>
                  <th>Modality & Asset</th>
                  <th>Annotation Payload Preview</th>
                  <th>Review Status</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredRecords.map((rec, idx) => {
                  const statusConfig = getStatusBadgeConfig(rec.review_status);
                  const StatusIcon = statusConfig.icon;
                  const rowNum = page * PAGE_SIZE + idx + 1;

                  return (
                    <tr
                      key={rec.id}
                      id={`record-${rec.id}`}
                      style={
                        rec.id === highlightedRecordId
                          ? {
                              background: 'rgba(37, 99, 235, 0.08)',
                              boxShadow: 'inset 3px 0 0 var(--accent-interactive)',
                            }
                          : {}
                      }
                    >
                      <td style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: '0.75rem' }}>
                        #{rowNum}
                      </td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                          <span style={{ fontWeight: 600, fontSize: '0.85rem', color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>
                            {rec.external_key || rec.id.slice(0, 14)}
                          </span>
                          {rec.id === highlightedRecordId && (
                            <span
                              className="badge badge-blue"
                              style={{ fontSize: '0.68rem', padding: '1px 6px', textTransform: 'uppercase' }}
                            >
                              Target Finding
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                          ID: {rec.id.slice(0, 8)}...
                        </div>
                      </td>
                      <td>
                        <span className="badge badge-neutral" style={{ textTransform: 'uppercase', fontSize: '0.72rem' }}>
                          {rec.split || 'train'}
                        </span>
                      </td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                          <Layers size={13} style={{ color: 'var(--text-muted)' }} />
                          <span>{rec.primary_asset?.modality || 'media'}</span>
                          {rec.primary_asset?.original_filename && (
                            <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                              ({rec.primary_asset.original_filename})
                            </span>
                          )}
                        </div>
                      </td>
                      <td>
                        {rec.annotation_payload?.label ? (
                          <span className="badge badge-blue">{rec.annotation_payload.label}</span>
                        ) : rec.annotation_payload?.boxes && Array.isArray(rec.annotation_payload.boxes) ? (
                          <span className="badge badge-neutral">
                            {rec.annotation_payload.boxes.length} bounding box{rec.annotation_payload.boxes.length === 1 ? '' : 'es'}
                          </span>
                        ) : rec.annotation_payload?.text ? (
                          <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', maxWidth: '280px', display: 'inline-block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {rec.annotation_payload.text}
                          </span>
                        ) : (
                          <span style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>Unlabeled</span>
                        )}
                      </td>
                      <td>
                        <span className={`badge ${statusConfig.className}`} style={{ fontSize: '0.75rem', display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
                          <StatusIcon size={11} strokeWidth={2} />
                          <span>{rec.review_status.replace(/_/g, ' ')}</span>
                        </span>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <SpringButton
                          variant="secondary"
                          onClick={() => setIsWorkspaceOpen(true)}
                          style={{ padding: '0.25rem 0.55rem', fontSize: '0.78rem' }}
                        >
                          <PenTool size={12} style={{ marginRight: '4px' }} />
                          <span>Annotate</span>
                        </SpringButton>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {/* Pagination Controls */}
            <div className="records-pagination">
              <div>
                Showing{' '}
                <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                  {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, totalRecords)}
                </span>{' '}
                of <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{totalRecords}</span> records
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                <button
                  className="btn btn-secondary"
                  disabled={page === 0 || recordsLoading}
                  onClick={() => setPage((prev) => Math.max(0, prev - 1))}
                  style={{ padding: '0.25rem 0.55rem', fontSize: '0.78rem', display: 'inline-flex', alignItems: 'center' }}
                  title="Previous page"
                >
                  <ChevronLeft size={14} style={{ marginRight: '2px' }} />
                  <span>Previous</span>
                </button>

                <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', padding: '0 0.35rem' }}>
                  Page {page + 1} of {totalPages}
                </span>

                <button
                  className="btn btn-secondary"
                  disabled={(page + 1) * PAGE_SIZE >= totalRecords || recordsLoading}
                  onClick={() => setPage((prev) => prev + 1)}
                  style={{ padding: '0.25rem 0.55rem', fontSize: '0.78rem', display: 'inline-flex', alignItems: 'center' }}
                  title="Next page"
                >
                  <span>Next</span>
                  <ChevronRight size={14} style={{ marginLeft: '2px' }} />
                </button>
              </div>
            </div>
          </div>
        ) : (
          /* Grid View */
          <div>
            <div className="record-grid">
              {filteredRecords.map((rec, idx) => {
                const statusConfig = getStatusBadgeConfig(rec.review_status);
                const StatusIcon = statusConfig.icon;
                const rowNum = page * PAGE_SIZE + idx + 1;

                return (
                  <div
                    key={rec.id}
                    id={`record-${rec.id}`}
                    className="record-card"
                    style={
                      rec.id === highlightedRecordId
                        ? {
                            borderColor: 'var(--accent-interactive)',
                            boxShadow: '0 0 0 2px var(--accent-interactive)',
                            background: 'rgba(37, 99, 235, 0.04)',
                          }
                        : {}
                    }
                  >
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                        <span style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: '0.72rem' }}>
                          #{rowNum}
                        </span>
                        <div style={{ display: 'flex', gap: '0.35rem', alignItems: 'center' }}>
                          {rec.id === highlightedRecordId && (
                            <span
                              className="badge badge-blue"
                              style={{ fontSize: '0.65rem', padding: '1px 5px', textTransform: 'uppercase' }}
                            >
                              Target Finding
                            </span>
                          )}
                          <span className="badge badge-neutral" style={{ textTransform: 'uppercase', fontSize: '0.68rem' }}>
                            {rec.split || 'train'}
                          </span>
                          <span className={`badge ${statusConfig.className}`} style={{ fontSize: '0.68rem', display: 'inline-flex', alignItems: 'center', gap: '0.2rem' }}>
                            <StatusIcon size={10} strokeWidth={2} />
                            <span>{rec.review_status.replace(/_/g, ' ')}</span>
                          </span>
                        </div>
                      </div>

                      <div style={{ fontWeight: 600, fontSize: '0.85rem', color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', marginBottom: '0.25rem' }}>
                        {rec.external_key || rec.id.slice(0, 14)}
                      </div>

                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.65rem' }}>
                        ID: <code style={{ fontFamily: 'var(--font-mono)' }}>{rec.id.slice(0, 8)}...</code>
                      </div>

                      {/* Payload preview */}
                      <div style={{ background: 'var(--bg-elevated)', borderRadius: 'var(--radius-sm)', padding: '0.5rem', fontSize: '0.8rem', minHeight: '44px', display: 'flex', alignItems: 'center' }}>
                        {rec.annotation_payload?.label ? (
                          <span className="badge badge-blue">{rec.annotation_payload.label}</span>
                        ) : rec.annotation_payload?.boxes && Array.isArray(rec.annotation_payload.boxes) ? (
                          <span style={{ color: 'var(--text-secondary)' }}>
                            {rec.annotation_payload.boxes.length} bounding box{rec.annotation_payload.boxes.length === 1 ? '' : 'es'}
                          </span>
                        ) : rec.annotation_payload?.text ? (
                          <span style={{ color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                            {rec.annotation_payload.text}
                          </span>
                        ) : (
                          <span style={{ color: 'var(--text-muted)' }}>Unlabeled</span>
                        )}
                      </div>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: '0.5rem', borderTop: '1px solid var(--border-hairline)' }}>
                      <SpringButton
                        variant="secondary"
                        onClick={() => setIsWorkspaceOpen(true)}
                        style={{ padding: '0.25rem 0.6rem', fontSize: '0.78rem' }}
                      >
                        <PenTool size={12} style={{ marginRight: '4px' }} />
                        <span>Annotate</span>
                      </SpringButton>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Pagination Controls for Grid View */}
            <div className="records-pagination" style={{ marginTop: '1rem', borderRadius: 'var(--radius-md)' }}>
              <div>
                Showing{' '}
                <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                  {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, totalRecords)}
                </span>{' '}
                of <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{totalRecords}</span> records
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                <button
                  className="btn btn-secondary"
                  disabled={page === 0 || recordsLoading}
                  onClick={() => setPage((prev) => Math.max(0, prev - 1))}
                  style={{ padding: '0.25rem 0.55rem', fontSize: '0.78rem', display: 'inline-flex', alignItems: 'center' }}
                  title="Previous page"
                >
                  <ChevronLeft size={14} style={{ marginRight: '2px' }} />
                  <span>Previous</span>
                </button>

                <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', padding: '0 0.35rem' }}>
                  Page {page + 1} of {totalPages}
                </span>

                <button
                  className="btn btn-secondary"
                  disabled={(page + 1) * PAGE_SIZE >= totalRecords || recordsLoading}
                  onClick={() => setPage((prev) => prev + 1)}
                  style={{ padding: '0.25rem 0.55rem', fontSize: '0.78rem', display: 'inline-flex', alignItems: 'center' }}
                  title="Next page"
                >
                  <span>Next</span>
                  <ChevronRight size={14} style={{ marginLeft: '2px' }} />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 12 Preserved Modals */}
      <React.Suspense fallback={null}>
        <ImportModal
          datasetId={datasetId}
          isOpen={isImportOpen}
          onClose={() => setIsImportOpen(false)}
          onImportComplete={() => {
            loadData();
            loadRecords(page, splitFilter, statusFilter);
          }}
        />

        <AIAnnotationModal
          datasetId={datasetId}
          taskType={dataset.task_type}
          labelSchema={dataset.label_schema}
          isOpen={isAIOpen}
          onClose={() => setIsAIOpen(false)}
          onRunComplete={() => {
            loadData();
            loadRecords(page, splitFilter, statusFilter);
          }}
          onOpenWorkspace={() => setIsWorkspaceOpen(true)}
        />

        <QualityDashboardModal
          datasetId={datasetId}
          isOpen={isQualityOpen}
          onClose={() => {
            setIsQualityOpen(false);
            loadData();
          }}
          onFilterRecords={handleLocateRecord}
          onOpenWorkspace={() => {
            setIsQualityOpen(false);
            setIsWorkspaceOpen(true);
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
          onAugmentationComplete={() => {
            loadData();
            loadRecords(page, splitFilter, statusFilter);
          }}
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
          onImportComplete={() => {
            loadData();
            loadRecords(page, splitFilter, statusFilter);
          }}
        />

        <SyntheticGenerationModal
          datasetId={datasetId}
          labels={labels}
          taskType={dataset.task_type}
          labelSchema={dataset.label_schema}
          isOpen={isSynthesisOpen}
          onClose={() => setIsSynthesisOpen(false)}
          onGenerationComplete={() => {
            loadData();
            loadRecords(page, splitFilter, statusFilter);
          }}
          onOpenWorkspace={() => setIsWorkspaceOpen(true)}
        />

        <EvaluationModal
          datasetId={datasetId}
          isOpen={isEvaluationOpen}
          onClose={() => setIsEvaluationOpen(false)}
          onOpenSynthesize={() => setIsSynthesisOpen(true)}
        />
      </React.Suspense>
    </div>
  );
};

// Helper for review status styling and icons
function getStatusBadgeConfig(status: string) {
  switch (status) {
    case 'approved':
      return { className: 'badge-emerald', icon: CheckCircle2 };
    case 'rejected':
      return { className: 'badge-rose', icon: XCircle };
    case 'needs_correction':
      return { className: 'badge-amber', icon: AlertTriangle };
    case 'pending_review':
      return { className: 'badge-blue', icon: Clock };
    case 'unannotated':
    default:
      return { className: 'badge-neutral', icon: HelpCircle };
  }
}

// Small icon helper
const FilterIcon: React.FC<{ size?: number; style?: React.CSSProperties }> = ({ size = 16, style }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.75"
    strokeLinecap="round"
    strokeLinejoin="round"
    style={style}
  >
    <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
  </svg>
);
