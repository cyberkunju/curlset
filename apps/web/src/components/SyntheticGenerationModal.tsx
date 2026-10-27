import React, { useState, useEffect, useMemo } from 'react';
import { Sparkles, ShieldCheck, CheckCircle2, AlertTriangle, Code2, X, ArrowRight } from 'lucide-react';
import { triggerSyntheticGeneration, fetchSyntheticLineage } from '../api';
import { PerceptualProgressBar } from './ui/PerceptualProgressBar';
import { SpringButton } from './ui/SpringButton';
import { CustomSelect } from './ui/CustomSelect';

export interface SyntheticGenerationModalProps {
  datasetId: string;
  labels: string[];
  taskType?: string;
  labelSchema?: Record<string, any>;
  isOpen: boolean;
  onClose: () => void;
  onGenerationComplete?: () => void;
  onOpenWorkspace?: () => void;
}

export const SyntheticGenerationModal: React.FC<SyntheticGenerationModalProps> = ({
  datasetId,
  labels,
  taskType = 'image_classification',
  labelSchema,
  isOpen,
  onClose,
  onGenerationComplete,
  onOpenWorkspace,
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
    } catch {
      // Lineage may be unavailable if no synthesis runs yet
      setLineageData(null);
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
        text: `Successfully synthesized ${res.accepted_count} candidate record(s) (${res.duplicate_count} duplicate(s) rejected). Routed to Pending Review.`,
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

  // Schema matching status
  const isClassInSchema = labels.length === 0 || labels.includes(targetClass);

  // Honest illustrative task schema preview derived from task type and form state
  const schemaPreview = useMemo(() => {
    const previewPayload: Record<string, any> = {
      task_type: taskType,
      origin: 'synthetic',
      review_status: 'pending_review',
      target_class: targetClass || '<unspecified_target_class>',
      provenance: {
        prompt_template: promptTemplate,
        template_version: templateVersion,
        seed: Number(seed),
        target_split: split,
      },
      payload: {},
    };

    if (taskType === 'text_classification') {
      previewPayload.payload = {
        label: targetClass || '<target_class>',
        text: `[Synthesized text output for class: ${targetClass || 'sample'}]`,
      };
    } else if (taskType === 'image_classification') {
      previewPayload.payload = {
        label: targetClass || '<target_class>',
        notes: `[Synthesized sample metadata for class: ${targetClass || 'sample'}]`,
      };
    } else if (taskType === 'object_detection') {
      previewPayload.payload = {
        boxes: [
          {
            label: targetClass || '<target_class>',
            x: '<norm_x_min_0.0_to_1.0>',
            y: '<norm_y_min_0.0_to_1.0>',
            width: '<norm_width_0.0_to_1.0>',
            height: '<norm_height_0.0_to_1.0>',
          },
        ],
      };
    } else if (taskType === 'audio_transcription') {
      previewPayload.payload = {
        text: `[Synthesized audio transcript for ${targetClass || 'sample'}]`,
        language: 'en',
      };
      previewPayload.media_note =
        'Acoustic synthesis requires audio processing pipeline; generation produces transcript and metadata only.';
    } else if (taskType === 'document_ocr') {
      previewPayload.payload = {
        text: `[Synthesized document text for ${targetClass || 'sample'}]`,
        words: [],
      };
      previewPayload.media_note =
        'Document image rendering requires visual OCR asset pipeline; generation produces structured text only.';
    } else {
      previewPayload.payload = {
        label: targetClass || '<target_class>',
      };
    }

    return JSON.stringify(previewPayload, null, 2);
  }, [targetClass, taskType, promptTemplate, templateVersion, seed, split]);

  const realRecords = lineageData?.real_records ?? 0;
  const synthRecords = lineageData?.synthetic_records ?? 0;
  const totalRecords = lineageData?.total_records ?? realRecords + synthRecords;
  const realPct = totalRecords > 0 ? (realRecords / totalRecords) * 100 : 100;
  const synthPct = totalRecords > 0 ? (synthRecords / totalRecords) * 100 : 0;

  return (
    <div className="modal-backdrop" onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="synth-modal-title">
      <div
        className="modal-card"
        style={{ maxWidth: '840px', width: '94vw', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
            <Sparkles size={20} strokeWidth={1.75} style={{ color: 'var(--accent-interactive)' }} />
            <div>
              <h2 id="synth-modal-title" style={{ fontSize: '1.2rem', fontWeight: 700 }}>
                Synthetic Data Generation & Lineage
              </h2>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', marginTop: '0.15rem' }}>
                Augment minority classes with versioned prompt templates, deduplication, and mandatory review routing
              </p>
            </div>
          </div>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={onClose}
            aria-label="Close dialog"
            style={{ padding: '0.35rem 0.5rem', display: 'flex', alignItems: 'center' }}
          >
            <X size={18} strokeWidth={1.75} />
          </button>
        </div>

        {/* Regulatory & Provenance Notice */}
        <div
          style={{
            padding: '0.65rem 0.85rem',
            borderRadius: 'var(--radius-sm)',
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border-hairline)',
            color: 'var(--text-secondary)',
            fontSize: '0.78rem',
            lineHeight: '1.4',
            marginBottom: '1rem',
            display: 'flex',
            gap: '0.5rem',
            alignItems: 'flex-start',
          }}
        >
          <ShieldCheck size={16} strokeWidth={1.75} style={{ color: 'var(--accent-interactive)', flexShrink: 0, marginTop: '2px' }} />
          <div>
            <strong style={{ color: 'var(--text-primary)' }}>Data Provenance Policy: </strong>
            Synthetic records are permanently tagged <code>origin: synthetic</code>, linked to their prompt version and seed,
            and routed to <code>PENDING_REVIEW</code>. Automated synthetic outputs never enter published training sets without human signoff.
          </div>
        </div>

        {/* Real vs Synthetic Proportions */}
        {lineageData && (
          <div style={{ marginBottom: '1rem' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.65rem', marginBottom: '0.5rem' }}>
              <div className="stat-card" style={{ padding: '0.65rem' }}>
                <span className="stat-value" style={{ fontSize: '1.15rem' }}>{totalRecords}</span>
                <span className="stat-label" style={{ fontSize: '0.72rem' }}>Total Records</span>
              </div>
              <div className="stat-card" style={{ padding: '0.65rem' }}>
                <span className="stat-value" style={{ fontSize: '1.15rem', color: 'var(--emerald)' }}>{realRecords}</span>
                <span className="stat-label" style={{ fontSize: '0.72rem' }}>Real Records</span>
              </div>
              <div className="stat-card" style={{ padding: '0.65rem' }}>
                <span className="stat-value" style={{ fontSize: '1.15rem', color: 'var(--accent-interactive)' }}>{synthRecords}</span>
                <span className="stat-label" style={{ fontSize: '0.72rem' }}>Synthetic Records</span>
              </div>
              <div className="stat-card" style={{ padding: '0.65rem' }}>
                <span className="stat-value" style={{ fontSize: '1.15rem', color: 'var(--cyan)' }}>
                  {totalRecords > 0 ? ((synthRecords / totalRecords) * 100).toFixed(1) : '0.0'}%
                </span>
                <span className="stat-label" style={{ fontSize: '0.72rem' }}>Synthetic Ratio</span>
              </div>
            </div>

            {/* Proportional Stacked Bar */}
            <div
              style={{
                display: 'flex',
                height: '6px',
                borderRadius: '3px',
                overflow: 'hidden',
                background: 'var(--bg-canvas)',
                border: '1px solid var(--border-hairline)',
              }}
              title="Real vs Synthetic Proportion"
            >
              <div style={{ width: `${realPct}%`, backgroundColor: 'var(--emerald)', transition: 'width 0.2s' }} />
              <div style={{ width: `${synthPct}%`, backgroundColor: 'var(--accent-interactive)', transition: 'width 0.2s' }} />
            </div>
          </div>
        )}

        {feedback && (
          <div
            style={{
              padding: '0.65rem 0.85rem',
              borderRadius: 'var(--radius-sm)',
              marginBottom: '1rem',
              background: feedback.type === 'success' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
              border: `1px solid ${feedback.type === 'success' ? 'var(--emerald)' : 'var(--rose)'}`,
              color: feedback.type === 'success' ? 'var(--emerald)' : 'var(--rose)',
              fontSize: '0.825rem',
            }}
          >
            {feedback.text}
          </div>
        )}

        {/* Scrollable Form Body */}
        <div style={{ flex: 1, overflowY: 'auto', paddingRight: '0.35rem' }}>
          <form onSubmit={handleGenerate}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.85rem', marginBottom: '0.85rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, marginBottom: '0.25rem' }}>
                  Target Class
                </label>
                <CustomSelect
                  value={targetClass}
                  onChange={(val) => setTargetClass(val)}
                  options={labels.map((lbl) => ({ value: lbl, label: lbl }))}
                  style={{ width: '100%' }}
                  ariaLabel="Select target class"
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, marginBottom: '0.25rem' }}>
                  Sample Count (Bounded 1–50)
                </label>
                <input
                  type="number"
                  className="input-text"
                  min="1"
                  max="50"
                  value={count}
                  onChange={(e) => setCount(Math.max(1, Math.min(50, parseInt(e.target.value) || 1)))}
                  style={{ width: '100%', fontSize: '0.825rem' }}
                  required
                />
              </div>
            </div>

            <div style={{ marginBottom: '0.85rem' }}>
              <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, marginBottom: '0.25rem' }}>
                Prompt Template (Supports <code>{'{class_name}'}</code>)
              </label>
              <textarea
                className="input-text"
                rows={2}
                value={promptTemplate}
                onChange={(e) => setPromptTemplate(e.target.value)}
                style={{ width: '100%', fontSize: '0.825rem', fontFamily: 'var(--font-mono)' }}
                required
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.75rem', marginBottom: '1rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, marginBottom: '0.25rem' }}>
                  Template Version
                </label>
                <input
                  type="text"
                  className="input-text"
                  value={templateVersion}
                  onChange={(e) => setTemplateVersion(e.target.value)}
                  style={{ width: '100%', fontSize: '0.825rem' }}
                  required
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, marginBottom: '0.25rem' }}>
                  Seed (Reproducibility)
                </label>
                <input
                  type="number"
                  className="input-text"
                  value={seed}
                  onChange={(e) => setSeed(parseInt(e.target.value) || 0)}
                  style={{ width: '100%', fontSize: '0.825rem' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, marginBottom: '0.25rem' }}>
                  Destination Split
                </label>
                <CustomSelect
                  value={split}
                  onChange={(val) => setSplit(val)}
                  options={[
                    { value: 'train', label: 'train' },
                    { value: 'validation', label: 'validation' },
                    { value: 'test', label: 'test' },
                  ]}
                  style={{ width: '100%' }}
                  ariaLabel="Select destination split"
                />
              </div>
            </div>

            {/* Live Schema Preview Card */}
            <div
              style={{
                padding: '0.75rem',
                borderRadius: 'var(--radius-sm)',
                background: 'var(--bg-elevated)',
                border: '1px solid var(--border-hairline)',
                marginBottom: '1rem',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                <span style={{ fontSize: '0.78rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                  <Code2 size={14} strokeWidth={1.75} style={{ color: 'var(--cyan)' }} />
                  Target Schema Payload Preview ({taskType})
                </span>
                {isClassInSchema ? (
                  <span style={{ fontSize: '0.72rem', color: 'var(--emerald)', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                    <CheckCircle2 size={12} strokeWidth={1.75} /> Registered Class
                  </span>
                ) : (
                  <span style={{ fontSize: '0.72rem', color: 'var(--amber)', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                    <AlertTriangle size={12} strokeWidth={1.75} /> Unregistered Class Warning
                  </span>
                )}
              </div>

              {/* Class Schema Mismatch Blocker */}
              {!isClassInSchema && labels.length > 0 && (
                <div
                  style={{
                    padding: '0.6rem 0.8rem',
                    borderRadius: 'var(--radius-sm)',
                    marginBottom: '0.65rem',
                    background: 'rgba(239, 68, 68, 0.08)',
                    border: '1px solid var(--rose)',
                    color: 'var(--rose)',
                    fontSize: '0.76rem',
                    display: 'flex',
                    gap: '0.45rem',
                    alignItems: 'center',
                  }}
                >
                  <AlertTriangle size={15} strokeWidth={1.75} style={{ flexShrink: 0 }} />
                  <span>
                    Target class <strong>"{targetClass}"</strong> is not in the dataset's configured class list: [{labels.join(', ')}]. Generation disabled until an allowed class is selected.
                  </span>
                </div>
              )}

              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: '0.4rem', fontStyle: 'italic' }}>
                Illustrative schema template only — not a generated record. Synthetic samples will be routed to pending_review upon generation.
              </div>

              <pre
                style={{
                  margin: 0,
                  padding: '0.5rem',
                  borderRadius: '3px',
                  background: 'var(--bg-canvas)',
                  border: '1px solid var(--border-hairline)',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '0.725rem',
                  color: 'var(--text-secondary)',
                  maxHeight: '120px',
                  overflowY: 'auto',
                }}
              >
                {schemaPreview}
              </pre>
            </div>

            {isGenerating && (
              <div style={{ marginBottom: '1rem' }}>
                <PerceptualProgressBar active={isGenerating} taskType="synthesize" />
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textAlign: 'center', marginTop: '0.35rem' }}>
                  Executing generation request via local model gateway...
                </div>
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.65rem', marginBottom: '1.25rem' }}>
              <SpringButton type="button" variant="secondary" onClick={onClose} disabled={isGenerating}>
                Cancel
              </SpringButton>
              <SpringButton
                type="submit"
                variant="primary"
                disabled={isGenerating || (!isClassInSchema && labels.length > 0) || !targetClass.trim()}
              >
                {isGenerating ? 'Synthesizing Samples...' : `Generate ${count} Synthetic Samples`}
              </SpringButton>
            </div>
          </form>

          {/* Last Run Summary */}
          {lastResult && (
            <div
              className="card"
              style={{
                padding: '0.85rem',
                border: '1px solid var(--border-hairline)',
                borderRadius: 'var(--radius-sm)',
                marginBottom: '1rem',
                background: 'var(--bg-elevated)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                <span style={{ fontSize: '0.825rem', fontWeight: 600, color: 'var(--emerald)', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                  <CheckCircle2 size={14} strokeWidth={1.75} /> Last Run: {lastResult.run_id}
                </span>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  Destination: <code>PENDING_REVIEW</code>
                </span>
              </div>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', lineHeight: '1.45' }}>
                <div>Target Class: <strong>{lastResult.target_class}</strong> ({split} split)</div>
                <div>
                  Requested: <strong>{lastResult.requested_count}</strong> | Accepted: <strong style={{ color: 'var(--emerald)' }}>{lastResult.accepted_count}</strong> | Duplicates: <strong>{lastResult.duplicate_count}</strong>
                </div>
              </div>

              {onOpenWorkspace && (
                <div style={{ marginTop: '0.65rem', display: 'flex', justifyContent: 'flex-end' }}>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => {
                      onClose();
                      onOpenWorkspace();
                    }}
                    style={{ fontSize: '0.75rem', padding: '0.25rem 0.6rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}
                  >
                    Open Workspace to Review <ArrowRight size={12} strokeWidth={1.75} />
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Historical Runs */}
          {lineageData?.runs && lineageData.runs.length > 0 && (
            <div>
              <h4 style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>
                Historical Generation Runs ({lineageData.runs.length})
              </h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', maxHeight: '160px', overflowY: 'auto' }}>
                {lineageData.runs.map((r: any) => (
                  <div
                    key={r.run_id}
                    style={{
                      padding: '0.55rem 0.75rem',
                      background: 'var(--bg-elevated)',
                      border: '1px solid var(--border-hairline)',
                      borderRadius: 'var(--radius-xs)',
                      fontSize: '0.76rem',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{r.run_id}</span>
                      <span style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>
                        {r.created_at ? new Date(r.created_at).toLocaleTimeString() : ''}
                      </span>
                    </div>
                    <div style={{ color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                      Target: {r.configuration?.target_class} | Accepted: {r.metrics?.accepted ?? 0} | Duplicates: {r.metrics?.duplicates_dropped ?? 0}
                    </div>
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
