import React, { useRef, useState, useEffect } from 'react';
import {
  Magnet,
  Sparkles,
  Trash2,
  ZoomIn,
  ZoomOut,
  Layers,
  Move,
  Crosshair,
  AlertCircle,
  Info,
} from 'lucide-react';
import { SpringButton } from './ui/SpringButton';
import { CustomSelect } from './ui/CustomSelect';
import { magneticSnapBoxToEdges } from '../utils/magneticBoxSnap';
import {
  displayToSourceCoords,
  sourceToDisplayBox,
  identifyCoordinateSystem,
  shouldPlotVersionGeometry,
  convertNormalizedToPixelIntrinsic,
} from '../utils/coordinateContract';
import type { BoundingBox } from '../utils/coordinateContract';

export type { BoundingBox };
export { displayToSourceCoords, sourceToDisplayBox };

export interface ObjectDetectionCanvasProps {
  imageUrl: string;
  boxes: BoundingBox[];
  classes: string[];
  selectedClass: string;
  onChange: (boxes: BoundingBox[]) => void;
  disabled?: boolean;
  assetDimensions?: { width?: number; height?: number } | null;
  coordinateSystem?: string;
  isLegacyRecord?: boolean;
  onDimensionsLoaded?: (dims: { width: number; height: number }) => void;
  onRecreateCalibrated?: () => void;
  onConvertNormalizedToIntrinsic?: (convertedBoxes: BoundingBox[]) => void;
}

// Deterministic class color mapping palette
const CLASS_COLORS = [
  '#2563EB', // Blue
  '#10B981', // Emerald
  '#F59E0B', // Amber
  '#EC4899', // Pink
  '#8B5CF6', // Purple
  '#06B6D4', // Cyan
  '#F97316', // Orange
  '#14B8A6', // Teal
];

export function getClassColor(label: string, classes: string[]): string {
  const index = classes.indexOf(label);
  if (index >= 0) {
    return CLASS_COLORS[index % CLASS_COLORS.length];
  }
  let hash = 0;
  for (let i = 0; i < label.length; i++) {
    hash = label.charCodeAt(i) + ((hash << 5) - hash);
  }
  return CLASS_COLORS[Math.abs(hash) % CLASS_COLORS.length];
}

export const ObjectDetectionCanvas: React.FC<ObjectDetectionCanvasProps> = ({
  imageUrl,
  boxes,
  classes,
  selectedClass,
  onChange,
  disabled = false,
  assetDimensions,
  coordinateSystem,
  isLegacyRecord,
  onDimensionsLoaded,
  onRecreateCalibrated,
  onConvertNormalizedToIntrinsic,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  // Canonical intrinsic image geometry
  const [naturalDims, setNaturalDims] = useState<{ width: number; height: number } | null>(
    assetDimensions?.width && assetDimensions?.height
      ? { width: assetDimensions.width, height: assetDimensions.height }
      : null
  );
  const [displayedDims, setDisplayedDims] = useState<{ width: number; height: number }>({
    width: 0,
    height: 0,
  });

  const [selectedBoxIndex, setSelectedBoxIndex] = useState<number | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [startPoint, setStartPoint] = useState<{ x: number; y: number } | null>(null);
  const [currentBox, setCurrentBox] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [magneticSnapEnabled, setMagneticSnapEnabled] = useState(true);

  // Zoom state
  const [zoom, setZoom] = useState(1.0);
  const [isDraggingBox, setIsDraggingBox] = useState(false);
  const [dragOffset, setDragOffset] = useState<{ x: number; y: number } | null>(null);

  // Real-time hover coordinate HUD
  const [hoverCoords, setHoverCoords] = useState<{ x: number; y: number } | null>(null);

  // Observe container & image resize events to keep display scale calibrated
  useEffect(() => {
    if (!imgRef.current) return;
    const updateDims = () => {
      if (imgRef.current) {
        const w = imgRef.current.clientWidth;
        const h = imgRef.current.clientHeight;
        if (w > 0 && h > 0) {
          setDisplayedDims({ width: w, height: h });
        }
      }
    };
    updateDims();
    const observer = new ResizeObserver(updateDims);
    observer.observe(imgRef.current);
    return () => observer.disconnect();
  }, [imageUrl, zoom]);

  // Handle image load to capture actual intrinsic source resolution
  const handleImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    if (img.naturalWidth > 0 && img.naturalHeight > 0) {
      const nd = { width: img.naturalWidth, height: img.naturalHeight };
      setNaturalDims(nd);
      onDimensionsLoaded?.(nd);
    }
    if (img.clientWidth > 0 && img.clientHeight > 0) {
      setDisplayedDims({ width: img.clientWidth, height: img.clientHeight });
    }
  };

  // Reset selection if box index becomes out of bounds
  useEffect(() => {
    if (selectedBoxIndex !== null && selectedBoxIndex >= boxes.length) {
      setSelectedBoxIndex(boxes.length > 0 ? boxes.length - 1 : null);
    }
  }, [boxes.length, selectedBoxIndex]);

  // Contract-driven calibration determination (Phase R5.2.1, R5.2.2 & R5.2.3)
  const coordSystemType = identifyCoordinateSystem(coordinateSystem, boxes);
  const isLegacyUncalibrated = Boolean(isLegacyRecord || coordSystemType === 'uncalibrated-legacy');
  const canPlotBoxes = shouldPlotVersionGeometry(coordinateSystem, boxes, naturalDims);
  const isExplicitlyNormalized = coordinateSystem === 'normalized';

  // Handle keyboard shortcut for Delete selected box
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (disabled || selectedBoxIndex === null || isLegacyUncalibrated || isExplicitlyNormalized) return;
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;

      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        handleDeleteBox(selectedBoxIndex);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedBoxIndex, boxes, disabled, isLegacyUncalibrated, isExplicitlyNormalized]);

  const handleConvertNormalized = () => {
    if (!naturalDims || naturalDims.width <= 0 || naturalDims.height <= 0) return;
    try {
      const converted = convertNormalizedToPixelIntrinsic(boxes, naturalDims);
      onConvertNormalizedToIntrinsic?.(converted);
    } catch {
      // Dimensions missing or invalid: conversion prohibited
    }
  };

  // Read full-resolution image data from offscreen canvas for precision edge-snapping
  const getImageData = (): ImageData | null => {
    if (!imgRef.current || !imgRef.current.complete || imgRef.current.naturalWidth === 0) return null;
    const offscreen = document.createElement('canvas');
    const width = naturalDims?.width || imgRef.current.naturalWidth;
    const height = naturalDims?.height || imgRef.current.naturalHeight;
    offscreen.width = width;
    offscreen.height = height;
    const ctx = offscreen.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(imgRef.current, 0, 0, width, height);
    try {
      return ctx.getImageData(0, 0, width, height);
    } catch {
      return null;
    }
  };

  // Convert client pointer event into canonical intrinsic image coordinates
  const getRelativeCoords = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!containerRef.current || !imgRef.current) return { x: 0, y: 0 };
    const rect = containerRef.current.getBoundingClientRect();
    const dispW = displayedDims.width || imgRef.current.clientWidth || 1;
    const dispH = displayedDims.height || imgRef.current.clientHeight || 1;
    const srcW = naturalDims?.width || dispW;
    const srcH = naturalDims?.height || dispH;

    // Display-relative coordinates inside image boundary (unscaled by zoom)
    const rawDispX = (e.clientX - rect.left) / zoom;
    const rawDispY = (e.clientY - rect.top) / zoom;
    const clampedDispX = Math.max(0, Math.min(dispW, rawDispX));
    const clampedDispY = Math.max(0, Math.min(dispH, rawDispY));

    return displayToSourceCoords(clampedDispX, clampedDispY, dispW, dispH, srcW, srcH);
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    // Lock drawing on uncalibrated historical annotations and normalized coordinate systems
    // Normalized annotations must be explicitly converted to intrinsic pixels before drawing geometry
    if (disabled || isLegacyUncalibrated || isExplicitlyNormalized) return;
    if (e.target !== containerRef.current && (e.target as HTMLElement).tagName !== 'IMG') {
      return;
    }

    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    const coords = getRelativeCoords(e);
    setIsDrawing(true);
    setStartPoint(coords);
    setCurrentBox({ x: coords.x, y: coords.y, w: 0, h: 0 });
    setSelectedBoxIndex(null);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const coords = getRelativeCoords(e);
    setHoverCoords(coords);

    if (isDraggingBox && selectedBoxIndex !== null && dragOffset) {
      if (isLegacyUncalibrated || isExplicitlyNormalized) return;
      const srcW = naturalDims?.width || displayedDims.width;
      const srcH = naturalDims?.height || displayedDims.height;
      const current = boxes[selectedBoxIndex];
      const newX = Math.max(0, Math.min(srcW - current.w, coords.x - dragOffset.x));
      const newY = Math.max(0, Math.min(srcH - current.h, coords.y - dragOffset.y));
      const updated = [...boxes];
      updated[selectedBoxIndex] = {
        ...updated[selectedBoxIndex],
        x: newX,
        y: newY,
      };
      onChange(updated);
      return;
    }

    if (!isDrawing || !startPoint) return;
    const x = Math.min(startPoint.x, coords.x);
    const y = Math.min(startPoint.y, coords.y);
    const w = Math.abs(coords.x - startPoint.x);
    const h = Math.abs(coords.y - startPoint.y);
    setCurrentBox({ x, y, w, h });
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);

    if (isDraggingBox) {
      setIsDraggingBox(false);
      setDragOffset(null);
      return;
    }

    if (!isDrawing || !currentBox) return;
    setIsDrawing(false);
    setStartPoint(null);

    const minSize = naturalDims ? Math.max(4, Math.round(naturalDims.width * 0.005)) : 6;
    if (currentBox.w >= minSize && currentBox.h >= minSize) {
      let finalBox = { ...currentBox };
      if (magneticSnapEnabled || e.shiftKey) {
        const imgData = getImageData();
        if (imgData) {
          finalBox = magneticSnapBoxToEdges(imgData, currentBox);
        }
      }

      const newBox: BoundingBox = {
        label: selectedClass || classes[0] || 'object',
        x: finalBox.x,
        y: finalBox.y,
        w: finalBox.w,
        h: finalBox.h,
      };
      const updated = [...boxes, newBox];
      onChange(updated);
      setSelectedBoxIndex(updated.length - 1);
    }
    setCurrentBox(null);
  };

  const handleSnapExistingBoxes = () => {
    if (isLegacyUncalibrated || isExplicitlyNormalized) return;
    const imgData = getImageData();
    if (!imgData || boxes.length === 0) return;
    const snapped = boxes.map((box) => {
      const snappedCoords = magneticSnapBoxToEdges(imgData, {
        x: box.x,
        y: box.y,
        w: box.w,
        h: box.h,
      });
      return {
        ...box,
        x: snappedCoords.x,
        y: snappedCoords.y,
        w: snappedCoords.w,
        h: snappedCoords.h,
      };
    });
    onChange(snapped);
  };

  const handleDeleteBox = (index: number) => {
    // Disable geometry deletion while coordinates are uncalibrated or normalized
    // Normalized annotations must be explicitly converted to source pixels before modifying geometry
    if (isLegacyUncalibrated || isExplicitlyNormalized) return;
    const updated = boxes.filter((_, i) => i !== index);
    onChange(updated);
    setSelectedBoxIndex(null);
  };

  const handleBoxClassChange = (index: number, newClass: string) => {
    const updated = boxes.map((box, i) => (i === index ? { ...box, label: newClass } : box));
    onChange(updated);
  };

  const handleBoxPointerDown = (e: React.PointerEvent, index: number) => {
    e.stopPropagation();
    setSelectedBoxIndex(index);
    if (disabled || isLegacyUncalibrated || isExplicitlyNormalized) return;
    const box = boxes[index];
    const coords = getRelativeCoords(e as any);
    setIsDraggingBox(true);
    setDragOffset({ x: coords.x - box.x, y: coords.y - box.y });
  };

  const dispW = displayedDims.width || imgRef.current?.clientWidth || 0;
  const dispH = displayedDims.height || imgRef.current?.clientHeight || 0;
  const srcW = naturalDims?.width || dispW;
  const srcH = naturalDims?.height || dispH;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', width: '100%', height: '100%' }}>
      {/* Precision Smart Canvas Controls Toolbar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0.4rem 0.75rem',
          backgroundColor: 'var(--bg-surface)',
          border: '1px solid var(--border-hairline)',
          borderRadius: 'var(--radius-sm)',
          gap: '0.75rem',
          flexShrink: 0,
          minHeight: '44px',
          boxSizing: 'border-box',
        }}
      >
        {/* Left Section: Annotation Controls & Calibration */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }}>
          <SpringButton
            variant={magneticSnapEnabled ? 'primary' : 'secondary'}
            size="sm"
            shortcut="Shift"
            onClick={() => setMagneticSnapEnabled(!magneticSnapEnabled)}
            title="Sobel gradient edge boundary snapping in canonical source pixels (Toggle with Shift)"
            style={{ padding: '0.28rem 0.6rem', fontSize: '0.78rem' }}
          >
            <Magnet size={13} strokeWidth={1.75} style={{ marginRight: '4px' }} />
            <span>Edge-Snap {magneticSnapEnabled ? 'ON' : 'OFF'}</span>
          </SpringButton>

          {boxes.length > 0 && (
            <SpringButton
              variant="secondary"
              size="sm"
              onClick={handleSnapExistingBoxes}
              title="Re-align all current boxes to high-contrast image edges"
              style={{ padding: '0.28rem 0.6rem', fontSize: '0.78rem' }}
            >
              <Sparkles size={13} strokeWidth={1.75} style={{ marginRight: '4px' }} />
              <span>Snap Boxes</span>
            </SpringButton>
          )}

          {/* Coordinate System Calibration Status Pill */}
          {naturalDims && (
            <span
              style={{
                fontSize: '0.72rem',
                fontFamily: 'var(--font-mono)',
                color: isLegacyUncalibrated ? 'var(--amber)' : isExplicitlyNormalized ? 'var(--text-secondary)' : 'var(--emerald)',
                background: isLegacyUncalibrated ? 'rgba(245, 158, 11, 0.1)' : 'rgba(16, 185, 129, 0.1)',
                border: `1px solid ${isLegacyUncalibrated ? 'rgba(245, 158, 11, 0.3)' : 'rgba(16, 185, 129, 0.3)'}`,
                padding: '0.2rem 0.5rem',
                borderRadius: 'var(--radius-xs)',
                whiteSpace: 'nowrap',
                fontWeight: 500,
              }}
              title={
                isLegacyUncalibrated
                  ? 'Historical uncalibrated coordinates: exact placement uncertain, geometry not plotted'
                  : isExplicitlyNormalized
                  ? 'Normalized coordinates [0, 1]'
                  : 'Canonical frame: coordinates calibrated to source image resolution'
              }
            >
              {isLegacyUncalibrated
                ? 'Legacy Uncalibrated'
                : isExplicitlyNormalized
                ? 'Normalized Space [0, 1]'
                : `Source: ${srcW}×${srcH}px`}
            </span>
          )}
        </div>

        {/* Center Section: Contextual Information At-A-Glance (Uses leftover space effectively) */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.5rem',
            flex: 1,
            minWidth: 0,
            overflow: 'hidden',
          }}
        >
          {/* Active Target Class Pill */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              fontSize: '0.75rem',
              padding: '0.2rem 0.55rem',
              background: 'var(--bg-elevated)',
              borderRadius: 'var(--radius-xs)',
              border: '1px solid var(--border-hairline)',
              whiteSpace: 'nowrap',
            }}
            title="Active target class for newly drawn bounding boxes"
          >
            <span style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>Class:</span>
            <span
              style={{
                display: 'inline-block',
                width: '7px',
                height: '7px',
                borderRadius: '50%',
                backgroundColor: getClassColor(selectedClass || classes[0] || 'object', classes),
                flexShrink: 0,
              }}
            />
            <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
              {selectedClass || classes[0] || 'object'}
            </span>
          </div>

          {/* Total Box Count Badge */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.35rem',
              fontSize: '0.72rem',
              color: 'var(--text-secondary)',
              padding: '0.2rem 0.5rem',
              background: 'var(--bg-elevated)',
              border: '1px solid var(--border-hairline)',
              borderRadius: 'var(--radius-xs)',
              whiteSpace: 'nowrap',
            }}
          >
            <Layers size={12} style={{ color: 'var(--text-muted)' }} />
            <span>{boxes.length} {boxes.length === 1 ? 'box' : 'boxes'}</span>
          </div>

          {/* Active Selection / Drawing Status */}
          {isDrawing ? (
            <span
              style={{
                fontSize: '0.72rem',
                color: 'var(--accent-interactive)',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: '0.35rem',
                whiteSpace: 'nowrap',
              }}
            >
              <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--accent-interactive)' }} />
              Drawing Box...
            </span>
          ) : selectedBoxIndex !== null && boxes[selectedBoxIndex] ? (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.4rem',
                fontSize: '0.72rem',
                color: 'var(--accent-interactive)',
                padding: '0.15rem 0.45rem',
                background: 'rgba(59, 130, 246, 0.08)',
                border: '1px solid rgba(59, 130, 246, 0.25)',
                borderRadius: 'var(--radius-xs)',
                whiteSpace: 'nowrap',
              }}
            >
              <span>Box #{selectedBoxIndex + 1} ({Math.round(boxes[selectedBoxIndex].w)}×{Math.round(boxes[selectedBoxIndex].h)}px)</span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleDeleteBox(selectedBoxIndex);
                }}
                title="Delete selected box"
                style={{
                  background: 'none',
                  border: 'none',
                  padding: 0,
                  cursor: 'pointer',
                  color: 'var(--rose, #f43f5e)',
                  display: 'flex',
                  alignItems: 'center',
                }}
              >
                <Trash2 size={11} />
              </button>
            </div>
          ) : null}
        </div>

        {/* Right Section: Fixed-Width Jitter-Free Coordinates HUD & Zoom Viewport Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }}>
          {/* Dedicated Coordinate HUD: Fixed 132px slot with tabular numbers prevents any UI shifts or shaking */}
          <div
            style={{
              width: '132px',
              boxSizing: 'border-box',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.35rem',
              padding: '0.24rem 0.5rem',
              borderRadius: 'var(--radius-xs)',
              backgroundColor: hoverCoords ? 'var(--bg-elevated)' : 'transparent',
              border: '1px solid',
              borderColor: hoverCoords ? 'var(--border-hairline)' : 'transparent',
              fontSize: '0.72rem',
              fontFamily: 'var(--font-mono)',
              fontVariantNumeric: 'tabular-nums',
              color: hoverCoords ? 'var(--text-primary)' : 'var(--text-muted)',
              opacity: hoverCoords ? 1 : 0.4,
              transition: 'opacity 0.2s cubic-bezier(0.16, 1, 0.3, 1), background-color 0.2s ease, border-color 0.2s ease, color 0.2s ease',
              userSelect: 'none',
            }}
            title={hoverCoords ? 'Real-time source coordinate' : 'Hover over image to view live coordinates'}
          >
            <Crosshair
              size={12}
              style={{
                color: hoverCoords ? 'var(--accent-interactive)' : 'var(--text-muted)',
                transition: 'color 0.2s ease',
                flexShrink: 0,
              }}
            />
            <span style={{ letterSpacing: 'var(--letter-spacing-base)', whiteSpace: 'nowrap' }}>
              {hoverCoords
                ? `X: ${hoverCoords.x}, Y: ${hoverCoords.y}`
                : 'X: —, Y: —'}
            </span>
          </div>

          {/* Divider line */}
          <div style={{ width: '1px', height: '18px', background: 'var(--border-hairline)' }} />

          {/* Zoom Controls */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
            <button
              className="btn btn-secondary"
              disabled={zoom <= 0.75}
              onClick={() => setZoom((z) => Math.max(0.75, Math.round((z - 0.25) * 100) / 100))}
              style={{ padding: '0.25rem 0.45rem' }}
              title="Zoom Out"
              type="button"
            >
              <ZoomOut size={13} />
            </button>
            <span
              onClick={() => setZoom(1.0)}
              style={{
                fontSize: '0.75rem',
                fontFamily: 'var(--font-mono)',
                minWidth: '42px',
                textAlign: 'center',
                color: zoom === 1.0 ? 'var(--text-secondary)' : 'var(--accent-interactive)',
                cursor: zoom === 1.0 ? 'default' : 'pointer',
                fontWeight: zoom === 1.0 ? 500 : 700,
                userSelect: 'none',
              }}
              title={zoom === 1.0 ? 'Current zoom: 100%' : 'Click to reset zoom to 100%'}
            >
              {Math.round(zoom * 100)}%
            </span>
            <button
              className="btn btn-secondary"
              disabled={zoom >= 3.0}
              onClick={() => setZoom((z) => Math.min(3.0, Math.round((z + 0.25) * 100) / 100))}
              style={{ padding: '0.25rem 0.45rem' }}
              title="Zoom In"
              type="button"
            >
              <ZoomIn size={13} />
            </button>
            {zoom !== 1.0 && (
              <button
                className="btn btn-secondary"
                onClick={() => setZoom(1.0)}
                style={{ padding: '0.25rem 0.45rem', fontSize: '0.7rem' }}
                title="Reset Zoom to 100%"
                type="button"
              >
                1:1
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Uncalibrated Historical Annotation Disclosure Banner */}
      {isLegacyUncalibrated && (
        <div
          style={{
            padding: '0.75rem 1rem',
            background: 'rgba(245, 158, 11, 0.08)',
            border: '1px solid rgba(245, 158, 11, 0.3)',
            borderRadius: 'var(--radius-sm)',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.4rem',
            flexShrink: 0,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <AlertCircle size={16} style={{ color: 'var(--amber)', flexShrink: 0 }} />
              <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                Uncalibrated Historical Annotation ({boxes.length} box{boxes.length === 1 ? '' : 'es'})
              </span>
            </div>
            {onRecreateCalibrated && (
              <SpringButton
                variant="secondary"
                size="sm"
                onClick={onRecreateCalibrated}
                style={{ fontSize: '0.725rem', borderColor: 'var(--amber)', color: 'var(--amber)' }}
              >
                Clear & Re-annotate (Calibrated)
              </SpringButton>
            )}
          </div>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', lineHeight: 1.4 }}>
            This historical annotation lacks coordinate-space metadata. Exact spatial placement cannot be determined reliably from source dimensions alone. Geometry is not plotted on the canvas to prevent misleading visual alignment. Drawing is locked to prevent mixing uncalibrated boxes with calibrated source pixels.
          </div>
        </div>
      )}

      {/* Normalized Coordinate Conversion Banner */}
      {!isLegacyUncalibrated && isExplicitlyNormalized && (
        <div
          style={{
            padding: '0.75rem 1rem',
            background: 'rgba(59, 130, 246, 0.08)',
            border: '1px solid rgba(59, 130, 246, 0.3)',
            borderRadius: 'var(--radius-sm)',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.4rem',
            flexShrink: 0,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Info size={16} style={{ color: 'var(--accent-primary)', flexShrink: 0 }} />
              <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                Normalized Coordinates ({boxes.length} box{boxes.length === 1 ? '' : 'es'})
              </span>
            </div>
            {onConvertNormalizedToIntrinsic && (
              <SpringButton
                variant="secondary"
                size="sm"
                disabled={!naturalDims || naturalDims.width <= 0 || naturalDims.height <= 0}
                onClick={handleConvertNormalized}
                style={{ fontSize: '0.725rem', borderColor: 'var(--accent-primary)', color: 'var(--accent-primary)' }}
                title={
                  !naturalDims || naturalDims.width <= 0
                    ? 'Intrinsic image dimensions must be established before conversion'
                    : 'Convert all normalized boxes to intrinsic source pixels'
                }
              >
                Convert to Source Pixels
              </SpringButton>
            )}
          </div>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', lineHeight: 1.4 }}>
            {!naturalDims || naturalDims.width <= 0
              ? 'This annotation uses normalized [0, 1] coordinates, but source dimensions could not be established. Drawing and modifying geometry is disabled to prevent mixing coordinate spaces.'
              : boxes.length === 0
                ? 'This annotation is declared with normalized coordinates. To draw new geometry in intrinsic pixels, convert to source pixels using verified image dimensions.'
                : 'This annotation uses normalized [0, 1] coordinates. To add or adjust geometry, convert existing boxes to intrinsic pixel coordinates [0, W_src] × [0, H_src] first using verified source dimensions.'}
          </div>
        </div>
      )}

      {/* Main Annotation Viewport Area */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'auto',
          background: 'var(--bg-canvas)',
          borderRadius: 'var(--radius-md)',
          border: '1px solid var(--border-hairline)',
          position: 'relative',
          padding: '1rem',
        }}
      >
        <div
          ref={containerRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={() => setHoverCoords(null)}
          style={{
            position: 'relative',
            display: 'inline-block',
            userSelect: 'none',
            touchAction: 'none',
            cursor: isDrawing ? 'crosshair' : isDraggingBox ? 'grabbing' : (isLegacyUncalibrated || isExplicitlyNormalized) ? 'not-allowed' : 'default',
            borderRadius: 'var(--radius-sm)',
            transform: `scale(${zoom})`,
            transformOrigin: 'center center',
            transition: isDrawing ? 'none' : 'transform 0.15s ease',
            boxShadow: 'var(--shadow-md)',
          }}
        >
          <img
            ref={imgRef}
            src={imageUrl}
            alt="Object Detection Target"
            crossOrigin="anonymous"
            onLoad={handleImageLoad}
            style={{
              display: 'block',
              maxWidth: '100%',
              maxHeight: 'calc(100vh - 270px)',
              pointerEvents: 'none',
            }}
          />

          {/* Render Existing Bounding Boxes Scaled into Canvas Frame (Only when verified calibrated) */}
          {canPlotBoxes &&
            dispW > 0 &&
            dispH > 0 &&
            boxes.map((box, idx) => {
              const isSelected = selectedBoxIndex === idx;
              const classColor = getClassColor(box.label, classes);
              const style = sourceToDisplayBox(
                box,
                dispW,
                dispH,
                srcW,
                srcH,
                isExplicitlyNormalized
              );
              if (!style) return null;

              return (
                <div
                  key={idx}
                  onPointerDown={(e) => handleBoxPointerDown(e, idx)}
                  style={{
                    position: 'absolute',
                    ...style,
                    border: isSelected ? `2.5px solid ${classColor}` : `2px solid ${classColor}`,
                    backgroundColor: isSelected ? `${classColor}33` : `${classColor}1A`,
                    boxShadow: isSelected ? `0 0 0 2px var(--bg-surface), 0 0 0 4px ${classColor}` : 'none',
                    cursor: 'grab',
                    boxSizing: 'border-box',
                    zIndex: isSelected ? 10 : 2,
                  }}
                  title={`Box #${idx + 1}: ${box.label} [${box.x}, ${box.y}, ${box.w}×${box.h} px] (Drag to move)`}
                >
                  {/* Box Class Tag Badge */}
                  <span
                    style={{
                      position: 'absolute',
                      top: '-22px',
                      left: '-2px',
                      background: classColor,
                      color: '#fff',
                      fontSize: '0.68rem',
                      fontWeight: 700,
                      padding: '2px 6px',
                      borderRadius: '2px',
                      whiteSpace: 'nowrap',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.25rem',
                      boxShadow: 'var(--shadow-sm)',
                      pointerEvents: 'none',
                    }}
                  >
                    <span>{box.label}</span>
                    {isSelected && <Move size={10} />}
                  </span>
                </div>
              );
            })}

          {/* Active Drawing Box Preview */}
          {isDrawing && currentBox && dispW > 0 && dispH > 0 && (
            <div
              style={{
                position: 'absolute',
                ...sourceToDisplayBox(
                  { ...currentBox, label: selectedClass },
                  dispW,
                  dispH,
                  srcW,
                  srcH,
                  false
                ),
                border: '2px dashed var(--accent-interactive)',
                backgroundColor: 'rgba(37, 99, 235, 0.2)',
                pointerEvents: 'none',
                boxSizing: 'border-box',
                zIndex: 20,
              }}
            />
          )}
        </div>
      </div>

      {/* Detected Objects Inspector Strip */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '0.4rem',
          background: 'var(--bg-surface)',
          padding: '0.65rem 0.85rem',
          borderRadius: 'var(--radius-sm)',
          border: '1px solid var(--border-hairline)',
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <Layers size={14} />
            <span>Detected Bounding Boxes ({boxes.length})</span>
          </span>
          <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
            Coordinates calibrated in canonical source pixels • Drag to draw • Click box to move • Del to remove
          </span>
        </div>

        {boxes.length === 0 ? (
          <div style={{ padding: '0.5rem', background: 'var(--bg-elevated)', borderRadius: 'var(--radius-sm)', fontSize: '0.78rem', color: 'var(--text-muted)', textAlign: 'center' }}>
            No objects detected. Drag on the image canvas above to label an object.
          </div>
        ) : (
          <div
            className="no-scrollbar"
            style={{
              display: 'flex',
              gap: '0.45rem',
              flexWrap: 'wrap',
              alignItems: 'center',
              maxHeight: '130px',
              overflowY: 'auto',
              scrollbarWidth: 'none',
              msOverflowStyle: 'none',
              paddingBottom: '0.1rem',
            }}
          >
            {boxes.map((box, idx) => {
              const isSelected = selectedBoxIndex === idx;
              const classColor = getClassColor(box.label, classes);

              return (
                <div
                  key={idx}
                  onClick={() => setSelectedBoxIndex(idx)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.45rem',
                    padding: '0.25rem 0.55rem',
                    borderRadius: 'var(--radius-sm)',
                    background: isSelected ? 'var(--bg-elevated)' : 'var(--bg-surface)',
                    border: `1.5px solid ${isSelected ? classColor : 'var(--border-hairline)'}`,
                    fontSize: '0.78rem',
                    cursor: isLegacyUncalibrated ? 'default' : 'pointer',
                    flex: '0 0 auto',
                  }}
                >
                  <span
                    style={{
                      width: '8px',
                      height: '8px',
                      borderRadius: '50%',
                      backgroundColor: classColor,
                      display: 'inline-block',
                    }}
                  />
                  <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>#{idx + 1}</span>
                  <CustomSelect
                    value={box.label}
                    onChange={(val) => handleBoxClassChange(idx, val)}
                    options={classes.map((cls) => ({ value: cls, label: cls }))}
                    size="sm"
                    style={{ minWidth: '90px' }}
                    ariaLabel={`Class for box ${idx + 1}`}
                  />
                  {isLegacyUncalibrated ? (
                    <span
                      style={{
                        color: 'var(--amber)',
                        fontFamily: 'var(--font-mono)',
                        fontSize: '0.68rem',
                      }}
                      title="Coordinates recorded without calibration metadata"
                    >
                      x:{box.x}, y:{box.y}, w:{box.w}, h:{box.h} (uncalibrated)
                    </span>
                  ) : isExplicitlyNormalized ? (
                    <span style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: '0.7rem' }}>
                      {Number(box.w).toFixed(3)}×{Number(box.h).toFixed(3)} (norm)
                    </span>
                  ) : (
                    <span style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: '0.7rem' }}>
                      {box.w}×{box.h} px
                    </span>
                  )}
                  <button
                    disabled={isLegacyUncalibrated || isExplicitlyNormalized}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (isLegacyUncalibrated || isExplicitlyNormalized) return;
                      handleDeleteBox(idx);
                    }}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: isLegacyUncalibrated || isExplicitlyNormalized ? 'var(--text-muted)' : 'var(--rose)',
                      cursor: isLegacyUncalibrated || isExplicitlyNormalized ? 'not-allowed' : 'pointer',
                      opacity: isLegacyUncalibrated || isExplicitlyNormalized ? 0.4 : 1,
                      padding: 0,
                      display: 'flex',
                    }}
                    title={
                      isLegacyUncalibrated
                        ? "Deletion is disabled for uncalibrated historical annotations to preserve calibration integrity. Use 'Clear & Re-annotate (Calibrated)' above."
                        : isExplicitlyNormalized
                          ? 'Deletion is disabled for normalized annotations to prevent mixed coordinate payloads. Convert to source pixels before modifying geometry.'
                          : 'Remove box'
                    }
                    type="button"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
