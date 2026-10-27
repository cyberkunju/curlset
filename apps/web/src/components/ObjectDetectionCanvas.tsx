import React, { useRef, useState, useEffect, useCallback } from 'react';
import {
  Magnet,
  Sparkles,
  Trash2,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Layers,
  Move,
} from 'lucide-react';
import { SpringButton } from './ui/SpringButton';
import { CustomSelect } from './ui/CustomSelect';
import { magneticSnapBoxToEdges } from '../utils/magneticBoxSnap';

export interface BoundingBox {
  id?: string;
  label: string;
  x: number;
  y: number;
  w: number;
  h: number;
  confidence?: number;
}

interface ObjectDetectionCanvasProps {
  imageUrl: string;
  boxes: BoundingBox[];
  classes: string[];
  selectedClass: string;
  onChange: (boxes: BoundingBox[]) => void;
  disabled?: boolean;
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
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  const [selectedBoxIndex, setSelectedBoxIndex] = useState<number | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [startPoint, setStartPoint] = useState<{ x: number; y: number } | null>(null);
  const [currentBox, setCurrentBox] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [magneticSnapEnabled, setMagneticSnapEnabled] = useState(true);

  // Zoom & Pan state
  const [zoom, setZoom] = useState(1.0);
  const [isDraggingBox, setIsDraggingBox] = useState(false);
  const [dragOffset, setDragOffset] = useState<{ x: number; y: number } | null>(null);

  // Reset selection if box index becomes out of bounds
  useEffect(() => {
    if (selectedBoxIndex !== null && selectedBoxIndex >= boxes.length) {
      setSelectedBoxIndex(boxes.length > 0 ? boxes.length - 1 : null);
    }
  }, [boxes.length, selectedBoxIndex]);

  // Handle keyboard shortcut for Delete selected box
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (disabled || selectedBoxIndex === null) return;
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;

      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        handleDeleteBox(selectedBoxIndex);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedBoxIndex, boxes, disabled]);

  const getImageData = (): ImageData | null => {
    if (!imgRef.current || !imgRef.current.complete || imgRef.current.naturalWidth === 0) return null;
    const offscreen = document.createElement('canvas');
    const width = imgRef.current.clientWidth || 640;
    const height = imgRef.current.clientHeight || 480;
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

  // Maps pointer event coordinates to image-relative integer pixels
  const getRelativeCoords = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!containerRef.current || !imgRef.current) return { x: 0, y: 0 };
    const rect = containerRef.current.getBoundingClientRect();
    const rawX = (e.clientX - rect.left) / zoom;
    const rawY = (e.clientY - rect.top) / zoom;
    const x = Math.max(0, Math.min(rect.width / zoom, rawX));
    const y = Math.max(0, Math.min(rect.height / zoom, rawY));
    return {
      x: Math.round(x),
      y: Math.round(y),
    };
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (disabled) return;
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
    if (isDraggingBox && selectedBoxIndex !== null && dragOffset) {
      const coords = getRelativeCoords(e);
      const newX = Math.max(0, coords.x - dragOffset.x);
      const newY = Math.max(0, coords.y - dragOffset.y);
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
    const coords = getRelativeCoords(e);
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

    // Only add if box has meaningful size (> 10x10 px)
    if (currentBox.w > 10 && currentBox.h > 10) {
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
    const imgData = getImageData();
    if (!imgData || boxes.length === 0) return;
    const snapped = boxes.map((box) => {
      const snappedCoords = magneticSnapBoxToEdges(imgData, { x: box.x, y: box.y, w: box.w, h: box.h });
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
    const box = boxes[index];
    const coords = getRelativeCoords(e as any);
    setIsDraggingBox(true);
    setDragOffset({ x: coords.x - box.x, y: coords.y - box.y });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', width: '100%', height: '100%' }}>
      {/* Precision Smart Canvas Controls Toolbar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0.45rem 0.75rem',
          backgroundColor: 'var(--bg-surface)',
          border: '1px solid var(--border-hairline)',
          borderRadius: 'var(--radius-sm)',
          flexWrap: 'wrap',
          gap: '0.5rem',
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
          <SpringButton
            variant={magneticSnapEnabled ? 'primary' : 'secondary'}
            size="sm"
            shortcut="Shift"
            onClick={() => setMagneticSnapEnabled(!magneticSnapEnabled)}
            title="Sobel gradient edge boundary snapping"
          >
            <Magnet size={14} strokeWidth={1.75} style={{ marginRight: '4px' }} />
            {magneticSnapEnabled ? 'Magnetic Edge-Snap ON' : 'Magnetic Edge-Snap OFF'}
          </SpringButton>

          {boxes.length > 0 && (
            <SpringButton variant="secondary" size="sm" onClick={handleSnapExistingBoxes}>
              <Sparkles size={14} strokeWidth={1.75} style={{ marginRight: '4px' }} />
              Snap Boxes
            </SpringButton>
          )}
        </div>

        {/* Zoom Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
          <button
            className="btn btn-secondary"
            disabled={zoom <= 0.75}
            onClick={() => setZoom((z) => Math.max(0.75, Math.round((z - 0.25) * 100) / 100))}
            style={{ padding: '0.25rem 0.45rem' }}
            title="Zoom Out"
          >
            <ZoomOut size={13} />
          </button>
          <span
            style={{
              fontSize: '0.75rem',
              fontFamily: 'var(--font-mono)',
              minWidth: '44px',
              textAlign: 'center',
              color: 'var(--text-secondary)',
            }}
          >
            {Math.round(zoom * 100)}%
          </span>
          <button
            className="btn btn-secondary"
            disabled={zoom >= 3.0}
            onClick={() => setZoom((z) => Math.min(3.0, Math.round((z + 0.25) * 100) / 100))}
            style={{ padding: '0.25rem 0.45rem' }}
            title="Zoom In"
          >
            <ZoomIn size={13} />
          </button>
          {zoom !== 1.0 && (
            <button
              className="btn btn-secondary"
              onClick={() => setZoom(1.0)}
              style={{ padding: '0.25rem 0.45rem', fontSize: '0.72rem' }}
              title="Reset Zoom to 100%"
            >
              <Maximize2 size={12} style={{ marginRight: '2px' }} />
              Reset
            </button>
          )}
        </div>
      </div>

      {/* Main Canvas Scroll Area */}
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
          style={{
            position: 'relative',
            display: 'inline-block',
            userSelect: 'none',
            touchAction: 'none',
            cursor: isDrawing ? 'crosshair' : isDraggingBox ? 'grabbing' : 'default',
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
            style={{ display: 'block', maxWidth: '100%', maxHeight: 'calc(100vh - 360px)', pointerEvents: 'none' }}
          />

          {/* Render Existing Bounding Boxes */}
          {boxes.map((box, idx) => {
            const isSelected = selectedBoxIndex === idx;
            const classColor = getClassColor(box.label, classes);

            return (
              <div
                key={idx}
                onPointerDown={(e) => handleBoxPointerDown(e, idx)}
                style={{
                  position: 'absolute',
                  left: `${box.x}px`,
                  top: `${box.y}px`,
                  width: `${box.w}px`,
                  height: `${box.h}px`,
                  border: isSelected ? `2.5px solid ${classColor}` : `2px solid ${classColor}`,
                  backgroundColor: isSelected ? `${classColor}33` : `${classColor}1A`,
                  boxShadow: isSelected ? `0 0 0 2px var(--bg-surface), 0 0 0 4px ${classColor}` : 'none',
                  cursor: 'grab',
                  boxSizing: 'border-box',
                  zIndex: isSelected ? 10 : 2,
                }}
                title={`Box #${idx + 1}: ${box.label} (Drag to move)`}
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
          {isDrawing && currentBox && (
            <div
              style={{
                position: 'absolute',
                left: `${currentBox.x}px`,
                top: `${currentBox.y}px`,
                width: `${currentBox.w}px`,
                height: `${currentBox.h}px`,
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
            Drag to draw box • Click box to move • Del to remove
          </span>
        </div>

        {boxes.length === 0 ? (
          <div style={{ padding: '0.5rem', background: 'var(--bg-elevated)', borderRadius: 'var(--radius-sm)', fontSize: '0.78rem', color: 'var(--text-muted)', textAlign: 'center' }}>
            No objects detected. Drag on the image canvas above to label an object.
          </div>
        ) : (
          <div style={{ display: 'flex', gap: '0.45rem', overflowX: 'auto', paddingBottom: '0.2rem' }}>
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
                    padding: '0.3rem 0.55rem',
                    borderRadius: 'var(--radius-sm)',
                    background: isSelected ? 'var(--bg-elevated)' : 'var(--bg-surface)',
                    border: `1.5px solid ${isSelected ? classColor : 'var(--border-hairline)'}`,
                    fontSize: '0.78rem',
                    whiteSpace: 'nowrap',
                    cursor: 'pointer',
                    flexShrink: 0,
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
                  <span style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: '0.7rem' }}>
                    {box.w}×{box.h}
                  </span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteBox(idx);
                    }}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'var(--rose)',
                      cursor: 'pointer',
                      padding: 0,
                      display: 'flex',
                    }}
                    title="Remove box"
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
