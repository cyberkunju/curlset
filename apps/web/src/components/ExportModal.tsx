import React, { useEffect, useState, useMemo, useRef } from 'react';
import {
  Package,
  Lock,
  FileText,
  Database,
  Image as ImageIcon,
  Crosshair,
  Sparkles,
  Terminal,
  Layers,
  Mic,
  Sliders,
  CheckCircle2,
  AlertTriangle,
  Download,
  X,
  Code2,
} from 'lucide-react';
import {
  fetchDatasetVersions,
  fetchVersionExports,
  getExportDownloadUrl,
  triggerVersionExport,
  simulateDatasetTokens,
} from '../api';
import { DatasetVersion, ExportArtifact, ExportFormatType, TokenSimulationResponse } from '../types';
import { PerceptualProgressBar } from './ui/PerceptualProgressBar';
import { CustomSelect } from './ui/CustomSelect';
import { SpringButton } from './ui/SpringButton';
import { ModalShell } from './ui/ModalShell';

export interface ExportModalProps {
  datasetId: string;
  isOpen: boolean;
  onClose: () => void;
  onOpenVersions: () => void;
}

interface FormatOption {
  id: ExportFormatType;
  title: string;
  badge: string;
  category: 'Standard' | 'Vision' | 'Speech' | 'Framework';
  description: string;
  illustrativeTemplate: string;
}

const EXPORT_FORMATS: FormatOption[] = [
  {
    id: 'csv',
    title: 'Standard CSV',
    badge: 'Tabular',
    category: 'Standard',
    description: 'Comma-separated table with text, class labels, metadata, and media paths.',
    illustrativeTemplate: `id,text,label,split,media_path\nrec_001,"Sample input text",positive,train,assets/rec_001.jpg\nrec_002,"Second input sample",negative,train,assets/rec_002.jpg`,
  },
  {
    id: 'jsonl',
    title: 'Structured JSONL',
    badge: 'LLM / VLM',
    category: 'Standard',
    description: 'Newline-delimited JSON with full schema dictionaries and nested asset signatures.',
    illustrativeTemplate: `{"id": "rec_001", "text": "Sample text", "annotation": {"label": "positive", "status": "approved"}, "split": "train"}\n{"id": "rec_002", "text": "Second text", "annotation": {"label": "negative", "status": "approved"}, "split": "val"}`,
  },
  {
    id: 'coco',
    title: 'MS-COCO JSON',
    badge: 'Vision',
    category: 'Vision',
    description: 'COCO format with images, bounding boxes, categories, and split references.',
    illustrativeTemplate: `{\n  "images": [{"id": 1, "file_name": "rec_001.jpg", "width": 640, "height": 480}],\n  "annotations": [{"id": 1, "image_id": 1, "category_id": 2, "bbox": [50, 60, 200, 150]}],\n  "categories": [{"id": 2, "name": "defect"}]\n}`,
  },
  {
    id: 'yolo',
    title: 'Ultralytics YOLO',
    badge: 'Detection',
    category: 'Vision',
    description: 'data.yaml and normalized label files (<class> <x_center> <y_center> <w> <h>).',
    illustrativeTemplate: `# data.yaml\nnames:\n  0: defect\n  1: normal\nnc: 2\ntrain: images/train\nval: images/val`,
  },
  {
    id: 'unsloth_sharegpt_vlm',
    title: 'Unsloth VLM',
    badge: 'Framework',
    category: 'Framework',
    description: 'ShareGPT conversation splits paired with ready-to-run train_unsloth.py script.',
    illustrativeTemplate: `{"id": "rec_001", "conversations": [{"from": "human", "value": "<image>\\nDescribe the defect."}, {"from": "gpt", "value": "Surface scratch detected."}], "images": ["assets/rec_001.jpg"]}`,
  },
  {
    id: 'axolotl_alpaca_chatml',
    title: 'Axolotl ChatML',
    badge: 'Framework',
    category: 'Framework',
    description: 'Alpaca/ChatML format splits paired with pre-configured axolotl_config.yml.',
    illustrativeTemplate: `{"instruction": "Analyze the industrial part image.", "input": "<image>", "output": "Approved quality standard."}`,
  },
  {
    id: 'llama_factory_bundle',
    title: 'LLaMA-Factory',
    badge: 'Framework',
    category: 'Framework',
    description: 'Auto-registers dataset in dataset_info.json with SHA-256 integrity hashes.',
    illustrativeTemplate: `// dataset_info.json registry\n{\n  "dataset_release_v1": {\n    "file_name": "train.jsonl",\n    "file_sha256": "a3f5b7...",\n    "columns": {"prompt": "instruction", "response": "output"}\n  }\n}`,
  },
  {
    id: 'ultralytics_yolo_v8_v11',
    title: 'YOLO v8 / v11 Bundle',
    badge: 'Framework',
    category: 'Framework',
    description: 'Ultralytics YOLO v8/v11 bundle with split directories and data.yaml.',
    illustrativeTemplate: `# Ultralytics YOLO v8/v11\npath: /datasets/release_v1\ntrain: images/train\nval: images/val\nnames: {0: 'defect', 1: 'clean'}`,
  },
  {
    id: 'webvtt',
    title: 'WebVTT Subtitles',
    badge: 'Audio',
    category: 'Speech',
    description: 'W3C standard WebVTT subtitle and cue alignment files for speech/audio datasets.',
    illustrativeTemplate: `WEBVTT\n\n00:00:01.000 --> 00:00:04.500\n[Speaker 1] Verified audio transcription segment.`,
  },
];

export const ExportModal: React.FC<ExportModalProps> = ({
  datasetId,
  isOpen,
  onClose,
  onOpenVersions,
}) => {
  const [versions, setVersions] = useState<DatasetVersion[]>([]);
  const [selectedVersionId, setSelectedVersionId] = useState<string>('');
  const [format, setFormat] = useState<ExportFormatType>('csv');
  const [artifacts, setArtifacts] = useState<ExportArtifact[]>([]);
  const [loadingVersions, setLoadingVersions] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Real Token & Context Simulator State with race-condition prevention
  const [targetContext, setTargetContext] = useState<string>('4096');
  const [simResult, setSimResult] = useState<TokenSimulationResponse | null>(null);
  const [simLoading, setSimLoading] = useState<boolean>(false);
  const [simError, setSimError] = useState<string | null>(null);
  const [showTemplatePreview, setShowTemplatePreview] = useState<boolean>(false);

  // Monotonically increasing request identifier and abort controller to prevent out-of-order race conditions
  const simRequestIdRef = useRef<number>(0);
  const abortControllerRef = useRef<AbortController | null>(null);

  const loadVersions = async () => {
    setLoadingVersions(true);
    setError(null);
    try {
      const vers = await fetchDatasetVersions(datasetId);
      setVersions(vers);
      if (vers.length > 0) {
        setSelectedVersionId(vers[0].id);
        await loadArtifacts(vers[0].id);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load dataset versions');
    } finally {
      setLoadingVersions(false);
    }
  };

  const loadArtifacts = async (versionId: string) => {
    try {
      const data = await fetchVersionExports(versionId);
      setArtifacts(data);
    } catch {
      // Silently handled
    }
  };

  // Run real server-side token simulation with race-prevention and stale-clearing
  const runTokenSimulation = async (targetCtx: number) => {
    // Abort in-flight request if present
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;

    const currentReqId = ++simRequestIdRef.current;
    setSimLoading(true);
    setSimError(null);
    // Clear old results while newer simulation is in flight so stale context utilization is not displayed
    setSimResult(null);

    try {
      const res = await simulateDatasetTokens(
        datasetId,
        { target_context_window: targetCtx },
        controller.signal
      );
      if (currentReqId === simRequestIdRef.current) {
        setSimResult(res);
        setSimLoading(false);
      }
    } catch (err: any) {
      if (err?.name === 'AbortError') {
        // Ignored as superseded by newer simulation request
        return;
      }
      if (currentReqId === simRequestIdRef.current) {
        setSimError(err.message || 'Token simulation request failed');
        setSimResult(null);
        setSimLoading(false);
      }
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadVersions();
      runTokenSimulation(parseInt(targetContext, 10) || 4096);
    }
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [isOpen, datasetId]);

  const handleContextChange = (newVal: string) => {
    setTargetContext(newVal);
    const parsed = parseInt(newVal, 10);
    if (!isNaN(parsed) && parsed > 0) {
      runTokenSimulation(parsed);
    }
  };

  const handleVersionChange = async (vId: string) => {
    setSelectedVersionId(vId);
    await loadArtifacts(vId);
  };

  const handleExport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedVersionId) return;
    setExporting(true);
    setError(null);
    try {
      await triggerVersionExport(selectedVersionId, format);
      await loadArtifacts(selectedVersionId);
    } catch (err: any) {
      setError(err.message || 'Export generation failed');
    } finally {
      setExporting(false);
    }
  };

  const activePreset = useMemo(() => {
    return EXPORT_FORMATS.find((f) => f.id === format) || EXPORT_FORMATS[0];
  }, [format]);

  if (!isOpen) return null;

  const reportedContextNum = simResult ? simResult.target_context_window : (parseInt(targetContext, 10) || 4096);
  const p95UtilizationPct =
    simResult && reportedContextNum > 0
      ? Math.min(100, Math.round((simResult.p95_tokens / reportedContextNum) * 100))
      : 0;

  return (
    <ModalShell
      isOpen={isOpen}
      onClose={onClose}
      title="Training-Ready Dataset Exporter"
      description="Generate reproducible training bundles bound to immutable version snapshots with live token capacity simulation"
      icon={<Package size={20} strokeWidth={1.75} style={{ color: 'var(--accent-interactive)' }} />}
      size="xl"
    >

        {error && (
          <div
            style={{
              padding: '0.65rem 0.85rem',
              background: 'rgba(239, 68, 68, 0.12)',
              border: '1px solid var(--rose)',
              borderRadius: 'var(--radius-sm)',
              color: 'var(--rose)',
              marginBottom: '1rem',
              fontSize: '0.825rem',
            }}
          >
            {error}
          </div>
        )}

        {loadingVersions ? (
          <div className="loading-container" style={{ padding: '3.5rem' }}>
            <div className="spinner" style={{ width: '22px', height: '22px' }}></div>
            <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Loading dataset versions...</div>
          </div>
        ) : versions.length === 0 ? (
          <div className="empty-state" style={{ padding: '2.5rem', textAlign: 'center' }}>
            <div style={{ color: 'var(--amber)', display: 'flex', justifyContent: 'center', marginBottom: '0.5rem' }}>
              <Lock size={32} strokeWidth={1.75} />
            </div>
            <h3 style={{ fontSize: '1.05rem', fontWeight: 600, marginBottom: '0.35rem' }}>
              Immutable Snapshot Required
            </h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.825rem', maxWidth: '440px', margin: '0 auto 1.25rem' }}>
              Per platform data governance rules, exports cannot be generated against mutable working queues.
              Freeze an approved dataset version snapshot before exporting.
            </p>
            <div style={{ display: 'flex', justifyContent: 'center', gap: '0.65rem' }}>
              <button type="button" className="btn btn-secondary" onClick={onClose}>
                Close
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => {
                  onClose();
                  onOpenVersions();
                }}
              >
                Go to Version Snapshots
              </button>
            </div>
          </div>
        ) : (
          <div>
            <form onSubmit={handleExport} style={{ marginBottom: '1.75rem' }}>
              {/* Target Version Selector */}
              <div style={{ marginBottom: '1.25rem' }}>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.35rem' }}>
                  Target Version Snapshot (Immutable)
                </label>
                <CustomSelect
                  value={selectedVersionId}
                  onChange={handleVersionChange}
                  options={versions.map((v) => ({
                    value: v.id,
                    label: `${v.version_tag} (${v.record_count} records - published ${new Date(v.created_at).toLocaleDateString()})`,
                  }))}
                  style={{ width: '100%' }}
                  ariaLabel="Select target version snapshot"
                />
              </div>

              {/* Format Selection Cards (Semantic Accessible Radio Buttons) */}
              <div style={{ marginBottom: '1.25rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.45rem' }}>
                  <label style={{ fontSize: '0.8rem', fontWeight: 600 }}>
                    Target Training Format ({EXPORT_FORMATS.length} formats available)
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowTemplatePreview(!showTemplatePreview)}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'var(--accent-interactive)',
                      fontSize: '0.75rem',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.3rem',
                    }}
                  >
                    <Code2 size={13} strokeWidth={1.75} />
                    {showTemplatePreview ? 'Hide Illustrative Template' : 'Show Illustrative Template'}
                  </button>
                </div>

                <div
                  role="radiogroup"
                  aria-label="Export format presets"
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))',
                    gap: '0.65rem',
                  }}
                >
                  {EXPORT_FORMATS.map((item) => {
                    const isSelected = format === item.id;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        role="radio"
                        aria-checked={isSelected}
                        onClick={() => setFormat(item.id)}
                        style={{
                          textAlign: 'left',
                          padding: '0.75rem',
                          borderRadius: 'var(--radius-sm)',
                          border: `1.5px solid ${isSelected ? 'var(--accent-interactive)' : 'var(--border-hairline)'}`,
                          background: isSelected ? 'rgba(37, 99, 235, 0.08)' : 'var(--bg-elevated)',
                          cursor: 'pointer',
                          transition: 'all 0.15s ease',
                          display: 'flex',
                          flexDirection: 'column',
                          justifyContent: 'space-between',
                          gap: '0.35rem',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <span style={{ fontWeight: 600, fontSize: '0.85rem', color: isSelected ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
                            {item.title}
                          </span>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                            <span style={{ fontSize: '0.65rem', padding: '1px 5px', borderRadius: '3px', background: 'var(--bg-canvas)', color: 'var(--text-muted)' }}>
                              {item.badge}
                            </span>
                            {isSelected && <CheckCircle2 size={14} strokeWidth={2} style={{ color: 'var(--accent-interactive)' }} />}
                          </div>
                        </div>
                        <p style={{ color: 'var(--text-muted)', fontSize: '0.725rem', lineHeight: '1.35', margin: 0 }}>
                          {item.description}
                        </p>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Format-Specific Illustrative Preview */}
              {showTemplatePreview && (
                <div
                  style={{
                    padding: '0.75rem 1rem',
                    background: 'var(--bg-canvas)',
                    border: '1px solid var(--border-hairline)',
                    borderRadius: 'var(--radius-sm)',
                    marginBottom: '1.25rem',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                    <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                      Illustrative Template for {activePreset.title} (Example structure, not actual dataset records)
                    </span>
                    <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                      Format: {activePreset.id}
                    </span>
                  </div>
                  <pre
                    style={{
                      margin: 0,
                      padding: '0.5rem',
                      borderRadius: '3px',
                      background: 'var(--bg-surface)',
                      border: '1px solid var(--border-hairline)',
                      fontFamily: 'var(--font-mono)',
                      fontSize: '0.725rem',
                      color: 'var(--text-secondary)',
                      maxHeight: '120px',
                      overflowY: 'auto',
                      whiteSpace: 'pre-wrap',
                    }}
                  >
                    {activePreset.illustrativeTemplate}
                  </pre>
                </div>
              )}

              {/* Real Multimodal Token & Context-Window Capacity Simulator */}
              <div
                style={{
                  padding: '0.85rem 1rem',
                  background: 'var(--bg-elevated)',
                  border: '1px solid var(--border-hairline)',
                  borderRadius: 'var(--radius-sm)',
                  marginBottom: '1.25rem',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                    <Sliders size={15} strokeWidth={1.75} style={{ color: 'var(--accent-interactive)' }} />
                    <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>
                      Multimodal Token & Context Simulator
                    </span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Target Context:</span>
                    <CustomSelect
                      value={targetContext}
                      onChange={handleContextChange}
                      options={[
                        { value: '2048', label: '2,048 tokens' },
                        { value: '4096', label: '4,096 tokens (Default)' },
                        { value: '8192', label: '8,192 tokens' },
                        { value: '32768', label: '32,768 tokens' },
                      ]}
                      size="sm"
                      style={{ minWidth: '160px' }}
                      ariaLabel="Select target context window"
                    />
                  </div>
                </div>

                {simLoading ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 0', fontSize: '0.775rem', color: 'var(--text-muted)' }}>
                    <div className="spinner" style={{ width: '14px', height: '14px' }}></div>
                    <span>Evaluating record token distributions for {targetContext} context window...</span>
                  </div>
                ) : simError ? (
                  <div style={{ fontSize: '0.75rem', color: 'var(--rose)', padding: '0.35rem 0' }}>
                    Token simulation unavailable: {simError}
                  </div>
                ) : simResult ? (
                  simResult.total_records_evaluated === 0 ? (
                    <div
                      style={{
                        padding: '0.75rem',
                        background: 'var(--bg-canvas)',
                        borderRadius: 'var(--radius-xs)',
                        border: '1px solid var(--border-hairline)',
                        fontSize: '0.75rem',
                        color: 'var(--text-muted)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.4rem',
                      }}
                    >
                      <AlertTriangle size={14} />
                      <span>No records found in dataset to evaluate. Add or import records before simulating token capacity.</span>
                    </div>
                  ) : (
                    <div>
                      {/* Simulator Metrics Row */}
                      <div
                        style={{
                          display: 'grid',
                          gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
                          gap: '0.5rem',
                          marginBottom: '0.65rem',
                        }}
                      >
                        <div style={{ padding: '0.45rem 0.6rem', background: 'var(--bg-canvas)', borderRadius: 'var(--radius-xs)', border: '1px solid var(--border-hairline)' }}>
                          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Records Evaluated</div>
                          <div style={{ fontSize: '1rem', fontWeight: 700 }}>{simResult.total_records_evaluated}</div>
                        </div>
                        <div style={{ padding: '0.45rem 0.6rem', background: 'var(--bg-canvas)', borderRadius: 'var(--radius-xs)', border: '1px solid var(--border-hairline)' }}>
                          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Average Tokens</div>
                          <div style={{ fontSize: '1rem', fontWeight: 700 }}>{simResult.avg_tokens_per_record}</div>
                        </div>
                        <div style={{ padding: '0.45rem 0.6rem', background: 'var(--bg-canvas)', borderRadius: 'var(--radius-xs)', border: '1px solid var(--border-hairline)' }}>
                          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>P95 Tokens</div>
                          <div style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)' }}>{simResult.p95_tokens}</div>
                        </div>
                        <div style={{ padding: '0.45rem 0.6rem', background: 'var(--bg-canvas)', borderRadius: 'var(--radius-xs)', border: '1px solid var(--border-hairline)' }}>
                          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Maximum Tokens</div>
                          <div style={{ fontSize: '1rem', fontWeight: 700 }}>{simResult.max_tokens}</div>
                        </div>
                        <div style={{ padding: '0.45rem 0.6rem', background: 'var(--bg-canvas)', borderRadius: 'var(--radius-xs)', border: '1px solid var(--border-hairline)' }}>
                          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Truncated Records</div>
                          <div style={{ fontSize: '1rem', fontWeight: 700, color: simResult.records_truncated > 0 ? 'var(--rose)' : 'var(--emerald)' }}>
                            {simResult.records_truncated} ({simResult.truncation_percentage}%)
                          </div>
                        </div>
                      </div>

                      {/* Context Utilization Visual Bar */}
                      <div style={{ marginBottom: '0.5rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: '0.2rem' }}>
                          <span>P95 Context Utilization ({p95UtilizationPct}%)</span>
                          <span>Capacity: {reportedContextNum.toLocaleString()} tokens</span>
                        </div>
                        <div
                          style={{
                            width: '100%',
                            height: '6px',
                            background: 'var(--bg-canvas)',
                            borderRadius: '3px',
                            overflow: 'hidden',
                            border: '1px solid var(--border-hairline)',
                          }}
                        >
                          <div
                            style={{
                              width: `${Math.min(100, p95UtilizationPct)}%`,
                              height: '100%',
                              background:
                                simResult.records_truncated > 0
                                  ? 'var(--rose)'
                                  : p95UtilizationPct > 85
                                  ? 'var(--amber)'
                                  : 'var(--emerald)',
                              transition: 'width 0.2s ease',
                            }}
                          />
                        </div>

                        {/* Context Tick Marks */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: '0.2rem', fontFamily: 'var(--font-mono)' }}>
                          <span>0</span>
                          <span>2,048</span>
                          <span>4,096</span>
                          <span>8,192</span>
                          <span>32,768</span>
                        </div>
                      </div>

                      {/* Status Notice */}
                      <div style={{ fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                        {simResult.records_truncated > 0 ? (
                          <span style={{ color: 'var(--rose)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                            <AlertTriangle size={13} strokeWidth={1.75} />
                            {simResult.records_truncated} record(s) exceed {reportedContextNum.toLocaleString()} context limit.
                          </span>
                        ) : simResult.records_at_risk > 0 ? (
                          <span style={{ color: 'var(--amber)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                            <AlertTriangle size={13} strokeWidth={1.75} />
                            {simResult.records_at_risk} record(s) within 90% of context limit.
                          </span>
                        ) : (
                          <span style={{ color: 'var(--emerald)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                            <CheckCircle2 size={13} strokeWidth={1.75} />
                            All evaluated records fit within {reportedContextNum.toLocaleString()} tokens.
                          </span>
                        )}
                      </div>
                    </div>
                  )
                ) : null}

                {/* Heuristic Estimator Disclosure */}
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.5rem', lineHeight: '1.4' }}>
                  Estimates use a deterministic heuristic (~3.7 chars/subword token, 28x28 ViT patch tiles for 448x448 standard images).
                  Actual tokenization depends on specific target framework tokenizers (e.g. LLaMA, Qwen, CLIP).
                </div>
              </div>

              {exporting && (
                <div style={{ marginBottom: '1.25rem' }}>
                  <PerceptualProgressBar active={exporting} taskType="export" />
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textAlign: 'center', marginTop: '0.35rem' }}>
                    Compiling export bundle and calculating SHA-256 integrity hashes...
                  </div>
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.65rem' }}>
                <SpringButton type="button" variant="secondary" onClick={onClose} disabled={exporting}>
                  Cancel
                </SpringButton>
                <SpringButton type="submit" variant="primary" disabled={exporting || !selectedVersionId}>
                  {exporting ? 'Compiling Archive...' : `Generate ${activePreset.title} Package`}
                </SpringButton>
              </div>
            </form>

            {/* Generated Exports List */}
            <div>
              <h3 style={{ fontSize: '0.95rem', fontWeight: 600, marginBottom: '0.65rem', borderTop: '1px solid var(--border-hairline)', paddingTop: '1rem' }}>
                Generated Export Packages ({artifacts.length})
              </h3>
              {artifacts.length === 0 ? (
                <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                  No export packages generated for this snapshot release yet.
                </p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {artifacts.map((art) => (
                    <div
                      key={art.id}
                      style={{
                        padding: '0.75rem 0.85rem',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        flexWrap: 'wrap',
                        gap: '0.65rem',
                        background: 'var(--bg-elevated)',
                        borderRadius: 'var(--radius-sm)',
                        border: '1px solid var(--border-hairline)',
                      }}
                    >
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', marginBottom: '0.2rem' }}>
                          <span className="badge badge-blue" style={{ textTransform: 'uppercase', fontSize: '0.7rem' }}>
                            {art.format}
                          </span>
                          <span style={{ fontWeight: 600, fontSize: '0.85rem' }}>
                            {art.record_count} Records
                          </span>
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                            ({(art.byte_size / 1024).toFixed(1)} KB)
                          </span>
                        </div>
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'flex', gap: '0.75rem' }}>
                          <span>Created: {new Date(art.created_at).toLocaleTimeString()}</span>
                          <span>
                            SHA-256:{' '}
                            <code style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>
                              {art.sha256.slice(0, 12)}...
                            </code>
                          </span>
                        </div>
                      </div>

                      <a
                        href={getExportDownloadUrl(art.id)}
                        className="btn btn-primary"
                        download
                        style={{ fontSize: '0.775rem', padding: '0.35rem 0.75rem', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '0.35rem' }}
                      >
                        <Download size={13} strokeWidth={1.75} /> Download ZIP
                      </a>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
    </ModalShell>
  );
};
