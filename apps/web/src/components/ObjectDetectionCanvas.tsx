import React, { useRef, useState } from 'react';

export interface BoundingBox {
  id?: string;
  label: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

interface ObjectDetectionCanvasProps {
  imageUrl: string;
  boxes: BoundingBox[];
  classes: string[];
  selectedClass: string;
  onChange: (boxes: BoundingBox[]) => void;
  disabled?: boolean;
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
  const [selectedBoxIndex, setSelectedBoxIndex] = useState<number | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [startPoint, setStartPoint] = useState<{ x: number; y: number } | null>(null);
  const [currentBox, setCurrentBox] = useState<{ x: number; y: number; w: number; h: number } | null>(null);

  const [isTouchDevice, setIsTouchDevice] = useState(false);

  const getRelativeCoords = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!containerRef.current) return { x: 0, y: 0 };
    const rect = containerRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
    const y = Math.max(0, Math.min(rect.height, e.clientY - rect.top));
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
    if (e.pointerType === 'touch') setIsTouchDevice(true);
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    const coords = getRelativeCoords(e);
    setIsDrawing(true);
    setStartPoint(coords);
    setCurrentBox({ x: coords.x, y: coords.y, w: 0, h: 0 });
    setSelectedBoxIndex(null);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
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
    if (!isDrawing || !currentBox) return;
    setIsDrawing(false);
    setStartPoint(null);

    // Only add if box has meaningful size (> 10x10 px)
    if (currentBox.w > 10 && currentBox.h > 10) {
      const newBox: BoundingBox = {
        label: selectedClass || classes[0] || 'object',
        x: currentBox.x,
        y: currentBox.y,
        w: currentBox.w,
        h: currentBox.h,
      };
      const updated = [...boxes, newBox];
      onChange(updated);
      setSelectedBoxIndex(updated.length - 1);
    }
    setCurrentBox(null);
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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', width: '100%' }}>
      {/* Canvas Area with Unified Touch & Mouse PointerEvents */}
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
          cursor: isDrawing ? 'crosshair' : 'default',
          border: '1px solid var(--border-hairline)',
          borderRadius: 'var(--radius-md)',
          overflow: 'hidden',
          backgroundColor: 'var(--bg-canvas)',
          maxWidth: '100%',
        }}
      >
        <img
          src={imageUrl}
          alt="Visual Annotation Target"
          style={{ display: 'block', maxWidth: '100%', height: 'auto', pointerEvents: 'none' }}
        />

        {/* Existing Bounding Boxes */}
        {boxes.map((box, idx) => {
          const isSelected = selectedBoxIndex === idx;
          return (
            <div
              key={idx}
              onClick={(e) => {
                e.stopPropagation();
                setSelectedBoxIndex(idx);
              }}
              style={{
                position: 'absolute',
                left: `${box.x}px`,
                top: `${box.y}px`,
                width: `${box.w}px`,
                height: `${box.h}px`,
                border: isSelected ? '2px solid var(--emerald)' : '2px solid var(--indigo)',
                background: isSelected ? 'rgba(16, 185, 129, 0.2)' : 'rgba(99, 102, 241, 0.15)',
                cursor: 'pointer',
                boxSizing: 'border-box',
              }}
            >
              <span
                style={{
                  position: 'absolute',
                  top: '-22px',
                  left: '-2px',
                  background: isSelected ? 'var(--emerald)' : 'var(--indigo)',
                  color: '#fff',
                  fontSize: '0.7rem',
                  fontWeight: 700,
                  padding: '2px 6px',
                  borderRadius: '2px',
                  whiteSpace: 'nowrap',
                }}
              >
                {box.label}
              </span>
            </div>
          );
        })}

        {/* Drawing Box Preview */}
        {isDrawing && currentBox && (
          <div
            style={{
              position: 'absolute',
              left: `${currentBox.x}px`,
              top: `${currentBox.y}px`,
              width: `${currentBox.w}px`,
              height: `${currentBox.h}px`,
              border: '2px dashed var(--amber)',
              background: 'rgba(245, 158, 11, 0.2)',
              pointerEvents: 'none',
              boxSizing: 'border-box',
            }}
          />
        )}
      </div>

      {/* Box Inspector & Classes List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-secondary)' }}>
            Detected Objects ({boxes.length})
          </span>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            Click & drag on image to draw bounding boxes
          </span>
        </div>

        {boxes.length === 0 ? (
          <div style={{ padding: '0.75rem', background: 'rgba(15, 23, 42, 0.5)', borderRadius: 'var(--radius-sm)', fontSize: '0.8rem', color: 'var(--text-muted)', textAlign: 'center' }}>
            No bounding boxes defined yet. Draw on the image above to localize an object.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', maxHeight: '160px', overflowY: 'auto' }}>
            {boxes.map((box, idx) => (
              <div
                key={idx}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '0.4rem 0.75rem',
                  borderRadius: 'var(--radius-sm)',
                  background: selectedBoxIndex === idx ? 'rgba(99, 102, 241, 0.2)' : 'rgba(15, 23, 42, 0.6)',
                  border: `1px solid ${selectedBoxIndex === idx ? 'var(--indigo)' : 'var(--border-subtle)'}`,
                  fontSize: '0.8rem',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span style={{ fontWeight: 700, color: 'var(--text-accent)' }}>#{idx + 1}</span>
                  <select
                    className="input"
                    value={box.label}
                    onChange={(e) => handleBoxClassChange(idx, e.target.value)}
                    style={{ padding: '0.2rem 0.5rem', fontSize: '0.75rem' }}
                  >
                    {classes.map((cls) => (
                      <option key={cls} value={cls}>
                        {cls}
                      </option>
                    ))}
                  </select>
                  <span style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: '0.75rem' }}>
                    x:{box.x} y:{box.y} w:{box.w} h:{box.h}
                  </span>
                </div>

                <button
                  className="btn btn-secondary"
                  onClick={() => handleDeleteBox(idx)}
                  style={{ padding: '0.15rem 0.45rem', fontSize: '0.75rem', color: 'var(--rose)' }}
                >
                  ✕ Remove
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
