/**
 * 1-Click Magnetic Smart-Box & Sobel Edge-Snap Engine.
 * Extracts luminance gradients around rough bounding box edges in <150ms
 * and automatically snaps coordinates to tight physical object contours.
 */

export interface BoundingBoxCoordinates {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Computes luminance of an RGBA pixel (Rec. 709 / sRGB perceptual weights).
 */
function getPixelLuminance(data: Uint8ClampedArray, index: number): number {
  const r = data[index];
  const g = data[index + 1];
  const b = data[index + 2];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * Snaps a drawn or existing bounding box to high-contrast Sobel gradient edges.
 *
 * @param imageData The ImageData of the image loaded into an offscreen canvas
 * @param roughBox The user-drawn or existing bounding box {x, y, w, h}
 * @param searchWindow The search radius in pixels around each edge (default +/- 14px)
 * @param edgeThreshold Minimum gradient magnitude to trigger a snap (default 18.0)
 */
export function magneticSnapBoxToEdges(
  imageData: ImageData,
  roughBox: BoundingBoxCoordinates,
  searchWindow: number = 14,
  edgeThreshold: number = 18.0
): BoundingBoxCoordinates {
  const width = imageData.width;
  const height = imageData.height;
  const data = imageData.data;

  // Box bounds in integer pixels
  let left = Math.max(0, Math.min(width - 1, Math.round(roughBox.x)));
  let top = Math.max(0, Math.min(height - 1, Math.round(roughBox.y)));
  let right = Math.max(0, Math.min(width - 1, Math.round(roughBox.x + roughBox.w)));
  let bottom = Math.max(0, Math.min(height - 1, Math.round(roughBox.y + roughBox.h)));

  if (right <= left + 5 || bottom <= top + 5) {
    return roughBox;
  }

  // Helper: compute average horizontal Sobel gradient along a vertical line x in [top, bottom]
  const evaluateVerticalEdge = (xCandidate: number): number => {
    if (xCandidate < 1 || xCandidate >= width - 1) return 0;
    let sumGrad = 0;
    let count = 0;
    const step = Math.max(1, Math.floor((bottom - top) / 32)); // sample up to 32 points along edge
    for (let y = top; y <= bottom; y += step) {
      const idxL = ((y * width) + (xCandidate - 1)) * 4;
      const idxR = ((y * width) + (xCandidate + 1)) * 4;
      const lumL = getPixelLuminance(data, idxL);
      const lumR = getPixelLuminance(data, idxR);
      sumGrad += Math.abs(lumR - lumL);
      count++;
    }
    return count > 0 ? sumGrad / count : 0;
  };

  // Helper: compute average vertical Sobel gradient along a horizontal line y in [left, right]
  const evaluateHorizontalEdge = (yCandidate: number): number => {
    if (yCandidate < 1 || yCandidate >= height - 1) return 0;
    let sumGrad = 0;
    let count = 0;
    const step = Math.max(1, Math.floor((right - left) / 32));
    for (let x = left; x <= right; x += step) {
      const idxT = (((yCandidate - 1) * width) + x) * 4;
      const idxB = (((yCandidate + 1) * width) + x) * 4;
      const lumT = getPixelLuminance(data, idxT);
      const lumB = getPixelLuminance(data, idxB);
      sumGrad += Math.abs(lumB - lumT);
      count++;
    }
    return count > 0 ? sumGrad / count : 0;
  };

  // 1. Snap Left Edge
  let bestLeft = left;
  let maxLeftGrad = 0;
  const minX = Math.max(1, left - searchWindow);
  const maxX = Math.min(right - 8, left + searchWindow);
  for (let x = minX; x <= maxX; x++) {
    const grad = evaluateVerticalEdge(x);
    if (grad > maxLeftGrad) {
      maxLeftGrad = grad;
      bestLeft = x;
    }
  }
  if (maxLeftGrad >= edgeThreshold) {
    left = bestLeft;
  }

  // 2. Snap Right Edge
  let bestRight = right;
  let maxRightGrad = 0;
  const minRX = Math.max(left + 8, right - searchWindow);
  const maxRX = Math.min(width - 2, right + searchWindow);
  for (let x = minRX; x <= maxRX; x++) {
    const grad = evaluateVerticalEdge(x);
    if (grad > maxRightGrad) {
      maxRightGrad = grad;
      bestRight = x;
    }
  }
  if (maxRightGrad >= edgeThreshold) {
    right = bestRight;
  }

  // 3. Snap Top Edge
  let bestTop = top;
  let maxTopGrad = 0;
  const minY = Math.max(1, top - searchWindow);
  const maxY = Math.min(bottom - 8, top + searchWindow);
  for (let y = minY; y <= maxY; y++) {
    const grad = evaluateHorizontalEdge(y);
    if (grad > maxTopGrad) {
      maxTopGrad = grad;
      bestTop = y;
    }
  }
  if (maxTopGrad >= edgeThreshold) {
    top = bestTop;
  }

  // 4. Snap Bottom Edge
  let bestBottom = bottom;
  let maxBottomGrad = 0;
  const minBY = Math.max(top + 8, bottom - searchWindow);
  const maxBY = Math.min(height - 2, bottom + searchWindow);
  for (let y = minBY; y <= maxBY; y++) {
    const grad = evaluateHorizontalEdge(y);
    if (grad > maxBottomGrad) {
      maxBottomGrad = grad;
      bestBottom = y;
    }
  }
  if (maxBottomGrad >= edgeThreshold) {
    bottom = bestBottom;
  }

  return {
    x: left,
    y: top,
    w: Math.max(10, right - left),
    h: Math.max(10, bottom - top),
  };
}
