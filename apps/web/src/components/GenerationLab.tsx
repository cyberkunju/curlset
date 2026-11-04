import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, FlaskConical, Play, RefreshCw, ShieldCheck } from 'lucide-react';
import { ModalShell } from './ui/ModalShell';
import { SpringButton } from './ui/SpringButton';
import { fetchProviders, runGatedGeneration } from '../api';
import type { GatedGenerationResponse } from '../types';

interface GenerationLabProps {
  isOpen: boolean;
  onClose: () => void;
  datasetId: string;
  onApplied?: () => void;
}

interface ProviderInfo {
  name: string;
  models: string[];
  capabilities: string[];
}

const MAX_VERIFIERS = 3;

const cell: React.CSSProperties = {
  padding: '0.4rem 0.55rem',
  borderBottom: '1px solid var(--border-hairline)',
  fontSize: '0.8rem',
  textAlign: 'left',
};

const field: React.CSSProperties = {
  width: '100%',
  padding: '0.4rem 0.55rem',
  fontSize: '0.82rem',
  borderRadius: 'var(--radius-sm)',
  border: '1px solid var(--border-hairline)',
  backgroundColor: 'var(--bg-base)',
  color: 'var(--text-primary)',
};

const pct = (value: number): string => `${(value * 100).toFixed(1)}%`;

/**
 * Gated Generation Lab.
 *
 * Synthetic data is only useful if it cannot poison the dataset. This panel makes the admission
 * rules explicit: an independent verifier must agree with each sample's intended label, the batch
 * must not look like template collapse, and a batch that fails any check writes *nothing*.
 * Accepted records are stored as `origin=synthetic` / `pending_review` — never approved.
 */
export const GenerationLab: React.FC<GenerationLabProps> = ({ isOpen, onClose, datasetId, onApplied }) => {
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [generator, setGenerator] = useState<{ provider: string; model: string } | null>(null);
  const [verifiers, setVerifiers] = useState<Array<{ provider: string; model: string }>>([]);
  const [perClass, setPerClass] = useState(6);
  const [split, setSplit] = useState('train');
  const [maxClassShare, setMaxClassShare] = useState(0.5);
  const [minPreservation, setMinPreservation] = useState(0.9);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<GatedGenerationResponse | null>(null);

  const generators = useMemo(
    () => providers.filter((provider) => provider.capabilities.includes('text_generation')),
    [providers],
  );
  const classifierProviders = useMemo(
    () => providers.filter((provider) => provider.capabilities.includes('text_classification')),
    [providers],
  );

  const loadProviders = useCallback(async () => {
    try {
      const rows = await fetchProviders();
      const mapped: ProviderInfo[] = (rows || []).map((row: any) => ({
        name: String(row?.name ?? ''),
        models: Array.isArray(row?.models) ? row.models.map(String) : [],
        capabilities: Array.isArray(row?.capabilities) ? row.capabilities.map(String) : [],
      }));
      setProviders(mapped);
      setGenerator((current) => {
        if (current) return current;
        const first = mapped.find((provider) => provider.capabilities.includes('text_generation'));
        return first && first.models[0] ? { provider: first.name, model: first.models[0] } : null;
      });
      setVerifiers((current) => {
        if (current.length > 0) return current;
        return mapped
          .filter((provider) => provider.capabilities.includes('text_classification'))
          .slice(0, MAX_VERIFIERS)
          .map((provider) => ({ provider: provider.name, model: provider.models[0] }))
          .filter((entry) => Boolean(entry.model));
      });
    } catch (err: any) {
      setError(err?.message || 'Failed to load providers');
    }
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    void loadProviders();
  }, [isOpen, loadProviders]);

  const toggleVerifier = (entry: { provider: string; model: string }) => {
    setVerifiers((current) => {
      const exists = current.some((item) => item.provider === entry.provider && item.model === entry.model);
      if (exists) return current.filter((item) => !(item.provider === entry.provider && item.model === entry.model));
      if (current.length >= MAX_VERIFIERS) return current;
      return [...current, entry];
    });
  };

  const isVerifier = (entry: { provider: string; model: string }) =>
    verifiers.some((item) => item.provider === entry.provider && item.model === entry.model);

  const handleRun = async () => {
    if (!generator) {
      setError('Select a generation provider (one that advertises text_generation).');
      return;
    }
    if (verifiers.length === 0) {
      setError('At least one independent verifier is required — the pipeline refuses unverified data.');
      return;
    }
    setRunning(true);
    setError(null);
    try {
      const response: GatedGenerationResponse = await runGatedGeneration(datasetId, {
        provider: generator.provider,
        model: generator.model,
        verifier_providers: verifiers,
        per_class: perClass,
        target_split: split,
        max_class_share: maxClassShare,
        min_label_preservation: minPreservation,
      });
      setResult(response);
      if (response.verdict === 'accept' && response.accepted > 0 && onApplied) onApplied();
    } catch (err: any) {
      setError(err?.message || 'Generation run failed');
    } finally {
      setRunning(false);
    }
  };

  return (
    <ModalShell
      isOpen={isOpen}
      onClose={onClose}
      size="lg"
      icon={<FlaskConical size={20} strokeWidth={1.75} />}
      title="Gated Generation"
      description="Synthetic samples are admitted only when the whole batch passes the diversity and label-preservation checks. A failing batch writes nothing."
      footer={
        <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center', width: '100%' }}>
          <div style={{ flex: 1 }} />
          <SpringButton variant="secondary" size="sm" onClick={onClose}>
            Close
          </SpringButton>
          <SpringButton
            variant="primary"
            size="sm"
            onClick={handleRun}
            disabled={running || !generator || verifiers.length === 0}
            icon={running ? <RefreshCw size={14} /> : <Play size={14} />}
          >
            {running ? 'Generating…' : 'Generate & gate'}
          </SpringButton>
        </div>
      }
    >
      {error && (
        <div className="card" style={{ borderColor: 'var(--rose)', padding: '0.7rem 0.85rem', marginBottom: '0.9rem' }}>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start' }}>
            <AlertTriangle size={16} strokeWidth={1.9} style={{ color: 'var(--rose)', flexShrink: 0, marginTop: 2 }} />
            <div style={{ fontSize: '0.82rem' }}>{error}</div>
          </div>
        </div>
      )}

      <section style={{ marginBottom: '1rem' }}>
        <h3 style={{ fontSize: '0.85rem', margin: '0 0 0.4rem', color: 'var(--text-secondary)' }}>
          1. Generator
        </h3>
        <select
          value={generator ? `${generator.provider}::${generator.model}` : ''}
          onChange={(event) => {
            const [provider, model] = event.target.value.split('::');
            setGenerator(provider && model ? { provider, model } : null);
          }}
          style={field}
        >
          <option value="">Select a generator…</option>
          {generators.flatMap((provider) =>
            provider.models.map((model) => (
              <option key={`${provider.name}::${model}`} value={`${provider.name}::${model}`}>
                {provider.name} · {model}
              </option>
            )),
          )}
        </select>
        {generators.length === 0 && (
          <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '0.3rem' }}>
            No provider advertises <code>text_generation</code>. In development set
            <code> ALLOW_SIMULATED_PROVIDERS=true</code> to use the simulated experts.
          </div>
        )}
      </section>

      <section style={{ marginBottom: '1rem' }}>
        <h3 style={{ fontSize: '0.85rem', margin: '0 0 0.4rem', color: 'var(--text-secondary)' }}>
          2. Independent verifiers ({verifiers.length}/{MAX_VERIFIERS})
        </h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
          {classifierProviders.length === 0 && (
            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>No classifier providers.</div>
          )}
          {classifierProviders.map((provider) => (
            <div key={provider.name} style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', alignItems: 'center' }}>
              <span className="badge badge-neutral" style={{ textTransform: 'none' }}>{provider.name}</span>
              {provider.models.slice(0, 4).map((model) => {
                const entry = { provider: provider.name, model };
                const active = isVerifier(entry);
                const disabled = !active && verifiers.length >= MAX_VERIFIERS;
                return (
                  <button
                    key={`${provider.name}:${model}`}
                    type="button"
                    onClick={() => toggleVerifier(entry)}
                    disabled={disabled}
                    style={{
                      fontSize: '0.75rem',
                      padding: '0.22rem 0.5rem',
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

      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: '0.6rem', marginBottom: '1rem' }}>
        <label style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
          Samples / class
          <input type="number" min={1} max={100} value={perClass}
                 onChange={(event) => setPerClass(Number(event.target.value) || 1)} style={field} />
        </label>
        <label style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
          Target split
          <select value={split} onChange={(event) => setSplit(event.target.value)} style={field}>
            <option value="train">train</option>
            <option value="val">val</option>
            <option value="test">test</option>
          </select>
        </label>
        <label style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
          Max class share
          <input type="number" step={0.05} min={0.05} max={1} value={maxClassShare}
                 onChange={(event) => setMaxClassShare(Number(event.target.value) || 0.5)} style={field} />
        </label>
        <label style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
          Min label preservation
          <input type="number" step={0.05} min={0.1} max={1} value={minPreservation}
                 onChange={(event) => setMinPreservation(Number(event.target.value) || 0.9)} style={field} />
        </label>
      </section>

      {result && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
          <div
            className="card"
            style={{ borderColor: result.verdict === 'accept' ? 'var(--emerald)' : 'var(--rose)', padding: '0.8rem 0.9rem' }}
          >
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start' }}>
              {result.verdict === 'accept' ? (
                <CheckCircle2 size={17} strokeWidth={2} style={{ color: 'var(--emerald)', flexShrink: 0, marginTop: 2 }} />
              ) : (
                <AlertTriangle size={17} strokeWidth={2} style={{ color: 'var(--rose)', flexShrink: 0, marginTop: 2 }} />
              )}
              <div style={{ fontSize: '0.84rem' }}>
                <strong>
                  {result.verdict === 'accept'
                    ? `Batch admitted — ${result.accepted} record(s) added`
                    : 'Batch rejected — no records were written'}
                </strong>
                {result.rejection_reasons.length > 0 && (
                  <ul style={{ margin: '0.35rem 0 0 1rem', padding: 0 }}>
                    {result.rejection_reasons.map((reason) => (
                      <li key={reason}>{reason}</li>
                    ))}
                  </ul>
                )}
                {result.verdict === 'accept' && (
                  <div style={{ marginTop: '0.3rem', color: 'var(--text-secondary)' }}>
                    Stored as <code>origin=synthetic</code> · status pending review · never auto-approved
                  </div>
                )}
              </div>
            </div>
          </div>

          <section className="card" style={{ padding: '0.8rem 0.9rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.4rem' }}>
              <ShieldCheck size={16} strokeWidth={1.9} />
              <strong style={{ fontSize: '0.85rem' }}>Gate measurements</strong>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <tbody>
                <tr>
                  <td style={cell}>Generated</td>
                  <td style={cell}>{result.generated}</td>
                  <td style={cell}>Passed diversity filters</td>
                  <td style={cell}>{result.passed_filters}</td>
                </tr>
                <tr>
                  <td style={cell}>Label preservation</td>
                  <td style={cell}>{pct(result.label_preservation)}</td>
                  <td style={cell}>Batch trigram diversity</td>
                  <td style={cell}>{result.batch_unique_trigram_ratio.toFixed(3)}</td>
                </tr>
                <tr>
                  <td style={cell}>Admitted</td>
                  <td style={cell}>{result.accepted}</td>
                  <td style={cell}>Collapse flagged</td>
                  <td style={cell}>{result.collapsed ? 'yes' : 'no'}</td>
                </tr>
              </tbody>
            </table>
            {Object.keys(result.rejection_breakdown).length > 0 && (
              <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '0.4rem' }}>
                Filter rejections: {Object.entries(result.rejection_breakdown)
                  .map(([reason, count]) => `${reason} (${count})`)
                  .join(' · ')}
              </div>
            )}
            {Object.keys(result.class_counts_after).length > 0 && (
              <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '0.3rem' }}>
                Class counts after: {Object.entries(result.class_counts_after)
                  .map(([label, count]) => `${label}=${count}`)
                  .join(' · ')}
              </div>
            )}
          </section>
        </div>
      )}

      {!result && !running && (
        <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', padding: '0.4rem 0' }}>
          Pick a generator and at least one independent verifier. Generation, the diversity gate and the
          verifier check all run server-side; this panel only displays the decision.
        </div>
      )}
    </ModalShell>
  );
};
