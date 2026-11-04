import React, { useState, useEffect, useMemo } from 'react';
import {
  Brain,
  Target,
  BarChart2,
  Compass,
  RefreshCw,
  AlertTriangle,
  AlertCircle,
  Sparkles,
  Info,
} from 'lucide-react';
import {
  fetchActiveLearningQueue,
  runEvaluation,
  fetchClusterMap,
  ApiError,
} from '../api';
import { ActiveLearningItem, EvaluationReport } from '../types';
import { CustomSelect } from './ui/CustomSelect';
import { ModalShell } from './ui/ModalShell';

interface EvaluationModalProps {
  datasetId: string;
  isOpen: boolean;
  onClose: () => void;
  onOpenSynthesize?: () => void;
}

/** Evaluation failure surfaced to the user (HTTP 422 = no comparable pairs). */
interface EvaluationFailure {
  status: number;
  message: string;
  code?: string;
  modelProposals?: number;
  approvedLabels?: number;
  recordsInSplit?: number;
}

/* ------------------------------------------------------------------------- */
/* Cluster payload normalisation                                              */
/*                                                                            */
/* The live endpoint (GET /datasets/{id}/clusters) returns the quality-engine  */
/* shape: { points[] (u,v), clusters[], coverage_gap_cells[] (center_u/v),      */
/* total_points, total_records }. An older contract exposed                   */
/* { coverage_gaps[] (center_x/y) }. Both are accepted defensively so a         */
/* backend contract drift can never crash the render tree.                    */
/* ------------------------------------------------------------------------- */

interface NormalizedPoint {
  record_id: string;
  x: number;
  y: number;
  label?: string;
  snippet?: string;
}

interface NormalizedGap {
  id: string;
  x: number;
  y: number;
  suggested: string;
  density?: number;
}

interface NormalizedCluster {
  label: string;
  x: number;
  y: number;
  count: number;
}

interface NormalizedClusterData {
  points: NormalizedPoint[];
  gaps: NormalizedGap[];
  clusters: NormalizedCluster[];
  totalPoints: number;
}

const asFiniteNumber = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

function normalizeClusterPayload(raw: unknown): NormalizedClusterData {
  const data = (raw && typeof raw === 'object' ? raw : {}) as Record<string, any>;

  const rawPoints: any[] = Array.isArray(data.points) ? data.points : [];
  const points: NormalizedPoint[] = [];
  rawPoints.forEach((p: any, index: number) => {
    const x = asFiniteNumber(p?.x) ?? asFiniteNumber(p?.u);
    const y = asFiniteNumber(p?.y) ?? asFiniteNumber(p?.v);
    if (x === null || y === null) return;
    points.push({
      record_id: String(p?.record_id ?? `point_${index}`),
      x,
      y,
      label: typeof p?.label === 'string' ? p.label : undefined,
      snippet: typeof p?.snippet === 'string' ? p.snippet : undefined,
    });
  });

  const rawGaps: any[] = Array.isArray(data.coverage_gap_cells)
    ? data.coverage_gap_cells
    : Array.isArray(data.coverage_gaps)
    ? data.coverage_gaps
    : [];
  const gaps: NormalizedGap[] = [];
  rawGaps.forEach((g: any, index: number) => {
    const x = asFiniteNumber(g?.center_u) ?? asFiniteNumber(g?.center_x);
    const y = asFiniteNumber(g?.center_v) ?? asFiniteNumber(g?.center_y);
    if (x === null || y === null) return;
    const suggested =
      typeof g?.suggested_focus === 'string'
        ? g.suggested_focus
        : typeof g?.prompt_hint === 'string'
        ? g.prompt_hint
        : typeof g?.suggested_class === 'string'
        ? `Under-represented: ${g.suggested_class}`
        : 'Coverage gap reported by the server projection';
    gaps.push({
      id: String(g?.cell_id ?? g?.gap_id ?? `gap_${index}`),
      x,
      y,
      suggested,
      density: asFiniteNumber(g?.density) ?? undefined,
    });
  });

  const rawClusters: any[] = Array.isArray(data.clusters) ? data.clusters : [];
  const clusters: NormalizedCluster[] = [];
  rawClusters.forEach((c: any) => {
    const x = asFiniteNumber(c?.center_u) ?? asFiniteNumber(c?.center_x);
    const y = asFiniteNumber(c?.center_v) ?? asFiniteNumber(c?.center_y);
    if (x === null || y === null) return;
    clusters.push({
      label: String(c?.label ?? 'cluster'),
      x,
      y,
      count: asFiniteNumber(c?.count) ?? 0,
    });
  });

  const totalPoints =
    asFiniteNumber(data.total_points) ?? asFiniteNumber(data.total_records) ?? points.length;

  return { points, gaps, clusters, totalPoints };
}

/** Extracts comparable-pair counts from a 422 payload without inventing values. */
function readComparableCounts(details: unknown): {
  modelProposals?: number;
  approvedLabels?: number;
  recordsInSplit?: number;
} {
  const d = (details && typeof details === 'object' ? details : {}) as Record<string, any>;
  const pick = (...keys: string[]): number | undefined => {
    for (const key of keys) {
      const value = d[key];
      if (typeof value === 'number' && Number.isFinite(value)) return value;
      if (typeof value === 'string' && value.trim() !== '' && !Number.isNaN(Number(value))) {
        return Number(value);
      }
    }
    return undefined;
  };
  return {
    modelProposals: pick(
      'records_with_model_candidate',
      'model_proposals',
      'model_count',
      'candidate_count',
      'proposals',
      'candidate_samples'
    ),
    approvedLabels: pick(
      'records_with_approved_human_gold',
      'approved_labels',
      'human_approved',
      'gold_count',
      'approved_count',
      'reference_samples'
    ),
    recordsInSplit: pick('records_in_split', 'total_records', 'records'),
  };
}

const formatPercent = (ratio: number | null | undefined): string =>
  typeof ratio === 'number' && Number.isFinite(ratio) ? `${(ratio * 100).toFixed(1)}%` : '—';

export const EvaluationModal: React.FC<EvaluationModalProps> = ({
  datasetId,
  isOpen,
  onClose,
  onOpenSynthesize,
}) => {
  const [activeTab, setActiveTab] = useState<'queue' | 'evaluation' | 'clusters'>('queue');
  const [queueSort, setQueueSort] = useState<'rank' | 'confidence_asc' | 'confidence_desc'>('rank');

  // Active Learning state
  const [strategy, setStrategy] = useState<string>('least_confidence');
  const [queueSplit, setQueueSplit] = useState<string>('');
  const [queueItems, setQueueItems] = useState<ActiveLearningItem[]>([]);
  const [totalQueue, setTotalQueue] = useState(0);
  const [loadingQueue, setLoadingQueue] = useState(false);
  const [queueError, setQueueError] = useState<string | null>(null);

  // Evaluation state
  const [evalSplit, setEvalSplit] = useState<string>('test');
  const [evalReport, setEvalReport] = useState<EvaluationReport | null>(null);
  const [loadingEval, setLoadingEval] = useState(false);
  const [evalFailure, setEvalFailure] = useState<EvaluationFailure | null>(null);

  // Cluster Map state
  const [clusterData, setClusterData] = useState<NormalizedClusterData | null>(null);
  const [loadingClusters, setLoadingClusters] = useState(false);
  const [clusterError, setClusterError] = useState<string | null>(null);

  // Load Active Learning Queue
  const loadQueue = async () => {
    setLoadingQueue(true);
    setQueueError(null);
    try {
      const res = await fetchActiveLearningQueue(datasetId, strategy, queueSplit || undefined, 50, 0);
      setQueueItems(Array.isArray(res?.items) ? res.items : []);
      setTotalQueue(typeof res?.total === 'number' ? res.total : 0);
    } catch (err: any) {
      setQueueItems([]);
      setQueueError(err?.message || 'Failed to load the active-learning queue');
    } finally {
      setLoadingQueue(false);
    }
  };

  // Run Baseline Evaluation (gold human labels vs model proposals)
  const handleRunEvaluation = async () => {
    setLoadingEval(true);
    setEvalFailure(null);
    setEvalReport(null);
    try {
      const report = await runEvaluation(datasetId, evalSplit, 'model', 'human');
      setEvalReport(report);
    } catch (err: any) {
      const status = err instanceof ApiError ? err.status : 0;
      const details = err instanceof ApiError ? err.details : undefined;
      const code = err instanceof ApiError ? err.code : undefined;
      const counts = readComparableCounts(details);
      setEvalFailure({
        status,
        message: err?.message || 'Evaluation failed to complete',
        code,
        ...counts,
      });
    } finally {
      setLoadingEval(false);
    }
  };

  // Load 2D Clusters (defensively normalised to the live payload shape)
  const loadClusters = async () => {
    setLoadingClusters(true);
    setClusterError(null);
    try {
      const data = await fetchClusterMap(datasetId);
      setClusterData(normalizeClusterPayload(data));
    } catch (err: any) {
      setClusterData(null);
      setClusterError(err?.message || 'Failed to compute the cluster projection');
    } finally {
      setLoadingClusters(false);
    }
  };

  useEffect(() => {
    if (!isOpen) return;
    if (activeTab === 'queue') {
      loadQueue();
    } else if (activeTab === 'clusters') {
      loadClusters();
    }
  }, [isOpen, activeTab, strategy, queueSplit]);

  const sortedQueueItems = useMemo(() => {
    const items = [...queueItems];
    if (queueSort === 'confidence_asc') {
      items.sort((a, b) => {
        const ca = typeof a.confidence === 'number' ? a.confidence : (a.priority_metadata?.confidence ?? Infinity);
        const cb = typeof b.confidence === 'number' ? b.confidence : (b.priority_metadata?.confidence ?? Infinity);
        return ca - cb;
      });
    } else if (queueSort === 'confidence_desc') {
      items.sort((a, b) => {
        const ca = typeof a.confidence === 'number' ? a.confidence : (a.priority_metadata?.confidence ?? -1);
        const cb = typeof b.confidence === 'number' ? b.confidence : (b.priority_metadata?.confidence ?? -1);
        return cb - ca;
      });
    } else {
      items.sort((a, b) => a.rank - b.rank);
    }
    return items;
  }, [queueItems, queueSort]);

  // Provenance is only rendered when the API reports it. Never assume "human gold".
  const goldSource = typeof evalReport?.gold_source === 'string' ? evalReport.gold_source : null;
  const candidateSource =
    typeof evalReport?.candidate_source === 'string' ? evalReport.candidate_source : null;
  const provenanceVerified = Boolean(goldSource && candidateSource && goldSource !== candidateSource);
  const totalSamples = typeof evalReport?.total_samples === 'number' ? evalReport.total_samples : 0;
  const smallSample = totalSamples > 0 && totalSamples < 30;

  return (
    <ModalShell
      isOpen={isOpen}
      onClose={onClose}
      title="Review Queue, Accuracy Evaluation & Cluster Map"
      description="Active-learning prioritisation, label agreement between approved human labels and model proposals, and the server's 2D projection."
      icon={<Brain size={20} strokeWidth={1.75} style={{ color: 'var(--accent-interactive)' }} />}
      size="xl"
    >
      <div>
        {/* Tab Navigation */}
        <div style={{ display: 'flex', gap: '0.5rem', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '0.75rem', marginBottom: '1.25rem' }}>
          <button
            onClick={() => setActiveTab('queue')}
            className={`btn ${activeTab === 'queue' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ padding: '0.45rem 0.9rem', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}
          >
            <Target size={15} /> Active Learning Queue
          </button>
          <button
            onClick={() => setActiveTab('evaluation')}
            className={`btn ${activeTab === 'evaluation' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ padding: '0.45rem 0.9rem', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}
          >
            <BarChart2 size={15} /> Accuracy Evaluation
          </button>
          <button
            onClick={() => setActiveTab('clusters')}
            className={`btn ${activeTab === 'clusters' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ padding: '0.45rem 0.9rem', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}
          >
            <Compass size={15} /> 2D Projection
          </button>
        </div>

        {/* Tab 1: Active Learning Queue */}
        {activeTab === 'queue' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
              <div style={{ flex: '1 1 200px' }}>
                <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700, display: 'block', marginBottom: '0.2rem' }}>
                  Prioritization Strategy
                </label>
                <CustomSelect
                  value={strategy}
                  onChange={(val) => setStrategy(val)}
                  options={[
                    { value: 'least_confidence', label: 'Least Confident (lowest model confidence first)' },
                    { value: 'label_noise', label: 'Confident Label Errors (detected label noise first)' },
                    { value: 'disagreement', label: 'Disagreement (divergent model/human revisions)' },
                    { value: 'unreviewed_first', label: 'Unreviewed First (pending review proposals)' },
                  ]}
                  style={{ width: '100%' }}
                  ariaLabel="Select prioritization strategy"
                />
              </div>

              <div style={{ width: '140px' }}>
                <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700, display: 'block', marginBottom: '0.2rem' }}>
                  Split
                </label>
                <CustomSelect
                  value={queueSplit}
                  onChange={(val) => setQueueSplit(val)}
                  options={[
                    { value: '', label: 'All Splits' },
                    { value: 'train', label: 'Train' },
                    { value: 'val', label: 'Val' },
                    { value: 'test', label: 'Test' },
                  ]}
                  style={{ width: '100%' }}
                  ariaLabel="Select queue split"
                />
              </div>

              <div style={{ width: '160px' }}>
                <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700, display: 'block', marginBottom: '0.2rem' }}>
                  Sort Order
                </label>
                <CustomSelect
                  value={queueSort}
                  onChange={(val) => setQueueSort(val as any)}
                  options={[
                    { value: 'rank', label: 'Priority Rank (1-N)' },
                    { value: 'confidence_asc', label: 'Confidence (Low to High)' },
                    { value: 'confidence_desc', label: 'Confidence (High to Low)' },
                  ]}
                  style={{ width: '100%' }}
                  ariaLabel="Select queue sort order"
                />
              </div>

              <div style={{ alignSelf: 'flex-end' }}>
                <button className="btn btn-secondary" onClick={loadQueue} disabled={loadingQueue} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <RefreshCw size={14} className={loadingQueue ? 'animate-spin' : ''} /> {loadingQueue ? 'Refreshing...' : 'Refresh'}
                </button>
              </div>
            </div>

            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              {totalQueue} record(s) prioritised. Showing up to 50.
            </div>

            {queueError && (
              <div style={{ padding: '0.65rem 0.85rem', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid var(--rose)', borderRadius: 'var(--radius-sm)', color: 'var(--rose)', fontSize: '0.825rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <AlertCircle size={14} /> {queueError}
              </div>
            )}

            {/* Queue Table */}
            <div style={{ maxHeight: '360px', overflowY: 'auto', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)' }}>
              {loadingQueue ? (
                <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                  Loading active-learning queue...
                </div>
              ) : sortedQueueItems.length === 0 ? (
                <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                  No records match the current active-learning criteria.
                </div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem' }}>
                  <thead>
                    <tr style={{ background: 'var(--bg-elevated)', borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-secondary)' }}>
                      <th style={{ padding: '0.6rem 0.8rem' }}>Rank</th>
                      <th style={{ padding: '0.6rem 0.8rem' }}>Record</th>
                      <th style={{ padding: '0.6rem 0.8rem' }}>Status</th>
                      <th style={{ padding: '0.6rem 0.8rem' }}>Label</th>
                      <th style={{ padding: '0.6rem 0.8rem' }}>Confidence</th>
                      <th style={{ padding: '0.6rem 0.8rem' }}>Priority Justification</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedQueueItems.map((item) => (
                      <tr key={item.record_id} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                        <td style={{ padding: '0.6rem 0.8rem', fontWeight: 700 }}>#{item.rank}</td>
                        <td style={{ padding: '0.6rem 0.8rem', fontFamily: 'var(--font-mono)' }}>
                          {item.external_key || item.record_id.slice(0, 8)}
                        </td>
                        <td style={{ padding: '0.6rem 0.8rem' }}>
                          <span className="badge badge-neutral">{item.review_status}</span>
                        </td>
                        <td style={{ padding: '0.6rem 0.8rem' }}>
                          {item.label ? <span className="badge badge-blue">{item.label}</span> : '—'}
                        </td>
                        <td style={{ padding: '0.6rem 0.8rem' }}>
                          {typeof item.confidence === 'number'
                            ? `${(item.confidence * 100).toFixed(1)}%`
                            : item.priority_metadata?.confidence !== undefined && item.priority_metadata?.confidence !== null
                            ? `${(item.priority_metadata.confidence * 100).toFixed(1)}%`
                            : <span style={{ color: 'var(--text-muted)' }}>not reported</span>}
                        </td>
                        <td style={{ padding: '0.6rem 0.8rem', color: 'var(--text-secondary)' }}>
                          {item.priority_metadata?.reason || 'Ranked by the selected strategy'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}

        {/* Tab 2: Baseline Accuracy Evaluation (honest about provenance and sample size) */}
        {activeTab === 'evaluation' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', background: 'var(--bg-elevated)', padding: '1rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)', flexWrap: 'wrap' }}>
              <div>
                <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700, display: 'block', marginBottom: '0.2rem' }}>
                  Evaluation Split
                </label>
                <CustomSelect
                  value={evalSplit}
                  onChange={(val) => setEvalSplit(val)}
                  options={[
                    { value: 'test', label: 'Test Split' },
                    { value: 'val', label: 'Val Split' },
                    { value: 'train', label: 'Train Split' },
                  ]}
                  style={{ minWidth: '140px' }}
                  ariaLabel="Select evaluation split"
                />
              </div>

              <div style={{ alignSelf: 'flex-end' }}>
                <button className="btn btn-primary" onClick={handleRunEvaluation} disabled={loadingEval}>
                  {loadingEval ? 'Evaluating...' : 'Run Evaluation'}
                </button>
              </div>

              <div style={{ flex: '1 1 260px', fontSize: '0.75rem', color: 'var(--text-secondary)', lineHeight: 1.45 }}>
                Compares <strong>approved human labels</strong> (gold reference) against <strong>model proposals</strong> for
                the same records in this split. A record needs both to be comparable.
              </div>
            </div>

            {evalFailure && evalFailure.status === 422 && (
              <div
                style={{
                  padding: '0.85rem 1rem',
                  background: 'rgba(245, 158, 11, 0.08)',
                  border: '1px solid var(--amber)',
                  borderRadius: 'var(--radius-sm)',
                  color: 'var(--text-primary)',
                  fontSize: '0.825rem',
                  lineHeight: 1.5,
                }}
              >
                <div style={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.25rem' }}>
                  <AlertTriangle size={15} style={{ color: 'var(--amber)' }} />
                  {evalFailure.code === 'EVALUATION_TASK_NOT_SUPPORTED'
                    ? 'Accuracy evaluation is not supported for this task type'
                    : evalFailure.code === 'EVALUATION_UNSUPPORTED_ORIGINS'
                    ? 'Unsupported label sources for a comparable evaluation'
                    : 'Not enough reviewed records to measure accuracy'}
                </div>
                {evalFailure.code === 'EVALUATION_TASK_NOT_SUPPORTED' ? (
                  <div>
                    Accuracy is measured by comparing approved human labels with model proposals, which is defined for
                    classification datasets only.
                  </div>
                ) : typeof evalFailure.modelProposals === 'number' ||
                  typeof evalFailure.approvedLabels === 'number' ||
                  typeof evalFailure.recordsInSplit === 'number' ? (
                  <div>
                    {typeof evalFailure.recordsInSplit === 'number' && (
                      <span>
                        <strong>{evalFailure.recordsInSplit}</strong> record(s) in split <code>{evalSplit}</code>
                        {', '}
                      </span>
                    )}
                    <strong>{evalFailure.approvedLabels ?? 0}</strong> with an approved human label,{' '}
                    <strong>{evalFailure.modelProposals ?? 0}</strong> with a model proposal. A record needs both to be
                    comparable.
                  </div>
                ) : (
                  <div>
                    No record in split <code>{evalSplit}</code> currently has both an approved human label and a model
                    proposal.
                  </div>
                )}
                {evalFailure.code !== 'EVALUATION_TASK_NOT_SUPPORTED' && (
                  <div style={{ color: 'var(--text-secondary)', marginTop: '0.35rem' }}>
                    Approve or reject pending proposals in the Annotation Workbench, then run the evaluation again.
                  </div>
                )}
                {evalFailure.message && (
                  <div style={{ marginTop: '0.35rem', fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                    API: {evalFailure.message}
                  </div>
                )}
              </div>
            )}

            {evalFailure && evalFailure.status !== 422 && (
              <div style={{ padding: '0.75rem', background: 'rgba(239, 68, 68, 0.12)', border: '1px solid var(--rose)', borderRadius: 'var(--radius-sm)', color: 'var(--rose)', fontSize: '0.825rem', display: 'flex', alignItems: 'flex-start', gap: '0.4rem' }}>
                <AlertCircle size={15} style={{ flexShrink: 0, marginTop: '2px' }} />
                <span>
                  Evaluation request failed{evalFailure.status ? ` (HTTP ${evalFailure.status})` : ''}: {evalFailure.message}
                </span>
              </div>
            )}

            {!evalReport && !evalFailure && !loadingEval && (
              <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem', background: 'var(--bg-elevated)', borderRadius: 'var(--radius-md)', border: '1px dashed var(--border-subtle)' }}>
                No evaluation has been run in this session. Select a split and run the evaluation to measure label
                agreement between approved human labels and model proposals.
              </div>
            )}

            {evalReport && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {/* Provenance disclosure */}
                <div
                  style={{
                    padding: '0.7rem 0.9rem',
                    borderRadius: 'var(--radius-sm)',
                    border: `1px solid ${provenanceVerified ? 'var(--border-hairline)' : 'var(--amber)'}`,
                    background: provenanceVerified ? 'var(--bg-elevated)' : 'rgba(245, 158, 11, 0.08)',
                    fontSize: '0.78rem',
                    color: 'var(--text-secondary)',
                    lineHeight: 1.5,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '0.2rem' }}>
                    <Info size={14} /> Label provenance
                  </div>
                  <div>
                    Gold reference: <strong>{goldSource ?? 'not reported by this API version'}</strong>
                    {' · '}
                    Candidate: <strong>{candidateSource ?? 'not reported by this API version'}</strong>
                  </div>
                  {!provenanceVerified && (
                    <div style={{ color: 'var(--amber)', marginTop: '0.25rem' }}>
                      Provenance was not confirmed as two distinct label sources. Treat these metrics as unverified
                      until the API reports <code>gold_source</code> and <code>candidate_source</code>.
                    </div>
                  )}
                  {evalReport.comparable === false && (
                    <div style={{ color: 'var(--amber)', marginTop: '0.25rem' }}>
                      The API flagged this report as not comparable between distinct sources.
                    </div>
                  )}
                </div>

                {/* Metric Summary Cards — sample count first, no unconditional green pass */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '0.75rem' }}>
                  <div className="stat-card" style={{ borderColor: 'var(--border-hairline)' }}>
                    <span className="stat-value" style={{ fontSize: '1.4rem', color: 'var(--text-primary)' }}>
                      {totalSamples}
                    </span>
                    <span className="stat-label">Comparable samples</span>
                    <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>
                      records with both a gold and a candidate label
                    </span>
                  </div>
                  <div className="stat-card" style={{ borderColor: 'var(--border-hairline)' }}>
                    <span className="stat-value" style={{ fontSize: '1.4rem', color: 'var(--text-primary)' }}>
                      {formatPercent(evalReport.accuracy)}
                    </span>
                    <span className="stat-label">Accuracy</span>
                    <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>
                      n = {totalSamples}
                    </span>
                  </div>
                  <div className="stat-card" style={{ borderColor: 'var(--border-hairline)' }}>
                    <span className="stat-value" style={{ fontSize: '1.4rem', color: 'var(--text-primary)' }}>
                      {formatPercent(evalReport.macro_f1)}
                    </span>
                    <span className="stat-label">Macro F1</span>
                  </div>
                  <div className="stat-card" style={{ borderColor: 'var(--border-hairline)' }}>
                    <span className="stat-value" style={{ fontSize: '1.4rem', color: 'var(--text-primary)' }}>
                      {formatPercent(evalReport.macro_precision)}
                    </span>
                    <span className="stat-label">Macro Precision</span>
                  </div>
                  <div className="stat-card" style={{ borderColor: 'var(--border-hairline)' }}>
                    <span className="stat-value" style={{ fontSize: '1.4rem', color: 'var(--text-primary)' }}>
                      {formatPercent(evalReport.macro_recall)}
                    </span>
                    <span className="stat-label">Macro Recall</span>
                  </div>
                </div>

                {totalSamples === 0 && (
                  <div style={{ padding: '0.75rem', background: 'rgba(245, 158, 11, 0.1)', border: '1px solid var(--amber)', borderRadius: 'var(--radius-sm)', color: 'var(--amber)', fontSize: '0.825rem' }}>
                    The report contains no comparable samples. Accuracy and F1 are not meaningful for this run.
                  </div>
                )}
                {smallSample && (
                  <div style={{ padding: '0.65rem 0.85rem', background: 'var(--bg-elevated)', border: '1px solid var(--border-hairline)', borderRadius: 'var(--radius-sm)', color: 'var(--text-secondary)', fontSize: '0.78rem' }}>
                    Small sample (n = {totalSamples}). Treat accuracy as indicative only; it is not statistically
                    meaningful at this size.
                  </div>
                )}

                {/* Warnings / Limitations */}
                {Array.isArray(evalReport.warnings) && evalReport.warnings.length > 0 && (
                  <div style={{ background: 'rgba(245, 158, 11, 0.1)', border: '1px solid var(--amber)', padding: '0.75rem', borderRadius: 'var(--radius-sm)', fontSize: '0.8rem', color: 'var(--amber)' }}>
                    <div style={{ fontWeight: 700, marginBottom: '0.3rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      <AlertTriangle size={15} /> Reported caveats
                    </div>
                    <ul style={{ margin: 0, paddingLeft: '1.2rem' }}>
                      {evalReport.warnings.map((w, idx) => (
                        <li key={idx}>{w}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Confusion Matrix */}
                {Array.isArray(evalReport.classes) && evalReport.classes.length > 0 && (
                  <div style={{ border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', padding: '1rem', background: 'var(--bg-elevated)' }}>
                    <div style={{ fontSize: '0.85rem', fontWeight: 700, marginBottom: '0.75rem', color: 'var(--text-secondary)' }}>
                      CONFUSION MATRIX (approved human label vs model proposal)
                    </div>
                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ borderCollapse: 'collapse', fontSize: '0.8rem', textAlign: 'center', width: '100%' }}>
                        <thead>
                          <tr>
                            <th style={{ padding: '0.4rem', color: 'var(--text-muted)' }}>Gold \ Candidate</th>
                            {evalReport.classes.map((c) => (
                              <th key={c} style={{ padding: '0.4rem', borderBottom: '1px solid var(--border-subtle)' }}>
                                {c}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {evalReport.classes.map((gold) => (
                            <tr key={gold}>
                              <td style={{ padding: '0.4rem', fontWeight: 700, textAlign: 'left', borderRight: '1px solid var(--border-subtle)' }}>
                                {gold}
                              </td>
                              {evalReport.classes.map((candidate) => {
                                const val = evalReport.confusion_matrix?.[gold]?.[candidate] || 0;
                                const isDiagonal = gold === candidate;
                                return (
                                  <td
                                    key={candidate}
                                    style={{
                                      padding: '0.4rem',
                                      background: isDiagonal && val > 0 ? 'rgba(16, 185, 129, 0.15)' : val > 0 ? 'rgba(239, 68, 68, 0.12)' : 'transparent',
                                      fontWeight: val > 0 ? 700 : 400,
                                      color: 'var(--text-primary)',
                                    }}
                                  >
                                    {val}
                                  </td>
                                );
                              })}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {evalReport.metadata && typeof evalReport.metadata === 'object' && Object.keys(evalReport.metadata).length > 0 && (
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', wordBreak: 'break-word' }}>
                    Run metadata: {JSON.stringify(evalReport.metadata)}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Tab 3: 2D Projection (tolerates both historical and live payload shapes) */}
        {activeTab === 'clusters' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {loadingClusters ? (
              <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                Loading the server-side 2D projection...
              </div>
            ) : clusterError ? (
              <div style={{ padding: '1rem', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid var(--rose)', borderRadius: 'var(--radius-sm)', color: 'var(--rose)', fontSize: '0.825rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', flexWrap: 'wrap' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <AlertCircle size={15} /> {clusterError}
                </span>
                <button className="btn btn-secondary" onClick={loadClusters} style={{ fontSize: '0.78rem', padding: '0.25rem 0.6rem' }}>
                  Retry
                </button>
              </div>
            ) : !clusterData || clusterData.points.length === 0 ? (
              <div style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--text-muted)', background: 'var(--bg-elevated)', borderRadius: 'var(--radius-md)', border: '1px dashed var(--border-subtle)' }}>
                <Compass size={28} style={{ margin: '0 auto 0.5rem', opacity: 0.6 }} />
                <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: '0.25rem' }}>
                  No projected records
                </div>
                <div style={{ fontSize: '0.8rem' }}>
                  The server did not return any 2D points for this dataset. Import text records to populate the
                  projection.
                </div>
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 300px', gap: '1rem' }}>
                {/* 2D Scatter Plot */}
                <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', padding: '1rem', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  <svg
                    viewBox="-110 -110 220 220"
                    role="img"
                    aria-label={`2D projection of ${clusterData.points.length} records with ${clusterData.gaps.length} coverage gaps`}
                    style={{ width: '100%', maxWidth: '420px', height: '320px' }}
                  >
                    <line x1="-100" y1="0" x2="100" y2="0" stroke="var(--border-hairline)" strokeWidth="0.5" />
                    <line x1="0" y1="-100" x2="0" y2="100" stroke="var(--border-hairline)" strokeWidth="0.5" />
                    <circle cx="0" cy="0" r="100" fill="none" stroke="var(--border-hairline)" strokeDasharray="3 3" />

                    {clusterData.gaps.map((gap) => (
                      <circle
                        key={gap.id}
                        cx={Math.max(-100, Math.min(100, gap.x * 90))}
                        cy={Math.max(-100, Math.min(100, gap.y * 90))}
                        r="10"
                        fill="rgba(239, 68, 68, 0.12)"
                        stroke="var(--rose)"
                        strokeWidth="0.9"
                        strokeDasharray="2 2"
                      >
                        <title>{`${gap.id}: ${gap.suggested}`}</title>
                      </circle>
                    ))}

                    {clusterData.points.map((p) => (
                      <circle
                        key={p.record_id}
                        cx={Math.max(-100, Math.min(100, p.x * 90))}
                        cy={Math.max(-100, Math.min(100, p.y * 90))}
                        r="2.6"
                        fill={p.label ? 'var(--accent-interactive)' : 'var(--text-muted)'}
                        opacity={0.85}
                      >
                        <title>{`${p.label || 'unlabeled'} (${p.record_id})`}</title>
                      </circle>
                    ))}
                  </svg>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <span>{clusterData.totalPoints} record(s) projected</span>
                    <span>·</span>
                    <span>{clusterData.clusters.length} cluster label(s)</span>
                    <span>·</span>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
                      <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', border: '1px dashed var(--rose)' }} />
                      {clusterData.gaps.length} coverage gap(s)
                    </span>
                  </div>
                </div>

                {/* Coverage Gap List */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '340px', overflowY: 'auto' }}>
                  <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
                    Coverage Gaps ({clusterData.gaps.length})
                  </div>
                  {clusterData.gaps.length === 0 ? (
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', padding: '1rem 0' }}>
                      The projection found no under-covered region for this dataset.
                    </div>
                  ) : (
                    clusterData.gaps.slice(0, 24).map((gap) => (
                      <div
                        key={gap.id}
                        style={{
                          background: 'var(--bg-elevated)',
                          border: '1px solid var(--border-subtle)',
                          borderRadius: 'var(--radius-sm)',
                          padding: '0.6rem',
                          fontSize: '0.78rem',
                        }}
                      >
                        <div style={{ fontWeight: 700, color: 'var(--rose)', marginBottom: '0.2rem' }}>
                          {gap.id}
                        </div>
                        <div style={{ color: 'var(--text-secondary)', fontSize: '0.75rem', marginBottom: '0.4rem' }}>
                          {gap.suggested}
                          {typeof gap.density === 'number' ? ` (density ${gap.density})` : ''}
                        </div>
                        {onOpenSynthesize && (
                          <button
                            type="button"
                            className="btn btn-secondary"
                            style={{ fontSize: '0.75rem', padding: '0.2rem 0.5rem', width: '100%', justifyContent: 'center', display: 'flex', alignItems: 'center', gap: '0.35rem' }}
                            onClick={() => {
                              onClose();
                              onOpenSynthesize();
                            }}
                          >
                            <Sparkles size={13} /> Open Synthetic Generation
                          </button>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </ModalShell>
  );
};

export default EvaluationModal;
