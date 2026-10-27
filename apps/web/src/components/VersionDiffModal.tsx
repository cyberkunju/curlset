import React, { useEffect, useState, useMemo, useRef } from 'react';
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
import {
  identifyCoordinateSystem,
  shouldPlotVersionGeometry,
} from '../utils/coordinateContract';

export interface VersionDiffModalProps {
  datasetId: string;
  isOpen: boolean;
  onClose: () => void;
}

interface SpatialDiffViewerProps {
  assetUrl: string | null;
  boxesV1: any[];
  boxesV2: any[];
  coordinateSystemV1?: string | null;
  coordinateSystemV2?: string | null;
  imageDimensionsV1?: { width: number; height: number } | null;
  imageDimensionsV2?: { width: number; height: number } | null;
  assetDimensions?: { width: number; height: number } | null;
  assetDimensionsV1?: { width: number; height: number } | null;
  assetDimensionsV2?: { width: number; height: number } | null;
  viewMode: 'overlay' | 'sideBySide';
  v1Opacity: number;
  v2Opacity: number;
  recordId: string;
}

const SpatialDiffViewer: React.FC<SpatialDiffViewerProps> = ({
  assetUrl,
  boxesV1,
  boxesV2,
  coordinateSystemV1,
  coordinateSystemV2,
  imageDimensionsV1,
  imageDimensionsV2,
  assetDimensions,
  assetDimensionsV1,
  assetDimensionsV2,
  viewMode,
  v1Opacity,
  v2Opacity,
  recordId,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [naturalDims, setNaturalDims] = useState<{ width: number; height: number } | null>(null);
  const [containerDims, setContainerDims] = useState<{ width: number; height: number }>({ width: 300, height: 170 });
  const [imgError, setImgError] = useState(false);

  // V1 and V2 must resolve their reference dimensions independently to avoid cross-version dimension leakage.
  // We prefer the version's explicit payload dimensions, then that version's asset metadata, then the loaded asset natural dimensions.
  const dimsV1 = useMemo(() => {
    if (imageDimensionsV1 && imageDimensionsV1.width > 0 && imageDimensionsV1.height > 0) return imageDimensionsV1;
    if (assetDimensionsV1 && assetDimensionsV1.width > 0 && assetDimensionsV1.height > 0) return assetDimensionsV1;
    if (assetDimensions && assetDimensions.width > 0 && assetDimensions.height > 0) return assetDimensions;
    if (naturalDims && naturalDims.width > 0 && naturalDims.height > 0) return naturalDims;
    return null;
  }, [imageDimensionsV1, assetDimensionsV1, assetDimensions, naturalDims]);

  const dimsV2 = useMemo(() => {
    if (imageDimensionsV2 && imageDimensionsV2.width > 0 && imageDimensionsV2.height > 0) return imageDimensionsV2;
    if (assetDimensionsV2 && assetDimensionsV2.width > 0 && assetDimensionsV2.height > 0) return assetDimensionsV2;
    if (assetDimensions && assetDimensions.width > 0 && assetDimensions.height > 0) return assetDimensions;
    if (naturalDims && naturalDims.width > 0 && naturalDims.height > 0) return naturalDims;
    return null;
  }, [imageDimensionsV2, assetDimensionsV2, assetDimensions, naturalDims]);

  const coordSystemV1 = useMemo(() => identifyCoordinateSystem(coordinateSystemV1, boxesV1), [coordinateSystemV1, boxesV1]);
  const coordSystemV2 = useMemo(() => identifyCoordinateSystem(coordinateSystemV2, boxesV2), [coordinateSystemV2, boxesV2]);

  const v1Plottable = useMemo(() => shouldPlotVersionGeometry(coordinateSystemV1, boxesV1, dimsV1), [coordinateSystemV1, boxesV1, dimsV1]);
  const v2Plottable = useMemo(() => shouldPlotVersionGeometry(coordinateSystemV2, boxesV2, dimsV2), [coordinateSystemV2, boxesV2, dimsV2]);

  // Measure container dimensions with ResizeObserver
  useEffect(() => {
    if (!containerRef.current) return;
    const updateSize = () => {
      if (containerRef.current) {
        setContainerDims({
          width: containerRef.current.clientWidth || 300,
          height: containerRef.current.clientHeight || (viewMode === 'overlay' ? 170 : 140),
        });
      }
    };
    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [viewMode]);

  // Compute image-relative bounding box dimensions accounting for object-fit: contain letterbox offsets
  const computeBoxStyle = (box: any, isV1: boolean) => {
    // If this version is not plottable according to the coordinate contract, do not fabricate geometry
    if (isV1 && !v1Plottable) return null;
    if (!isV1 && !v2Plottable) return null;

    const activeCoordSystem = isV1 ? coordSystemV1 : coordSystemV2;
    const activeVersionDims = isV1 ? dimsV1 : dimsV2;

    const cw = containerDims.width;
    const ch = containerDims.height;
    const bx = Number(box.x) || 0;
    const by = Number(box.y) || 0;
    const bw = Number(box.w ?? box.width) || 0;
    const bh = Number(box.h ?? box.height) || 0;

    if (activeCoordSystem === 'uncalibrated-legacy' || activeCoordSystem === 'unknown') {
      return null;
    }

    if (activeCoordSystem === 'normalized') {
      if (activeVersionDims && activeVersionDims.width > 0 && activeVersionDims.height > 0) {
        const nw = activeVersionDims.width;
        const nh = activeVersionDims.height;
        const rImg = nw / nh;
        const rCont = cw / ch;

        let renderedW = cw;
        let renderedH = ch;
        let offX = 0;
        let offY = 0;

        if (rCont > rImg) {
          renderedH = ch;
          renderedW = ch * rImg;
          offX = (cw - renderedW) / 2;
          offY = 0;
        } else {
          renderedW = cw;
          renderedH = cw / rImg;
          offX = 0;
          offY = (ch - renderedH) / 2;
        }

        const scaledX = bx * renderedW;
        const scaledY = by * renderedH;
        const scaledW = bw * renderedW;
        const scaledH = bh * renderedH;

        const clampedX = Math.max(0, Math.min(renderedW, scaledX));
        const clampedY = Math.max(0, Math.min(renderedH, scaledY));
        const clampedW = Math.max(2, Math.min(renderedW - clampedX, scaledW));
        const clampedH = Math.max(2, Math.min(renderedH - clampedY, scaledH));

        return {
          left: `${offX + clampedX}px`,
          top: `${offY + clampedY}px`,
          width: `${clampedW}px`,
          height: `${clampedH}px`,
        };
      }

      // Fallback for normalized without dimensions: map to container directly
      return {
        left: `${bx * cw}px`,
        top: `${by * ch}px`,
        width: `${Math.max(2, bw * cw)}px`,
        height: `${Math.max(2, bh * ch)}px`,
      };
    }

    if (activeCoordSystem === 'pixel-intrinsic') {
      if (!activeVersionDims || activeVersionDims.width <= 0 || activeVersionDims.height <= 0) {
        return null;
      }

      const nw = activeVersionDims.width;
      const nh = activeVersionDims.height;
      const rImg = nw / nh;
      const rCont = cw / ch;

      let renderedW = cw;
      let renderedH = ch;
      let offX = 0;
      let offY = 0;

      if (rCont > rImg) {
        renderedH = ch;
        renderedW = ch * rImg;
        offX = (cw - renderedW) / 2;
        offY = 0;
      } else {
        renderedW = cw;
        renderedH = cw / rImg;
        offX = 0;
        offY = (ch - renderedH) / 2;
      }

      const scaleX = renderedW / nw;
      const scaleY = renderedH / nh;
      const scaledX = bx * scaleX;
      const scaledY = by * scaleY;
      const scaledW = bw * scaleX;
      const scaledH = bh * scaleY;

      const clampedX = Math.max(0, Math.min(renderedW, scaledX));
      const clampedY = Math.max(0, Math.min(renderedH, scaledY));
      const clampedW = Math.max(2, Math.min(renderedW - clampedX, scaledW));
      const clampedH = Math.max(2, Math.min(renderedH - clampedY, scaledH));

      return {
        left: `${offX + clampedX}px`,
        top: `${offY + clampedY}px`,
        width: `${clampedW}px`,
        height: `${clampedH}px`,
      };
    }

    return null;
  };

  const renderBoxesLayer = (boxes: any[], isV1: boolean, opacity: number) => {
    if (opacity <= 0) return null;
    return (
      <div
        style={{
          position: 'absolute',
          inset: 0,
          opacity,
          transition: 'opacity 0.05s ease',
          pointerEvents: 'none',
        }}
      >
        {boxes.map((b: any, idx: number) => {
          const style = computeBoxStyle(b, isV1);
          if (!style) return null;
          return (
            <div
              key={`${isV1 ? 'v1' : 'v2'}_${idx}`}
              style={{
                position: 'absolute',
                ...style,
                border: isV1 ? '2px dashed var(--rose)' : '2px solid var(--emerald)',
                background: isV1 ? 'rgba(239, 68, 68, 0.18)' : 'rgba(16, 185, 129, 0.28)',
                borderRadius: '2px',
                boxSizing: 'border-box',
              }}
              title={`${isV1 ? 'v1 Baseline' : 'v2 Target'}: ${b.label || 'box'}`}
            >
              <span
                style={{
                  position: 'absolute',
                  top: '-14px',
                  left: 0,
                  fontSize: '0.62rem',
                  fontWeight: 600,
                  fontFamily: 'var(--font-mono)',
                  color: isV1 ? 'var(--rose)' : 'var(--emerald)',
                  background: 'var(--bg-canvas)',
                  padding: '0 2px',
                  borderRadius: '2px',
                  whiteSpace: 'nowrap',
                  lineHeight: '1.2',
                }}
              >
                {b.label || (isV1 ? 'v1' : 'v2')}
              </span>
            </div>
          );
        })}
      </div>
    );
  };

  const hasValidAsset = Boolean(assetUrl && !imgError);
  const hasAnyBoxes = (boxesV1 && boxesV1.length > 0) || (boxesV2 && boxesV2.length > 0);
  const hasPlottableBoxes =
    (boxesV1.length > 0 && v1Plottable) || (boxesV2.length > 0 && v2Plottable);

  // If there are boxes present, but neither version can be safely plotted, show truthful geometry unavailable state
  if (hasAnyBoxes && !hasPlottableBoxes) {
    return (
      <div
        style={{
          width: '100%',
          minHeight: '140px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'var(--bg-surface)',
          border: '1px dashed var(--border-hairline)',
          borderRadius: '4px',
          padding: '1rem',
          textAlign: 'center',
          gap: '0.35rem',
        }}
      >
        <AlertCircle size={20} style={{ color: 'var(--amber)' }} />
        <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-primary)' }}>
          Spatial Geometry Unavailable (Uncalibrated)
        </div>
        <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', maxWidth: '300px', lineHeight: 1.4 }}>
          Coordinates lack calibration metadata or reliable source-image dimensions for record {recordId.slice(0, 8)}. Exact bounding boxes cannot be plotted truthfully.
        </div>
        <div style={{ fontSize: '0.68rem', fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
          Baseline (v1): {boxesV1.length} box{boxesV1.length === 1 ? '' : 'es'} ({coordSystemV1}) · Target (v2): {boxesV2.length} box{boxesV2.length === 1 ? '' : 'es'} ({coordSystemV2})
        </div>
      </div>
    );
  }

  // If neither asset nor dimensions exist at all
  if (!hasValidAsset && !dimsV1 && !dimsV2) {
    return (
      <div
        style={{
          width: '100%',
          minHeight: '140px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'var(--bg-surface)',
          border: '1px dashed var(--border-hairline)',
          borderRadius: '4px',
          padding: '1rem',
          textAlign: 'center',
          gap: '0.35rem',
        }}
      >
        <AlertCircle size={20} style={{ color: 'var(--amber)' }} />
        <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-primary)' }}>
          Spatial Geometry Unavailable
        </div>
        <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', maxWidth: '280px', lineHeight: 1.4 }}>
          Media asset and intrinsic dimensions are not recorded for record {recordId.slice(0, 8)}. Exact bounding coordinates cannot be accurately projected.
        </div>
        <div style={{ fontSize: '0.68rem', fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
          Baseline: {boxesV1.length} box{boxesV1.length === 1 ? '' : 'es'} · Target: {boxesV2.length} box{boxesV2.length === 1 ? '' : 'es'}
        </div>
      </div>
    );
  }

  const activeDimsDisplay = dimsV2 || dimsV1;

  if (viewMode === 'overlay') {
    return (
      <div
        ref={containerRef}
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
        {hasValidAsset ? (
          <img
            src={assetUrl!}
            alt={`Record ${recordId} asset canvas`}
            style={{ width: '100%', height: '100%', objectFit: 'contain', opacity: 0.65 }}
            onLoad={(e) => {
              const img = e.currentTarget;
              if (img.naturalWidth > 0 && img.naturalHeight > 0) {
                setNaturalDims({ width: img.naturalWidth, height: img.naturalHeight });
              }
            }}
            onError={() => setImgError(true)}
          />
        ) : (
          <div
            style={{
              width: '100%',
              height: '100%',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              background:
                'repeating-linear-gradient(45deg, var(--bg-surface), var(--bg-surface) 10px, var(--bg-elevated) 10px, var(--bg-elevated) 20px)',
              color: 'var(--text-muted)',
              fontSize: '0.72rem',
              padding: '0.5rem',
              textAlign: 'center',
            }}
          >
            <span>Geometry projected onto source frame ({activeDimsDisplay?.width}×{activeDimsDisplay?.height}px)</span>
          </div>
        )}

        {/* Calibration & Coordinate Space Badges */}
        <div
          style={{
            position: 'absolute',
            bottom: '4px',
            right: '4px',
            display: 'flex',
            gap: '4px',
            pointerEvents: 'none',
          }}
        >
          {activeDimsDisplay && (
            <span
              style={{
                fontSize: '0.58rem',
                fontFamily: 'var(--font-mono)',
                padding: '1px 4px',
                borderRadius: '2px',
                background: 'rgba(0,0,0,0.65)',
                color: 'var(--text-secondary)',
              }}
            >
              {activeDimsDisplay.width}×{activeDimsDisplay.height}px
            </span>
          )}
          {boxesV1.length > 0 && !v1Plottable && (
            <span
              style={{
                fontSize: '0.58rem',
                fontFamily: 'var(--font-mono)',
                padding: '1px 4px',
                borderRadius: '2px',
                background: 'rgba(239, 68, 68, 0.85)',
                color: '#fff',
              }}
              title="v1 coordinates lack calibration metadata and cannot be plotted"
            >
              v1: {boxesV1.length} uncalibrated
            </span>
          )}
          {boxesV2.length > 0 && !v2Plottable && (
            <span
              style={{
                fontSize: '0.58rem',
                fontFamily: 'var(--font-mono)',
                padding: '1px 4px',
                borderRadius: '2px',
                background: 'rgba(239, 68, 68, 0.85)',
                color: '#fff',
              }}
              title="v2 coordinates lack calibration metadata and cannot be plotted"
            >
              v2: {boxesV2.length} uncalibrated
            </span>
          )}
        </div>

        {renderBoxesLayer(boxesV1, true, v1Opacity)}
        {renderBoxesLayer(boxesV2, false, v2Opacity)}
      </div>
    );
  }

  // Side-by-side mode
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
      <div>
        <div style={{ fontSize: '0.7rem', color: 'var(--rose)', fontWeight: 600, marginBottom: '0.2rem' }}>
          v1 Baseline ({boxesV1.length} boxes)
        </div>
        <div
          ref={containerRef}
          style={{
            position: 'relative',
            height: '140px',
            background: 'var(--bg-surface)',
            borderRadius: '3px',
            overflow: 'hidden',
            border: '1px solid var(--border-hairline)',
          }}
        >
          {hasValidAsset ? (
            <img
              src={assetUrl!}
              alt={`Record ${recordId} v1 canvas`}
              style={{ width: '100%', height: '100%', objectFit: 'contain', opacity: 0.65 }}
              onLoad={(e) => {
                const img = e.currentTarget;
                if (img.naturalWidth > 0 && img.naturalHeight > 0) {
                  setNaturalDims({ width: img.naturalWidth, height: img.naturalHeight });
                }
              }}
              onError={() => setImgError(true)}
            />
          ) : (
            <div
              style={{
                width: '100%',
                height: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'var(--bg-elevated)',
                color: 'var(--text-muted)',
                fontSize: '0.7rem',
              }}
            >
              Geometry only
            </div>
          )}
          {boxesV1.length > 0 && !v1Plottable ? (
            <div
              style={{
                position: 'absolute',
                inset: 0,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'rgba(0,0,0,0.55)',
                padding: '0.5rem',
                textAlign: 'center',
              }}
            >
              <span style={{ fontSize: '0.65rem', color: 'var(--amber)', fontWeight: 600 }}>Uncalibrated</span>
              <span style={{ fontSize: '0.58rem', color: 'var(--text-muted)' }}>{boxesV1.length} boxes hidden</span>
            </div>
          ) : (
            renderBoxesLayer(boxesV1, true, 1.0)
          )}
        </div>
      </div>

      <div>
        <div style={{ fontSize: '0.7rem', color: 'var(--emerald)', fontWeight: 600, marginBottom: '0.2rem' }}>
          v2 Target ({boxesV2.length} boxes)
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
          {hasValidAsset ? (
            <img
              src={assetUrl!}
              alt={`Record ${recordId} v2 canvas`}
              style={{ width: '100%', height: '100%', objectFit: 'contain', opacity: 0.65 }}
              onError={() => setImgError(true)}
            />
          ) : (
            <div
              style={{
                width: '100%',
                height: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'var(--bg-elevated)',
                color: 'var(--text-muted)',
                fontSize: '0.7rem',
              }}
            >
              Geometry only
            </div>
          )}
          {boxesV2.length > 0 && !v2Plottable ? (
            <div
              style={{
                position: 'absolute',
                inset: 0,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'rgba(0,0,0,0.55)',
                padding: '0.5rem',
                textAlign: 'center',
              }}
            >
              <span style={{ fontSize: '0.65rem', color: 'var(--amber)', fontWeight: 600 }}>Uncalibrated</span>
              <span style={{ fontSize: '0.58rem', color: 'var(--text-muted)' }}>{boxesV2.length} boxes hidden</span>
            </div>
          ) : (
            renderBoxesLayer(boxesV2, false, 1.0)
          )}
        </div>
      </div>
    </div>
  );
};

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

  // V1 and V2 layer opacities for the onion-skin overlay (endpoints strictly hide the opposite layer)
  const v1LayerOpacity = useMemo(() => {
    if (onionSkinOpacity === 100) return 0.0;
    return Math.max(0.0, (100 - onionSkinOpacity) / 100);
  }, [onionSkinOpacity]);

  const v2LayerOpacity = useMemo(() => {
    if (onionSkinOpacity === 0) return 0.0;
    return Math.max(0.0, onionSkinOpacity / 100);
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
                          : null;

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

                            <SpatialDiffViewer
                              assetUrl={rawAssetUrl}
                              boxesV1={item.boxes_v1 || []}
                              boxesV2={item.boxes_v2 || []}
                              coordinateSystemV1={item.coordinate_system_v1}
                              coordinateSystemV2={item.coordinate_system_v2}
                              imageDimensionsV1={item.image_dimensions_v1}
                              imageDimensionsV2={item.image_dimensions_v2}
                              assetDimensions={item.asset_dimensions}
                              assetDimensionsV1={item.asset_dimensions_v1}
                              assetDimensionsV2={item.asset_dimensions_v2}
                              viewMode={viewMode}
                              v1Opacity={v1LayerOpacity}
                              v2Opacity={v2LayerOpacity}
                              recordId={item.record_id}
                            />
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
