import React, { useEffect, useState } from 'react';
import { Target, Sparkles, Layers, Info, ZoomIn, ZoomOut, RotateCcw, AlertTriangle } from 'lucide-react';
import { SpringButton } from './ui/SpringButton';
import { ModalShell } from './ui/ModalShell';

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
  const [error, setError] = useState<string | null>(null);
  const [selectedGap, setSelectedGap] = useState<any>(null);
  const [hoveredPoint, setHoveredPoint] = useState<any>(null);
  const [zoom, setZoom] = useState<number>(1);

  useEffect(() => {
    if (isOpen) {
      loadClusters();
    }
  }, [isOpen, datasetId]);

  const loadClusters = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/datasets/${datasetId}/clusters`);
      if (!res.ok) {
        throw new Error(`Server returned HTTP ${res.status}`);
      }
      const json = await res.json();
      setData(json);
    } catch (err: any) {
      setError(err?.message || 'Failed to compute cluster map projection');
    } finally {
      setLoading(false);
    }
  };

  // Coordinate mapping from [-1, 1] to SVG viewBox [30, 470]
  const mapCoord = (val: number) => {
    const clamped = Math.max(-1, Math.min(1, val));
    return 250 + clamped * 220;
  };

  const handleZoomIn = () => setZoom((prev) => Math.min(2.5, +(prev + 0.25).toFixed(2)));
  const handleZoomOut = () => setZoom((prev) => Math.max(1, +(prev - 0.25).toFixed(2)));
  const handleZoomReset = () => setZoom(1);

  return (
    <ModalShell
      isOpen={isOpen}
      onClose={onClose}
      title="Interactive 2D Semantic Cluster Map"
      description="High-dimensional SVD projection with automated data-desert coverage gap discovery"
      icon={<Target size={20} strokeWidth={1.75} style={{ color: 'var(--accent-interactive)' }} />}
      size="xl"
      footer={
        <div style={{ display: 'flex', justifyContent: 'flex-end', width: '100%' }}>
          <button onClick={onClose} className="btn btn-secondary" style={{ padding: '0.45rem 1rem' }}>
            Close Map
          </button>
        </div>
      }
    >
      <div>
        {loading ? (
          <div className="loading-container" style={{ padding: '4rem', textAlign: 'center' }}>
            <div className="spinner" style={{ margin: '0 auto 1rem' }} />
            <div style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
              Computing 2D SVD Semantic Projection...
            </div>
          </div>
        ) : error ? (
          <div
            style={{
              padding: '3rem 2rem',
              textAlign: 'center',
              background: 'var(--bg-elevated)',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border-hairline)',
            }}
          >
            <AlertTriangle size={36} strokeWidth={1.75} style={{ margin: '0 auto 1rem', color: 'var(--rose)' }} />
            <h3 style={{ fontSize: '1.05rem', fontWeight: 600, marginBottom: '0.4rem', color: 'var(--text-primary)' }}>
              Cluster Projection Error
            </h3>
            <p style={{ color: 'var(--rose)', fontSize: '0.85rem', marginBottom: '1.25rem' }}>
              {error}
            </p>
            <button className="btn btn-secondary" onClick={loadClusters} style={{ fontSize: '0.85rem' }}>
              Retry Projection
            </button>
          </div>
        ) : !data || !data.points || data.points.length === 0 ? (
          <div
            style={{
              padding: '3.5rem 2rem',
              textAlign: 'center',
              background: 'var(--bg-elevated)',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border-hairline)',
            }}
          >
            <Layers size={36} strokeWidth={1.75} style={{ margin: '0 auto 1rem', color: 'var(--text-muted)' }} />
            <h3 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '0.4rem', color: 'var(--text-primary)' }}>
              Insufficient Record Vectors
            </h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
              Import or create at least 2 records to project clusters and identify data deserts.
            </p>
          </div>
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
              gap: '1.25rem',
              alignItems: 'start',
            }}
          >
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
              {/* Zoom Controls HUD */}
              <div
                style={{
                  position: 'absolute',
                  top: '10px',
                  right: '10px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.35rem',
                  background: 'rgba(24, 24, 27, 0.85)',
                  backdropFilter: 'blur(4px)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: 'var(--radius-sm)',
                  padding: '0.25rem',
                  zIndex: 2,
                }}
              >
                <button
                  type="button"
                  onClick={handleZoomIn}
                  disabled={zoom >= 2.5}
                  aria-label="Zoom in"
                  title="Zoom in"
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: zoom >= 2.5 ? 'rgba(255, 255, 255, 0.3)' : '#FAFAFA',
                    cursor: zoom >= 2.5 ? 'not-allowed' : 'pointer',
                    padding: '0.25rem',
                    display: 'flex',
                    alignItems: 'center',
                    borderRadius: '3px',
                  }}
                >
                  <ZoomIn size={14} />
                </button>
                <span
                  style={{
                    fontSize: '0.7rem',
                    color: '#A1A1AA',
                    fontFamily: 'var(--font-mono)',
                    minWidth: '2.5rem',
                    textAlign: 'center',
                  }}
                >
                  {zoom.toFixed(1)}x
                </span>
                <button
                  type="button"
                  onClick={handleZoomOut}
                  disabled={zoom <= 1}
                  aria-label="Zoom out"
                  title="Zoom out"
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: zoom <= 1 ? 'rgba(255, 255, 255, 0.3)' : '#FAFAFA',
                    cursor: zoom <= 1 ? 'not-allowed' : 'pointer',
                    padding: '0.25rem',
                    display: 'flex',
                    alignItems: 'center',
                    borderRadius: '3px',
                  }}
                >
                  <ZoomOut size={14} />
                </button>
                {zoom !== 1 && (
                  <button
                    type="button"
                    onClick={handleZoomReset}
                    aria-label="Reset zoom"
                    title="Reset zoom to 1.0x"
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: '#FAFAFA',
                      cursor: 'pointer',
                      padding: '0.25rem',
                      display: 'flex',
                      alignItems: 'center',
                      borderRadius: '3px',
                    }}
                  >
                    <RotateCcw size={13} />
                  </button>
                )}
              </div>

              <svg
                viewBox="0 0 500 500"
                style={{ width: '100%', height: 'auto', display: 'block' }}
                aria-label="2D SVD Semantic Cluster Map projection canvas"
                role="img"
              >
                <g transform={`scale(${zoom})`} style={{ transformOrigin: '250px 250px', transition: 'transform 0.15s ease-out' }}>
                  {/* Center grid axes */}
                  <line x1="250" y1="10" x2="250" y2="490" stroke="rgba(255, 255, 255, 0.08)" strokeWidth="1" strokeDasharray="4 4" />
                  <line x1="10" y1="250" x2="490" y2="250" stroke="rgba(255, 255, 255, 0.08)" strokeWidth="1" strokeDasharray="4 4" />

                  {/* Coverage Gap Cells (Data Deserts) */}
                  {data.coverage_gap_cells &&
                    data.coverage_gap_cells.map((gap: any) => {
                      const cx = mapCoord(gap.center_u);
                      const cy = mapCoord(gap.center_v);
                      const isSelected = selectedGap?.cell_id === gap.cell_id;
                      return (
                        <g
                          key={gap.cell_id}
                          tabIndex={0}
                          role="button"
                          aria-label={`Target coverage gap cell #${gap.cell_id} at coordinates ${gap.center_u?.toFixed(2)}, ${gap.center_v?.toFixed(2)}`}
                          onClick={() => setSelectedGap(gap)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              setSelectedGap(gap);
                            }
                          }}
                          style={{ cursor: 'pointer', outline: isSelected ? '2px solid var(--rose)' : 'none' }}
                        >
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
                  {data.clusters &&
                    data.clusters.map((c: any) => {
                      const cx = mapCoord(c.center_u);
                      const cy = mapCoord(c.center_v);
                      return (
                        <g key={c.label}>
                          <circle cx={cx} cy={cy} r="28" fill="rgba(37, 99, 235, 0.12)" stroke="var(--accent-interactive)" strokeWidth="1.5" />
                          <text x={cx} y={cy - 8} fill="#FAFAFA" fontSize="10" fontWeight="700" textAnchor="middle">
                            {c.label}
                          </text>
                          <text x={cx} y={cy + 6} fill="#A1A1AA" fontSize="8" textAnchor="middle">
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
                        tabIndex={0}
                        role="button"
                        aria-label={`Record ${p.record_id}: label ${p.label}`}
                        style={{ cursor: 'pointer' }}
                        onMouseEnter={() => setHoveredPoint(p)}
                        onMouseLeave={() => setHoveredPoint(null)}
                        onFocus={() => setHoveredPoint(p)}
                        onBlur={() => setHoveredPoint(null)}
                      />
                    );
                  })}
                </g>
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
                  <span>
                    Label: <strong>{hoveredPoint.label}</strong>
                  </span>
                  <span style={{ color: 'var(--text-muted)' }}>{hoveredPoint.snippet || hoveredPoint.record_id}</span>
                </div>
              )}
            </div>

            {/* Sidebar Inspector & Fill-the-Gap Action */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div
                style={{
                  padding: '0.85rem',
                  background: 'var(--bg-elevated)',
                  border: '1px solid var(--border-hairline)',
                  borderRadius: 'var(--radius-md)',
                }}
              >
                <div
                  style={{
                    fontSize: '0.8rem',
                    fontWeight: 600,
                    marginBottom: '0.5rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.35rem',
                    color: 'var(--text-primary)',
                  }}
                >
                  <Info size={14} /> Map Legend
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#FAFAFA', border: '1px solid #71717A' }} />
                    Dataset Records ({data.total_records || data.points.length})
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span
                      style={{
                        width: '12px',
                        height: '12px',
                        borderRadius: '50%',
                        border: '1.5px solid var(--accent-interactive)',
                        background: 'rgba(37, 99, 235, 0.2)',
                      }}
                    />
                    Semantic Clusters ({data.clusters?.length || 0})
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span
                      style={{
                        width: '12px',
                        height: '12px',
                        borderRadius: '50%',
                        border: '1.5px dashed var(--rose)',
                        background: 'rgba(244, 63, 94, 0.2)',
                      }}
                    />
                    Coverage Blind Spots ({data.coverage_gap_cells?.length || 0})
                  </div>
                </div>
              </div>

              {/* Accessible Gap Selector (Dropdown for keyboard / screen-reader accessibility) */}
              {data.coverage_gap_cells && data.coverage_gap_cells.length > 0 && (
                <div
                  style={{
                    padding: '0.85rem',
                    background: 'var(--bg-surface)',
                    border: '1px solid var(--border-hairline)',
                    borderRadius: 'var(--radius-md)',
                  }}
                >
                  <label
                    htmlFor="coverageGapSelect"
                    style={{
                      display: 'block',
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      color: 'var(--text-secondary)',
                      marginBottom: '0.35rem',
                    }}
                  >
                    Select Coverage Blind Spot
                  </label>
                  <select
                    id="coverageGapSelect"
                    className="form-input"
                    value={selectedGap?.cell_id ?? ''}
                    onChange={(e) => {
                      const id = e.target.value;
                      const gap = data.coverage_gap_cells.find((g: any) => String(g.cell_id) === id);
                      setSelectedGap(gap || null);
                    }}
                    style={{ width: '100%', fontSize: '0.8rem', padding: '0.35rem 0.5rem' }}
                  >
                    <option value="">-- Choose a blind spot cell --</option>
                    {data.coverage_gap_cells.map((g: any) => (
                      <option key={g.cell_id} value={g.cell_id}>
                        Cell #{g.cell_id} ({g.center_u?.toFixed(2)}, {g.center_v?.toFixed(2)}) — {g.suggested_class || 'Underrepresented'}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Selected Gap Action Card */}
              {selectedGap ? (
                <div
                  style={{
                    padding: '1rem',
                    background: 'var(--bg-surface)',
                    border: '1px solid var(--rose)',
                    borderRadius: 'var(--radius-md)',
                  }}
                >
                  <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--rose)', marginBottom: '0.25rem' }}>
                    Targeted Data Desert
                  </div>
                  <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.75rem', lineHeight: 1.4 }}>
                    Coordinates ({selectedGap.center_u?.toFixed(2) ?? selectedGap.center_u}, {selectedGap.center_v?.toFixed(2) ?? selectedGap.center_v}) currently lack coverage for class{' '}
                    <strong>{selectedGap.suggested_class || 'Underrepresented'}</strong>.
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
                <div
                  style={{
                    padding: '1rem',
                    background: 'var(--bg-elevated)',
                    border: '1px solid var(--border-hairline)',
                    borderRadius: 'var(--radius-md)',
                    textAlign: 'center',
                    fontSize: '0.8rem',
                    color: 'var(--text-muted)',
                  }}
                >
                  Click any dashed red circle on the map or choose a cell from the dropdown to target synthesis into that blind spot.
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </ModalShell>
  );
};
