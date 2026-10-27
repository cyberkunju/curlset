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

export interface ManifestAsset {
  asset_id?: string;
  role?: string | null;
  modality?: string | null;
  mime_type?: string | null;
  dimensions?: { width: number; height: number } | null;
  storage_key?: string | null;
  [key: string]: any;
}

/**
 * Resolves the intended primary image asset from explicit metadata per the repository contract:
 * - Primary candidate: role is 'primary_image' and modality is 'image' or genuinely absent/empty (legacy).
 * - Rejects known non-image modalities ('text', 'audio', 'video', 'document') and non-empty unrecognized modalities.
 * - Single asset with no role may be used only when modality is explicitly 'image'.
 * - Single asset missing both role and modality resolves as unavailable ('missing_source_asset').
 * - Preserves ambiguity protection when multiple eligible primary images are present.
 * - Returns { asset, reason: null } on clean single resolution.
 * - Returns { asset: null, reason: 'ambiguous_primary_image' } if multiple candidates claim primary image role or multiple fallback images exist.
 * - Returns { asset: null, reason: 'missing_source_asset' } if no primary image can be resolved.
 */
export function resolvePrimaryImageAsset(assets?: ManifestAsset[] | null): {
  asset: ManifestAsset | null;
  reason: string | null;
} {
  if (!assets || !Array.isArray(assets) || assets.length === 0) {
    return { asset: null, reason: 'missing_source_asset' };
  }

  const isEmpty = (v: any) => v === null || v === undefined || (typeof v === 'string' && v.trim() === '');
  const isImageModality = (m: any) => typeof m === 'string' && m.trim().toLowerCase() === 'image';

  // 1. Look for explicit primary_image role candidates
  const primaryRoleCandidates = assets.filter((a) => {
    if (!a || typeof a !== 'object') return false;
    const role = typeof a.role === 'string' ? a.role.trim() : null;
    if (role === 'primary_image') {
      return isImageModality(a.modality) || isEmpty(a.modality);
    }
    return false;
  });

  if (primaryRoleCandidates.length === 1) {
    return { asset: primaryRoleCandidates[0], reason: null };
  }
  if (primaryRoleCandidates.length > 1) {
    return { asset: null, reason: 'ambiguous_primary_image' };
  }

  // If any asset explicitly declared primary_image but failed modality validation, do not fallback
  const hasIneligiblePrimary = assets.some(
    (a) => a && typeof a === 'object' && typeof a.role === 'string' && a.role.trim() === 'primary_image'
  );
  if (hasIneligiblePrimary) {
    return { asset: null, reason: 'missing_source_asset' };
  }

  // 2. Fallback: single asset record where modality explicitly identifies it as an image
  if (assets.length === 1) {
    const a = assets[0];
    if (a && typeof a === 'object') {
      const role = a.role;
      const roleEmptyOrImage = isEmpty(role) || (typeof role === 'string' && role.trim() === 'image');
      if (roleEmptyOrImage && isImageModality(a.modality)) {
        return { asset: a, reason: null };
      }
    }
    return { asset: null, reason: 'missing_source_asset' };
  }

  // 3. Multiple assets without primary_image role
  const imageModalityCandidates = assets.filter((a) => a && typeof a === 'object' && isImageModality(a.modality));
  if (imageModalityCandidates.length > 1) {
    return { asset: null, reason: 'ambiguous_primary_image' };
  }

  return { asset: null, reason: 'missing_source_asset' };
}


