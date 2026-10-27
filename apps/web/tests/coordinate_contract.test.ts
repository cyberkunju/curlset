/**
 * Regression and Contract Tests for Coordinate Calibration (Phase R5.2.1)
 *
 * Runs directly via Node.js to verify actual TypeScript implementation.
 */
import assert from 'node:assert';
import {
  displayToSourceCoords,
  identifyCoordinateSystem,
  isCoordinateSystemCalibrated,
  shouldPlotVersionGeometry,
  sourceToDisplayBox,
} from '../src/utils/coordinateContract.ts';
import type { BoundingBox } from '../src/utils/coordinateContract.ts';

function runTests() {
  console.log('--- Running TypeScript Coordinate Calibration Tests ---');

  // Test 1: Historical annotation without coordinate metadata is identified as uncalibrated
  {
    const legacyBoxes: BoundingBox[] = [
      { label: 'defect', x: 120, y: 80, w: 200, h: 150 },
    ];
    const system = identifyCoordinateSystem(undefined, legacyBoxes);
    assert.strictEqual(
      system,
      'uncalibrated-legacy',
      'Missing metadata must be identified as uncalibrated legacy'
    );

    const isCalibrated = isCoordinateSystemCalibrated(undefined, legacyBoxes);
    assert.strictEqual(
      isCalibrated,
      false,
      'Historical annotation with existing boxes must not be treated as calibrated'
    );
  }

  // Test 2: Uncalibrated historical geometry MUST NOT be plotted
  {
    const legacyBoxes: BoundingBox[] = [
      { label: 'part', x: 250, y: 150, w: 100, h: 100 },
    ];
    const canPlot = shouldPlotVersionGeometry(undefined, legacyBoxes, {
      width: 1920,
      height: 1080,
    });
    assert.strictEqual(
      canPlot,
      false,
      'Uncalibrated historical geometry must not be plotted even when image dimensions exist'
    );
  }

  // Test 3: Fractional coordinates without explicit metadata are still uncalibrated
  {
    const fractionalBoxes: BoundingBox[] = [
      { label: 'object', x: 0.1, y: 0.2, w: 0.3, h: 0.4 },
    ];
    const system = identifyCoordinateSystem(null, fractionalBoxes);
    assert.strictEqual(
      system,
      'uncalibrated-legacy',
      'Fractional coordinates without explicit declaration must remain uncalibrated'
    );

    const canPlot = shouldPlotVersionGeometry(null, fractionalBoxes, {
      width: 800,
      height: 600,
    });
    assert.strictEqual(
      canPlot,
      false,
      'Fractional coordinates without explicit metadata must not be plotted'
    );
  }

  // Test 4: Explicit pixel-intrinsic coordinates plot when dimensions exist
  {
    const intrinsicBoxes: BoundingBox[] = [
      { label: 'car', x: 100, y: 200, w: 300, h: 150 },
    ];
    const system = identifyCoordinateSystem('pixel-intrinsic', intrinsicBoxes);
    assert.strictEqual(system, 'pixel-intrinsic');

    const canPlotWithDims = shouldPlotVersionGeometry('pixel-intrinsic', intrinsicBoxes, {
      width: 1000,
      height: 800,
    });
    assert.strictEqual(canPlotWithDims, true, 'Pixel-intrinsic coordinates with dimensions can be plotted');

    const canPlotWithoutDims = shouldPlotVersionGeometry('pixel-intrinsic', intrinsicBoxes, null);
    assert.strictEqual(
      canPlotWithoutDims,
      false,
      'Pixel-intrinsic coordinates without image dimensions cannot be plotted'
    );
  }

  // Test 5: Explicit normalized coordinates can be plotted
  {
    const normalizedBoxes: BoundingBox[] = [
      { label: 'sign', x: 0.2, y: 0.3, w: 0.4, h: 0.2 },
    ];
    const system = identifyCoordinateSystem('normalized', normalizedBoxes);
    assert.strictEqual(system, 'normalized');

    const canPlot = shouldPlotVersionGeometry('normalized', normalizedBoxes, null);
    assert.strictEqual(canPlot, true, 'Explicitly normalized coordinates can be plotted');
  }

  // Test 6: Empty box list is uncommitted / safe to calibrate
  {
    const isCalibrated = isCoordinateSystemCalibrated(undefined, []);
    assert.strictEqual(
      isCalibrated,
      true,
      'Empty box lists are safe to calibrate into canonical frame'
    );
  }

  // Test 7: displayToSourceCoords accuracy at 1:1 and downscaled viewports
  {
    // 1:1 display
    const pt1 = displayToSourceCoords(150, 250, 800, 600, 800, 600);
    assert.deepStrictEqual(pt1, { x: 150, y: 250 });

    // Downscaled container (50% scale: 960x540 container for 1920x1080 image)
    const pt2 = displayToSourceCoords(480, 270, 960, 540, 1920, 1080);
    assert.deepStrictEqual(pt2, { x: 960, y: 540 });

    // Boundary clamping
    const ptClamped = displayToSourceCoords(1200, 700, 960, 540, 1920, 1080);
    assert.deepStrictEqual(ptClamped, { x: 1920, y: 1080 });
  }

  // Test 8: sourceToDisplayBox mapping
  {
    const box: BoundingBox = { label: 'box', x: 200, y: 100, w: 400, h: 200 };

    // Intrinsic projection onto 50% downscaled viewport
    const style = sourceToDisplayBox(box, 500, 250, 1000, 500, false);
    assert.deepStrictEqual(style, {
      left: '100px',
      top: '50px',
      width: '200px',
      height: '100px',
    });

    // Normalized box projection
    const normBox: BoundingBox = { label: 'box', x: 0.25, y: 0.5, w: 0.5, h: 0.25 };
    const normStyle = sourceToDisplayBox(normBox, 800, 400, 0, 0, true);
    assert.deepStrictEqual(normStyle, {
      left: '200px',
      top: '200px',
      width: '400px',
      height: '100px',
    });

    // Invalid dimensions return null
    const invalidStyle = sourceToDisplayBox(box, 0, 0, 1000, 500, false);
    assert.strictEqual(invalidStyle, null, 'Invalid display dimensions should return null');
  }

  console.log('✓ All TypeScript Coordinate Calibration Tests PASSED!');
}

runTests();
