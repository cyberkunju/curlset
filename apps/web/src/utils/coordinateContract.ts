/**
 * Coordinate System Calibration Contract & Geometry Transformations (Phase R5.2.1)
 *
 * Implements strict calibration contracts:
 * - 'pixel-intrinsic': Stored coordinates are exact source-image pixels in [0, W_src] x [0, H_src].
 * - 'normalized': Stored coordinates are unit fractions in [0, 1] x [0, 1].
 * - Missing / uncalibrated: Historical coordinates without verified calibration space must NOT
 *   be plotted or silently stamped as intrinsic pixels.
 */

export interface BoundingBox {
  id?: string;
  label: string;
  x: number;
  y: number;
  w: number;
  h: number;
  confidence?: number;
}

export type CoordinateSystemType =
  | 'pixel-intrinsic'
  | 'normalized'
  | 'uncalibrated-legacy'
  | 'unknown';

/**
 * Identifies the coordinate system type strictly by contract,
 * avoiding inferring coordinate space merely from numeric values.
 */
export function identifyCoordinateSystem(
  declaredSystem?: string | null,
  boxes?: BoundingBox[]
): CoordinateSystemType {
  if (declaredSystem === 'pixel-intrinsic') return 'pixel-intrinsic';
  if (declaredSystem === 'normalized') return 'normalized';
  if (!boxes || boxes.length === 0) return 'unknown';
  return 'uncalibrated-legacy';
}

/**
 * Checks whether an annotation is demonstrably calibrated.
 * Returns true if explicitly declared as pixel-intrinsic or normalized,
 * or if there are no existing boxes (fresh annotation).
 */
export function isCoordinateSystemCalibrated(
  declaredSystem?: string | null,
  boxes?: BoundingBox[]
): boolean {
  if (declaredSystem === 'pixel-intrinsic' || declaredSystem === 'normalized') {
    return true;
  }
  if (!boxes || boxes.length === 0) {
    return true;
  }
  return false;
}

/**
 * Determines whether geometry can be truthfully and reliably plotted on an image.
 * Historical uncalibrated boxes MUST NOT be plotted at arbitrary or guessed scales.
 */
export function shouldPlotVersionGeometry(
  declaredSystem: string | null | undefined,
  boxes: BoundingBox[] | undefined,
  dimensions: { width: number; height: number } | null | undefined
): boolean {
  if (!boxes || boxes.length === 0) return false;
  if (declaredSystem === 'pixel-intrinsic') {
    return Boolean(dimensions && dimensions.width > 0 && dimensions.height > 0);
  }
  if (declaredSystem === 'normalized') {
    return true;
  }
  // Historical annotations without explicit coordinate-space metadata cannot be plotted reliably
  return false;
}

/**
 * Converts displayed canvas pointer coordinates into canonical intrinsic source pixels.
 */
export function displayToSourceCoords(
  dispX: number,
  dispY: number,
  dispW: number,
  dispH: number,
  srcW: number,
  srcH: number
): { x: number; y: number } {
  if (dispW <= 0 || dispH <= 0 || srcW <= 0 || srcH <= 0) {
    return { x: Math.round(dispX), y: Math.round(dispY) };
  }
  const scaleX = srcW / dispW;
  const scaleY = srcH / dispH;
  return {
    x: Math.max(0, Math.min(srcW, Math.round(dispX * scaleX))),
    y: Math.max(0, Math.min(srcH, Math.round(dispY * scaleY))),
  };
}

/**
 * Maps a stored bounding box to CSS pixel dimensions for canvas display.
 * Returns null if dimensions are invalid or geometry cannot be projected.
 */
export function sourceToDisplayBox(
  box: BoundingBox,
  dispW: number,
  dispH: number,
  srcW: number,
  srcH: number,
  isNormalized = false
): { left: string; top: string; width: string; height: string } | null {
  if (dispW <= 0 || dispH <= 0) {
    return null;
  }

  if (isNormalized) {
    const l = Math.max(0, Math.min(dispW, box.x * dispW));
    const t = Math.max(0, Math.min(dispH, box.y * dispH));
    const w = Math.max(2, Math.min(dispW - l, box.w * dispW));
    const h = Math.max(2, Math.min(dispH - t, box.h * dispH));
    return {
      left: `${Math.round(l)}px`,
      top: `${Math.round(t)}px`,
      width: `${Math.round(w)}px`,
      height: `${Math.round(h)}px`,
    };
  }

  if (srcW <= 0 || srcH <= 0) {
    return null;
  }

  const scaleX = dispW / srcW;
  const scaleY = dispH / srcH;
  const l = Math.max(0, Math.min(dispW, box.x * scaleX));
  const t = Math.max(0, Math.min(dispH, box.y * scaleY));
  const w = Math.max(2, Math.min(dispW - l, box.w * scaleX));
  const h = Math.max(2, Math.min(dispH - t, box.h * scaleY));

  return {
    left: `${Math.round(l)}px`,
    top: `${Math.round(t)}px`,
    width: `${Math.round(w)}px`,
    height: `${Math.round(h)}px`,
  };
}
