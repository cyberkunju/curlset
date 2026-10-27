import React, { useEffect, useState } from 'react';
import { Target, Sparkles, Layers, Info } from 'lucide-react';
import { SpringButton } from './ui/SpringButton';

interface ClusterMapModalProps {
  datasetId: string;
  isOpen: boolean;
  onClose: () => void;
  onSynthesizeGap?: (gap: any) => void;
}

export const ClusterMapModal: React.FC<ClusterMapModalProps> = ({
  datasetId,
  isOpen,
  onClose,
  onSynthesizeGap,
}) => {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [selectedGap, setSelectedGap] = useState<any>(null);
  const [hoveredPoint, setHoveredPoint] = useState<any>(null);

  useEffect(() => {
    if (isOpen) {
      loadClusters();
    }
  }, [isOpen, datasetId]);

  const loadClusters = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/v1/datasets/${datasetId}/clusters`);
      if (res.ok) {
        const json = await res.json();
        setData(json);
      }
    } catch (err) {
      console.error('Failed to load clusters', err);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  // Coordinate mapping from [-1, 1] to SVG viewBox [20, 480]
  const mapCoord = (val: number) => {
    const clamped = Math.max(-1, Math.min(1, val));
    return 250 + clamped * 220;
  };

  return (
    <div className="modal-backdrop">
      <div className="modal-content" style={{ maxWidth: '840px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
          <div>
            <h2 style={{ fontSize: '1.35rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Target size={20} strokeWidth={1.75} />
              Interactive 2D Semantic Cluster Map
            </h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
              High-dimensional SVD projection with automated data-desert coverage gap discovery
            </p>
          </div>
          <button className="btn btn-secondary" onClick={onClose} style={{ padding: '0.35rem 0.75rem' }}>
            ✕
          </button>
        </div>

        {loading ? (
          <div className="loading-container" style={{ padding: '4rem' }}>
            <div className="spinner" />
            <div>Computing 2D SVD Semantic Projection...</div>
          </div>
        ) : !data || data.points.length === 0 ? (
          <div style={{ padding: '3rem', textAlign: 'center', background: 'var(--bg-surface)', borderRadius: 'var(--radius-md)' }}>
            <Layers size={36} strokeWidth={1.75} style={{ margin: '0 auto 1rem', color: 'var(--text-muted)' }} />
            <h3 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '0.5rem' }}>Insufficient Record Vectors</h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
              Import or create at least 2 records to project clusters and identify data deserts.
            </p>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: '1.5rem', alignItems: 'start' }}>
            {/* Interactive SVG Projection Canvas */}
            <div
              style={{
                background: '#09090B',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border-hairline)',
                overflow: 'hidden',
                position: 'relative',
              }}
            >
              <svg viewBox="0 0 500 500" style={{ width: '100%', height: 'auto', display: 'block' }}>
                {/* Center grid axes */}
                <line x1="250" y1="10" x2="250" y2="490" stroke="rgba(255, 255, 255, 0.08)" strokeWidth="1" strokeDasharray="4 4" />
                <line x1="10" y1="250" x2="490" y2="250" stroke="rgba(255, 255, 255, 0.08)" strokeWidth="1" strokeDasharray="4 4" />

                {/* Coverage Gap Cells (Data Deserts) */}
                {data.coverage_gap_cells && data.coverage_gap_cells.map((gap: any) => {
                  const cx = mapCoord(gap.center_u);
                  const cy = mapCoord(gap.center_v);
                  const isSelected = selectedGap?.cell_id === gap.cell_id;
                  return (
                    <g key={gap.cell_id} onClick={() => setSelectedGap(gap)} style={{ cursor: 'pointer' }}>
                      <circle
                        cx={cx}
                        cy={cy}
                        r="34"
                        fill={isSelected ? 'rgba(244, 63, 94, 0.25)' : 'rgba(244, 63, 94, 0.08)'}
                        stroke="var(--rose)"
                        strokeWidth={isSelected ? '2' : '1'}
                        strokeDasharray="4 3"
                      />
                      <circle cx={cx} cy={cy} r="4" fill="var(--rose)" />
                    </g>
                  );
                })}

                {/* Cluster Centroids */}
                {data.clusters && data.clusters.map((c: any) => {
                  const cx = mapCoord(c.center_u);
                  const cy = mapCoord(c.center_v);
                  return (
                    <g key={c.label}>
                      <circle cx={cx} cy={cy} r="28" fill="rgba(99, 102, 241, 0.12)" stroke="var(--indigo)" strokeWidth="1.5" />
                      <text x={cx} y={cy - 8} fill="#FAFAFA" fontSize="10" fontWeight="700" textAnchor="middle">
                        {c.label}
                      </text>
                      <text x={cx} y={cy + 6} fill="var(--text-muted)" fontSize="8" textAnchor="middle">
                        {c.count} items
                      </text>
                    </g>
                  );
                })}

                {/* Record Points */}
                {data.points.map((p: any) => {
                  const cx = mapCoord(p.u);
                  const cy = mapCoord(p.v);
                  return (
                    <circle
                      key={p.record_id}
                      cx={cx}
                      cy={cy}
                      r="4"
                      fill="#FAFAFA"
                      stroke="#09090B"
                      strokeWidth="1"
                      style={{ cursor: 'pointer' }}
                      onMouseEnter={() => setHoveredPoint(p)}
                      onMouseLeave={() => setHoveredPoint(null)}
                    />
                  );
                })}
              </svg>

              {/* Hover Tooltip */}
              {hoveredPoint && (
                <div
                  style={{
                    position: 'absolute',
                    bottom: '8px',
                    left: '8px',
                    right: '8px',
                    padding: '0.4rem 0.6rem',
                    background: 'var(--bg-surface)',
                    border: '1px solid var(--border-hairline)',
                    borderRadius: 'var(--radius-sm)',
                    fontSize: '0.75rem',
                    display: 'flex',
                    justifyContent: 'space-between',
                  }}
                >
                  <span>Label: <strong>{hoveredPoint.label}</strong></span>
                  <span style={{ color: 'var(--text-muted)' }}>{hoveredPoint.snippet || hoveredPoint.record_id}</span>
                </div>
              )}
            </div>

            {/* Sidebar Inspector & Fill-the-Gap Action */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{ padding: '0.85rem', background: 'var(--bg-surface)', border: '1px solid var(--border-hairline)', borderRadius: 'var(--radius-md)' }}>
                <div style={{ fontSize: '0.8rem', fontWeight: 700, marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                  <Info size={14} /> Map Legend
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#FAFAFA' }} />
                    Dataset Records ({data.total_records})
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span style={{ width: '12px', height: '12px', borderRadius: '50%', border: '1px solid var(--indigo)', background: 'rgba(99, 102, 241, 0.2)' }} />
                    Semantic Clusters ({data.clusters.length})
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span style={{ width: '12px', height: '12px', borderRadius: '50%', border: '1px dashed var(--rose)', background: 'rgba(244, 63, 94, 0.2)' }} />
                    Coverage Blind Spots ({data.coverage_gap_cells.length})
                  </div>
                </div>
              </div>

              {/* Selected Gap Action Card */}
              {selectedGap ? (
                <div style={{ padding: '1rem', background: 'var(--bg-surface)', border: '1px solid var(--rose)', borderRadius: 'var(--radius-md)' }}>
                  <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--rose)', marginBottom: '0.25rem' }}>
                    Targeted Data Desert
                  </div>
                  <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.75rem' }}>
                    Coordinates ({selectedGap.center_u}, {selectedGap.center_v}) currently lack coverage for class <strong>{selectedGap.suggested_class}</strong>.
                  </p>
                  <SpringButton
                    variant="primary"
                    size="sm"
                    style={{ width: '100%' }}
                    onClick={() => {
                      onClose();
                      onSynthesizeGap?.(selectedGap);
                    }}
                  >
                    <Sparkles size={14} style={{ marginRight: '4px' }} />
                    Synthesize Edge Cases Here
                  </SpringButton>
                </div>
              ) : (
                <div style={{ padding: '1rem', background: 'var(--bg-surface)', border: '1px solid var(--border-hairline)', borderRadius: 'var(--radius-md)', textAlign: 'center', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  Click any dashed red circle on the map to target synthesis into that blind spot.
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
