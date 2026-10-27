import React, { useEffect, useState } from 'react';
import { Bot, CheckCircle2, Lock, X } from 'lucide-react';
import { fetchProviders, triggerAIAnnotation } from '../api';
import { PerceptualProgressBar } from './ui/PerceptualProgressBar';
import { SpringButton } from './ui/SpringButton';
import { CustomSelect } from './ui/CustomSelect';

interface AIAnnotationModalProps {
  datasetId: string;
  isOpen: boolean;
  onClose: () => void;
  onRunComplete: () => void;
}

export const AIAnnotationModal: React.FC<AIAnnotationModalProps> = ({
  datasetId,
  isOpen,
  onClose,
  onRunComplete,
}) => {
  const [providers, setProviders] = useState<any[]>([]);
  const [selectedProvider, setSelectedProvider] = useState('fake');
  const [selectedModel, setSelectedModel] = useState('fake-classifier-v1');
  const [targetSplit, setTargetSplit] = useState<string>('');
  const [onlyUnannotated, setOnlyUnannotated] = useState(true);
  const [limit, setLimit] = useState(50);
  const [enableConsensus, setEnableConsensus] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [runResult, setRunResult] = useState<any | null>(null);

  useEffect(() => {
    if (isOpen) {
      setRunResult(null);
      setError(null);
      fetchProviders()
        .then((data) => {
          setProviders(data);
          if (data.length > 0) {
            setSelectedProvider(data[0].name);
            if (data[0].models?.length > 0) {
              setSelectedModel(data[0].models[0]);
            }
          }
        })
        .catch((err) => setError(err.message));
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const currentProviderObj = providers.find((p) => p.name === selectedProvider);
  const availableModels = currentProviderObj?.models || ['default-model'];

  const handleStartInference = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const result = await triggerAIAnnotation(datasetId, {
        provider: selectedProvider,
        model: selectedModel,
        target_split: targetSplit || undefined,
        only_unannotated: onlyUnannotated,
        limit,
        enable_consensus: enableConsensus,
      });
      setRunResult(result);
      onRunComplete();
    } catch (err: any) {
      setError(err.message || 'AI annotation run failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" style={{ maxWidth: '580px' }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <Bot size={22} className="text-blue-500" />
            <h2 style={{ fontSize: '1.25rem', fontWeight: 800 }}>AI Model Assisted Annotation</h2>
          </div>
          <button
            onClick={onClose}
            aria-label="Close dialog"
            style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', fontSize: '1.25rem', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
          >
            <X size={18} />
          </button>
        </div>

        {runResult ? (
          <div>
            <div
              style={{
                background: 'rgba(16, 185, 129, 0.1)',
                border: '1px solid rgba(16, 185, 129, 0.3)',
                padding: '1.25rem',
                borderRadius: 'var(--radius-md)',
                marginBottom: '1.5rem',
              }}
            >
              <h3 style={{ color: 'var(--emerald)', fontSize: '1.1rem', fontWeight: 700, marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <CheckCircle2 size={18} /> AI Annotation Batch Completed
              </h3>
              <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginBottom: '0.75rem' }}>
                All generated model outputs have been registered as <strong>pending review</strong> proposals.
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem', textAlign: 'center' }}>
                <div style={{ background: 'rgba(15, 23, 42, 0.6)', padding: '0.5rem', borderRadius: 'var(--radius-sm)' }}>
                  <div style={{ fontSize: '1.2rem', fontWeight: 700 }}>{runResult.total_items}</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Target Items</div>
                </div>
                <div style={{ background: 'rgba(15, 23, 42, 0.6)', padding: '0.5rem', borderRadius: 'var(--radius-sm)' }}>
                  <div style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--emerald)' }}>{runResult.processed_items}</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Proposals Created</div>
                </div>
                <div style={{ background: 'rgba(15, 23, 42, 0.6)', padding: '0.5rem', borderRadius: 'var(--radius-sm)' }}>
                  <div style={{ fontSize: '1.2rem', fontWeight: 700, color: runResult.failed_items > 0 ? 'var(--rose)' : 'var(--text-secondary)' }}>
                    {runResult.failed_items}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Failed Items</div>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
              <button className="btn btn-primary" onClick={onClose}>
                Go to Annotation Workspace to Review
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleStartInference}>
            {error && (
              <div
                style={{
                  background: 'rgba(239, 68, 68, 0.1)',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                  color: 'var(--rose)',
                  padding: '0.75rem',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: '0.85rem',
                  marginBottom: '1rem',
                }}
              >
                {error}
              </div>
            )}

            <div
              style={{
                background: 'rgba(99, 102, 241, 0.08)',
                border: '1px solid rgba(99, 102, 241, 0.2)',
                padding: '0.85rem',
                borderRadius: 'var(--radius-sm)',
                marginBottom: '1.25rem',
                fontSize: '0.85rem',
                color: 'var(--text-secondary)',
                lineHeight: 1.5,
                display: 'flex',
                alignItems: 'flex-start',
                gap: '0.5rem',
              }}
            >
              <Lock size={15} style={{ flexShrink: 0, marginTop: '2px', color: 'var(--accent-interactive)' }} />
              <div>
                <strong>Review Policy:</strong> Model proposals are created with status <code style={{ color: 'var(--text-accent)' }}>pending_review</code> and require human verification before inclusion.
              </div>
            </div>

            <div className="form-group" style={{ marginBottom: '1rem' }}>
              <label className="label">Inference Provider</label>
              <CustomSelect
                value={selectedProvider}
                onChange={(val) => {
                  setSelectedProvider(val);
                  const p = providers.find((prov) => prov.name === val);
                  if (p?.models?.length > 0) setSelectedModel(p.models[0]);
                }}
                options={providers.map((p) => ({
                  value: p.name,
                  label: p.name === 'fake' ? 'Local Deterministic Provider (Offline)' : p.name.toUpperCase(),
                }))}
                style={{ width: '100%' }}
                ariaLabel="Select inference provider"
              />
            </div>

            <div className="form-group" style={{ marginBottom: '1rem' }}>
              <label className="label">Model Identifier</label>
              <CustomSelect
                value={selectedModel}
                onChange={(val) => setSelectedModel(val)}
                options={availableModels.map((m: string) => ({
                  value: m,
                  label: m,
                }))}
                style={{ width: '100%' }}
                ariaLabel="Select model identifier"
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
              <div className="form-group">
                <label className="label">Target Split</label>
                <CustomSelect
                  value={targetSplit}
                  onChange={(val) => setTargetSplit(val)}
                  options={[
                    { value: '', label: 'All Splits' },
                    { value: 'train', label: 'Train' },
                    { value: 'val', label: 'Val' },
                    { value: 'test', label: 'Test' },
                  ]}
                  style={{ width: '100%' }}
                  ariaLabel="Select target split"
                />
              </div>

              <div className="form-group">
                <label className="label">Batch Limit</label>
                <input
                  type="number"
                  className="input"
                  min={1}
                  max={200}
                  value={limit}
                  onChange={(e) => setLimit(parseInt(e.target.value, 10) || 1)}
                />
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', marginBottom: '1.5rem' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.85rem' }}>
                <input
                  type="checkbox"
                  checked={onlyUnannotated}
                  onChange={(e) => setOnlyUnannotated(e.target.checked)}
                />
                <span>Only annotate records with no existing labels</span>
              </label>

              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.85rem' }}>
                <input
                  type="checkbox"
                  checked={enableConsensus}
                  onChange={(e) => setEnableConsensus(e.target.checked)}
                />
                <span>Enable Consensus Verifier (Dual-Pass Agreement Score)</span>
              </label>
            </div>

            {loading && (
              <div style={{ marginBottom: '1.25rem' }}>
                <PerceptualProgressBar active={loading} taskType="annotate" />
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
              <SpringButton type="button" variant="secondary" onClick={onClose} disabled={loading}>
                Cancel
              </SpringButton>
              <SpringButton type="submit" variant="primary" disabled={loading}>
                {loading ? 'Running Inference...' : 'Start AI Inference'}
              </SpringButton>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
