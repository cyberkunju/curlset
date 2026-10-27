import React, { useEffect, useState } from 'react';
import { GitCompare, Layers, CheckCircle, AlertTriangle, ArrowRight, X } from 'lucide-react';
import { SpringButton } from './ui/SpringButton';
import { CustomSelect } from './ui/CustomSelect';
import { fetchDatasetVersions } from '../api';
import { DatasetVersion } from '../types';

interface VersionDiffModalProps {
  datasetId: string;
  isOpen: boolean;
  onClose: () => void;
}

export const VersionDiffModal: React.FC<VersionDiffModalProps> = ({
  datasetId,
  isOpen,
  onClose,
}) => {
  const [versions, setVersions] = useState<DatasetVersion[]>([]);
  const [v1Id, setV1Id] = useState<string>('');
  const [v2Id, setV2Id] = useState<string>('');
  const [diffData, setDiffData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      loadVersions();
    }
  }, [isOpen, datasetId]);

  const loadVersions = async () => {
    try {
      const vers = await fetchDatasetVersions(datasetId);
      setVersions(vers);
      if (vers.length >= 2) {
        setV1Id(vers[1].id);
        setV2Id(vers[0].id);
        fetchDiff(vers[1].id, vers[0].id);
      } else if (vers.length === 1) {
        setV1Id(vers[0].id);
        setV2Id(vers[0].id);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load versions');
    }
  };

  const fetchDiff = async (baseId: string, targetId: string) => {
    if (!baseId || !targetId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/datasets/${datasetId}/versions/${baseId}/diff/${targetId}`);
      if (!res.ok) throw new Error('Failed to compute version git-diff');
      const data = await res.json();
      setDiffData(data);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch diff');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-backdrop">
      <div className="modal-content" style={{ maxWidth: '920px', maxHeight: '90vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
          <div>
            <h2 style={{ fontSize: '1.35rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <GitCompare size={20} strokeWidth={1.75} />
              Visual Dataset Git-Diff Engine
            </h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
              Cryptographic release comparison, class delta distributions, and spatial IoU shifts
            </p>
          </div>
          <button className="btn btn-secondary" onClick={onClose} aria-label="Close dialog" style={{ padding: '0.35rem 0.5rem', display: 'flex', alignItems: 'center' }}>
            <X size={18} />
          </button>
        </div>

        {versions.length < 2 ? (
          <div style={{ padding: '2.5rem', textAlign: 'center', background: 'var(--bg-surface)', borderRadius: 'var(--radius-md)' }}>
            <Layers size={36} strokeWidth={1.75} style={{ margin: '0 auto 1rem', color: 'var(--text-muted)' }} />
            <h3 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '0.5rem' }}>Two Immutable Versions Required</h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', maxWidth: '420px', margin: '0 auto' }}>
              The Visual Git-Diff engine compares changes between two distinct immutable published versions. Publish at least two versions to compare deltas.
            </p>
          </div>
        ) : (
          <div>
            {/* Version Selectors Bar */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr auto', gap: '1rem', alignItems: 'center', padding: '1rem', background: 'var(--bg-surface)', borderRadius: 'var(--radius-md)', marginBottom: '1.25rem', border: '1px solid var(--border-hairline)' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.25rem' }}>
                  Baseline Release (v1)
                </label>
                <CustomSelect
                  value={v1Id}
                  onChange={(val) => {
                    setV1Id(val);
                    fetchDiff(val, v2Id);
                  }}
                  options={versions.map((v) => ({
                    value: v.id,
                    label: `${v.version_tag} (${v.record_count} items)`,
                  }))}
                  style={{ width: '100%' }}
                  ariaLabel="Select baseline release"
                />
              </div>

              <ArrowRight size={18} style={{ color: 'var(--text-muted)' }} />

              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.25rem' }}>
                  Target Release (v2)
                </label>
                <CustomSelect
                  value={v2Id}
                  onChange={(val) => {
                    setV2Id(val);
                    fetchDiff(v1Id, val);
                  }}
                  options={versions.map((v) => ({
                    value: v.id,
                    label: `${v.version_tag} (${v.record_count} items)`,
                  }))}
                  style={{ width: '100%' }}
                  ariaLabel="Select target release"
                />
              </div>

              <SpringButton
                variant="primary"
                size="sm"
                onClick={() => fetchDiff(v1Id, v2Id)}
                disabled={loading}
              >
                {loading ? 'Diffing...' : 'Recompute Diff'}
              </SpringButton>
            </div>

            {error && (
              <div style={{ padding: '0.75rem 1rem', background: 'rgba(239, 68, 68, 0.15)', border: '1px solid var(--rose)', borderRadius: 'var(--radius-md)', color: 'var(--rose)', marginBottom: '1.25rem' }}>
                {error}
              </div>
            )}

            {diffData && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                {/* Metric Summary Counters */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '0.75rem' }}>
                  <div style={{ padding: '0.75rem', background: 'var(--bg-surface)', border: '1px solid var(--border-hairline)', borderRadius: 'var(--radius-sm)', textAlign: 'center' }}>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Records Added</div>
                    <div style={{ fontSize: '1.35rem', fontWeight: 800, color: 'var(--emerald)' }}>+{diffData.summary.records_added}</div>
                  </div>
                  <div style={{ padding: '0.75rem', background: 'var(--bg-surface)', border: '1px solid var(--border-hairline)', borderRadius: 'var(--radius-sm)', textAlign: 'center' }}>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Records Removed</div>
                    <div style={{ fontSize: '1.35rem', fontWeight: 800, color: 'var(--rose)' }}>-{diffData.summary.records_removed}</div>
                  </div>
                  <div style={{ padding: '0.75rem', background: 'var(--bg-surface)', border: '1px solid var(--border-hairline)', borderRadius: 'var(--radius-sm)', textAlign: 'center' }}>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Splits Reassigned</div>
                    <div style={{ fontSize: '1.35rem', fontWeight: 800, color: 'var(--amber)' }}>{diffData.summary.splits_changed}</div>
                  </div>
                  <div style={{ padding: '0.75rem', background: 'var(--bg-surface)', border: '1px solid var(--border-hairline)', borderRadius: 'var(--radius-sm)', textAlign: 'center' }}>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Labels Modified</div>
                    <div style={{ fontSize: '1.35rem', fontWeight: 800, color: '#38BDF8' }}>{diffData.summary.annotations_modified}</div>
                  </div>
                  <div style={{ padding: '0.75rem', background: 'var(--bg-surface)', border: '1px solid var(--border-hairline)', borderRadius: 'var(--radius-sm)', textAlign: 'center' }}>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Spatial IoU Shift</div>
                    <div style={{ fontSize: '1.35rem', fontWeight: 800, color: '#FAFAFA' }}>{diffData.summary.mean_iou_shift}</div>
                  </div>
                </div>

                {/* Class Distribution Delta Table */}
                {diffData.class_distribution_deltas && diffData.class_distribution_deltas.length > 0 && (
                  <div style={{ padding: '1rem', background: 'var(--bg-surface)', border: '1px solid var(--border-hairline)', borderRadius: 'var(--radius-md)' }}>
                    <h3 style={{ fontSize: '0.9rem', fontWeight: 700, marginBottom: '0.75rem' }}>
                      Class Balance Shift Across Splits
                    </h3>
                    <table style={{ width: '100%', fontSize: '0.8rem', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr style={{ borderBottom: '1px solid var(--border-hairline)', color: 'var(--text-muted)' }}>
                          <th style={{ textAlign: 'left', padding: '0.4rem' }}>Class</th>
                          <th style={{ textAlign: 'center', padding: '0.4rem' }}>Train (v1 → v2)</th>
                          <th style={{ textAlign: 'center', padding: '0.4rem' }}>Val (v1 → v2)</th>
                          <th style={{ textAlign: 'center', padding: '0.4rem' }}>Test (v1 → v2)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {diffData.class_distribution_deltas.map((row: any) => (
                          <tr key={row.class_name} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.04)' }}>
                            <td style={{ padding: '0.5rem 0.4rem', fontWeight: 600 }}>{row.class_name}</td>
                            {['train', 'val', 'test'].map((sp) => {
                              const cell = row[sp] || { v1: 0, v2: 0, delta: 0 };
                              const deltaColor = cell.delta > 0 ? 'var(--emerald)' : cell.delta < 0 ? 'var(--rose)' : 'var(--text-muted)';
                              return (
                                <td key={sp} style={{ textAlign: 'center', padding: '0.5rem 0.4rem' }}>
                                  <span style={{ color: 'var(--text-muted)' }}>{cell.v1}</span>
                                  <span style={{ margin: '0 0.35rem', color: 'var(--text-muted)' }}>→</span>
                                  <span style={{ fontWeight: 700 }}>{cell.v2}</span>
                                  {cell.delta !== 0 && (
                                    <span style={{ marginLeft: '0.4rem', color: deltaColor, fontSize: '0.75rem' }}>
                                      ({cell.delta > 0 ? `+${cell.delta}` : cell.delta})
                                    </span>
                                  )}
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Spatial Bounding-Box Overlay Comparison */}
                {diffData.spatial_diffs && diffData.spatial_diffs.length > 0 && (
                  <div style={{ padding: '1rem', background: 'var(--bg-surface)', border: '1px solid var(--border-hairline)', borderRadius: 'var(--radius-md)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                      <h3 style={{ fontSize: '0.9rem', fontWeight: 700 }}>
                        Spatial Bounding-Box Delta Visualizer ({diffData.spatial_diffs.length} modified items)
                      </h3>
                      <div style={{ display: 'flex', gap: '1rem', fontSize: '0.75rem' }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                          <span style={{ width: '12px', height: '12px', border: '2px dashed var(--rose)', borderRadius: '2px' }} />
                          v1 Boxes (Baseline)
                        </span>
                        <span style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                          <span style={{ width: '12px', height: '12px', background: 'rgba(16, 185, 129, 0.4)', border: '2px solid var(--emerald)', borderRadius: '2px' }} />
                          v2 Boxes (Current)
                        </span>
                      </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem' }}>
                      {diffData.spatial_diffs.slice(0, 4).map((item: any) => (
                        <div
                          key={item.record_id}
                          style={{
                            padding: '0.75rem',
                            background: 'var(--bg-elevated)',
                            borderRadius: 'var(--radius-sm)',
                            border: '1px solid var(--border-hairline)',
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', marginBottom: '0.5rem' }}>
                            <span style={{ fontFamily: 'var(--font-mono)' }}>{item.record_id.slice(0, 8)}</span>
                            <span style={{ color: 'var(--text-accent)' }}>Mean IoU: {item.mean_iou}</span>
                          </div>

                          <div
                            style={{
                              position: 'relative',
                              width: '100%',
                              height: '160px',
                              background: '#09090B',
                              borderRadius: '4px',
                              overflow: 'hidden',
                              border: '1px solid var(--border-hairline)',
                            }}
                          >
                            {/* v1 Boxes: Dashed Rose */}
                            {item.boxes_v1.map((b: any, bi: number) => (
                              <div
                                key={`v1_${bi}`}
                                style={{
                                  position: 'absolute',
                                  left: `${b.x}px`,
                                  top: `${b.y}px`,
                                  width: `${b.w || b.width}px`,
                                  height: `${b.h || b.height}px`,
                                  border: '2px dashed var(--rose)',
                                  background: 'rgba(239, 68, 68, 0.15)',
                                }}
                              />
                            ))}

                            {/* v2 Boxes: Solid Emerald */}
                            {item.boxes_v2.map((b: any, bi: number) => (
                              <div
                                key={`v2_${bi}`}
                                style={{
                                  position: 'absolute',
                                  left: `${b.x}px`,
                                  top: `${b.y}px`,
                                  width: `${b.w || b.width}px`,
                                  height: `${b.h || b.height}px`,
                                  border: '2px solid var(--emerald)',
                                  background: 'rgba(16, 185, 129, 0.25)',
                                }}
                              />
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
