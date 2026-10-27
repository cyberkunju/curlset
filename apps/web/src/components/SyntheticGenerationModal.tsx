import React, { useState, useEffect } from 'react';
import { Sparkles, ShieldCheck, CheckCircle2, X } from 'lucide-react';
import { triggerSyntheticGeneration, fetchSyntheticLineage } from '../api';
import { PerceptualProgressBar } from './ui/PerceptualProgressBar';
import { SpringButton } from './ui/SpringButton';

interface SyntheticGenerationModalProps {
  datasetId: string;
  labels: string[];
  isOpen: boolean;
  onClose: () => void;
  onGenerationComplete?: () => void;
}

export const SyntheticGenerationModal: React.FC<SyntheticGenerationModalProps> = ({
  datasetId,
  labels,
  isOpen,
  onClose,
  onGenerationComplete,
}) => {
  const [targetClass, setTargetClass] = useState<string>(labels[0] || 'positive');
  const [count, setCount] = useState<number>(5);
  const [promptTemplate, setPromptTemplate] = useState<string>(
    'Generate realistic training examples for class: {class_name}'
  );
  const [templateVersion, setTemplateVersion] = useState<string>('v1.0');
  const [seed, setSeed] = useState<number>(42);
  const [split, setSplit] = useState<string>('train');
  const [isGenerating, setIsGenerating] = useState(false);
  const [lineageData, setLineageData] = useState<any>(null);
  const [lastResult, setLastResult] = useState<any>(null);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    if (labels.length > 0 && !labels.includes(targetClass)) {
      setTargetClass(labels[0]);
    }
  }, [labels]);

  useEffect(() => {
    if (isOpen) {
      loadLineage();
      setFeedback(null);
      setLastResult(null);
    }
  }, [isOpen, datasetId]);

  if (!isOpen) return null;

  const loadLineage = async () => {
    try {
      const data = await fetchSyntheticLineage(datasetId);
      setLineageData(data);
    } catch (err: any) {
      // Quietly ignore or log
    }
  };

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsGenerating(true);
    setFeedback(null);
    setLastResult(null);

    try {
      const res = await triggerSyntheticGeneration(datasetId, {
        target_class: targetClass,
        count: Number(count),
        prompt_template: promptTemplate,
        template_version: templateVersion,
        seed: Number(seed),
        split,
      });
      setLastResult(res);
      setFeedback({
        type: 'success',
        text: `Generated ${res.accepted_count} candidate records (${res.duplicate_count} duplicate(s) rejected). Routed to Pending Review.`,
      });
      await loadLineage();
      if (onGenerationComplete) onGenerationComplete();
    } catch (err: any) {
      setFeedback({
        type: 'error',
        text: err.message || 'Synthetic generation run failed.',
      });
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="modal-backdrop">
      <div className="modal-card" style={{ maxWidth: '820px', width: '92vw', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <Sparkles size={22} className="text-blue-500" />
            <div>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 800 }}>Synthetic Data Generation & Lineage</h2>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                Generate minority-class samples with versioned prompts, duplicate rejection, and review gating.
              </p>
            </div>
          </div>
          <button className="btn btn-secondary" onClick={onClose} aria-label="Close dialog" style={{ padding: '0.35rem 0.5rem', display: 'flex', alignItems: 'center' }}>
            <X size={18} />
          </button>
        </div>

        {/* Regulatory & Integrity Notice */}
        <div style={{
          padding: '0.75rem 1rem',
          borderRadius: 'var(--radius-sm)',
          background: 'var(--bg-elevated)',
          border: '1px solid var(--border-hairline)',
          color: 'var(--text-secondary)',
          fontSize: '0.8rem',
          lineHeight: '1.4',
          marginBottom: '1rem',
          display: 'flex',
          gap: '0.5rem',
          alignItems: 'flex-start',
        }}>
          <ShieldCheck size={16} style={{ color: 'var(--accent-interactive)', flexShrink: 0, marginTop: '2px' }} />
          <div>
            <strong style={{ color: 'var(--text-primary)' }}>Integrity Policy:</strong> Synthetic records are never confused with real samples.
            Every sample is tagged <code>origin: synthetic</code>, linked to its prompt version and seed,
            and routed to <code>PENDING_REVIEW</code> by default.
          </div>
        </div>

        {/* Proportion Stat Badges */}
        {lineageData && (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: '0.75rem',
            marginBottom: '1rem',
          }}>
            <div className="stat-card" style={{ padding: '0.75rem' }}>
              <span className="stat-value" style={{ fontSize: '1.25rem' }}>{lineageData.total_records}</span>
              <span className="stat-label" style={{ fontSize: '0.75rem' }}>Total Records</span>
            </div>
            <div className="stat-card" style={{ padding: '0.75rem' }}>
              <span className="stat-value" style={{ fontSize: '1.25rem', color: 'var(--emerald)' }}>{lineageData.real_records}</span>
              <span className="stat-label" style={{ fontSize: '0.75rem' }}>Real Records</span>
            </div>
            <div className="stat-card" style={{ padding: '0.75rem' }}>
              <span className="stat-value" style={{ fontSize: '1.25rem', color: 'var(--accent-interactive)' }}>{lineageData.synthetic_records}</span>
              <span className="stat-label" style={{ fontSize: '0.75rem' }}>Synthetic Records</span>
            </div>
            <div className="stat-card" style={{ padding: '0.75rem' }}>
              <span className="stat-value" style={{ fontSize: '1.25rem', color: 'var(--cyan)' }}>
                {(lineageData.synthetic_ratio * 100).toFixed(1)}%
              </span>
              <span className="stat-label" style={{ fontSize: '0.75rem' }}>Synthetic Ratio</span>
            </div>
          </div>
        )}

        {feedback && (
          <div style={{
            padding: '0.75rem 1rem',
            borderRadius: 'var(--radius-sm)',
            marginBottom: '1rem',
            background: feedback.type === 'success' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
            border: `1px solid ${feedback.type === 'success' ? 'var(--emerald)' : 'var(--rose)'}`,
            color: feedback.type === 'success' ? 'var(--emerald)' : 'var(--rose)',
            fontSize: '0.85rem',
          }}>
            {feedback.text}
          </div>
        )}

        {/* Form and Run History */}
        <div style={{ flex: 1, overflowY: 'auto', paddingRight: '0.5rem' }}>
          <form onSubmit={handleGenerate}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.3rem' }}>
                  Target Minority Class
                </label>
                <select
                  className="input-text"
                  value={targetClass}
                  onChange={(e) => setTargetClass(e.target.value)}
                  style={{ width: '100%', fontSize: '0.85rem' }}
                >
                  {labels.map((lbl) => (
                    <option key={lbl} value={lbl}>
                      {lbl}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.3rem' }}>
                  Sample Count (Bounded 1-50)
                </label>
                <input
                  type="number"
                  className="input-text"
                  min="1"
                  max="50"
                  value={count}
                  onChange={(e) => setCount(Math.max(1, Math.min(50, parseInt(e.target.value) || 1)))}
                  style={{ width: '100%', fontSize: '0.85rem' }}
                  required
                />
              </div>
            </div>

            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.3rem' }}>
                Prompt Template (with <code>{'{class_name}'}</code> variable)
              </label>
              <textarea
                className="input-text"
                rows={2}
                value={promptTemplate}
                onChange={(e) => setPromptTemplate(e.target.value)}
                style={{ width: '100%', fontSize: '0.85rem', fontFamily: 'var(--font-mono)' }}
                required
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem', marginBottom: '1.25rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.3rem' }}>
                  Template Version
                </label>
                <input
                  type="text"
                  className="input-text"
                  value={templateVersion}
                  onChange={(e) => setTemplateVersion(e.target.value)}
                  style={{ width: '100%', fontSize: '0.85rem' }}
                  required
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.3rem' }}>
                  Random Seed (Reproducibility)
                </label>
                <input
                  type="number"
                  className="input-text"
                  value={seed}
                  onChange={(e) => setSeed(parseInt(e.target.value) || 0)}
                  style={{ width: '100%', fontSize: '0.85rem' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.3rem' }}>
                  Destination Split
                </label>
                <select
                  className="input-text"
                  value={split}
                  onChange={(e) => setSplit(e.target.value)}
                  style={{ width: '100%', fontSize: '0.85rem' }}
                >
                  <option value="train">train</option>
                  <option value="validation">validation</option>
                  <option value="test">test</option>
                </select>
              </div>
            </div>

            {isGenerating && (
              <div style={{ marginBottom: '1.25rem' }}>
                <PerceptualProgressBar active={isGenerating} taskType="synthesize" />
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginBottom: '1.5rem' }}>
              <SpringButton type="button" variant="secondary" onClick={onClose} disabled={isGenerating}>
                Cancel
              </SpringButton>
              <SpringButton type="submit" variant="primary" disabled={isGenerating}>
                {isGenerating ? 'Synthesizing Samples...' : `Generate ${count} Synthetic Samples`}
              </SpringButton>
            </div>
          </form>

          {lastResult && (
            <div className="card" style={{ padding: '1rem', border: '1px solid var(--border-subtle)', marginBottom: '1.5rem' }}>
              <h4 style={{ fontSize: '0.9rem', fontWeight: 700, marginBottom: '0.5rem', color: 'var(--emerald)', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                <CheckCircle2 size={15} /> Last Run Summary ({lastResult.run_id})
              </h4>
              <div style={{ fontSize: '0.8rem', lineHeight: '1.5' }}>
                <div><strong>Target Class:</strong> {lastResult.target_class}</div>
                <div><strong>Requested:</strong> {lastResult.requested_count} | <strong>Accepted:</strong> {lastResult.accepted_count} | <strong>Duplicates Dropped:</strong> {lastResult.duplicate_count}</div>
                <div><strong>Model:</strong> {lastResult.lineage.provider}/{lastResult.lineage.model} (Config: {lastResult.lineage.template_version})</div>
              </div>
            </div>
          )}

          {/* Past Synthesis Runs Table */}
          {lineageData && lineageData.runs && lineageData.runs.length > 0 && (
            <div>
              <h4 style={{ fontSize: '0.95rem', fontWeight: 700, marginBottom: '0.75rem' }}>
                Historical Generation Runs ({lineageData.runs.length})
              </h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {lineageData.runs.map((r: any) => (
                  <div key={r.run_id} className="card" style={{ padding: '0.75rem', fontSize: '0.8rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <span style={{ fontWeight: 700 }}>Run: <code>{r.run_id}</code></span>
                        <span className="badge badge-blue" style={{ marginLeft: '0.5rem' }}>{r.status}</span>
                      </div>
                      <span style={{ color: 'var(--text-muted)' }}>{r.created_at ? new Date(r.created_at).toLocaleString() : ''}</span>
                    </div>
                    <div style={{ marginTop: '0.35rem', color: 'var(--text-secondary)' }}>
                      Provider: {r.provider} | Model: {r.model} | Target: {r.configuration?.target_class} ({r.configuration?.count} samples)
                    </div>
                    {r.metrics && (
                      <div style={{ marginTop: '0.2rem', color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                        Accepted: {r.metrics.accepted} | Duplicates Filtered: {r.metrics.duplicates_dropped}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
