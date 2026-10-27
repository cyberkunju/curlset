import React, { useState, useEffect } from 'react';
import {
  fetchActiveLearningQueue,
  runEvaluation,
  fetchClusterMap,
} from '../api';
import {
  ActiveLearningItem,
  EvaluationReport,
  ClusterMapResponse,
  CoverageGap,
} from '../types';

interface EvaluationModalProps {
  datasetId: string;
  isOpen: boolean;
  onClose: () => void;
  onOpenSynthesize?: () => void;
}

export const EvaluationModal: React.FC<EvaluationModalProps> = ({
  datasetId,
  isOpen,
  onClose,
  onOpenSynthesize,
}) => {
  const [activeTab, setActiveTab] = useState<'queue' | 'evaluation' | 'clusters'>('queue');

  // Active Learning state
  const [strategy, setStrategy] = useState<string>('least_confidence');
  const [queueSplit, setQueueSplit] = useState<string>('');
  const [queueItems, setQueueItems] = useState<ActiveLearningItem[]>([]);
  const [totalQueue, setTotalQueue] = useState(0);
  const [loadingQueue, setLoadingQueue] = useState(false);

  // Evaluation state
  const [evalSplit, setEvalSplit] = useState<string>('test');
  const [evalReport, setEvalReport] = useState<EvaluationReport | null>(null);
  const [loadingEval, setLoadingEval] = useState(false);
  const [evalError, setEvalError] = useState<string | null>(null);

  // Cluster Map state
  const [clusterData, setClusterData] = useState<ClusterMapResponse | null>(null);
  const [loadingClusters, setLoadingClusters] = useState(false);

  // Load Active Learning Queue
  const loadQueue = async () => {
    setLoadingQueue(true);
    try {
      const res = await fetchActiveLearningQueue(datasetId, strategy, queueSplit || undefined, 50, 0);
      setQueueItems(res.items || []);
      setTotalQueue(res.total || 0);
    } catch {
      setQueueItems([]);
    } finally {
      setLoadingQueue(false);
    }
  };

  // Run Baseline Evaluation
  const handleRunEvaluation = async () => {
    setLoadingEval(true);
    setEvalError(null);
    try {
      const report = await runEvaluation(datasetId, evalSplit, 'model', 'human');
      setEvalReport(report);
    } catch (err: any) {
      setEvalError(err.message || 'Evaluation failed to complete');
    } finally {
      setLoadingEval(false);
    }
  };

  // Load 2D Clusters
  const loadClusters = async () => {
    setLoadingClusters(true);
    try {
      const data = await fetchClusterMap(datasetId);
      setClusterData(data);
    } catch {
      setClusterData(null);
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

  if (!isOpen) return null;

  return (
    <div className="modal-backdrop">
      <div className="modal-card" style={{ maxWidth: '960px', width: '92vw', maxHeight: '90vh' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
          <div>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0 }}>
              🧠 Active Learning & Baseline Evaluation
            </h2>
            <p style={{ margin: '0.2rem 0 0 0', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
              Explainable review queue prioritization, gold-standard confusion metrics, and 2D semantic cluster exploration.
            </p>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text-muted)',
              fontSize: '1.5rem',
              cursor: 'pointer',
            }}
          >
            ✕
          </button>
        </div>

        {/* Tab Navigation */}
        <div style={{ display: 'flex', gap: '0.5rem', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '0.75rem', marginBottom: '1.25rem' }}>
          <button
            onClick={() => setActiveTab('queue')}
            className={`btn ${activeTab === 'queue' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ padding: '0.45rem 0.9rem', fontSize: '0.85rem' }}
          >
            🎯 Active Learning Queue
          </button>
          <button
            onClick={() => setActiveTab('evaluation')}
            className={`btn ${activeTab === 'evaluation' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ padding: '0.45rem 0.9rem', fontSize: '0.85rem' }}
          >
            📊 Baseline Evaluation & F1
          </button>
          <button
            onClick={() => setActiveTab('clusters')}
            className={`btn ${activeTab === 'clusters' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ padding: '0.45rem 0.9rem', fontSize: '0.85rem' }}
          >
            🗺️ 2D Semantic Cluster Map
          </button>
        </div>

        {/* Tab 1: Active Learning Queue */}
        {activeTab === 'queue' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>
                  Prioritization Strategy
                </label>
                <select
                  className="input"
                  value={strategy}
                  onChange={(e) => setStrategy(e.target.value)}
                  style={{ width: '100%', marginTop: '0.2rem' }}
                >
                  <option value="least_confidence">Least Confident (lowest model confidence first)</option>
                  <option value="label_noise">Confident Label Errors (detected label noise first)</option>
                  <option value="disagreement">Disagreement (divergent model/human revisions)</option>
                  <option value="unreviewed_first">Unreviewed First (pending review proposals)</option>
                </select>
              </div>

              <div style={{ width: '140px' }}>
                <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>
                  Split
                </label>
                <select
                  className="input"
                  value={queueSplit}
                  onChange={(e) => setQueueSplit(e.target.value)}
                  style={{ width: '100%', marginTop: '0.2rem' }}
                >
                  <option value="">All Splits</option>
                  <option value="train">Train</option>
                  <option value="val">Val</option>
                  <option value="test">Test</option>
                </select>
              </div>

              <div style={{ alignSelf: 'flex-end' }}>
                <button className="btn btn-secondary" onClick={loadQueue} disabled={loadingQueue}>
                  {loadingQueue ? 'Refreshing...' : '🔄 Refresh'}
                </button>
              </div>
            </div>

            {/* Queue Table */}
            <div style={{ maxHeight: '360px', overflowY: 'auto', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)' }}>
              {loadingQueue ? (
                <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                  Calculating active-learning priority weights...
                </div>
              ) : queueItems.length === 0 ? (
                <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                  No records match current active-learning criteria.
                </div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem' }}>
                  <thead>
                    <tr style={{ background: 'rgba(15, 23, 42, 0.8)', borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-secondary)' }}>
                      <th style={{ padding: '0.6rem 0.8rem' }}>Rank</th>
                      <th style={{ padding: '0.6rem 0.8rem' }}>Record</th>
                      <th style={{ padding: '0.6rem 0.8rem' }}>Status</th>
                      <th style={{ padding: '0.6rem 0.8rem' }}>Label</th>
                      <th style={{ padding: '0.6rem 0.8rem' }}>Confidence</th>
                      <th style={{ padding: '0.6rem 0.8rem' }}>Priority Justification</th>
                    </tr>
                  </thead>
                  <tbody>
                    {queueItems.map((item) => (
                      <tr key={item.record_id} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                        <td style={{ padding: '0.6rem 0.8rem', fontWeight: 700 }}>#{item.rank}</td>
                        <td style={{ padding: '0.6rem 0.8rem', fontFamily: 'var(--font-mono)' }}>
                          {item.external_key || item.record_id.slice(0, 8)}
                        </td>
                        <td style={{ padding: '0.6rem 0.8rem' }}>
                          <span className="badge badge-cyan">{item.review_status}</span>
                        </td>
                        <td style={{ padding: '0.6rem 0.8rem' }}>
                          {item.label ? <span className="badge badge-blue">{item.label}</span> : '—'}
                        </td>
                        <td style={{ padding: '0.6rem 0.8rem' }}>
                          {item.confidence !== undefined && item.confidence !== null
                            ? `${(item.confidence * 100).toFixed(0)}%`
                            : <span style={{ color: 'var(--text-muted)' }}>unspecified</span>}
                        </td>
                        <td style={{ padding: '0.6rem 0.8rem', color: 'var(--amber)' }}>
                          {item.priority_metadata?.reason || 'Priority item'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}

        {/* Tab 2: Baseline Model Evaluation */}
        {activeTab === 'evaluation' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', background: 'rgba(15, 23, 42, 0.5)', padding: '1rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}>
              <div>
                <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>
                  Evaluation Split
                </label>
                <select
                  className="input"
                  value={evalSplit}
                  onChange={(e) => setEvalSplit(e.target.value)}
                  style={{ width: '130px', marginTop: '0.2rem' }}
                >
                  <option value="test">Test Split</option>
                  <option value="val">Val Split</option>
                </select>
              </div>

              <div style={{ alignSelf: 'flex-end' }}>
                <button className="btn btn-primary" onClick={handleRunEvaluation} disabled={loadingEval}>
                  {loadingEval ? 'Evaluating...' : '🚀 Run Evaluation'}
                </button>
              </div>
            </div>

            {evalError && (
              <div style={{ padding: '0.75rem', background: 'rgba(239, 68, 68, 0.15)', border: '1px solid var(--rose)', borderRadius: 'var(--radius-sm)', color: 'var(--rose)', fontSize: '0.85rem' }}>
                {evalError}
              </div>
            )}

            {evalReport && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {/* Metric Summary Cards */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.75rem' }}>
                  <div style={{ background: 'rgba(30, 41, 59, 0.5)', padding: '0.85rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)', textAlign: 'center' }}>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Accuracy</div>
                    <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--emerald)', marginTop: '0.2rem' }}>
                      {(evalReport.accuracy * 100).toFixed(1)}%
                    </div>
                  </div>
                  <div style={{ background: 'rgba(30, 41, 59, 0.5)', padding: '0.85rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)', textAlign: 'center' }}>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Macro F1</div>
                    <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-accent)', marginTop: '0.2rem' }}>
                      {(evalReport.macro_f1 * 100).toFixed(1)}%
                    </div>
                  </div>
                  <div style={{ background: 'rgba(30, 41, 59, 0.5)', padding: '0.85rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)', textAlign: 'center' }}>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Precision</div>
                    <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--cyan)', marginTop: '0.2rem' }}>
                      {(evalReport.macro_precision * 100).toFixed(1)}%
                    </div>
                  </div>
                  <div style={{ background: 'rgba(30, 41, 59, 0.5)', padding: '0.85rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)', textAlign: 'center' }}>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Recall</div>
                    <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--amber)', marginTop: '0.2rem' }}>
                      {(evalReport.macro_recall * 100).toFixed(1)}%
                    </div>
                  </div>
                </div>

                {/* Warnings / Limitations */}
                {evalReport.warnings && evalReport.warnings.length > 0 && (
                  <div style={{ background: 'rgba(245, 158, 11, 0.1)', border: '1px solid var(--amber)', padding: '0.75rem', borderRadius: 'var(--radius-sm)', fontSize: '0.8rem', color: 'var(--amber)' }}>
                    <div style={{ fontWeight: 700, marginBottom: '0.3rem' }}>⚠️ Statistical Limitations & Caveats</div>
                    <ul style={{ margin: 0, paddingLeft: '1.2rem' }}>
                      {evalReport.warnings.map((w, idx) => (
                        <li key={idx}>{w}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Confusion Matrix */}
                {evalReport.classes.length > 0 && (
                  <div style={{ border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', padding: '1rem', background: 'rgba(15, 23, 42, 0.6)' }}>
                    <div style={{ fontSize: '0.85rem', fontWeight: 700, marginBottom: '0.75rem', color: 'var(--text-secondary)' }}>
                      CONFUSION MATRIX (Actual vs Predicted)
                    </div>
                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ borderCollapse: 'collapse', fontSize: '0.8rem', textAlign: 'center', width: '100%' }}>
                        <thead>
                          <tr>
                            <th style={{ padding: '0.4rem', color: 'var(--text-muted)' }}>Actual \ Pred</th>
                            {evalReport.classes.map((c) => (
                              <th key={c} style={{ padding: '0.4rem', borderBottom: '1px solid var(--border-subtle)' }}>
                                {c}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {evalReport.classes.map((act) => (
                            <tr key={act}>
                              <td style={{ padding: '0.4rem', fontWeight: 700, textAlign: 'left', borderRight: '1px solid var(--border-subtle)' }}>
                                {act}
                              </td>
                              {evalReport.classes.map((pred) => {
                                const val = evalReport.confusion_matrix?.[act]?.[pred] || 0;
                                const isDiagonal = act === pred;
                                return (
                                  <td
                                    key={pred}
                                    style={{
                                      padding: '0.4rem',
                                      background: isDiagonal && val > 0 ? 'rgba(16, 185, 129, 0.2)' : val > 0 ? 'rgba(239, 68, 68, 0.15)' : 'transparent',
                                      fontWeight: val > 0 ? 700 : 400,
                                      color: isDiagonal && val > 0 ? 'var(--emerald)' : val > 0 ? 'var(--rose)' : 'var(--text-muted)',
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
              </div>
            )}
          </div>
        )}

        {/* Tab 3: 2D Semantic Cluster Map */}
        {activeTab === 'clusters' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {loadingClusters ? (
              <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                Projecting embeddings to 2D space & analyzing coverage gaps...
              </div>
            ) : !clusterData || clusterData.points.length === 0 ? (
              <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                No semantic vectors available. Ingest text or image assets to view cluster map.
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: '1rem' }}>
                {/* 2D Scatter Plot Canvas/SVG */}
                <div style={{ background: 'rgba(15, 23, 42, 0.8)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', padding: '1rem', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  <svg viewBox="-110 -110 220 220" style={{ width: '100%', maxWidth: '420px', height: '320px' }}>
                    {/* Grid lines */}
                    <line x1="-100" y1="0" x2="100" y2="0" stroke="rgba(255, 255, 255, 0.1)" strokeWidth="0.5" />
                    <line x1="0" y1="-100" x2="0" y2="100" stroke="rgba(255, 255, 255, 0.1)" strokeWidth="0.5" />
                    <circle cx="0" cy="0" r="100" fill="none" stroke="rgba(255, 255, 255, 0.08)" strokeDasharray="3 3" />

                    {/* Coverage Gaps (Red Pulsing Rings) */}
                    {clusterData.coverage_gaps.map((gap) => (
                      <circle
                        key={gap.gap_id}
                        cx={gap.center_x * 90}
                        cy={gap.center_y * 90}
                        r="12"
                        fill="rgba(239, 68, 68, 0.15)"
                        stroke="var(--rose)"
                        strokeWidth="1"
                        strokeDasharray="2 2"
                      />
                    ))}

                    {/* Projected Record Points */}
                    {clusterData.points.map((p) => (
                      <circle
                        key={p.record_id}
                        cx={p.x * 90}
                        cy={p.y * 90}
                        r="3.5"
                        fill={p.label ? 'var(--primary)' : 'var(--text-muted)'}
                        opacity={0.8}
                      >
                        <title>{`${p.label || 'Unlabeled'} (${p.record_id})`}</title>
                      </circle>
                    ))}
                  </svg>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>
                    {clusterData.total_points} records mapped • 🔴 Red rings indicate identified coverage gaps
                  </div>
                </div>

                {/* Coverage Gap List & Targeted Synthesis */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '340px', overflowY: 'auto' }}>
                  <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
                    Identified Blind Spots ({clusterData.coverage_gaps.length})
                  </div>
                  {clusterData.coverage_gaps.length === 0 ? (
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', padding: '1rem 0' }}>
                      No prominent semantic gaps detected.
                    </div>
                  ) : (
                    clusterData.coverage_gaps.map((gap: CoverageGap) => (
                      <div
                        key={gap.gap_id}
                        style={{
                          background: 'rgba(30, 41, 59, 0.4)',
                          border: '1px solid var(--border-subtle)',
                          borderRadius: 'var(--radius-sm)',
                          padding: '0.6rem',
                          fontSize: '0.8rem',
                        }}
                      >
                        <div style={{ fontWeight: 700, color: 'var(--rose)', marginBottom: '0.2rem' }}>
                          🎯 {gap.gap_id.toUpperCase()}
                        </div>
                        <div style={{ color: 'var(--text-secondary)', fontSize: '0.75rem', marginBottom: '0.4rem' }}>
                          {gap.suggested_focus}
                        </div>
                        {onOpenSynthesize && (
                          <button
                            type="button"
                            className="btn btn-secondary"
                            style={{ fontSize: '0.75rem', padding: '0.2rem 0.5rem', width: '100%', justifyContent: 'center' }}
                            onClick={() => {
                              onClose();
                              onOpenSynthesize();
                            }}
                          >
                            ⚡ Synthesize Edge Cases Here
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
    </div>
  );
};
