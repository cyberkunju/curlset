import React, { useEffect, useState, useMemo } from 'react';
import {
  GitCompare,
  Layers,
  ArrowRight,
  X,
  Sliders,
  Columns,
  Maximize2,
  AlertCircle,
} from 'lucide-react';
import { SpringButton } from './ui/SpringButton';
import { CustomSelect } from './ui/CustomSelect';
import { fetchDatasetVersions } from '../api';
import { DatasetVersion } from '../types';

export interface VersionDiffModalProps {
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

  // Visual comparison controls
  const [viewMode, setViewMode] = useState<'overlay' | 'sideBySide'>('overlay');
  const [onionSkinOpacity, setOnionSkinOpacity] = useState<number>(50); // 0% = pure v1, 100% = pure v2

  useEffect(() => {
    if (isOpen) {
      loadVersions();
    } else {
      setDiffData(null);
      setError(null);
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
      setError(err.message || 'Failed to load dataset versions');
    }
  };

  const fetchDiff = async (baseId: string, targetId: string) => {
    if (!baseId || !targetId) return;
    if (baseId === targetId) {
      setDiffData(null);
      setError('Select two distinct published versions to compare differences.');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/datasets/${datasetId}/versions/${baseId}/diff/${targetId}`);
      if (!res.ok) {
        let msg = `Failed to compute version diff (${res.status})`;
        try {
          const body = await res.json();
          if (body.detail) msg = body.detail;
        } catch {
          // ignore
        }
        throw new Error(msg);
      }
      const data = await res.json();
      setDiffData(data);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch version diff');
    } finally {
      setLoading(false);
    }
  };

  // V1 and V2 layer opacities for the onion-skin overlay
  const v1LayerOpacity = useMemo(() => {
    // When opacity slider is 50%, both are visible (0.8). At 0%, v1 is 1.0, v2 is 0.0.
    return Math.max(0.1, (100 - onionSkinOpacity) / 100);
  }, [onionSkinOpacity]);

  const v2LayerOpacity = useMemo(() => {
    return Math.max(0.1, onionSkinOpacity / 100);
  }, [onionSkinOpacity]);

  if (!isOpen) return null;

  return (
    <div className="modal-backdrop" onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="diff-modal-title">
      <div
        className="modal-content"
        style={{ maxWidth: '960px', maxHeight: '90vh', overflowY: 'auto' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.25rem' }}>
          <div>
            <h2 id="diff-modal-title" style={{ fontSize: '1.25rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <GitCompare size={20} strokeWidth={1.75} style={{ color: 'var(--accent-interactive)' }} />
              Dataset Version Diff & Spatial Comparison
            </h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.825rem', marginTop: '0.15rem' }}>
              Compare cryptographic manifests, split assignments, class deltas, and spatial bounding-box shifts
            </p>
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

        {versions.length < 2 ? (
          <div style={{ padding: '2.5rem', textAlign: 'center', background: 'var(--bg-elevated)', borderRadius: 'var(--radius-md)' }}>
            <Layers size={36} strokeWidth={1.75} style={{ margin: '0 auto 0.75rem', color: 'var(--text-muted)' }} />
            <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.35rem' }}>
              Two Immutable Versions Required
            </h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.825rem', maxWidth: '440px', margin: '0 auto' }}>
              The Version Diff engine requires two distinct immutable releases. Freeze and publish at least two versions to compare deltas.
            </p>
          </div>
        ) : (
          <div>
            {/* Version Selectors Bar */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr auto 1fr auto',
                gap: '0.85rem',
                alignItems: 'flex-end',
                padding: '0.85rem 1rem',
                background: 'var(--bg-elevated)',
                borderRadius: 'var(--radius-sm)',
                marginBottom: '1.25rem',
                border: '1px solid var(--border-hairline)',
              }}
            >
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

              <div style={{ paddingBottom: '0.4rem', color: 'var(--text-muted)' }}>
                <ArrowRight size={18} strokeWidth={1.75} />
              </div>

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
                disabled={loading || v1Id === v2Id}
                style={{ fontSize: '0.8rem', padding: '0.45rem 0.85rem' }}
              >
                {loading ? 'Diffing...' : 'Compare Versions'}
              </SpringButton>
            </div>

            {v1Id === v2Id && (
              <div
                style={{
                  padding: '0.65rem 0.85rem',
                  background: 'rgba(245, 158, 11, 0.12)',
                  border: '1px solid var(--amber)',
                  borderRadius: 'var(--radius-sm)',
                  color: 'var(--amber)',
                  marginBottom: '1rem',
                  fontSize: '0.825rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                }}
              >
                <AlertCircle size={15} strokeWidth={1.75} />
                <span>Selected baseline and target versions are identical. Select two different versions to compare deltas.</span>
              </div>
            )}

            {error && (
              <div
                style={{
                  padding: '0.65rem 0.85rem',
                  background: 'rgba(239, 68, 68, 0.12)',
                  border: '1px solid var(--rose)',
                  borderRadius: 'var(--radius-sm)',
                  color: 'var(--rose)',
                  marginBottom: '1.25rem',
                  fontSize: '0.825rem',
                }}
              >
                {error}
              </div>
            )}

            {loading ? (
              <div className="loading-container" style={{ padding: '3.5rem' }}>
                <div className="spinner" style={{ width: '22px', height: '22px' }}></div>
                <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Computing version deltas...</div>
              </div>
            ) : diffData && diffData.summary ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                {/* Metric Summary Counters */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '0.65rem' }}>
                  <div className="stat-card" style={{ padding: '0.65rem 0.85rem', textAlign: 'center' }}>
                    <span className="stat-label" style={{ fontSize: '0.725rem' }}>Records Added</span>
                    <span className="stat-value" style={{ fontSize: '1.25rem', color: 'var(--emerald)' }}>
                      +{diffData.summary.records_added}
                    </span>
                  </div>
                  <div className="stat-card" style={{ padding: '0.65rem 0.85rem', textAlign: 'center' }}>
                    <span className="stat-label" style={{ fontSize: '0.725rem' }}>Records Removed</span>
                    <span className="stat-value" style={{ fontSize: '1.25rem', color: 'var(--rose)' }}>
                      -{diffData.summary.records_removed}
                    </span>
                  </div>
                  <div className="stat-card" style={{ padding: '0.65rem 0.85rem', textAlign: 'center' }}>
                    <span className="stat-label" style={{ fontSize: '0.725rem' }}>Splits Reassigned</span>
                    <span className="stat-value" style={{ fontSize: '1.25rem', color: 'var(--amber)' }}>
                      {diffData.summary.splits_changed}
                    </span>
                  </div>
                  <div className="stat-card" style={{ padding: '0.65rem 0.85rem', textAlign: 'center' }}>
                    <span className="stat-label" style={{ fontSize: '0.725rem' }}>Labels Modified</span>
                    <span className="stat-value" style={{ fontSize: '1.25rem', color: 'var(--cyan)' }}>
                      {diffData.summary.annotations_modified}
                    </span>
                  </div>
                  <div className="stat-card" style={{ padding: '0.65rem 0.85rem', textAlign: 'center' }}>
                    <span className="stat-label" style={{ fontSize: '0.725rem' }}>Mean IoU Shift</span>
                    <span className="stat-value" style={{ fontSize: '1.25rem', color: 'var(--text-primary)' }}>
                      {diffData.summary.mean_iou_shift}
                    </span>
                  </div>
                </div>

                {/* Class Distribution Delta Table */}
                {diffData.class_distribution_deltas && diffData.class_distribution_deltas.length > 0 && (
                  <div
                    style={{
                      padding: '0.85rem',
                      background: 'var(--bg-elevated)',
                      border: '1px solid var(--border-hairline)',
                      borderRadius: 'var(--radius-sm)',
                    }}
                  >
                    <h3 style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.65rem' }}>
                      Class Balance Shift Across Splits
                    </h3>
                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ width: '100%', fontSize: '0.78rem', borderCollapse: 'collapse' }}>
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
                            <tr key={row.class_name} style={{ borderBottom: '1px solid var(--border-hairline)' }}>
                              <td style={{ padding: '0.45rem 0.4rem', fontWeight: 600 }}>{row.class_name}</td>
                              {['train', 'val', 'test'].map((sp) => {
                                const cell = row[sp] || { v1: 0, v2: 0, delta: 0 };
                                const deltaColor =
                                  cell.delta > 0 ? 'var(--emerald)' : cell.delta < 0 ? 'var(--rose)' : 'var(--text-muted)';
                                return (
                                  <td key={sp} style={{ textAlign: 'center', padding: '0.45rem 0.4rem' }}>
                                    <span style={{ color: 'var(--text-muted)' }}>{cell.v1}</span>
                                    <span style={{ margin: '0 0.35rem', color: 'var(--text-muted)' }}>→</span>
                                    <span style={{ fontWeight: 600 }}>{cell.v2}</span>
                                    {cell.delta !== 0 && (
                                      <span style={{ marginLeft: '0.35rem', color: deltaColor, fontSize: '0.725rem', fontWeight: 600 }}>
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
                  </div>
                )}

                {/* Spatial Bounding-Box Delta Visualizer with Onion-Skin Opacity Slider */}
                <div
                  style={{
                    padding: '0.85rem',
                    background: 'var(--bg-elevated)',
                    border: '1px solid var(--border-hairline)',
                    borderRadius: 'var(--radius-sm)',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      marginBottom: '0.75rem',
                      flexWrap: 'wrap',
                      gap: '0.75rem',
                    }}
                  >
                    <div>
                      <h3 style={{ fontSize: '0.85rem', fontWeight: 600 }}>
                        Spatial Bounding-Box Geometry Diff
                      </h3>
                      <p style={{ fontSize: '0.725rem', color: 'var(--text-muted)', marginTop: '0.1rem' }}>
                        {diffData.spatial_diffs?.length > 0
                          ? `Comparing ${diffData.spatial_diffs.length} modified record geometries`
                          : 'No spatial bounding-box modifications between selected versions'}
                      </p>
                    </div>

                    {diffData.spatial_diffs?.length > 0 && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                        {/* View Mode Toggle */}
                        <div style={{ display: 'inline-flex', padding: '2px', background: 'var(--bg-canvas)', borderRadius: 'var(--radius-xs)', border: '1px solid var(--border-hairline)' }}>
                          <button
                            type="button"
                            onClick={() => setViewMode('overlay')}
                            style={{
                              padding: '0.2rem 0.5rem',
                              fontSize: '0.725rem',
                              border: 'none',
                              background: viewMode === 'overlay' ? 'var(--bg-surface)' : 'transparent',
                              color: viewMode === 'overlay' ? 'var(--text-primary)' : 'var(--text-muted)',
                              borderRadius: '2px',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '0.3rem',
                            }}
                          >
                            <Sliders size={12} strokeWidth={1.75} /> Overlay
                          </button>
                          <button
                            type="button"
                            onClick={() => setViewMode('sideBySide')}
                            style={{
                              padding: '0.2rem 0.5rem',
                              fontSize: '0.725rem',
                              border: 'none',
                              background: viewMode === 'sideBySide' ? 'var(--bg-surface)' : 'transparent',
                              color: viewMode === 'sideBySide' ? 'var(--text-primary)' : 'var(--text-muted)',
                              borderRadius: '2px',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '0.3rem',
                            }}
                          >
                            <Columns size={12} strokeWidth={1.75} /> Side-by-Side
                          </button>
                        </div>

                        {/* Onion-Skin Opacity Slider (Interactive) */}
                        {viewMode === 'overlay' && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <span style={{ fontSize: '0.725rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                              Onion-Skin Blend:
                            </span>
                            <span style={{ fontSize: '0.7rem', color: 'var(--rose)', fontWeight: 600 }}>v1</span>
                            <input
                              type="range"
                              min="0"
                              max="100"
                              value={onionSkinOpacity}
                              onChange={(e) => setOnionSkinOpacity(parseInt(e.target.value, 10))}
                              aria-label="Onion skin overlay blend opacity slider"
                              style={{ width: '90px', cursor: 'pointer' }}
                            />
                            <span style={{ fontSize: '0.7rem', color: 'var(--emerald)', fontWeight: 600 }}>v2</span>
                            <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', minWidth: '32px' }}>
                              {onionSkinOpacity}%
                            </span>
                          </div>
                        )}

                        {/* Legend */}
                        <div style={{ display: 'flex', gap: '0.75rem', fontSize: '0.725rem' }}>
                          <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                            <span style={{ width: '10px', height: '10px', border: '2px dashed var(--rose)', borderRadius: '2px' }} />
                            v1 Baseline
                          </span>
                          <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                            <span style={{ width: '10px', height: '10px', background: 'rgba(16, 185, 129, 0.4)', border: '2px solid var(--emerald)', borderRadius: '2px' }} />
                            v2 Current
                          </span>
                        </div>
                      </div>
                    )}
                  </div>

                  {diffData.spatial_diffs?.length === 0 ? (
                    <div style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                      No bounding-box coordinate differences detected. Spatial IoU comparisons apply to object detection records.
                    </div>
                  ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '0.85rem' }}>
                      {diffData.spatial_diffs.slice(0, 4).map((item: any) => {
                        const rawAssetUrl = item.asset_url
                          ? item.asset_url.replace('/file', '/raw')
                          : `/api/v1/assets/${item.record_id}/raw`;

                        return (
                          <div
                            key={item.record_id}
                            style={{
                              padding: '0.75rem',
                              background: 'var(--bg-canvas)',
                              borderRadius: 'var(--radius-sm)',
                              border: '1px solid var(--border-hairline)',
                            }}
                          >
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', marginBottom: '0.45rem' }}>
                              <span style={{ fontFamily: 'var(--font-mono)' }}>Record: {item.record_id.slice(0, 8)}...</span>
                              <span style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>
                                IoU: {item.mean_iou} (Shift: {item.iou_shift})
                              </span>
                            </div>

                            {viewMode === 'overlay' ? (
                              /* Overlay View with Onion-Skin Opacity Control */
                              <div
                                style={{
                                  position: 'relative',
                                  width: '100%',
                                  height: '170px',
                                  background: 'var(--bg-surface)',
                                  borderRadius: '4px',
                                  overflow: 'hidden',
                                  border: '1px solid var(--border-hairline)',
                                }}
                              >
                                {/* Background Image */}
                                <img
                                  src={rawAssetUrl}
                                  alt="Record asset canvas"
                                  style={{ width: '100%', height: '100%', objectFit: 'contain', opacity: 0.65 }}
                                  onError={(e) => {
                                    (e.target as HTMLElement).style.display = 'none';
                                  }}
                                />

                                {/* v1 Baseline Boxes Layer with Opacity */}
                                <div
                                  style={{
                                    position: 'absolute',
                                    inset: 0,
                                    opacity: v1LayerOpacity,
                                    transition: 'opacity 0.05s ease',
                                    pointerEvents: 'none',
                                  }}
                                >
                                  {item.boxes_v1.map((b: any, bi: number) => {
                                    const w = b.w ?? b.width ?? 0;
                                    const h = b.h ?? b.height ?? 0;
                                    return (
                                      <div
                                        key={`v1_${bi}`}
                                        style={{
                                          position: 'absolute',
                                          left: `${b.x}px`,
                                          top: `${b.y}px`,
                                          width: `${w}px`,
                                          height: `${h}px`,
                                          border: '2px dashed var(--rose)',
                                          background: 'rgba(239, 68, 68, 0.18)',
                                          borderRadius: '2px',
                                          boxSizing: 'border-box',
                                        }}
                                        title={`v1 ${b.label || 'box'}`}
                                      />
                                    );
                                  })}
                                </div>

                                {/* v2 Current Boxes Layer with Opacity */}
                                <div
                                  style={{
                                    position: 'absolute',
                                    inset: 0,
                                    opacity: v2LayerOpacity,
                                    transition: 'opacity 0.05s ease',
                                    pointerEvents: 'none',
                                  }}
                                >
                                  {item.boxes_v2.map((b: any, bi: number) => {
                                    const w = b.w ?? b.width ?? 0;
                                    const h = b.h ?? b.height ?? 0;
                                    return (
                                      <div
                                        key={`v2_${bi}`}
                                        style={{
                                          position: 'absolute',
                                          left: `${b.x}px`,
                                          top: `${b.y}px`,
                                          width: `${w}px`,
                                          height: `${h}px`,
                                          border: '2px solid var(--emerald)',
                                          background: 'rgba(16, 185, 129, 0.28)',
                                          borderRadius: '2px',
                                          boxSizing: 'border-box',
                                        }}
                                        title={`v2 ${b.label || 'box'}`}
                                      />
                                    );
                                  })}
                                </div>
                              </div>
                            ) : (
                              /* Side-by-Side Comparison */
                              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.4rem' }}>
                                {/* Left: v1 Baseline */}
                                <div>
                                  <div style={{ fontSize: '0.7rem', color: 'var(--rose)', fontWeight: 600, marginBottom: '0.2rem' }}>
                                    v1 Baseline ({item.boxes_v1.length} boxes)
                                  </div>
                                  <div
                                    style={{
                                      position: 'relative',
                                      height: '140px',
                                      background: 'var(--bg-surface)',
                                      borderRadius: '3px',
                                      overflow: 'hidden',
                                      border: '1px solid var(--border-hairline)',
                                    }}
                                  >
                                    <img
                                      src={rawAssetUrl}
                                      alt="Record asset canvas"
                                      style={{ width: '100%', height: '100%', objectFit: 'contain', opacity: 0.65 }}
                                      onError={(e) => {
                                        (e.target as HTMLElement).style.display = 'none';
                                      }}
                                    />
                                    {item.boxes_v1.map((b: any, bi: number) => (
                                      <div
                                        key={`v1_side_${bi}`}
                                        style={{
                                          position: 'absolute',
                                          left: `${b.x}px`,
                                          top: `${b.y}px`,
                                          width: `${b.w ?? b.width ?? 0}px`,
                                          height: `${b.h ?? b.height ?? 0}px`,
                                          border: '2px dashed var(--rose)',
                                          background: 'rgba(239, 68, 68, 0.22)',
                                          borderRadius: '2px',
                                        }}
                                      />
                                    ))}
                                  </div>
                                </div>

                                {/* Right: v2 Target */}
                                <div>
                                  <div style={{ fontSize: '0.7rem', color: 'var(--emerald)', fontWeight: 600, marginBottom: '0.2rem' }}>
                                    v2 Current ({item.boxes_v2.length} boxes)
                                  </div>
                                  <div
                                    style={{
                                      position: 'relative',
                                      height: '140px',
                                      background: 'var(--bg-surface)',
                                      borderRadius: '3px',
                                      overflow: 'hidden',
                                      border: '1px solid var(--border-hairline)',
                                    }}
                                  >
                                    <img
                                      src={rawAssetUrl}
                                      alt="Record asset canvas"
                                      style={{ width: '100%', height: '100%', objectFit: 'contain', opacity: 0.65 }}
                                      onError={(e) => {
                                        (e.target as HTMLElement).style.display = 'none';
                                      }}
                                    />
                                    {item.boxes_v2.map((b: any, bi: number) => (
                                      <div
                                        key={`v2_side_${bi}`}
                                        style={{
                                          position: 'absolute',
                                          left: `${b.x}px`,
                                          top: `${b.y}px`,
                                          width: `${b.w ?? b.width ?? 0}px`,
                                          height: `${b.h ?? b.height ?? 0}px`,
                                          border: '2px solid var(--emerald)',
                                          background: 'rgba(16, 185, 129, 0.32)',
                                          borderRadius: '2px',
                                        }}
                                      />
                                    ))}
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
};
