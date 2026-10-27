import React, { useState } from 'react';
import { FlipHorizontal, FlipVertical, RotateCw, Sparkles, CheckCircle2 } from 'lucide-react';
import { SpringButton } from './ui/SpringButton';
import { PerceptualProgressBar } from './ui/PerceptualProgressBar';

interface AugmentationModalProps {
  datasetId: string;
  isOpen: boolean;
  onClose: () => void;
  onAugmentationComplete?: () => void;
}

export const AugmentationModal: React.FC<AugmentationModalProps> = ({
  datasetId,
  isOpen,
  onClose,
  onAugmentationComplete,
}) => {
  const [transformType, setTransformType] = useState<'hflip' | 'vflip' | 'rot90_cw' | 'rot180'>('hflip');
  const [targetSplit, setTargetSplit] = useState<string>('train');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleApply = async () => {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch(`/api/v1/datasets/${datasetId}/augment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transform_type: transformType,
          target_split: targetSplit,
          seed: 42,
        }),
      });
      if (!res.ok) throw new Error('Augmentation pipeline execution failed');
      const data = await res.json();
      setResult(data);
      onAugmentationComplete?.();
    } catch (err: any) {
      setError(err.message || 'Augmentation failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-backdrop">
      <div className="modal-content" style={{ maxWidth: '640px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
          <div>
            <h2 style={{ fontSize: '1.35rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Sparkles size={20} strokeWidth={1.75} />
              Geometry-Aware Deterministic Augmentation
            </h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
              Simultaneously transforms image assets and spatial bounding boxes with origin tracking
            </p>
          </div>
          <button className="btn btn-secondary" onClick={onClose} style={{ padding: '0.35rem 0.75rem' }}>
            ✕
          </button>
        </div>

        {error && (
          <div style={{ padding: '0.75rem 1rem', background: 'rgba(239, 68, 68, 0.15)', border: '1px solid var(--rose)', borderRadius: 'var(--radius-md)', color: 'var(--rose)', marginBottom: '1rem', fontSize: '0.875rem' }}>
            {error}
          </div>
        )}

        {result ? (
          <div style={{ padding: '1.5rem', background: 'var(--bg-surface)', border: '1px solid var(--border-hairline)', borderRadius: 'var(--radius-md)', textAlign: 'center' }}>
            <CheckCircle2 size={40} style={{ color: 'var(--emerald)', margin: '0 auto 0.75rem' }} />
            <h3 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '0.25rem' }}>Augmentation Run Completed</h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '1rem' }}>
              Successfully generated <strong>{result.augmented_count}</strong> augmented samples with strictly transformed bounding boxes and assigned them to <code>{targetSplit}</code>.
            </p>
            <SpringButton variant="primary" onClick={onClose}>
              Done
            </SpringButton>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            {/* Transformation Selector */}
            <div>
              <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.5rem' }}>
                Select Geometric Affine Transformation
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.75rem' }}>
                {[
                  { id: 'hflip', label: 'Horizontal Mirror Flip', desc: 'Flips image left-to-right; x becomes W - x - w', icon: FlipHorizontal },
                  { id: 'vflip', label: 'Vertical Mirror Flip', desc: 'Flips top-to-bottom; y becomes H - y - h', icon: FlipVertical },
                  { id: 'rot90_cw', label: '90° Clockwise Rotation', desc: 'Rotates 90 deg clockwise; swaps axes', icon: RotateCw },
                  { id: 'rot180', label: '180° Inversion Rotation', desc: 'Inverts both horizontal and vertical axes', icon: RotateCw },
                ].map((item) => {
                  const Icon = item.icon;
                  const active = transformType === item.id;
                  return (
                    <div
                      key={item.id}
                      onClick={() => setTransformType(item.id as any)}
                      style={{
                        padding: '0.75rem',
                        borderRadius: 'var(--radius-sm)',
                        border: `1px solid ${active ? '#FAFAFA' : 'var(--border-hairline)'}`,
                        background: active ? 'var(--bg-elevated)' : 'var(--bg-surface)',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                        <Icon size={16} strokeWidth={1.75} />
                        <span style={{ fontWeight: 700, fontSize: '0.85rem' }}>{item.label}</span>
                      </div>
                      <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{item.desc}</p>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Target Split */}
            <div>
              <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.5rem' }}>
                Destination Split
              </label>
              <select
                className="input"
                value={targetSplit}
                onChange={(e) => setTargetSplit(e.target.value)}
                style={{ width: '100%' }}
              >
                <option value="train">Training (train)</option>
                <option value="val">Validation (val)</option>
                <option value="test">Testing (test)</option>
              </select>
            </div>

            {/* Safety Invariant Notice */}
            <div style={{ padding: '0.75rem', background: 'var(--bg-surface)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-hairline)', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              🛡️ <strong>Safety Guarantee:</strong> All resulting bounding boxes are clipped to valid boundaries. Degenerate boxes (&lt;5px) are purged. All output records are tagged with <code>origin="augmented"</code> and routed to <code>pending_review</code>.
            </div>

            {loading && (
              <PerceptualProgressBar active={loading} taskType="ingest" />
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
              <SpringButton variant="secondary" onClick={onClose} disabled={loading}>
                Cancel
              </SpringButton>
              <SpringButton variant="primary" onClick={handleApply} disabled={loading}>
                {loading ? 'Transforming Dataset Records...' : '🚀 Execute Augmentation Run'}
              </SpringButton>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
