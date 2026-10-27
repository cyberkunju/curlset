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
 * Checks whether an annotation coordinate system is demonstrably calibrated.
 * Returns true strictly if declared as pixel-intrinsic or normalized.
 * Missing metadata is NEVER treated as calibrated, even with an empty box list.
 */
export function isCoordinateSystemCalibrated(
  declaredSystem?: string | null
): boolean {
  return declaredSystem === 'pixel-intrinsic' || declaredSystem === 'normalized';
}

/**
 * Determines whether geometry can be truthfully and reliably plotted on an image.
 * Both pixel-intrinsic and normalized geometry strictly require valid source dimensions
 * (width > 0, height > 0) to ensure accurate aspect-ratio letterboxing.
 * Historical uncalibrated boxes MUST NOT be plotted at arbitrary or guessed scales.
 */
export function shouldPlotVersionGeometry(
  declaredSystem: string | null | undefined,
  boxes: BoundingBox[] | undefined,
  dimensions: { width: number; height: number } | null | undefined
): boolean {
  if (!boxes || boxes.length === 0) return false;
  if (!dimensions || dimensions.width <= 0 || dimensions.height <= 0) {
    return false;
  }
  if (declaredSystem === 'pixel-intrinsic' || declaredSystem === 'normalized') {
    return true;
  }
  return false;
}

/**
 * Safely converts an array of normalized bounding boxes [0, 1] into intrinsic source-image pixels [0, W_src] x [0, H_src].
 * Preserves id, label, confidence, and all existing metadata fields.
 * Throws an Error if dimensions are missing or invalid.
 */
export function convertNormalizedToPixelIntrinsic(
  boxes: BoundingBox[],
  dimensions: { width: number; height: number } | null | undefined
): BoundingBox[] {
  if (!dimensions || dimensions.width <= 0 || dimensions.height <= 0) {
    throw new Error('Valid source image dimensions (width and height > 0) are required to convert normalized coordinates.');
  }
  const { width: W, height: H } = dimensions;
  return boxes.map((box) => ({
    ...box,
    x: Math.max(0, Math.min(W, Math.round(box.x * W))),
    y: Math.max(0, Math.min(H, Math.round(box.y * H))),
    w: Math.max(1, Math.min(W, Math.round(box.w * W))),
    h: Math.max(1, Math.min(H, Math.round(box.h * H))),
  }));
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
  if (dispW <= 0 || dispH <= 0 || srcW <= 0 || srcH <= 0) {
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

/**
 * Formats a record's IoU comparison result safely and honestly.
 * Distinguishes valid 0.0 IoU scores from unavailable/incomparable states.
 * Prohibits substituting fabricated numbers for null/undefined metrics.
 */
export function formatIoUMetric(
  meanIou: number | null | undefined,
  iouShift?: number | null | undefined,
  exclusionReason?: string | null
): { label: string; isAvailable: boolean; score: number | null } {
  if (meanIou !== null && meanIou !== undefined && !Number.isNaN(meanIou)) {
    const shiftText =
      iouShift !== null && iouShift !== undefined && !Number.isNaN(iouShift)
        ? ` (Shift: ${iouShift.toFixed(4)})`
        : '';
    return {
      label: `IoU: ${meanIou.toFixed(4)}${shiftText}`,
      isAvailable: true,
      score: meanIou,
    };
  }

  const reasonMap: Record<string, string> = {
    different_source_assets: 'Different Source Assets',
    missing_source_asset: 'Missing Source Asset',
    ambiguous_primary_image: 'Ambiguous Primary Image',
    uncalibrated_coordinates: 'Uncalibrated Geometry',
    missing_dimensions: 'Missing Dimensions',
    conflicting_dimensions: 'Conflicting Dimensions',
  };
  const cleanReason =
    (exclusionReason && reasonMap[exclusionReason]) ||
    (exclusionReason ? exclusionReason.replace(/_/g, ' ') : 'Incomparable');

  return {
    label: `IoU unavailable (${cleanReason})`,
    isAvailable: false,
    score: null,
  };
}

