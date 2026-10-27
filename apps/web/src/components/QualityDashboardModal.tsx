import React, { useEffect, useState } from 'react';
import {
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Tag,
  BarChart2,
  Layers,
  X,
} from 'lucide-react';
import { fetchValidationSummary, runDatasetValidation } from '../api';
import { QualityReport, ValidationFinding } from '../types';
import { PerceptualProgressBar } from './ui/PerceptualProgressBar';
import { SpringButton } from './ui/SpringButton';

interface QualityDashboardModalProps {
  datasetId: string;
  isOpen: boolean;
  onClose: () => void;
}

export const QualityDashboardModal: React.FC<QualityDashboardModalProps> = ({
  datasetId,
  isOpen,
  onClose,
}) => {
  const [report, setReport] = useState<QualityReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadSummary = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchValidationSummary(datasetId);
      setReport(data);
    } catch (err: any) {
      setError(err.message || 'Failed to load validation summary');
    } finally {
      setLoading(false);
    }
  };

  const handleRunAudit = async () => {
    setRunning(true);
    setError(null);
    try {
      const data = await runDatasetValidation(datasetId);
      setReport(data);
    } catch (err: any) {
      setError(err.message || 'Audit execution failed');
    } finally {
      setRunning(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadSummary();
    }
  }, [isOpen, datasetId]);

  if (!isOpen) return null;

  return (
    <div className="modal-backdrop">
      <div className="modal-content" style={{ maxWidth: '900px', maxHeight: '90vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
          <div>
            <h2 style={{ fontSize: '1.35rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <ShieldCheck size={20} className="text-blue-500" /> Quality & Publication Readiness Engine
            </h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
              Phase 6 automated integrity audits, split leakage detection, and distribution analysis
            </p>
          </div>
          <button className="btn btn-secondary" onClick={onClose} aria-label="Close dialog" style={{ padding: '0.35rem 0.5rem', display: 'flex', alignItems: 'center' }}>
            <X size={18} />
          </button>
        </div>

        {error && (
          <div style={{ padding: '0.75rem 1rem', background: 'rgba(239, 68, 68, 0.15)', border: '1px solid var(--rose)', borderRadius: 'var(--radius-md)', color: 'var(--rose)', marginBottom: '1rem', fontSize: '0.875rem' }}>
            {error}
          </div>
        )}

        {loading ? (
          <div className="loading-container" style={{ padding: '3rem' }}>
            <div className="spinner"></div>
            <div>Executing quality audit checks...</div>
          </div>
        ) : report ? (
          <div>
            {/* Publication Readiness Banner */}
            <div
              style={{
                padding: '1.25rem',
                borderRadius: 'var(--radius-md)',
                marginBottom: '1.5rem',
                background: report.is_publishable
                  ? 'rgba(16, 185, 129, 0.12)'
                  : 'rgba(239, 68, 68, 0.12)',
                border: `1px solid ${report.is_publishable ? 'var(--emerald)' : 'var(--rose)'}`,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '1rem',
              }}
            >
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                  {report.is_publishable ? (
                    <CheckCircle2 size={18} style={{ color: 'var(--emerald)' }} />
                  ) : (
                    <AlertTriangle size={18} style={{ color: 'var(--rose)' }} />
                  )}
                  <h3 style={{ fontSize: '1.05rem', fontWeight: 700, color: report.is_publishable ? 'var(--emerald)' : 'var(--rose)' }}>
                    {report.is_publishable ? 'Publication Ready' : 'Publication Blocked'}
                  </h3>
                </div>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                  {report.is_publishable
                    ? 'No blocking structural or integrity issues found. Dataset is eligible for immutable snapshotting and export.'
                    : `Contains ${report.blocking_count} blocking issue(s) that must be resolved before this dataset can be versioned or published.`}
                </p>
              </div>

              <SpringButton
                variant="primary"
                onClick={handleRunAudit}
                disabled={running}
                style={{ whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: '0.4rem' }}
              >
                <RefreshCw size={14} className={running ? 'animate-spin' : ''} />
                {running ? 'Running Diagnostics...' : 'Re-run Quality Audit'}
              </SpringButton>
            </div>

            {running && (
              <div style={{ marginBottom: '1.25rem' }}>
                <PerceptualProgressBar active={running} taskType="validate" />
              </div>
            )}

            {/* Metrics Grid */}
            <div className="stats-grid" style={{ marginBottom: '1.5rem' }}>
              <div className="stat-card" style={{ borderColor: report.blocking_count > 0 ? 'rgba(239, 68, 68, 0.4)' : undefined }}>
                <span className="stat-value" style={{ color: report.blocking_count > 0 ? 'var(--rose)' : 'var(--text-primary)' }}>
                  {report.blocking_count}
                </span>
                <span className="stat-label">Blocking Issues</span>
              </div>
              <div className="stat-card" style={{ borderColor: report.warning_count > 0 ? 'rgba(245, 158, 11, 0.4)' : undefined }}>
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

            {/* Distributions Section */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
              {/* Class Balance */}
              <div className="card" style={{ padding: '1rem', background: 'rgba(15, 23, 42, 0.5)' }}>
                <h4 style={{ fontSize: '0.9rem', fontWeight: 700, marginBottom: '0.75rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <Tag size={15} /> Class Distribution
                </h4>
                {Object.keys(report.class_distribution).length === 0 ? (
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>No approved class labels recorded yet.</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                    {Object.entries(report.class_distribution).map(([cls, count]) => (
                      <div key={cls} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.825rem' }}>
                        <span style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>{cls}</span>
                        <span className="badge badge-blue">{count}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Split Distribution */}
              <div className="card" style={{ padding: '1rem', background: 'rgba(15, 23, 42, 0.5)' }}>
                <h4 style={{ fontSize: '0.9rem', fontWeight: 700, marginBottom: '0.75rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <BarChart2 size={15} /> Split Balance
                </h4>
                {Object.keys(report.split_distribution).length === 0 ? (
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>No splits assigned.</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                    {Object.entries(report.split_distribution).map(([split, count]) => (
                      <div key={split} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.825rem' }}>
                        <span style={{ textTransform: 'capitalize', color: 'var(--text-primary)' }}>{split}</span>
                        <span className="badge badge-cyan">{count}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Origin Distribution */}
              <div className="card" style={{ padding: '1rem', background: 'rgba(15, 23, 42, 0.5)' }}>
                <h4 style={{ fontSize: '0.9rem', fontWeight: 700, marginBottom: '0.75rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <Layers size={15} /> Annotation Provenance
                </h4>
                {Object.keys(report.origin_distribution).length === 0 ? (
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>No annotations present.</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                    {Object.entries(report.origin_distribution).map(([origin, count]) => (
                      <div key={origin} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.825rem' }}>
                        <span style={{ textTransform: 'capitalize', color: 'var(--text-primary)' }}>{origin}</span>
                        <span className="badge badge-amber">{count}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Findings List */}
            <div style={{ marginBottom: '1.5rem' }}>
              <h4 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '0.75rem' }}>
                Diagnostic Findings ({report.findings.length})
              </h4>
              {report.findings.length === 0 ? (
                <div style={{ padding: '1.5rem', background: 'rgba(16, 185, 129, 0.08)', borderRadius: 'var(--radius-md)', textAlign: 'center', color: 'var(--emerald)', fontSize: '0.9rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
                  <CheckCircle2 size={18} /> Clean Bill of Health! No structural issues, missing assets, split leakage, or unreviewed records detected.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  {report.findings.map((finding: ValidationFinding, idx: number) => {
                    const badgeClass =
                      finding.severity === 'blocking'
                        ? 'badge-rose'
                        : finding.severity === 'warning'
                        ? 'badge-amber'
                        : 'badge-cyan';
                    return (
                      <div
                        key={idx}
                        style={{
                          padding: '1rem',
                          background: 'rgba(30, 41, 59, 0.5)',
                          borderRadius: 'var(--radius-md)',
                          borderLeft: `4px solid ${
                            finding.severity === 'blocking'
                              ? 'var(--rose)'
                              : finding.severity === 'warning'
                              ? 'var(--amber)'
                              : 'var(--cyan)'
                          }`,
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <span className={`badge ${badgeClass}`} style={{ textTransform: 'uppercase', fontSize: '0.75rem' }}>
                              {finding.severity}
                            </span>
                            <span style={{ fontWeight: 700, fontSize: '0.95rem' }}>{finding.title}</span>
                          </div>
                          <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem', fontFamily: 'var(--font-mono)' }}>
                            {finding.rule_id}
                          </span>
                        </div>
                        <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '0.5rem' }}>
                          {finding.description}
                        </p>
                        <div style={{ padding: '0.5rem 0.75rem', background: 'rgba(15, 23, 42, 0.6)', borderRadius: 'var(--radius-sm)', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                          <span style={{ fontWeight: 600, color: 'var(--text-accent)' }}>Remediation: </span>
                          {finding.remediation}
                        </div>
                        {finding.affected_record_ids.length > 0 && (
                          <div style={{ marginTop: '0.5rem', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                            <span>Affected records ({finding.affected_record_ids.length}): </span>
                            <code style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>
                              {finding.affected_record_ids.slice(0, 3).join(', ')}
                              {finding.affected_record_ids.length > 3 && ` +${finding.affected_record_ids.length - 3} more`}
                            </code>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Mandatory AGENTS.md Compliance Disclaimer */}
            <div style={{ padding: '0.75rem 1rem', background: 'rgba(15, 23, 42, 0.8)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', fontSize: '0.75rem', color: 'var(--text-muted)', lineHeight: '1.5', display: 'flex', alignItems: 'flex-start', gap: '0.5rem' }}>
              <AlertTriangle size={15} style={{ flexShrink: 0, marginTop: '2px', color: 'var(--amber)' }} />
              <div>
                <strong>Integrity Policy Notice: </strong>
                {report.disclaimer}
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
};
