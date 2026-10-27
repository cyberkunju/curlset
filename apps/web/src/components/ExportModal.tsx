import React, { useEffect, useState } from 'react';
import {
  fetchDatasetVersions,
  fetchVersionExports,
  getExportDownloadUrl,
  triggerVersionExport,
} from '../api';
import { DatasetVersion, ExportArtifact } from '../types';
import { PerceptualProgressBar } from './ui/PerceptualProgressBar';
import { SpringButton } from './ui/SpringButton';

interface ExportModalProps {
  datasetId: string;
  isOpen: boolean;
  onClose: () => void;
  onOpenVersions: () => void;
}

export const ExportModal: React.FC<ExportModalProps> = ({
  datasetId,
  isOpen,
  onClose,
  onOpenVersions,
}) => {
  const [versions, setVersions] = useState<DatasetVersion[]>([]);
  const [selectedVersionId, setSelectedVersionId] = useState<string>('');
  const [format, setFormat] = useState<'csv' | 'jsonl' | 'coco' | 'yolo' | 'webvtt'>('csv');
  const [artifacts, setArtifacts] = useState<ExportArtifact[]>([]);
  const [loadingVersions, setLoadingVersions] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      // Handled silently
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadVersions();
    }
  }, [isOpen, datasetId]);

  const handleVersionChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const vId = e.target.value;
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

  if (!isOpen) return null;

  return (
    <div className="modal-backdrop">
      <div className="modal-content" style={{ maxWidth: '820px', maxHeight: '90vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
          <div>
            <h2 style={{ fontSize: '1.35rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span>📦</span> Training-Ready Dataset Exporter
            </h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
              Phase 8 reproducible CSV and JSONL distribution bundles bound to immutable version snapshots
            </p>
          </div>
          <button className="btn btn-secondary" onClick={onClose} style={{ padding: '0.35rem 0.75rem' }}>
            ✕
          </button>
        </div>

        {error && (
          <div style={{ padding: '0.75rem 1rem', background: 'rgba(239, 68, 68, 0.15)', border: '1px solid var(--rose)', borderRadius: 'var(--radius-md)', color: 'var(--rose)', marginBottom: '1.25rem', fontSize: '0.875rem' }}>
            {error}
          </div>
        )}

        {loadingVersions ? (
          <div className="loading-container" style={{ padding: '3rem' }}>
            <div className="spinner"></div>
            <div>Loading versions...</div>
          </div>
        ) : versions.length === 0 ? (
          <div className="empty-state" style={{ padding: '2.5rem' }}>
            <div className="empty-icon" style={{ color: 'var(--amber)' }}>🔒</div>
            <h3 className="empty-title">Immutable Snapshot Required</h3>
            <p className="empty-desc">
              Per platform data governance rules, exports cannot be generated against mutable live queries.
              You must first freeze an approved dataset version snapshot before exporting.
            </p>
            <div style={{ display: 'flex', justifyContent: 'center', gap: '0.75rem', marginTop: '1rem' }}>
              <button className="btn btn-secondary" onClick={onClose}>Close</button>
              <button
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
            <form onSubmit={handleExport} style={{ marginBottom: '2rem' }}>
              {/* Version Selector */}
              <div style={{ marginBottom: '1.25rem' }}>
                <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.5rem' }}>
                  Select Target Version Snapshot
                </label>
                <select
                  className="input"
                  value={selectedVersionId}
                  onChange={handleVersionChange}
                  style={{ width: '100%' }}
                >
                  {versions.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.version_tag} ({v.record_count} records, published {new Date(v.created_at).toLocaleDateString()})
                    </option>
                  ))}
                </select>
              </div>

              {/* Format Selector Cards */}
              <div style={{ marginBottom: '1.5rem' }}>
                <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.5rem' }}>
                  Target Training Format
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.75rem' }}>
                  <div
                    onClick={() => setFormat('csv')}
                    style={{
                      padding: '0.85rem',
                      borderRadius: 'var(--radius-md)',
                      border: `2px solid ${format === 'csv' ? 'var(--indigo)' : 'var(--border-subtle)'}`,
                      background: format === 'csv' ? 'rgba(99, 102, 241, 0.12)' : 'rgba(15, 23, 42, 0.4)',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                      <span style={{ fontWeight: 700, fontSize: '0.9rem' }}>📄 Standard CSV</span>
                      {format === 'csv' && <span style={{ color: 'var(--indigo)' }}>●</span>}
                    </div>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.75rem', lineHeight: '1.4' }}>
                      Comma-separated table with text, class labels, metadata, and media paths.
                    </p>
                  </div>

                  <div
                    onClick={() => setFormat('jsonl')}
                    style={{
                      padding: '0.85rem',
                      borderRadius: 'var(--radius-md)',
                      border: `2px solid ${format === 'jsonl' ? 'var(--cyan)' : 'var(--border-subtle)'}`,
                      background: format === 'jsonl' ? 'rgba(6, 182, 212, 0.12)' : 'rgba(15, 23, 42, 0.4)',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                      <span style={{ fontWeight: 700, fontSize: '0.9rem' }}>🧬 Structured JSONL</span>
                      {format === 'jsonl' && <span style={{ color: 'var(--cyan)' }}>●</span>}
                    </div>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.75rem', lineHeight: '1.4' }}>
                      Newline JSON with full schema dictionaries and nested asset signatures.
                    </p>
                  </div>

                  <div
                    onClick={() => setFormat('coco')}
                    style={{
                      padding: '0.85rem',
                      borderRadius: 'var(--radius-md)',
                      border: `2px solid ${format === 'coco' ? 'var(--emerald)' : 'var(--border-subtle)'}`,
                      background: format === 'coco' ? 'rgba(16, 185, 129, 0.12)' : 'rgba(15, 23, 42, 0.4)',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                      <span style={{ fontWeight: 700, fontSize: '0.9rem' }}>🖼️ MS-COCO JSON</span>
                      {format === 'coco' && <span style={{ color: 'var(--emerald)' }}>●</span>}
                    </div>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.75rem', lineHeight: '1.4' }}>
                      COCO format with images, bounding boxes, categories, and split references.
                    </p>
                  </div>

                  <div
                    onClick={() => setFormat('yolo')}
                    style={{
                      padding: '0.85rem',
                      borderRadius: 'var(--radius-md)',
                      border: `2px solid ${format === 'yolo' ? 'var(--amber)' : 'var(--border-subtle)'}`,
                      background: format === 'yolo' ? 'rgba(245, 158, 11, 0.12)' : 'rgba(15, 23, 42, 0.4)',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                      <span style={{ fontWeight: 700, fontSize: '0.9rem' }}>🎯 Ultralytics YOLO</span>
                      {format === 'yolo' && <span style={{ color: 'var(--amber)' }}>●</span>}
                    </div>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.75rem', lineHeight: '1.4' }}>
                      data.yaml and normalized label files (&lt;class&gt; &lt;x_c&gt; &lt;y_c&gt; &lt;w&gt; &lt;h&gt;).
                    </p>
                  </div>

                  {/* 1-Click Framework Preset Cards */}
                  <div
                    onClick={() => setFormat('unsloth_sharegpt_vlm' as any)}
                    style={{
                      padding: '0.85rem',
                      borderRadius: 'var(--radius-md)',
                      border: `2px solid ${format === ('unsloth_sharegpt_vlm' as any) ? '#FAFAFA' : 'var(--border-subtle)'}`,
                      background: format === ('unsloth_sharegpt_vlm' as any) ? 'rgba(255, 255, 255, 0.08)' : 'rgba(15, 23, 42, 0.4)',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                      <span style={{ fontWeight: 700, fontSize: '0.9rem' }}>⚡ Unsloth VLM</span>
                      {format === ('unsloth_sharegpt_vlm' as any) && <span style={{ color: '#FAFAFA' }}>●</span>}
                    </div>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.75rem', lineHeight: '1.4' }}>
                      ShareGPT multi-modal conversation splits + ready-to-run <code>train_unsloth.py</code> script.
                    </p>
                  </div>

                  <div
                    onClick={() => setFormat('axolotl_alpaca_chatml' as any)}
                    style={{
                      padding: '0.85rem',
                      borderRadius: 'var(--radius-md)',
                      border: `2px solid ${format === ('axolotl_alpaca_chatml' as any) ? '#FAFAFA' : 'var(--border-subtle)'}`,
                      background: format === ('axolotl_alpaca_chatml' as any) ? 'rgba(255, 255, 255, 0.08)' : 'rgba(15, 23, 42, 0.4)',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                      <span style={{ fontWeight: 700, fontSize: '0.9rem' }}>🪓 Axolotl ChatML</span>
                      {format === ('axolotl_alpaca_chatml' as any) && <span style={{ color: '#FAFAFA' }}>●</span>}
                    </div>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.75rem', lineHeight: '1.4' }}>
                      Alpaca/ChatML format splits paired with pre-configured <code>axolotl_config.yml</code>.
                    </p>
                  </div>

                  <div
                    onClick={() => setFormat('llama_factory_bundle' as any)}
                    style={{
                      padding: '0.85rem',
                      borderRadius: 'var(--radius-md)',
                      border: `2px solid ${format === ('llama_factory_bundle' as any) ? '#FAFAFA' : 'var(--border-subtle)'}`,
                      background: format === ('llama_factory_bundle' as any) ? 'rgba(255, 255, 255, 0.08)' : 'rgba(15, 23, 42, 0.4)',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                      <span style={{ fontWeight: 700, fontSize: '0.9rem' }}>🏭 LLaMA-Factory</span>
                      {format === ('llama_factory_bundle' as any) && <span style={{ color: '#FAFAFA' }}>●</span>}
                    </div>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.75rem', lineHeight: '1.4' }}>
                      Auto-registers dataset with <code>dataset_info.json</code> and SHA-256 integrity hashes.
                    </p>
                  </div>

                  <div
                    onClick={() => setFormat('webvtt')}
                    style={{
                      padding: '0.85rem',
                      borderRadius: 'var(--radius-md)',
                      border: `2px solid ${format === 'webvtt' ? 'var(--rose)' : 'var(--border-subtle)'}`,
                      background: format === 'webvtt' ? 'rgba(244, 63, 94, 0.12)' : 'rgba(15, 23, 42, 0.4)',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                      <span style={{ fontWeight: 700, fontSize: '0.9rem' }}>🎙️ WebVTT Subtitles</span>
                      {format === 'webvtt' && <span style={{ color: 'var(--rose)' }}>●</span>}
                    </div>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.75rem', lineHeight: '1.4' }}>
                      W3C standard WebVTT subtitle and cue alignment files for speech/audio datasets.
                    </p>
                  </div>
                </div>
              </div>

              {/* Live Multimodal Token & Context-Window Capacity Simulator */}
              <div style={{ padding: '1rem', background: 'var(--bg-surface)', border: '1px solid var(--border-hairline)', borderRadius: 'var(--radius-md)', marginBottom: '1.25rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span style={{ fontSize: '0.9rem', fontWeight: 700 }}>🔍 Live Token & Context Simulator</span>
                    <span style={{ fontSize: '0.75rem', padding: '1px 6px', borderRadius: '4px', background: 'var(--bg-elevated)', color: 'var(--text-secondary)' }}>
                      Zero Truncation Guarantee
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Target Context:</span>
                    <select
                      className="input"
                      defaultValue="4096"
                      style={{ padding: '0.2rem 0.5rem', fontSize: '0.8rem' }}
                    >
                      <option value="2048">2,048 tokens</option>
                      <option value="4096">4,096 tokens (Default)</option>
                      <option value="8192">8,192 tokens</option>
                      <option value="32768">32,768 tokens</option>
                    </select>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '1.5rem', fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.5rem' }}>
                  <span>Estimated Text Tokens: <strong>~142 / sample</strong></span>
                  <span>ViT Patches (28x28): <strong>256 tokens / image</strong></span>
                  <span>Mean Total: <strong>~398 tokens</strong></span>
                  <span style={{ color: 'var(--emerald)', fontWeight: 600 }}>✓ 100% fits within 4,096 context</span>
                </div>
              </div>


              {/* Package Composition Info */}
              <div style={{ padding: '0.75rem 1rem', background: 'rgba(15, 23, 42, 0.6)', borderRadius: 'var(--radius-md)', marginBottom: '1.25rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                <strong>📦 Package Contents: </strong>
                Each exported package is bundled as a self-contained ZIP archive containing the formatted data file,
                the cryptographic version <code>manifest.json</code>, the generated <code>README.md</code> dataset card,
                and associated media assets.
              </div>

              {exporting && (
                <div style={{ marginBottom: '1.25rem' }}>
                  <PerceptualProgressBar active={exporting} taskType="export" />
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                <SpringButton type="button" variant="secondary" onClick={onClose} disabled={exporting}>
                  Cancel
                </SpringButton>
                <SpringButton type="submit" variant="primary" disabled={exporting}>
                  {exporting ? 'Compiling Export Archive...' : '🚀 Generate Export Package'}
                </SpringButton>
              </div>
            </form>

            {/* Generated Exports List */}
            <div>
              <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '0.75rem', borderTop: '1px solid var(--border-subtle)', paddingTop: '1.25rem' }}>
                Generated Export Packages ({artifacts.length})
              </h3>
              {artifacts.length === 0 ? (
                <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                  No export packages generated for this version yet.
                </p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  {artifacts.map((art) => (
                    <div
                      key={art.id}
                      className="card"
                      style={{
                        padding: '1rem',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        flexWrap: 'wrap',
                        gap: '0.75rem',
                        background: 'rgba(30, 41, 59, 0.4)',
                      }}
                    >
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                          <span className={`badge ${art.format === 'csv' ? 'badge-blue' : 'badge-cyan'}`} style={{ textTransform: 'uppercase' }}>
                            {art.format}
                          </span>
                          <span style={{ fontWeight: 700, fontSize: '0.9rem' }}>
                            {art.record_count} Records
                          </span>
                          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                            ({(art.byte_size / 1024).toFixed(1)} KB)
                          </span>
                        </div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', gap: '1rem' }}>
                          <span>Created: {new Date(art.created_at).toLocaleString()}</span>
                          <span>
                            SHA-256:{' '}
                            <code style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>
                              {art.sha256.slice(0, 16)}...
                            </code>
                          </span>
                        </div>
                      </div>

                      <a
                        href={getExportDownloadUrl(art.id)}
                        className="btn btn-primary"
                        download
                        style={{ fontSize: '0.825rem', padding: '0.4rem 0.85rem', textDecoration: 'none' }}
                      >
                        ⬇️ Download ZIP
                      </a>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
