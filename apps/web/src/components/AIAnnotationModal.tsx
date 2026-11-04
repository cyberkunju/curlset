import React, { useEffect, useState, useMemo } from 'react';
import { Bot, CheckCircle2, AlertTriangle, ShieldCheck, Code2, ArrowRight, X, KeyRound } from 'lucide-react';
import { fetchProviders, triggerAIAnnotation } from '../api';
import { PerceptualProgressBar } from './ui/PerceptualProgressBar';
import { SpringButton } from './ui/SpringButton';
import { CustomSelect } from './ui/CustomSelect';
import { ModalShell } from './ui/ModalShell';
import { ProviderIcon } from './ui/ProviderIcon';

export interface AIAnnotationModalProps {
  datasetId: string;
  taskType?: string;
  labelSchema?: Record<string, any>;
  isOpen: boolean;
  onClose: () => void;
  onRunComplete: () => void;
  onOpenWorkspace?: () => void;
}

export const AIAnnotationModal: React.FC<AIAnnotationModalProps> = ({
  datasetId,
  taskType = 'image_classification',
  labelSchema,
  isOpen,
  onClose,
  onRunComplete,
  onOpenWorkspace,
}) => {
  const [providers, setProviders] = useState<any[]>([]);
  const [selectedProvider, setSelectedProvider] = useState<string>('');
  const [selectedModel, setSelectedModel] = useState<string>('');
  const [targetSplit, setTargetSplit] = useState<string>('');
  const [onlyUnannotated, setOnlyUnannotated] = useState<boolean>(true);
  const [limit, setLimit] = useState<number>(50);
  const [enableConsensus, setEnableConsensus] = useState<boolean>(false);

  const [loadingProviders, setLoadingProviders] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [runResult, setRunResult] = useState<any | null>(null);

  useEffect(() => {
    if (isOpen) {
      setRunResult(null);
      setError(null);
      setLoadingProviders(true);
      fetchProviders()
        .then((data) => {
          setProviders(data);
          const compatible = data.filter(
            (p: any) => Array.isArray(p.capabilities) && p.capabilities.includes(taskType)
          );
          if (compatible.length > 0) {
            setSelectedProvider(compatible[0].name);
            if (compatible[0].models?.length > 0) {
              setSelectedModel(compatible[0].models[0]);
            } else {
              setSelectedModel('');
            }
          } else {
            setSelectedProvider('');
            setSelectedModel('');
          }
        })
        .catch((err) => setError(err.message || 'Failed to fetch providers'))
        .finally(() => setLoadingProviders(false));
    }
  }, [isOpen, taskType]);

  const currentProviderObj = providers.find((p) => p.name === selectedProvider);
  const availableModels = currentProviderObj?.models || [];

  // Filter providers by actual backend capability contract
  const compatibleProviders = useMemo(() => {
    return providers.filter(
      (p) => Array.isArray(p.capabilities) && p.capabilities.includes(taskType)
    );
  }, [providers, taskType]);

  const incompatibleProviders = useMemo(() => {
    return providers.filter(
      (p) => !Array.isArray(p.capabilities) || !p.capabilities.includes(taskType)
    );
  }, [providers, taskType]);

  // Update selected model when provider changes
  const handleProviderChange = (provName: string) => {
    setSelectedProvider(provName);
    const pObj = providers.find((p) => p.name === provName);
    if (pObj && pObj.models?.length > 0) {
      setSelectedModel(pObj.models[0]);
    } else {
      setSelectedModel('');
    }
  };

  const handleStartInference = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProvider) return;

    setLoading(true);
    setError(null);
    try {
      const result = await triggerAIAnnotation(datasetId, {
        provider: selectedProvider,
        model: selectedModel || undefined,
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

  // Honest label formatting for demo/fake providers
  const formatProviderLabel = (name: string) => {
    if (name === 'fake' || name.startsWith('fake_')) {
      return `${name} (Synthetic / Demo Provider - Testing only)`;
    }
    return name;
  };

  // Honest illustrative task schema preview with zero fabricated confidence or coordinates.
  // `origin`/`status` are shown as server-derived, because the client never sends them.
  const proposalSchemaPreview = useMemo(() => {
    const payload: Record<string, any> = {
      task_type: taskType,
      server_derived: {
        origin: 'model',
        status: 'pending_review',
      },
      model_metadata: {
        provider: selectedProvider || '<selected_provider>',
        model: selectedModel || '<selected_model>',
        consensus_enabled: enableConsensus,
      },
      payload: {},
    };

    if (taskType === 'text_classification') {
      const sampleLabel = labelSchema?.labels?.[0] || labelSchema?.classes?.[0] || '<class_label_placeholder>';
      payload.payload = {
        label: sampleLabel,
        confidence: '<float_0.0_to_1.0_when_provided>',
        rationale: '<optional_model_rationale_text>',
      };
    } else if (taskType === 'image_classification') {
      const sampleLabel = labelSchema?.labels?.[0] || labelSchema?.classes?.[0] || '<class_label_placeholder>';
      payload.payload = {
        label: sampleLabel,
        confidence: '<float_0.0_to_1.0_when_provided>',
        notes: '<optional_model_notes>',
      };
    } else if (taskType === 'object_detection') {
      const sampleLabel = labelSchema?.labels?.[0] || labelSchema?.classes?.[0] || '<class_label_placeholder>';
      payload.payload = {
        boxes: [
          {
            label: sampleLabel,
            x: '<norm_x_min_0.0_to_1.0>',
            y: '<norm_y_min_0.0_to_1.0>',
            width: '<norm_width_0.0_to_1.0>',
            height: '<norm_height_0.0_to_1.0>',
            confidence: '<optional_box_confidence_0.0_to_1.0>',
          },
        ],
      };
    } else if (taskType === 'audio_transcription') {
      payload.payload = {
        text: '<transcribed_audio_text_placeholder>',
        segments: [
          {
            start: '<start_seconds>',
            end: '<end_seconds>',
            text: '<speech_segment_text>',
          },
        ],
        language: '<iso_language_code>',
      };
    } else if (taskType === 'document_ocr') {
      payload.payload = {
        text: '<extracted_document_text_placeholder>',
        words: [
          {
            word: '<token_string>',
            box: ['<x1>', '<y1>', '<x2>', '<y2>'],
            page: 1,
          },
        ],
      };
    } else {
      payload.payload = {
        output: '<task_specific_model_prediction>',
        confidence: '<float_0.0_to_1.0_when_provided>',
      };
    }

    return JSON.stringify(payload, null, 2);
  }, [taskType, selectedProvider, selectedModel, enableConsensus, labelSchema]);

  if (!isOpen) return null;

  return (
    <ModalShell
      isOpen={isOpen}
      onClose={onClose}
      title="AI-Assisted Batch Annotation"
      description="Generate reviewable model proposals across dataset splits via backend provider gateway"
      icon={<Bot size={20} strokeWidth={1.75} style={{ color: 'var(--accent-interactive)' }} />}
      size="lg"
    >

        {/* Platform Integrity Rule Notice */}
        <div
          style={{
            padding: '0.65rem 0.85rem',
            borderRadius: 'var(--radius-sm)',
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border-hairline)',
            color: 'var(--text-secondary)',
            fontSize: '0.78rem',
            lineHeight: '1.45',
            marginBottom: '1rem',
            display: 'flex',
            gap: '0.5rem',
            alignItems: 'flex-start',
          }}
        >
          <ShieldCheck size={16} strokeWidth={1.75} style={{ color: 'var(--accent-interactive)', flexShrink: 0, marginTop: '2px' }} />
          <div>
            <strong style={{ color: 'var(--text-primary)' }}>Review Enforcement: </strong>
            All model predictions are registered strictly as <code>pending_review</code> proposals with <code>origin: model</code>.
            Model predictions cannot become approved annotations without explicit human verification.
          </div>
        </div>

        {error && (
          <div
            style={{
              padding: '0.65rem 0.85rem',
              borderRadius: 'var(--radius-sm)',
              marginBottom: '1rem',
              background: 'rgba(239, 68, 68, 0.12)',
              border: '1px solid var(--rose)',
              color: 'var(--rose)',
              fontSize: '0.825rem',
            }}
          >
            {error}
          </div>
        )}

        {runResult ? (
          <div>
            {/* Batch Results Card */}
            <div
              style={{
                background: 'rgba(16, 185, 129, 0.08)',
                border: '1px solid var(--emerald)',
                padding: '1rem 1.25rem',
                borderRadius: 'var(--radius-md)',
                marginBottom: '1.25rem',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', marginBottom: '0.35rem' }}>
                <CheckCircle2 size={18} strokeWidth={1.75} style={{ color: 'var(--emerald)' }} />
                <h3 style={{ color: 'var(--emerald)', fontSize: '1rem', fontWeight: 700 }}>
                  Batch Inference Completed
                </h3>
              </div>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.75rem' }}>
                Generated proposals registered to <code>pending_review</code>. Run ID: <code>{runResult.id || runResult.run_id}</code>
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem', textAlign: 'center' }}>
                <div style={{ background: 'var(--bg-canvas)', padding: '0.5rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-hairline)' }}>
                  <div style={{ fontSize: '1.15rem', fontWeight: 700 }}>{runResult.total_items}</div>
                  <div style={{ fontSize: '0.725rem', color: 'var(--text-muted)' }}>Target Records</div>
                </div>
                <div style={{ background: 'var(--bg-canvas)', padding: '0.5rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-hairline)' }}>
                  <div style={{ fontSize: '1.15rem', fontWeight: 700, color: 'var(--emerald)' }}>{runResult.processed_items}</div>
                  <div style={{ fontSize: '0.725rem', color: 'var(--text-muted)' }}>Proposals Created</div>
                </div>
                <div style={{ background: 'var(--bg-canvas)', padding: '0.5rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-hairline)' }}>
                  <div style={{ fontSize: '1.15rem', fontWeight: 700, color: runResult.failed_items > 0 ? 'var(--rose)' : 'var(--text-secondary)' }}>
                    {runResult.failed_items}
                  </div>
                  <div style={{ fontSize: '0.725rem', color: 'var(--text-muted)' }}>Failed Items</div>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.65rem' }}>
              <button type="button" className="btn btn-secondary" onClick={onClose} style={{ fontSize: '0.825rem' }}>
                Close
              </button>
              {onOpenWorkspace && (
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => {
                    onClose();
                    onOpenWorkspace();
                  }}
                  style={{ fontSize: '0.825rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}
                >
                  Review in Annotation Workspace <ArrowRight size={14} strokeWidth={1.75} />
                </button>
              )}
            </div>
          </div>
        ) : loadingProviders ? (
          <div className="loading-container" style={{ padding: '2.5rem' }}>
            <div className="spinner" style={{ width: '20px', height: '20px' }}></div>
            <div style={{ fontSize: '0.825rem', color: 'var(--text-muted)' }}>Querying registered gateway providers...</div>
          </div>
        ) : providers.length === 0 ? (
          <div style={{ padding: '2rem', textAlign: 'center', background: 'var(--bg-elevated)', borderRadius: 'var(--radius-sm)' }}>
            <AlertTriangle size={28} strokeWidth={1.75} style={{ color: 'var(--amber)', margin: '0 auto 0.5rem' }} />
            <h3 style={{ fontSize: '0.95rem', fontWeight: 600, marginBottom: '0.25rem' }}>No AI Providers Registered</h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', maxWidth: '380px', margin: '0 auto 1rem' }}>
              The backend gateway does not have active AI providers configured. Configure provider credentials or verify local demo services.
            </p>
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Close
            </button>
          </div>
        ) : (
          <form onSubmit={handleStartInference}>
            {/* Task Compatibility Warning when no provider supports task */}
            {compatibleProviders.length === 0 && (
              <div
                style={{
                  padding: '0.75rem 0.85rem',
                  borderRadius: 'var(--radius-sm)',
                  marginBottom: '1rem',
                  background: 'rgba(245, 158, 11, 0.08)',
                  border: '1px solid var(--amber)',
                  color: 'var(--amber)',
                  fontSize: '0.8rem',
                  lineHeight: '1.45',
                  display: 'flex',
                  gap: '0.5rem',
                  alignItems: 'flex-start',
                }}
              >
                <AlertTriangle size={16} strokeWidth={1.75} style={{ flexShrink: 0, marginTop: '2px' }} />
                <div>
                  <strong>No Compatible Providers for Task: </strong>
                  None of the registered gateway providers ({providers.map((p) => p.name).join(', ')}) advertise support for <code>{taskType}</code>. Capabilities are enforced at the provider gateway level. Batch model inference is disabled.
                </div>
              </div>
            )}

            {/* Provider and Model Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.85rem', marginBottom: '0.85rem' }}>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.78rem', fontWeight: 600 }}>
                    <ProviderIcon provider={selectedProvider} size={14} />
                    <span>Gateway Provider</span>
                  </label>
                  <a
                    href="#providers"
                    onClick={onClose}
                    style={{
                      fontSize: '0.7rem',
                      color: 'var(--indigo)',
                      textDecoration: 'none',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.25rem',
                      fontWeight: 500,
                    }}
                  >
                    <KeyRound size={11} />
                    <span>Manage Keys</span>
                  </a>
                </div>
                <CustomSelect
                  value={selectedProvider}
                  onChange={handleProviderChange}
                  options={providers.map((p) => {
                    const isComp = Array.isArray(p.capabilities) && p.capabilities.includes(taskType);
                    return {
                      value: p.name,
                      label: isComp
                        ? formatProviderLabel(p.name)
                        : `${formatProviderLabel(p.name)} (Incompatible: lacks '${taskType}')`,
                      disabled: !isComp,
                    };
                  })}
                  style={{ width: '100%' }}
                  ariaLabel="Select gateway provider"
                />
                {currentProviderObj && (!Array.isArray(currentProviderObj.capabilities) || currentProviderObj.capabilities.length === 0) ? (
                  <div style={{ fontSize: '0.7rem', color: 'var(--amber)', marginTop: '0.25rem' }}>
                    Warning: Provider '{currentProviderObj.name}' does not publish capabilities. Compatibility unverified.
                  </div>
                ) : currentProviderObj ? (
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                    Gateway capabilities for {currentProviderObj.name}: <code>{currentProviderObj.capabilities.join(', ')}</code>
                  </div>
                ) : null}
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, marginBottom: '0.25rem' }}>
                  Model
                </label>
                <CustomSelect
                  value={selectedModel}
                  onChange={(val) => setSelectedModel(val)}
                  options={availableModels.map((m: string) => ({
                    value: m,
                    label: m === 'fake-classifier-v1' ? `${m} (Demo)` : m,
                  }))}
                  disabled={availableModels.length === 0 || compatibleProviders.length === 0}
                  style={{ width: '100%' }}
                  ariaLabel="Select provider model"
                />
              </div>
            </div>

            {/* Split & Limit Controls */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.85rem', marginBottom: '0.85rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, marginBottom: '0.25rem' }}>
                  Target Split
                </label>
                <CustomSelect
                  value={targetSplit}
                  onChange={(val) => setTargetSplit(val)}
                  options={[
                    { value: '', label: 'All Splits' },
                    { value: 'train', label: 'train' },
                    { value: 'validation', label: 'validation' },
                    { value: 'test', label: 'test' },
                  ]}
                  style={{ width: '100%' }}
                  ariaLabel="Select target split"
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, marginBottom: '0.25rem' }}>
                  Batch Record Limit (1–200)
                </label>
                <input
                  type="number"
                  className="input-text"
                  min="1"
                  max="200"
                  value={limit}
                  onChange={(e) => setLimit(Math.max(1, Math.min(200, parseInt(e.target.value) || 1)))}
                  style={{ width: '100%', fontSize: '0.825rem' }}
                  required
                />
              </div>
            </div>

            {/* Checkbox Options */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1rem' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8rem', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={onlyUnannotated}
                  onChange={(e) => setOnlyUnannotated(e.target.checked)}
                />
                <span>Only annotate records without existing annotations</span>
              </label>

              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8rem', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={enableConsensus}
                  onChange={(e) => setEnableConsensus(e.target.checked)}
                />
                <span>Enable multi-model consensus verification when supported</span>
              </label>
            </div>

            {/* Live Schema Proposal Preview */}
            <div
              style={{
                padding: '0.75rem',
                borderRadius: 'var(--radius-sm)',
                background: 'var(--bg-elevated)',
                border: '1px solid var(--border-hairline)',
                marginBottom: '1rem',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
                <span style={{ fontSize: '0.78rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                  <Code2 size={14} strokeWidth={1.75} style={{ color: 'var(--cyan)' }} />
                  Proposal Schema Preview ({taskType})
                </span>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                  State: <code>pending_review</code>
                </span>
              </div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: '0.4rem', fontStyle: 'italic' }}>
                Illustrative schema only — values are placeholders, not model predictions. Fields under
                <code> server_derived </code> are stamped by the API; this client does not send origin, status or actor
                ids.
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
                {proposalSchemaPreview}
              </pre>
            </div>

            {loading && (
              <div style={{ marginBottom: '1rem' }}>
                <PerceptualProgressBar active={loading} taskType="annotate" />
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textAlign: 'center', marginTop: '0.35rem' }}>
                  Dispatching batch annotation via provider gateway...
                </div>
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.65rem' }}>
              <SpringButton type="button" variant="secondary" onClick={onClose} disabled={loading}>
                Cancel
              </SpringButton>
              <SpringButton
                type="submit"
                variant="primary"
                disabled={loading || !selectedProvider || compatibleProviders.length === 0}
              >
                {loading ? 'Processing Inference Batch...' : `Run Inference on ${limit} Items`}
              </SpringButton>
            </div>
          </form>
        )}
    </ModalShell>
  );
};
