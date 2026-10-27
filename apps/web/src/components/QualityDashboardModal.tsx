import React, { useEffect, useState, useRef, useMemo } from 'react';
import {
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Tag,
  BarChart2,
  Layers,
  X,
  ExternalLink,
  Filter,
} from 'lucide-react';
import { fetchValidationSummary, runDatasetValidation } from '../api';
import { QualityReport, ValidationFinding } from '../types';
import { PerceptualProgressBar } from './ui/PerceptualProgressBar';
import { SpringButton } from './ui/SpringButton';

export interface QualityDashboardModalProps {
  datasetId: string;
  isOpen: boolean;
  onClose: () => void;
  onFilterRecords?: (recordIdOrQuery: string) => void;
  onOpenWorkspace?: () => void;
}

// Accessible categorical palette for proportional distributions
const PALETTE = [
  'var(--accent-interactive)',
  'var(--emerald)',
  'var(--amber)',
  'var(--cyan)',
  'var(--rose)',
  '#8B5CF6',
  '#EC4899',
  '#14B8A6',
];

export const QualityDashboardModal: React.FC<QualityDashboardModalProps> = ({
  datasetId,
  isOpen,
  onClose,
  onFilterRecords,
  onOpenWorkspace,
}) => {
  const [report, setReport] = useState<QualityReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [severityFilter, setSeverityFilter] = useState<'all' | 'blocking' | 'warning' | 'info'>('all');

  // Prevent stale asynchronous responses from overwriting new dataset data
  const requestIdRef = useRef(0);

  const loadSummary = async () => {
    const currentId = ++requestIdRef.current;
    setLoading(true);
    setError(null);
    try {
      const data = await fetchValidationSummary(datasetId);
      if (requestIdRef.current === currentId) {
        setReport(data);
      }
    } catch (err: any) {
      if (requestIdRef.current === currentId) {
        setError(err.message || 'Failed to load validation summary');
      }
    } finally {
      if (requestIdRef.current === currentId) {
        setLoading(false);
      }
    }
  };

  const handleRunAudit = async () => {
    const currentId = ++requestIdRef.current;
    setRunning(true);
    setError(null);
    try {
      const data = await runDatasetValidation(datasetId);
      if (requestIdRef.current === currentId) {
        setReport(data);
      }
    } catch (err: any) {
      if (requestIdRef.current === currentId) {
        setError(err.message || 'Audit execution failed');
      }
    } finally {
      if (requestIdRef.current === currentId) {
        setRunning(false);
      }
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadSummary();
      setSeverityFilter('all');
    } else {
      setReport(null);
      setError(null);
    }
  }, [isOpen, datasetId]);

  // Filter diagnostic findings by active severity tab
  const filteredFindings = useMemo(() => {
    if (!report?.findings) return [];
    if (severityFilter === 'all') return report.findings;
    return report.findings.filter((f) => f.severity === severityFilter);
  }, [report, severityFilter]);

  if (!isOpen) return null;

  // Compute distribution totals for proportional charts
  const classEntries = report?.class_distribution ? Object.entries(report.class_distribution) : [];
  const totalClassLabels = classEntries.reduce((sum, [, count]) => sum + count, 0);

  const splitEntries = report?.split_distribution ? Object.entries(report.split_distribution) : [];
  const totalSplitRecords = splitEntries.reduce((sum, [, count]) => sum + count, 0);

  const originEntries = report?.origin_distribution ? Object.entries(report.origin_distribution) : [];
  const totalOriginRecords = originEntries.reduce((sum, [, count]) => sum + count, 0);

  return (
    <div className="modal-backdrop" onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="quality-modal-title">
      <div
        className="modal-content"
        style={{ maxWidth: '920px', maxHeight: '90vh', overflowY: 'auto' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.25rem' }}>
          <div>
            <h2 id="quality-modal-title" style={{ fontSize: '1.25rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <ShieldCheck size={20} strokeWidth={1.75} style={{ color: 'var(--accent-interactive)' }} />
              Dataset Quality & Publication Audit
            </h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.825rem', marginTop: '0.2rem' }}>
              Automated structural integrity checks, split leakage verification, and distribution balance
            </p>
          </div>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={onClose}
            aria-label="Close quality dashboard"
            style={{ padding: '0.35rem 0.5rem', display: 'flex', alignItems: 'center' }}
          >
            <X size={18} strokeWidth={1.75} />
          </button>
        </div>

        {error && (
          <div
            style={{
              padding: '0.75rem 1rem',
              background: 'rgba(239, 68, 68, 0.12)',
              border: '1px solid var(--rose)',
              borderRadius: 'var(--radius-sm)',
              color: 'var(--rose)',
              marginBottom: '1rem',
              fontSize: '0.85rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <span>{error}</span>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={loadSummary}
              style={{ fontSize: '0.75rem', padding: '0.2rem 0.5rem' }}
            >
              Retry
            </button>
          </div>
        )}

        {loading ? (
          <div className="loading-container" style={{ padding: '3.5rem' }}>
            <div className="spinner" style={{ width: '24px', height: '24px' }}></div>
            <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Executing quality audit checks...</div>
          </div>
        ) : report ? (
          <div>
            {/* Publication Readiness Banner */}
            <div
              style={{
                padding: '1rem 1.25rem',
                borderRadius: 'var(--radius-md)',
                marginBottom: '1.25rem',
                background: report.is_publishable
                  ? 'rgba(16, 185, 129, 0.10)'
                  : 'rgba(239, 68, 68, 0.10)',
                border: `1px solid ${report.is_publishable ? 'var(--emerald)' : 'var(--rose)'}`,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '1rem',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.65rem' }}>
                {report.is_publishable ? (
                  <CheckCircle2 size={20} strokeWidth={1.75} style={{ color: 'var(--emerald)', flexShrink: 0, marginTop: '2px' }} />
                ) : (
                  <AlertTriangle size={20} strokeWidth={1.75} style={{ color: 'var(--rose)', flexShrink: 0, marginTop: '2px' }} />
                )}
                <div>
                  <h3 style={{ fontSize: '1rem', fontWeight: 700, color: report.is_publishable ? 'var(--emerald)' : 'var(--rose)' }}>
                    {report.is_publishable ? 'Eligible for Publication & Snapshotting' : 'Publication Blocked'}
                  </h3>
                  <p style={{ color: 'var(--text-secondary)', fontSize: '0.825rem', marginTop: '0.15rem' }}>
                    {report.is_publishable
                      ? 'No blocking structural or integrity issues found. Safe to freeze immutable release version.'
                      : `Contains ${report.blocking_count} blocking issue(s) that must be resolved before this dataset can be published.`}
                  </p>
                </div>
              </div>

              <SpringButton
                variant="primary"
                onClick={handleRunAudit}
                disabled={running}
                style={{ whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.825rem', padding: '0.45rem 0.85rem' }}
              >
                <RefreshCw size={14} strokeWidth={1.75} className={running ? 'animate-spin' : ''} />
                {running ? 'Running Diagnostics...' : 'Re-run Quality Audit'}
              </SpringButton>
            </div>

            {running && (
              <div style={{ marginBottom: '1.25rem' }}>
                <PerceptualProgressBar active={running} taskType="validate" />
              </div>
            )}

            {/* Scorecard Metrics Grid */}
            <div className="stats-grid" style={{ marginBottom: '1.25rem', gridTemplateColumns: 'repeat(4, 1fr)' }}>
              <div className="stat-card" style={{ borderColor: report.blocking_count > 0 ? 'var(--rose)' : undefined }}>
                <span className="stat-value" style={{ color: report.blocking_count > 0 ? 'var(--rose)' : 'var(--text-primary)' }}>
                  {report.blocking_count}
                </span>
                <span className="stat-label">Blocking Issues</span>
              </div>
              <div className="stat-card" style={{ borderColor: report.warning_count > 0 ? 'var(--amber)' : undefined }}>
                <span className="stat-value" style={{ color: report.warning_count > 0 ? 'var(--amber)' : 'var(--text-primary)' }}>
                  {report.warning_count}
                </span>
                <span className="stat-label">Warnings</span>
              </div>
              <div className="stat-card">
                <span className="stat-value" style={{ color: 'var(--cyan)' }}>{report.info_count}</span>
                <span className="stat-label">Informational</span>
              </div>
              <div className="stat-card">
                <span className="stat-value">{report.total_records}</span>
                <span className="stat-label">Records Audited</span>
              </div>
            </div>

            {/* Distribution Analysis: Compact Proportional Bars */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(270px, 1fr))', gap: '1rem', marginBottom: '1.25rem' }}>
              {/* Class Balance */}
              <div className="card" style={{ padding: '0.85rem', background: 'var(--bg-elevated)', border: '1px solid var(--border-hairline)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.65rem' }}>
                  <span style={{ fontSize: '0.85rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                    <Tag size={14} strokeWidth={1.75} style={{ color: 'var(--accent-interactive)' }} /> Class Balance
                  </span>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{classEntries.length} classes</span>
                </div>

                {classEntries.length === 0 ? (
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', margin: '0.5rem 0' }}>No approved class labels recorded.</p>
                ) : (
                  <div>
                    {/* Proportional Stacked Bar */}
                    <div
                      style={{
                        display: 'flex',
                        height: '8px',
                        borderRadius: '4px',
                        overflow: 'hidden',
                        background: 'var(--bg-canvas)',
                        marginBottom: '0.65rem',
                        border: '1px solid var(--border-hairline)',
                      }}
                      title="Class Distribution Bar"
                    >
                      {classEntries.map(([cls, count], idx) => {
                        const pct = totalClassLabels > 0 ? (count / totalClassLabels) * 100 : 0;
                        return (
                          <div
                            key={cls}
                            style={{
                              width: `${pct}%`,
                              backgroundColor: PALETTE[idx % PALETTE.length],
                              transition: 'width 0.2s ease',
                            }}
                            title={`${cls}: ${count} (${pct.toFixed(1)}%)`}
                          />
                        );
                      })}
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', maxHeight: '140px', overflowY: 'auto' }}>
                      {classEntries.map(([cls, count], idx) => {
                        const pct = totalClassLabels > 0 ? (count / totalClassLabels) * 100 : 0;
                        return (
                          <div key={cls} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.78rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                              <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: PALETTE[idx % PALETTE.length] }} />
                              <span style={{ fontFamily: 'var(--font-mono)' }}>{cls}</span>
                            </div>
                            <div style={{ display: 'flex', gap: '0.5rem', color: 'var(--text-muted)' }}>
                              <span>{count}</span>
                              <span style={{ minWidth: '40px', textAlign: 'right', fontWeight: 600, color: 'var(--text-primary)' }}>
                                {pct.toFixed(1)}%
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* Split Distribution */}
              <div className="card" style={{ padding: '0.85rem', background: 'var(--bg-elevated)', border: '1px solid var(--border-hairline)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.65rem' }}>
                  <span style={{ fontSize: '0.85rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                    <BarChart2 size={14} strokeWidth={1.75} style={{ color: 'var(--emerald)' }} /> Split Balance
                  </span>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{splitEntries.length} splits</span>
                </div>

                {splitEntries.length === 0 ? (
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', margin: '0.5rem 0' }}>No split assignments recorded.</p>
                ) : (
                  <div>
                    {/* Proportional Stacked Bar */}
                    <div
                      style={{
                        display: 'flex',
                        height: '8px',
                        borderRadius: '4px',
                        overflow: 'hidden',
                        background: 'var(--bg-canvas)',
                        marginBottom: '0.65rem',
                        border: '1px solid var(--border-hairline)',
                      }}
                      title="Split Distribution Bar"
                    >
                      {splitEntries.map(([split, count], idx) => {
                        const pct = totalSplitRecords > 0 ? (count / totalSplitRecords) * 100 : 0;
                        const splitColor = split === 'train' ? 'var(--accent-interactive)' : split === 'validation' || split === 'val' ? 'var(--cyan)' : 'var(--emerald)';
                        return (
                          <div
                            key={split}
                            style={{
                              width: `${pct}%`,
                              backgroundColor: splitColor,
                              transition: 'width 0.2s ease',
                            }}
                            title={`${split}: ${count} (${pct.toFixed(1)}%)`}
                          />
                        );
                      })}
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                      {splitEntries.map(([split, count]) => {
                        const pct = totalSplitRecords > 0 ? (count / totalSplitRecords) * 100 : 0;
                        const splitColor = split === 'train' ? 'var(--accent-interactive)' : split === 'validation' || split === 'val' ? 'var(--cyan)' : 'var(--emerald)';
                        return (
                          <div key={split} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.78rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                              <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: splitColor }} />
                              <span style={{ textTransform: 'capitalize' }}>{split}</span>
                            </div>
                            <div style={{ display: 'flex', gap: '0.5rem', color: 'var(--text-muted)' }}>
                              <span>{count}</span>
                              <span style={{ minWidth: '40px', textAlign: 'right', fontWeight: 600, color: 'var(--text-primary)' }}>
                                {pct.toFixed(1)}%
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* Annotation Provenance Distribution */}
              <div className="card" style={{ padding: '0.85rem', background: 'var(--bg-elevated)', border: '1px solid var(--border-hairline)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.65rem' }}>
                  <span style={{ fontSize: '0.85rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                    <Layers size={14} strokeWidth={1.75} style={{ color: 'var(--amber)' }} /> Provenance Origins
                  </span>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{originEntries.length} origins</span>
                </div>

                {originEntries.length === 0 ? (
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', margin: '0.5rem 0' }}>No annotations present.</p>
                ) : (
                  <div>
                    {/* Proportional Stacked Bar */}
                    <div
                      style={{
                        display: 'flex',
                        height: '8px',
                        borderRadius: '4px',
                        overflow: 'hidden',
                        background: 'var(--bg-canvas)',
                        marginBottom: '0.65rem',
                        border: '1px solid var(--border-hairline)',
                      }}
                      title="Provenance Origin Bar"
                    >
                      {originEntries.map(([origin, count], idx) => {
                        const pct = totalOriginRecords > 0 ? (count / totalOriginRecords) * 100 : 0;
                        return (
                          <div
                            key={origin}
                            style={{
                              width: `${pct}%`,
                              backgroundColor: PALETTE[(idx + 2) % PALETTE.length],
                              transition: 'width 0.2s ease',
                            }}
                            title={`${origin}: ${count} (${pct.toFixed(1)}%)`}
                          />
                        );
                      })}
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                      {originEntries.map(([origin, count], idx) => {
                        const pct = totalOriginRecords > 0 ? (count / totalOriginRecords) * 100 : 0;
                        return (
                          <div key={origin} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.78rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                              <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: PALETTE[(idx + 2) % PALETTE.length] }} />
                              <span style={{ textTransform: 'capitalize' }}>{origin}</span>
                            </div>
                            <div style={{ display: 'flex', gap: '0.5rem', color: 'var(--text-muted)' }}>
                              <span>{count}</span>
                              <span style={{ minWidth: '40px', textAlign: 'right', fontWeight: 600, color: 'var(--text-primary)' }}>
                                {pct.toFixed(1)}%
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Diagnostic Findings Section with Actionable Severity Filter */}
            <div style={{ marginBottom: '1.25rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                <h4 style={{ fontSize: '0.95rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <Filter size={15} strokeWidth={1.75} />
                  Diagnostic Findings ({filteredFindings.length} of {report.findings.length})
                </h4>

                {/* Severity Filter Tabs */}
                <div style={{ display: 'inline-flex', padding: '2px', background: 'var(--bg-elevated)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-hairline)' }}>
                  {[
                    { id: 'all', label: `All (${report.findings.length})` },
                    { id: 'blocking', label: `Blocking (${report.blocking_count})` },
                    { id: 'warning', label: `Warnings (${report.warning_count})` },
                    { id: 'info', label: `Info (${report.info_count})` },
                  ].map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setSeverityFilter(tab.id as any)}
                      style={{
                        padding: '0.25rem 0.65rem',
                        fontSize: '0.75rem',
                        fontWeight: severityFilter === tab.id ? 600 : 400,
                        border: 'none',
                        background: severityFilter === tab.id ? 'var(--bg-surface)' : 'transparent',
                        color: severityFilter === tab.id ? 'var(--text-primary)' : 'var(--text-muted)',
                        borderRadius: '3px',
                        cursor: 'pointer',
                        transition: 'background 0.15s ease',
                      }}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
              </div>

              {filteredFindings.length === 0 ? (
                <div
                  style={{
                    padding: '1.5rem',
                    background: 'rgba(16, 185, 129, 0.08)',
                    borderRadius: 'var(--radius-md)',
                    textAlign: 'center',
                    color: 'var(--emerald)',
                    fontSize: '0.85rem',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '0.5rem',
                    border: '1px solid rgba(16, 185, 129, 0.2)',
                  }}
                >
                  <CheckCircle2 size={16} strokeWidth={1.75} />
                  {report.findings.length === 0
                    ? 'Clean verification! No structural violations, split leakage, or unreviewed records detected.'
                    : `No findings matching severity filter "${severityFilter}".`}
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                  {filteredFindings.map((finding: ValidationFinding, idx: number) => {
                    const badgeColor =
                      finding.severity === 'blocking'
                        ? 'var(--rose)'
                        : finding.severity === 'warning'
                        ? 'var(--amber)'
                        : 'var(--cyan)';

                    const badgeBg =
                      finding.severity === 'blocking'
                        ? 'rgba(239, 68, 68, 0.15)'
                        : finding.severity === 'warning'
                        ? 'rgba(245, 158, 11, 0.15)'
                        : 'rgba(6, 182, 212, 0.15)';

                    return (
                      <div
                        key={idx}
                        style={{
                          padding: '0.85rem 1rem',
                          background: 'var(--bg-elevated)',
                          borderRadius: 'var(--radius-sm)',
                          border: '1px solid var(--border-hairline)',
                          borderLeft: `4px solid ${badgeColor}`,
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.35rem', flexWrap: 'wrap', gap: '0.4rem' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                            <span
                              style={{
                                textTransform: 'uppercase',
                                fontSize: '0.7rem',
                                fontWeight: 700,
                                padding: '1px 6px',
                                borderRadius: '3px',
                                color: badgeColor,
                                background: badgeBg,
                              }}
                            >
                              {finding.severity}
                            </span>
                            <span style={{ fontWeight: 600, fontSize: '0.875rem' }}>{finding.title}</span>
                          </div>
                          <span style={{ color: 'var(--text-muted)', fontSize: '0.725rem', fontFamily: 'var(--font-mono)' }}>
                            {finding.rule_id}
                          </span>
                        </div>

                        <p style={{ color: 'var(--text-secondary)', fontSize: '0.825rem', marginBottom: '0.45rem', lineHeight: '1.4' }}>
                          {finding.description}
                        </p>

                        <div
                          style={{
                            padding: '0.4rem 0.65rem',
                            background: 'var(--bg-canvas)',
                            borderRadius: 'var(--radius-xs)',
                            fontSize: '0.775rem',
                            color: 'var(--text-muted)',
                            marginBottom: finding.affected_record_ids.length > 0 ? '0.5rem' : 0,
                          }}
                        >
                          <strong style={{ color: 'var(--text-primary)' }}>Remediation: </strong>
                          {finding.remediation}
                        </div>

                        {/* Interactive One-Click Affected Records Access */}
                        {finding.affected_record_ids.length > 0 && (
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem', marginTop: '0.4rem' }}>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.35rem', flexWrap: 'wrap' }}>
                              <span>Affected ({finding.affected_record_ids.length}):</span>
                              {finding.affected_record_ids.slice(0, 3).map((recId) => (
                                <button
                                  key={recId}
                                  type="button"
                                  onClick={() => {
                                    if (onFilterRecords) {
                                      onFilterRecords(recId);
                                    }
                                  }}
                                  title={`Filter record ${recId} in dataset queue`}
                                  style={{
                                    padding: '1px 5px',
                                    borderRadius: '3px',
                                    border: '1px solid var(--border-hairline)',
                                    background: 'var(--bg-canvas)',
                                    fontFamily: 'var(--font-mono)',
                                    fontSize: '0.7rem',
                                    color: 'var(--accent-interactive)',
                                    cursor: onFilterRecords ? 'pointer' : 'default',
                                  }}
                                >
                                  {recId.slice(0, 8)}...
                                </button>
                              ))}
                              {finding.affected_record_ids.length > 3 && (
                                <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                                  +{finding.affected_record_ids.length - 3} more
                                </span>
                              )}
                            </div>

                            {onFilterRecords && (
                              <button
                                type="button"
                                className="btn btn-secondary"
                                onClick={() => {
                                  onFilterRecords(finding.affected_record_ids[0]);
                                }}
                                style={{
                                  fontSize: '0.725rem',
                                  padding: '0.2rem 0.5rem',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '0.3rem',
                                }}
                              >
                                <ExternalLink size={12} strokeWidth={1.75} />
                                Inspect in Queue
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Platform Integrity Policy Notice */}
            <div
              style={{
                padding: '0.65rem 0.85rem',
                background: 'var(--bg-elevated)',
                border: '1px solid var(--border-hairline)',
                borderRadius: 'var(--radius-sm)',
                fontSize: '0.75rem',
                color: 'var(--text-muted)',
                lineHeight: '1.45',
                display: 'flex',
                alignItems: 'flex-start',
                gap: '0.5rem',
              }}
            >
              <AlertTriangle size={14} strokeWidth={1.75} style={{ flexShrink: 0, marginTop: '2px', color: 'var(--amber)' }} />
              <div>
                <strong style={{ color: 'var(--text-primary)' }}>Validation Policy: </strong>
                {report.disclaimer}
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
};
