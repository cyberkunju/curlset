import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Boxes, ClipboardCheck, Gauge, Play, RefreshCw, ShieldCheck } from 'lucide-react';
import { ModalShell } from './ui/ModalShell';
import { SpringButton } from './ui/SpringButton';
import { fetchProviders, fetchEnsembleAuditSample, fetchEnsembleVotes, runEnsembleLabel } from '../api';
import type { EnsembleModelSpec } from '../api';
import type {
  EnsembleAuditSampleResponse,
  EnsembleLabelResponse,
  EnsembleVotesResponse,
} from '../types';

interface EnsembleLabProps {
  isOpen: boolean;
  onClose: () => void;
  datasetId: string;
  onApplied?: () => void;
  defaultSplit?: string;
}

interface ProviderInfo {
  name: string;
  models: string[];
  capabilities: string[];
}

const MAX_MODELS = 3;

const cell: React.CSSProperties = {
  padding: '0.4rem 0.55rem',
  borderBottom: '1px solid var(--border-hairline)',
  fontSize: '0.8rem',
  textAlign: 'left',
};

const th: React.CSSProperties = {
  ...cell,
  fontSize: '0.7rem',
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  color: 'var(--text-muted)',
  fontWeight: 600,
};

const numberInput: React.CSSProperties = {
  width: '100%',
  padding: '0.4rem 0.55rem',
  fontSize: '0.82rem',
  borderRadius: 'var(--radius-sm)',
  border: '1px solid var(--border-hairline)',
  backgroundColor: 'var(--bg-base)',
  color: 'var(--text-primary)',
};

const pct = (value: number | null | undefined): string =>
  typeof value === 'number' && Number.isFinite(value) ? `${(value * 100).toFixed(1)}%` : '—';

/**
 * Ensemble Lab: run confidence-weighted multi-model pseudo-labeling and inspect the measurement.
 *
 * The panel is intentionally measurement-first: it never shows an accuracy claim without the sample
 * count, the Wilson lower bound, and the correlated-error audit that qualifies it. Nothing here
 * approves data — auto-accepted labels land as `origin=ensemble` candidates for human review.
 */
export const EnsembleLab: React.FC<EnsembleLabProps> = ({
  isOpen,
  onClose,
  datasetId,
  onApplied,
  defaultSplit,
}) => {
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [selected, setSelected] = useState<EnsembleModelSpec[]>([]);
  const [split, setSplit] = useState(defaultSplit ?? '');
  const [limit, setLimit] = useState(200);
  const [targetPrecision, setTargetPrecision] = useState(0.9);
  const [budgetCap, setBudgetCap] = useState(2);
  const [alpha, setAlpha] = useState(2);
  const [materialize, setMaterialize] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<EnsembleLabelResponse | null>(null);
  const [votes, setVotes] = useState<EnsembleVotesResponse | null>(null);
  const [audit, setAudit] = useState<EnsembleAuditSampleResponse | null>(null);

  const loadProviders = useCallback(async () => {
    try {
      const rows = await fetchProviders();
      const mapped: ProviderInfo[] = (rows || []).map((row: any) => ({
        name: String(row?.name ?? ''),
        models: Array.isArray(row?.models) ? row.models.map(String) : [],
        capabilities: Array.isArray(row?.capabilities) ? row.capabilities.map(String) : [],
      }));
      setProviders(mapped);
      setSelected((current) => {
        if (current.length > 0) return current;
        const picks: EnsembleModelSpec[] = [];
        for (const provider of mapped) {
          if (!provider.capabilities.includes('text_classification')) continue;
          const model = provider.models[0];
          if (model) picks.push({ provider: provider.name, model });
          if (picks.length >= MAX_MODELS) break;
        }
        return picks;
      });
    } catch (err: any) {
      setError(err?.message || 'Failed to load providers');
    }
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    void loadProviders();
  }, [isOpen, loadProviders]);

  const toggleModel = (spec: EnsembleModelSpec) => {
    setSelected((current) => {
      const exists = current.some((item) => item.provider === spec.provider && item.model === spec.model);
      if (exists) return current.filter((item) => !(item.provider === spec.provider && item.model === spec.model));
      if (current.length >= MAX_MODELS) return current;
      return [...current, spec];
    });
  };

  const isChosen = (spec: EnsembleModelSpec) =>
    selected.some((item) => item.provider === spec.provider && item.model === spec.model);

  const handleRun = async () => {
    if (selected.length === 0) {
      setError('Select at least one model to poll.');
      return;
    }
    setRunning(true);
    setError(null);
    setAudit(null);
    try {
      const response: EnsembleLabelResponse = await runEnsembleLabel(datasetId, {
        models: selected,
        split: split || null,
        limit,
        target_precision: targetPrecision,
        budget_cap_usd: budgetCap,
        weight_alpha: alpha,
        min_support: 30,
        materialize,
      });
      setResult(response);
      try {
        setVotes(await fetchEnsembleVotes(datasetId));
      } catch {
        setVotes(null);
      }
      if (materialize && response.materialized_annotations > 0 && onApplied) onApplied();
    } catch (err: any) {
      setError(err?.message || 'Ensemble run failed');
    } finally {
      setRunning(false);
    }
  };

  const handleAuditSample = async () => {
    try {
      setAudit(await fetchEnsembleAuditSample(datasetId, { size: 100, target_precision: targetPrecision }));
    } catch (err: any) {
      setError(err?.message || 'Could not build audit sample');
    }
  };

  const correlatedFlagged = useMemo(() => {
    if (!result) return false;
    return Object.values(result.correlated_error || {}).some((value) => value > 0.6);
  }, [result]);

  const bestAggregator = useMemo(() => {
    if (!result) return null;
    const entries = Object.entries(result.aggregator_scores || {});
    if (entries.length === 0) return null;
    return entries.reduce((best, current) => (current[1].macro_f1 > best[1].macro_f1 ? current : best))[0];
  }, [result]);

  const overall = result?.thresholds?.['__all__'];

  return (
    <ModalShell
      isOpen={isOpen}
      onClose={onClose}
      size="xl"
      icon={<Boxes size={20} strokeWidth={1.75} />}
      title="Ensemble Lab"
      description="Confidence-weighted multi-model pseudo-labeling. Every number below is measured on gold labels and carries its sample size and Wilson lower bound."
      footer={
        <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center', width: '100%' }}>
          <SpringButton variant="ghost" size="sm" onClick={handleAuditSample} icon={<ClipboardCheck size={14} />}>
            Audit sample
          </SpringButton>
          <div style={{ flex: 1 }} />
          <SpringButton variant="secondary" size="sm" onClick={onClose}>
            Close
          </SpringButton>
          <SpringButton
            variant="primary"
            size="sm"
            onClick={handleRun}
            disabled={running || selected.length === 0}
            icon={running ? <RefreshCw size={14} /> : <Play size={14} />}
          >
            {running ? 'Running…' : 'Run ensemble'}
          </SpringButton>
        </div>
      }
    >
      {error && (
        <div className="card" style={{ borderColor: 'var(--rose)', marginBottom: '0.9rem', padding: '0.7rem 0.85rem' }}>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start' }}>
            <AlertTriangle size={16} strokeWidth={1.9} style={{ color: 'var(--rose)', flexShrink: 0, marginTop: 2 }} />
            <div style={{ fontSize: '0.82rem' }}>{error}</div>
          </div>
        </div>
      )}

      {/* ---------------- configuration ---------------- */}
      <section style={{ marginBottom: '1rem' }}>
        <h3 style={{ fontSize: '0.85rem', margin: '0 0 0.45rem', color: 'var(--text-secondary)' }}>
          1. Models to poll ({selected.length}/{MAX_MODELS})
        </h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
          {providers.length === 0 && (
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>No providers registered.</div>
          )}
          {providers
            .filter((provider) => provider.capabilities.includes('text_classification'))
            .map((provider) => (
              <div key={provider.name} style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', alignItems: 'center' }}>
                <span className="badge badge-neutral" style={{ textTransform: 'none' }}>{provider.name}</span>
                {provider.models.map((model) => {
                  const spec = { provider: provider.name, model };
                  const active = isChosen(spec);
                  const disabled = !active && selected.length >= MAX_MODELS;
                  return (
                    <button
                      key={`${provider.name}:${model}`}
                      type="button"
                      onClick={() => toggleModel(spec)}
                      disabled={disabled}
                      style={{
                        fontSize: '0.76rem',
                        padding: '0.25rem 0.55rem',
                        borderRadius: 'var(--radius-sm)',
                        cursor: disabled ? 'not-allowed' : 'pointer',
                        opacity: disabled ? 0.45 : 1,
                        border: `1px solid ${active ? 'var(--accent-primary)' : 'var(--border-hairline)'}`,
                        backgroundColor: active ? 'color-mix(in srgb, var(--accent-primary) 14%, transparent)' : 'var(--bg-base)',
                        color: 'var(--text-primary)',
                      }}
                    >
                      {model}
                    </button>
                  );
                })}
              </div>
            ))}
        </div>
      </section>

      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0, 1fr))', gap: '0.6rem', marginBottom: '1rem' }}>
        <label style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
          Split
          <select value={split} onChange={(event) => setSplit(event.target.value)} style={numberInput}>
            <option value="">all</option>
            <option value="train">train</option>
            <option value="val">val</option>
            <option value="test">test</option>
          </select>
        </label>
        <label style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
          Record limit
          <input type="number" min={1} max={500} value={limit} onChange={(event) => setLimit(Number(event.target.value) || 1)} style={numberInput} />
        </label>
        <label style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
          Target precision
          <input type="number" step={0.01} min={0.51} max={0.99} value={targetPrecision} onChange={(event) => setTargetPrecision(Number(event.target.value) || 0.9)} style={numberInput} />
        </label>
        <label style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
          Budget cap (USD)
          <input type="number" step={0.5} min={0} value={budgetCap} onChange={(event) => setBudgetCap(Number(event.target.value) || 0)} style={numberInput} />
        </label>
        <label style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
          Weight α
          <input type="number" step={1} min={0} max={20} value={alpha} onChange={(event) => setAlpha(Number(event.target.value))} style={numberInput} />
        </label>
      </section>

      <label style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', fontSize: '0.8rem', marginBottom: '1rem' }}>
        <input type="checkbox" checked={materialize} onChange={(event) => setMaterialize(event.target.checked)} />
        Write auto-accepted labels as <code style={{ fontSize: '0.76rem' }}>origin=ensemble</code> candidates (always pending review, never approved)
      </label>

      {votes && (
        <div className="card" style={{ padding: '0.7rem 0.85rem', marginBottom: '1rem', fontSize: '0.8rem' }}>
          <strong style={{ fontSize: '0.78rem' }}>Stored votes:</strong> {votes.total_votes} across{' '}
          {votes.models.length} model(s) · spend ${votes.total_cost_usd.toFixed(4)} ·{' '}
          {votes.ensemble_candidates_pending_review} ensemble candidate(s) pending review
          {votes.models.some((row) => row.failures > 0) && (
            <span style={{ color: 'var(--rose)' }}>
              {' '}· {votes.models.reduce((sum, row) => sum + row.failures, 0)} failed call(s)
            </span>
          )}
        </div>
      )}

      {audit && (
        <div className="card" style={{ padding: '0.75rem 0.9rem', marginBottom: '1rem', fontSize: '0.8rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.35rem' }}>
            <ClipboardCheck size={15} strokeWidth={1.9} />
            <strong>Audit plan</strong>
          </div>
          <div>
            {audit.population} ensemble candidate(s) · to certify {pct(audit.target_precision)} precision you need about{' '}
            <strong>{audit.recommended_size}</strong> human-audited labels.
          </div>
          <div style={{ color: 'var(--text-muted)', marginTop: '0.3rem' }}>{audit.note}</div>
        </div>
      )}

      {/* ---------------- results ---------------- */}
      {result && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {(correlatedFlagged || result.fanout.aborted_reason) && (
            <div className="card" style={{ borderColor: 'var(--rose)', padding: '0.75rem 0.9rem' }}>
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start' }}>
                <AlertTriangle size={17} strokeWidth={2} style={{ color: 'var(--rose)', flexShrink: 0, marginTop: 2 }} />
                <div style={{ fontSize: '0.82rem' }}>
                  {correlatedFlagged && (
                    <div>
                      <strong>Correlated-error audit flagged this run.</strong> The models fail together on the
                      same records, so agreement is not evidence. Nothing was auto-accepted; everything went to
                      human review.
                    </div>
                  )}
                  {result.fanout.aborted_reason && <div style={{ marginTop: '0.3rem' }}>{result.fanout.aborted_reason}</div>}
                </div>
              </div>
            </div>
          )}

          <section style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: '0.6rem' }}>
            {[
              { label: 'Records aggregated', value: String(result.records_aggregated) },
              { label: 'Gold pairs', value: String(result.gold_pairs) },
              { label: 'Model calls', value: `${result.fanout.calls_made} (${result.fanout.calls_reused} reused)` },
              { label: 'Cost / elapsed', value: `$${result.fanout.cost_usd.toFixed(4)} · ${result.fanout.elapsed_s.toFixed(1)}s` },
            ].map((card) => (
              <div key={card.label} className="card" style={{ padding: '0.6rem 0.75rem' }}>
                <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  {card.label}
                </div>
                <div style={{ fontSize: '0.95rem', fontWeight: 600 }}>{card.value}</div>
              </div>
            ))}
          </section>

          <section className="card" style={{ padding: '0.8rem 0.9rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
              <Gauge size={16} strokeWidth={1.9} />
              <strong style={{ fontSize: '0.85rem' }}>Aggregator comparison (macro-F1 measured on gold)</strong>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={th}>Strategy</th>
                  <th style={th}>Accuracy</th>
                  <th style={th}>Macro-F1</th>
                  <th style={th}>n</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(result.aggregator_scores).map(([name, score]) => (
                  <tr key={name}>
                    <td style={cell}>
                      {name}
                      {name === bestAggregator && <span className="badge badge-emerald" style={{ marginLeft: '0.4rem' }}>best</span>}
                    </td>
                    <td style={cell}>{pct(score.accuracy)}</td>
                    <td style={cell}>{score.macro_f1.toFixed(4)}</td>
                    <td style={cell}>{score.n}</td>
                  </tr>
                ))}
                {Object.entries(result.single_model_scores).map(([name, score]) => (
                  <tr key={name} style={{ color: 'var(--text-muted)' }}>
                    <td style={cell}>single · {name}</td>
                    <td style={cell}>{pct(score.accuracy)}</td>
                    <td style={cell}>{score.macro_f1.toFixed(4)}</td>
                    <td style={cell}>{score.n}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ fontSize: '0.78rem', marginTop: '0.45rem', color: 'var(--text-secondary)' }}>
              Lift over best single model ({result.best_single_model ?? 'n/a'}):{' '}
              <strong style={{ color: result.lift_over_best_single > 0 ? 'var(--emerald)' : 'var(--amber)' }}>
                {result.lift_over_best_single >= 0 ? '+' : ''}
                {(result.lift_over_best_single * 100).toFixed(2)} pts
              </strong>
              {result.optimistic && ' · thresholds fitted on the same gold half (optimistic)'}
            </div>
          </section>

          <section className="card" style={{ padding: '0.8rem 0.9rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
              <ShieldCheck size={16} strokeWidth={1.9} />
              <strong style={{ fontSize: '0.85rem' }}>Calibration & reliability weights</strong>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={th}>Model</th>
                  <th style={th}>Temperature</th>
                  <th style={th}>ECE raw → calibrated</th>
                  <th style={th}>Weight</th>
                </tr>
              </thead>
              <tbody>
                {result.calibration.map((row) => (
                  <tr key={row.model}>
                    <td style={cell}>{row.model}</td>
                    <td style={cell}>{row.temperature.toFixed(2)}</td>
                    <td style={cell}>
                      {row.ece_raw.toFixed(3)} → {row.ece_calibrated.toFixed(3)}
                      {row.ece_improvement > 0 && <span className="badge badge-emerald" style={{ marginLeft: '0.4rem' }}>−{(row.ece_improvement * 100).toFixed(0)}%</span>}
                    </td>
                    <td style={cell}>{pct(result.model_weights[row.model] ?? 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section className="card" style={{ padding: '0.8rem 0.9rem' }}>
            <strong style={{ fontSize: '0.85rem' }}>Precision band (target {pct(result.target_precision)})</strong>
            <div style={{ fontSize: '0.8rem', marginTop: '0.4rem', display: 'grid', gap: '0.2rem' }}>
              <div>
                Threshold τ = {overall ? overall.tau_hi.toFixed(3) : '—'} · accepted {overall?.accepted ?? 0} of{' '}
                {overall?.support ?? 0} · precision {pct(overall?.precision)} · Wilson lower bound{' '}
                <strong>{pct(overall?.wilson_low)}</strong>
              </div>
              <div>
                {overall?.met_target ? (
                  <span className="badge badge-emerald">target met on gold</span>
                ) : (
                  <span className="badge badge-amber">target not certifiable with this sample</span>
                )}
                <span style={{ marginLeft: '0.5rem' }}>
                  bands: auto-accept {result.band_counts.auto_accept ?? 0} · human review{' '}
                  {result.band_counts.human_review ?? 0} · reject {result.band_counts.reject ?? 0}
                </span>
              </div>
              {result.materialized_annotations > 0 && (
                <div style={{ color: 'var(--text-secondary)' }}>
                  {result.materialized_annotations} candidate label(s) written as{' '}
                  <code style={{ fontSize: '0.76rem' }}>origin=ensemble</code> · status pending review
                </div>
              )}
            </div>
          </section>

          <section className="card" style={{ padding: '0.8rem 0.9rem' }}>
            <strong style={{ fontSize: '0.85rem' }}>Correlated-error audit (pairwise φ)</strong>
            <div style={{ fontSize: '0.8rem', marginTop: '0.35rem', display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
              {Object.entries(result.correlated_error).length === 0 && <span>Not enough gold pairs to compute.</span>}
              {Object.entries(result.correlated_error).map(([pair, value]) => (
                <div key={pair} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  <code style={{ fontSize: '0.74rem' }}>{pair.replace('|', ' × ')}</code>
                  <strong style={{ color: value > 0.6 ? 'var(--rose)' : 'var(--text-primary)' }}>{value.toFixed(3)}</strong>
                  {value > 0.6 && <span className="badge badge-rose">fail together</span>}
                </div>
              ))}
              <div style={{ color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                Above 0.6 the models are treated as sharing blind spots and auto-accept is disabled entirely.
              </div>
            </div>
          </section>
        </div>
      )}

      {!result && !running && (
        <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', padding: '0.5rem 0' }}>
          Select up to three models and run a pass. The first run labels every record; re-runs reuse stored
          votes and cost nothing.
        </div>
      )}
    </ModalShell>
  );
};
