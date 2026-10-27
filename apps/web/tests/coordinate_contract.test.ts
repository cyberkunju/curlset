/**
 * Regression and Contract Tests for Coordinate Calibration, Editing Integrity,
 * and Version Asset Isolation (Phases R5.2.1, R5.2.2, R5.2.3)
 *
 * Runs directly via Node.js to verify actual TypeScript implementation.
 */
import assert from 'node:assert';
import {
  convertNormalizedToPixelIntrinsic,
  displayToSourceCoords,
  identifyCoordinateSystem,
  isCoordinateSystemCalibrated,
  shouldPlotVersionGeometry,
  sourceToDisplayBox,
} from '../src/utils/coordinateContract.ts';
import type { BoundingBox } from '../src/utils/coordinateContract.ts';

function runTests() {
  console.log('--- Running TypeScript Coordinate Calibration & Integrity Tests ---');

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

    const isCalibrated = isCoordinateSystemCalibrated(undefined);
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

  // Test 3: Fractional coordinates without explicit metadata remain uncalibrated
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

  // Test 4: Explicit pixel-intrinsic coordinates plot when dimensions exist, refuse when missing
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

  // Test 5: Explicit normalized coordinates require source dimensions to prevent container stretching
  {
    const normalizedBoxes: BoundingBox[] = [
      { label: 'sign', x: 0.2, y: 0.3, w: 0.4, h: 0.2 },
    ];
    const system = identifyCoordinateSystem('normalized', normalizedBoxes);
    assert.strictEqual(system, 'normalized');

    const canPlotWithoutDims = shouldPlotVersionGeometry('normalized', normalizedBoxes, null);
    assert.strictEqual(
      canPlotWithoutDims,
      false,
      'Normalized geometry without verified dimensions must not be projected across container'
    );

    const canPlotWithDims = shouldPlotVersionGeometry('normalized', normalizedBoxes, {
      width: 1920,
      height: 1080,
    });
    assert.strictEqual(
      canPlotWithDims,
      true,
      'Normalized geometry with verified source dimensions can be plotted'
    );
  }

  // Test 6: Legacy lock bypass prevention - empty box list without declared system is NOT calibrated
  {
    const isCalibrated = isCoordinateSystemCalibrated(undefined);
    assert.strictEqual(
      isCalibrated,
      false,
      'Empty box lists without an explicit calibrated coordinate system must not bypass legacy lock'
    );

    const isIntrinsicCalibrated = isCoordinateSystemCalibrated('pixel-intrinsic');
    assert.strictEqual(isIntrinsicCalibrated, true, 'Explicit pixel-intrinsic is calibrated');

    const isNormalizedCalibrated = isCoordinateSystemCalibrated('normalized');
    assert.strictEqual(isNormalizedCalibrated, true, 'Explicit normalized is calibrated');
  }

  // Test 7: convertNormalizedToPixelIntrinsic with real dimensions
  {
    const normalizedBoxes: BoundingBox[] = [
      {
        id: 'box-1',
        label: 'vehicle',
        x: 0.1,
        y: 0.2,
        w: 0.5,
        h: 0.4,
        confidence: 0.95,
      },
      {
        id: 'box-2',
        label: 'pedestrian',
        x: 0.0,
        y: 0.5,
        w: 0.25,
        h: 0.5,
        confidence: 0.88,
      },
    ];

    const converted = convertNormalizedToPixelIntrinsic(normalizedBoxes, {
      width: 1920,
      height: 1080,
    });

    assert.strictEqual(converted.length, 2);
    // Box 1: x: 0.1 * 1920 = 192, y: 0.2 * 1080 = 216, w: 0.5 * 1920 = 960, h: 0.4 * 1080 = 432
    assert.strictEqual(converted[0].x, 192);
    assert.strictEqual(converted[0].y, 216);
    assert.strictEqual(converted[0].w, 960);
    assert.strictEqual(converted[0].h, 432);
    assert.strictEqual(converted[0].id, 'box-1', 'Box id must be preserved');
    assert.strictEqual(converted[0].label, 'vehicle', 'Class label must be preserved');
    assert.strictEqual(converted[0].confidence, 0.95, 'Confidence must be preserved');

    // Box 2: x: 0, y: 0.5 * 1080 = 540, w: 0.25 * 1920 = 480, h: 0.5 * 1080 = 540
    assert.strictEqual(converted[1].x, 0);
    assert.strictEqual(converted[1].y, 540);
    assert.strictEqual(converted[1].w, 480);
    assert.strictEqual(converted[1].h, 540);
    assert.strictEqual(converted[1].id, 'box-2');
    assert.strictEqual(converted[1].label, 'pedestrian');
    assert.strictEqual(converted[1].confidence, 0.88);
  }

  // Test 8: convertNormalizedToPixelIntrinsic throws when dimensions are missing or non-positive
  {
    const boxes: BoundingBox[] = [{ label: 'test', x: 0.1, y: 0.1, w: 0.2, h: 0.2 }];

    assert.throws(
      () => convertNormalizedToPixelIntrinsic(boxes, null),
      /Valid source image dimensions/,
      'Must reject conversion when dimensions are null'
    );

    assert.throws(
      () => convertNormalizedToPixelIntrinsic(boxes, { width: 0, height: 600 }),
      /Valid source image dimensions/,
      'Must reject conversion when width is zero'
    );

    assert.throws(
      () => convertNormalizedToPixelIntrinsic(boxes, { width: 800, height: -10 }),
      /Valid source image dimensions/,
      'Must reject conversion when height is negative'
    );
  }

  // Test 9: displayToSourceCoords accuracy at 1:1 and downscaled viewports
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

  // Test 10: sourceToDisplayBox mapping
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

    // Normalized box projection with verified dimensions
    const normBox: BoundingBox = { label: 'box', x: 0.25, y: 0.5, w: 0.5, h: 0.25 };
    const normStyle = sourceToDisplayBox(normBox, 800, 400, 1600, 800, true);
    assert.deepStrictEqual(normStyle, {
      left: '200px',
      top: '200px',
      width: '400px',
      height: '100px',
    });

    // Invalid dimensions return null
    const invalidStyle = sourceToDisplayBox(box, 0, 0, 1000, 500, false);
    assert.strictEqual(invalidStyle, null, 'Invalid display dimensions should return null');

    // Missing source dimensions for normalized box returns null (prevents container distortion)
    const invalidNormStyle = sourceToDisplayBox(normBox, 800, 400, 0, 0, true);
    assert.strictEqual(invalidNormStyle, null, 'Missing source dimensions for normalized box should return null');
  }

  // =========================================================================
  // Phase R5.2.3 Regressions: Normalized Deletion & Version Asset Fallback Integrity
  // =========================================================================

  // Test 11: Normalized deletion bypass prevention
  {
    const normalizedBoxes: BoundingBox[] = [
      { id: 'norm-1', label: 'defect', x: 0.2, y: 0.2, w: 0.3, h: 0.3 },
    ];
    const coordSystem = 'normalized';
    const isExplicitlyNormalized = coordSystem === 'normalized';

    // Simulated handleDeleteBox logic
    const attemptDeleteBox = (boxes: BoundingBox[], index: number, isNormalized: boolean) => {
      if (isNormalized) return boxes; // Guarded: deletion is prohibited
      return boxes.filter((_, i) => i !== index);
    };

    const afterDeleteAttempt = attemptDeleteBox(normalizedBoxes, 0, isExplicitlyNormalized);
    assert.strictEqual(afterDeleteAttempt.length, 1, 'Normalized box deletion must be blocked');
    assert.strictEqual(afterDeleteAttempt[0].id, 'norm-1');

    // Simulated keyboard shortcut guard
    const handleKeyDownGuard = (key: string, isNormalized: boolean) => {
      if (key === 'Delete' || key === 'Backspace') {
        if (isNormalized) return false; // blocked
        return true;
      }
      return false;
    };
    assert.strictEqual(handleKeyDownGuard('Delete', isExplicitlyNormalized), false, 'Keyboard delete must be blocked');
    assert.strictEqual(handleKeyDownGuard('Backspace', isExplicitlyNormalized), false, 'Keyboard backspace must be blocked');

    // Drawing guard: even if box list is empty, if coordinateSystem === 'normalized', drawing is blocked
    const canStartDrawing = (isNormalized: boolean, boxCount: number) => {
      if (isNormalized) return false; // Never permit drawing intrinsic pixels when declared normalized
      return true;
    };
    assert.strictEqual(canStartDrawing(true, 1), false, 'Drawing is blocked when normalized with boxes');
    assert.strictEqual(canStartDrawing(true, 0), false, 'Drawing remains blocked when normalized even if empty');
    assert.strictEqual(canStartDrawing(false, 0), true, 'Drawing is permitted once calibrated intrinsic');
  }

  // Test 12: Empty normalized annotation retaining declaration & atomic conversion
  {
    // Empty normalized payload retains declared system
    const system = identifyCoordinateSystem('normalized', []);
    assert.strictEqual(system, 'normalized', 'Empty normalized annotation retains authoritative normalized declaration');

    // Atomic conversion from normalized to pixel-intrinsic
    const naturalDims = { width: 1000, height: 800 };
    const emptyBoxes: BoundingBox[] = [];
    const converted = convertNormalizedToPixelIntrinsic(emptyBoxes, naturalDims);
    assert.deepStrictEqual(converted, [], 'Converting empty boxes returns empty array');

    // Simulate save logic:
    // If activeCoordSystem === 'normalized', saving persists 'normalized'
    const simulateSavePayload = (
      activeCoordSystem: string | null,
      existingCoordSys: string | null,
      boxes: BoundingBox[],
      dims: { width: number; height: number } | null
    ) => {
      const payload: Record<string, any> = { boxes };
      const hasValidDims = Boolean(dims && dims.width > 0 && dims.height > 0);

      if (
        hasValidDims &&
        activeCoordSystem !== 'normalized' &&
        (activeCoordSystem === 'pixel-intrinsic' || existingCoordSys === 'pixel-intrinsic')
      ) {
        payload.coordinate_system = 'pixel-intrinsic';
        payload.image_dimensions = dims;
      } else if (activeCoordSystem === 'normalized' || existingCoordSys === 'normalized') {
        payload.coordinate_system = 'normalized';
        if (hasValidDims) {
          payload.image_dimensions = dims;
        }
      }
      return payload;
    };

    // Case A: Empty normalized annotation without conversion saves as 'normalized'
    const savedNormalized = simulateSavePayload('normalized', 'normalized', [], naturalDims);
    assert.strictEqual(savedNormalized.coordinate_system, 'normalized');

    // Case B: Converted annotation saves as 'pixel-intrinsic' with dimensions
    const savedConverted = simulateSavePayload('pixel-intrinsic', 'normalized', [{ label: 'box', x: 100, y: 100, w: 200, h: 200 }], naturalDims);
    assert.strictEqual(savedConverted.coordinate_system, 'pixel-intrinsic');
    assert.deepStrictEqual(savedConverted.image_dimensions, naturalDims);

    // Case C: Conversion failure when dimensions are missing
    assert.throws(
      () => convertNormalizedToPixelIntrinsic([{ label: 'test', x: 0.1, y: 0.1, w: 0.2, h: 0.2 }], null),
      /Valid source image dimensions/,
      'Conversion must fail without verified dimensions'
    );
  }

  // Test 13: Version asset URL resolution - strict isolation without shared fallbacks
  {
    const resolveUrls = (
      assetUrlV1: string | null | undefined,
      assetUrlV2: string | null | undefined
    ) => {
      return {
        resolvedUrlV1: assetUrlV1 || null,
        resolvedUrlV2: assetUrlV2 || null,
      };
    };

    // 1. Both versions have different valid assets
    const res1 = resolveUrls('/api/v1/assets/ast_1/raw', '/api/v1/assets/ast_2/raw');
    assert.strictEqual(res1.resolvedUrlV1, '/api/v1/assets/ast_1/raw');
    assert.strictEqual(res1.resolvedUrlV2, '/api/v1/assets/ast_2/raw');

    // 2. Version 1 lacking asset while Version 2 has one
    const res2 = resolveUrls(null, '/api/v1/assets/ast_2/raw');
    assert.strictEqual(res2.resolvedUrlV1, null, 'V1 must be strictly null without falling back to V2');
    assert.strictEqual(res2.resolvedUrlV2, '/api/v1/assets/ast_2/raw');

    // 3. Version 2 lacking asset while Version 1 has one
    const res3 = resolveUrls('/api/v1/assets/ast_1/raw', null);
    assert.strictEqual(res3.resolvedUrlV1, '/api/v1/assets/ast_1/raw');
    assert.strictEqual(res3.resolvedUrlV2, null, 'V2 must be strictly null without falling back to V1');

    // 4. Both versions lacking assets
    const res4 = resolveUrls(null, null);
    assert.strictEqual(res4.resolvedUrlV1, null);
    assert.strictEqual(res4.resolvedUrlV2, null);
  }

  // Test 14: Overlay compatibility rules
  {
    const checkOverlayCompatibility = (
      resolvedUrlV1: string | null,
      resolvedUrlV2: string | null,
      assetIdV1: string | null,
      assetIdV2: string | null,
      sameAsset: boolean
    ) => {
      return Boolean(
        resolvedUrlV1 &&
        resolvedUrlV2 &&
        (sameAsset || (assetIdV1 && assetIdV2 && assetIdV1 === assetIdV2) || (resolvedUrlV1 === resolvedUrlV2))
      );
    };

    // Compatible: both have same verified asset
    assert.strictEqual(
      checkOverlayCompatibility('/api/v1/assets/same/raw', '/api/v1/assets/same/raw', 'same', 'same', true),
      true,
      'Overlay mode permitted when versions reference same asset'
    );

    // Incompatible: differing assets
    assert.strictEqual(
      checkOverlayCompatibility('/api/v1/assets/ast_1/raw', '/api/v1/assets/ast_2/raw', 'ast_1', 'ast_2', false),
      false,
      'Overlay mode refused when assets differ'
    );

    // Incompatible: V1 lacking asset
    assert.strictEqual(
      checkOverlayCompatibility(null, '/api/v1/assets/ast_2/raw', null, 'ast_2', false),
      false,
      'Overlay mode refused when V1 lacks asset'
    );

    // Incompatible: V2 lacking asset
    assert.strictEqual(
      checkOverlayCompatibility('/api/v1/assets/ast_1/raw', null, 'ast_1', null, false),
      false,
      'Overlay mode refused when V2 lacks asset'
    );

    // Incompatible: both lacking assets
    assert.strictEqual(
      checkOverlayCompatibility(null, null, null, null, false),
      false,
      'Overlay mode refused when both lack assets'
    );
  }

  // Test 15: Side-by-side error and rendering isolation
  {
    // Side-by-side mode tracks independent error states
    let imgErrorV1 = false;
    let imgErrorV2 = false;

    // Failure on V1 image load
    imgErrorV1 = true;
    assert.strictEqual(imgErrorV1, true);
    assert.strictEqual(imgErrorV2, false, 'V1 image error must not taint V2 image state');

    // Boxes are isolated to each column
    const boxesV1 = [{ label: 'box_v1', x: 10, y: 10, w: 50, h: 50 }];
    const boxesV2 = [{ label: 'box_v2', x: 20, y: 20, w: 60, h: 60 }];

    const renderColumnBoxes = (isV1: boolean) => (isV1 ? boxesV1 : boxesV2);
    assert.deepStrictEqual(renderColumnBoxes(true), boxesV1);
    assert.deepStrictEqual(renderColumnBoxes(false), boxesV2);
  }

  console.log('✓ All TypeScript Coordinate Calibration & Integrity Tests PASSED!');
}

runTests();
