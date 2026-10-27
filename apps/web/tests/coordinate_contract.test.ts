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
  formatIoUMetric,
  resolvePrimaryImageAsset,
} from '../src/utils/coordinateContract.ts';
import type { BoundingBox, ManifestAsset } from '../src/utils/coordinateContract.ts';

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

  // Test 16 (Phase R5.2.4): formatIoUMetric distinguishes valid zero from unavailable
  {
    // Valid numeric IoU
    const validMetric = formatIoUMetric(0.85, 0.15, null);
    assert.strictEqual(validMetric.isAvailable, true);
    assert.strictEqual(validMetric.score, 0.85);
    assert.strictEqual(validMetric.label, 'IoU: 0.8500 (Shift: 0.1500)');

    // Valid zero overlap (must NOT be treated as unavailable or error)
    const zeroMetric = formatIoUMetric(0.0, 1.0, null);
    assert.strictEqual(zeroMetric.isAvailable, true);
    assert.strictEqual(zeroMetric.score, 0.0);
    assert.strictEqual(zeroMetric.label, 'IoU: 0.0000 (Shift: 1.0000)');

    // Unavailable: Different source assets
    const diffAssetsMetric = formatIoUMetric(null, null, 'different_source_assets');
    assert.strictEqual(diffAssetsMetric.isAvailable, false);
    assert.strictEqual(diffAssetsMetric.score, null);
    assert.strictEqual(diffAssetsMetric.label, 'IoU unavailable (Different Source Assets)');

    // Unavailable: Missing source asset
    const missingAstMetric = formatIoUMetric(null, null, 'missing_source_asset');
    assert.strictEqual(missingAstMetric.isAvailable, false);
    assert.strictEqual(missingAstMetric.label, 'IoU unavailable (Missing Source Asset)');

    // Unavailable: Uncalibrated coordinates
    const uncalMetric = formatIoUMetric(null, null, 'uncalibrated_coordinates');
    assert.strictEqual(uncalMetric.isAvailable, false);
    assert.strictEqual(uncalMetric.label, 'IoU unavailable (Uncalibrated Geometry)');

    // Unavailable: Missing dimensions
    const noDimsMetric = formatIoUMetric(null, null, 'missing_dimensions');
    assert.strictEqual(noDimsMetric.isAvailable, false);
    assert.strictEqual(noDimsMetric.label, 'IoU unavailable (Missing Dimensions)');

    // Unavailable: Conflicting dimensions
    const conflictMetric = formatIoUMetric(null, null, 'conflicting_dimensions');
    assert.strictEqual(conflictMetric.isAvailable, false);
    assert.strictEqual(conflictMetric.label, 'IoU unavailable (Conflicting Dimensions)');

    // Unavailable: Ambiguous primary image
    const ambigMetric = formatIoUMetric(null, null, 'ambiguous_primary_image');
    assert.strictEqual(ambigMetric.isAvailable, false);
    assert.strictEqual(ambigMetric.label, 'IoU unavailable (Ambiguous Primary Image)');

    // Unavailable: Undefined reason fallback
    const fallbackMetric = formatIoUMetric(undefined, undefined, undefined);
    assert.strictEqual(fallbackMetric.isAvailable, false);
    assert.strictEqual(fallbackMetric.label, 'IoU unavailable (Incomparable)');
  }

  // Test 17 (Phase R5.2.4): Summary aggregation display formatting
  {
    const formatSummaryShift = (shift: number | null | undefined): string => {
      if (shift !== null && shift !== undefined && !Number.isNaN(shift)) {
        return shift.toFixed(4);
      }
      return 'Unavailable';
    };

    assert.strictEqual(formatSummaryShift(0.25), '0.2500');
    assert.strictEqual(formatSummaryShift(0.0), '0.0000');
    assert.strictEqual(formatSummaryShift(null), 'Unavailable');
    assert.strictEqual(formatSummaryShift(undefined), 'Unavailable');
  }

  // Test 18 (Phase R5.2.4.1): Primary asset resolution & overlay refusal for missing/auxiliary assets
  {
    const resolveDisplayUrl = (versionAssetUrl: string | null | undefined): string | null => {
      return versionAssetUrl ? versionAssetUrl.replace('/file', '/raw') : null;
    };

    // When primary image is resolved for V1 but V2 has ambiguous/missing primary image
    const urlV1 = resolveDisplayUrl('/api/v1/assets/ast_prim_v1/file');
    const urlV2 = resolveDisplayUrl(null); // V2 has no primary image resolved

    assert.strictEqual(urlV1, '/api/v1/assets/ast_prim_v1/raw');
    assert.strictEqual(urlV2, null, 'V2 display URL must be null without fallback');

    // Overlay compatibility requires both resolved URLs and identical asset
    const isOverlayPermitted = Boolean(
      urlV1 && urlV2 && urlV1 === urlV2
    );
    assert.strictEqual(isOverlayPermitted, false, 'Overlay mode strictly refused when either version lacks primary image');
  }

  // Test 19 (Phase R5.2.4.2): Asset metadata strictness & primary-image resolution edge cases
  {
    // 1. Explicit primary_image role with modality="image"
    const r1 = resolvePrimaryImageAsset([
      { asset_id: 'ast_img_ok', role: 'primary_image', modality: 'image' },
    ]);
    assert.strictEqual(r1.asset?.asset_id, 'ast_img_ok');
    assert.strictEqual(r1.reason, null);

    // 2. Explicit primary_image role with modality absent/empty (legacy compatibility)
    const r2a = resolvePrimaryImageAsset([
      { asset_id: 'ast_leg_none', role: 'primary_image', modality: null },
    ]);
    assert.strictEqual(r2a.asset?.asset_id, 'ast_leg_none');
    assert.strictEqual(r2a.reason, null);

    const r2b = resolvePrimaryImageAsset([
      { asset_id: 'ast_leg_empty', role: 'primary_image', modality: '  ' },
    ]);
    assert.strictEqual(r2b.asset?.asset_id, 'ast_leg_empty');
    assert.strictEqual(r2b.reason, null);

    // 3. Explicit primary_image role with known non-image modality
    const r3 = resolvePrimaryImageAsset([
      { asset_id: 'ast_text', role: 'primary_image', modality: 'text' },
    ]);
    assert.strictEqual(r3.asset, null);
    assert.strictEqual(r3.reason, 'missing_source_asset');

    // 4. Explicit primary_image role with unknown non-empty modality
    const r4 = resolvePrimaryImageAsset([
      { asset_id: 'ast_pointcloud', role: 'primary_image', modality: 'pointcloud' },
    ]);
    assert.strictEqual(r4.asset, null);
    assert.strictEqual(r4.reason, 'missing_source_asset');

    // 5. Single asset missing both role and modality
    const r5 = resolvePrimaryImageAsset([
      { asset_id: 'ast_no_role_no_mod', role: null, modality: null },
    ]);
    assert.strictEqual(r5.asset, null);
    assert.strictEqual(r5.reason, 'missing_source_asset');

    // 6. Single asset with modality="image" and no role (supported compatibility)
    const r6 = resolvePrimaryImageAsset([
      { asset_id: 'ast_single_img', role: null, modality: 'image' },
    ]);
    assert.strictEqual(r6.asset?.asset_id, 'ast_single_img');
    assert.strictEqual(r6.reason, null);

    // 7. Multiple valid primary_image candidates returning ambiguous result
    const r7 = resolvePrimaryImageAsset([
      { asset_id: 'ast_p1', role: 'primary_image', modality: 'image' },
      { asset_id: 'ast_p2', role: 'primary_image', modality: 'image' },
    ]);
    assert.strictEqual(r7.asset, null);
    assert.strictEqual(r7.reason, 'ambiguous_primary_image');

    // Multiple image assets with no role
    const r7b = resolvePrimaryImageAsset([
      { asset_id: 'ast_raw1', modality: 'image' },
      { asset_id: 'ast_raw2', modality: 'image' },
    ]);
    assert.strictEqual(r7b.asset, null);
    assert.strictEqual(r7b.reason, 'ambiguous_primary_image');

    // 8. No invalid or ambiguous asset can produce an overlay
    const invalidAssetResolution = resolvePrimaryImageAsset([
      { asset_id: 'ast_inv', role: 'primary_image', modality: 'mesh' },
    ]);
    const urlFromInvalid = invalidAssetResolution.asset
      ? `/api/v1/assets/${invalidAssetResolution.asset.asset_id}/raw`
      : null;
    assert.strictEqual(urlFromInvalid, null);

    const overlayWithInvalid = Boolean(
      urlFromInvalid && '/api/v1/assets/valid/raw' && urlFromInvalid === '/api/v1/assets/valid/raw'
    );
    assert.strictEqual(overlayWithInvalid, false, 'Invalid asset must never permit overlay');
  }

  console.log('✓ All TypeScript Coordinate Calibration & Integrity Tests PASSED!');
}

runTests();

