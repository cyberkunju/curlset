/**
 * Regression and Integrity Tests for Shared UI Logic & Component Contracts (Phase R8)
 *
 * Imports directly from production module: apps/web/src/utils/uiIntegrityContracts.ts
 * Tests fail if production implementation is broken or regressed.
 */
import assert from 'node:assert/strict';
import {
  parseHealthProbeResult,
  isDateRangeValid,
  filterAuditLogs,
  filterCandidatesByLicense,
  resolveProgressDisplayState,
  clampClusterPan,
  computeClusterTransform,
  RATE_LIMIT_POLICIES,
} from '../src/utils/uiIntegrityContracts.ts';
import type { CandidateSource, AuditLogRecord } from '../src/utils/uiIntegrityContracts.ts';

console.log('--- Running UI Integrity & Regression Unit Tests (Phase R8) ---');

// ============================================================================
// Test Suite 1: Health & Readiness Endpoint Parsing & Error Handling
// ============================================================================
{
  console.log('Test 1: Health & Readiness Probe Parsing');

  // 1.1: Valid 200 JSON healthy response
  const healthyJson = JSON.stringify({ status: 'ok', database: 'connected', version: '0.1.0' });
  const healthyResult = parseHealthProbeResult(
    200,
    'application/json; charset=utf-8',
    healthyJson,
    null,
    14
  );
  assert.equal(healthyResult.healthy, true, '200 JSON with status:ok must be healthy');
  assert.equal(healthyResult.statusText, 'ok');
  assert.equal(healthyResult.latencyMs, 14);
  assert.equal(healthyResult.httpStatus, 200);

  // 1.2: 200 HTML response from unproxied Nginx SPA fallback MUST be marked as route failure
  const spaFallbackHtml = '<!doctype html><html><head><title>Vite App</title></head><body><div id="root"></div></body></html>';
  const htmlFallbackResult = parseHealthProbeResult(
    200,
    'text/html; charset=utf-8',
    spaFallbackHtml,
    null,
    22
  );
  assert.equal(htmlFallbackResult.healthy, false, 'HTML response on API probe MUST fail as invalid proxy fallback');
  assert.ok(htmlFallbackResult.error?.includes('HTML SPA fallback'), 'Error must identify unproxied SPA fallback');
  assert.equal(htmlFallbackResult.statusText, 'route_fallback_error');

  // 1.3: HTTP 503 degraded readiness response
  const degraded503Json = JSON.stringify({ status: 'degraded', database: 'unavailable', error: 'Database connection failed' });
  const degradedResult = parseHealthProbeResult(
    503,
    'application/json',
    degraded503Json,
    null,
    45
  );
  assert.equal(degradedResult.healthy, false, 'HTTP 503 must not be marked healthy');
  assert.equal(degradedResult.httpStatus, 503);
  assert.equal(degradedResult.statusText, 'degraded');
  assert.ok(degradedResult.error?.includes('Database connection failed'));

  // 1.4: Network failure (connection refused / timeout)
  const networkFailure = parseHealthProbeResult(
    null,
    null,
    null,
    'Connection refused at 127.0.0.1:8000',
    null
  );
  assert.equal(networkFailure.healthy, false);
  assert.equal(networkFailure.statusText, 'network_failure');
  assert.equal(networkFailure.httpStatus, null);
  assert.equal(networkFailure.latencyMs, null);
  assert.equal(networkFailure.error, 'Connection refused at 127.0.0.1:8000');

  // 1.5: 200 with malformed JSON body
  const malformedResult = parseHealthProbeResult(
    200,
    'application/json',
    'Not Valid JSON{',
    null,
    18
  );
  assert.equal(malformedResult.healthy, false);
  assert.ok(malformedResult.error?.includes('Non-JSON response'));

  // 1.6: 200 JSON with status != 'ok'
  const notOkResult = parseHealthProbeResult(
    200,
    'application/json',
    JSON.stringify({ status: 'warning', storage: 'read_only' }),
    null,
    10
  );
  assert.equal(notOkResult.healthy, false, 'Status != "ok" must not be considered healthy');
  assert.equal(notOkResult.statusText, 'warning');

  console.log('✓ Health & readiness endpoint handling verified across 6 production scenarios');
}

// ============================================================================
// Test Suite 2: Audit Filtering, Date Range Validation & Scope Limits
// ============================================================================
{
  console.log('Test 2: Audit Filtering & Timestamp Invariants');

  const sampleAuditRecords: AuditLogRecord[] = [
    {
      id: 'evt-1',
      action: 'dataset.create',
      user_id: 'user_dev',
      resource_type: 'dataset',
      resource_id: 'ds_alpha_1',
      created_at: '2026-03-15T08:30:00.000Z',
      details: { title: 'Autonomous Driving v1' },
    },
    {
      id: 'evt-2',
      action: 'annotation.batch_create',
      user_id: 'user_editor',
      resource_type: 'annotation',
      resource_id: 'rec_42',
      created_at: '2026-03-16T14:15:00.000Z',
      details: { task: 'object_detection', count: 25 },
    },
    {
      id: 'evt-3',
      action: 'source.inspect',
      user_id: 'user_admin',
      resource_type: 'source_candidate',
      resource_id: 'src_99',
      created_at: '2026-03-18T23:59:59.000Z',
      details: { url: 'https://example.org/data.json' },
    },
    {
      id: 'evt-4',
      action: 'project.legacy_export',
      user_id: 'user_dev',
      resource_type: 'export_job',
      resource_id: 'job_legacy',
      created_at: null, // missing timestamp
      details: { note: 'Historical record before timestamps were mandated' },
    },
    {
      id: 'evt-5',
      action: 'member.add',
      user_id: 'user_owner',
      resource_type: 'project_member',
      resource_id: 'user_guest',
      created_at: 'not-a-valid-iso-date', // malformed timestamp
      details: { role: 'viewer' },
    },
  ];

  // 2.1: Inverted date range validation
  assert.equal(isDateRangeValid('2026-03-15', '2026-03-20'), true);
  assert.equal(isDateRangeValid('2026-03-20', '2026-03-20'), true);
  assert.equal(isDateRangeValid('2026-03-20', '2026-03-15'), false, 'Start > End must be invalid');
  assert.equal(isDateRangeValid('', '2026-03-15'), true);
  assert.equal(isDateRangeValid('2026-03-15', ''), true);

  // 2.2: Inverted dates filter returns empty list
  const invertedResults = filterAuditLogs(sampleAuditRecords, {
    startDate: '2026-03-20',
    endDate: '2026-03-15',
  });
  assert.equal(invertedResults.length, 0, 'Inverted date range must return empty list');

  // 2.3: Unfiltered query preserves all records (including missing/malformed timestamps)
  const unfiltered = filterAuditLogs(sampleAuditRecords, {});
  assert.equal(unfiltered.length, 5, 'Unfiltered query must include all loaded records');

  // 2.4: Active date filter strictly excludes null, undefined, or invalid timestamps
  const dateFiltered = filterAuditLogs(sampleAuditRecords, {
    startDate: '2026-03-15',
    endDate: '2026-03-17',
  });
  assert.equal(dateFiltered.length, 2, 'Should match evt-1 and evt-2');
  assert.equal(dateFiltered[0].id, 'evt-1');
  assert.equal(dateFiltered[1].id, 'evt-2');

  // 2.5: Boundary inclusion: 2026-03-18T23:59:59.000Z matches endDate='2026-03-18' (23:59:59.999)
  const boundaryCheck = filterAuditLogs(sampleAuditRecords, {
    startDate: '2026-03-18',
    endDate: '2026-03-18',
  });
  assert.equal(boundaryCheck.length, 1);
  assert.equal(boundaryCheck[0].id, 'evt-3');

  // 2.6: Keyword search across action, user_id, resource_id, and details JSON
  const actionMatch = filterAuditLogs(sampleAuditRecords, { searchQuery: 'batch_create' });
  assert.equal(actionMatch.length, 1);
  assert.equal(actionMatch[0].id, 'evt-2');

  const detailsMatch = filterAuditLogs(sampleAuditRecords, { searchQuery: 'example.org' });
  assert.equal(detailsMatch.length, 1);
  assert.equal(detailsMatch[0].id, 'evt-3');

  const actorMatch = filterAuditLogs(sampleAuditRecords, { searchQuery: 'user_dev' });
  assert.equal(actorMatch.length, 2, 'Matches evt-1 and evt-4');

  // 2.7: Combined keyword + date filter
  const combined = filterAuditLogs(sampleAuditRecords, {
    searchQuery: 'user_dev',
    startDate: '2026-03-15',
    endDate: '2026-03-16',
  });
  assert.equal(combined.length, 1);
  assert.equal(combined[0].id, 'evt-1');

  console.log('✓ Audit log filtering & date-range validation verified across 7 scenarios');
}

// ============================================================================
// Test Suite 3: Catalog Candidate License Status Filtering
// ============================================================================
{
  console.log('Test 3: Catalog License-Status Filtering');

  const candidates: CandidateSource[] = [
    { source_id: 's1', title: 'Open Robotics Dataset', license_status: 'approved_for_intended_use', media_type: 'image/jpeg' },
    { source_id: 's2', title: 'Web Scraped Sample', license_status: 'review_required', media_type: 'text/csv' },
    { source_id: 's3', title: 'Proprietary Benchmark', license_status: 'restricted', media_type: 'application/json' },
    { source_id: 's4', title: 'Unasserted License Corpus', license_status: 'unknown', media_type: 'image/png' },
    { source_id: 's5', title: 'Non-Commercial Only', license_status: 'rejected', media_type: 'audio/wav' },
  ];

  // 3.1: 'all' filter returns all candidates
  assert.equal(filterCandidatesByLicense(candidates, 'all').length, 5);
  assert.equal(filterCandidatesByLicense(candidates, '').length, 5);

  // 3.2: Filter by specific authoritative license statuses
  const approved = filterCandidatesByLicense(candidates, 'approved_for_intended_use');
  assert.equal(approved.length, 1);
  assert.equal(approved[0].source_id, 's1');

  const reviewReq = filterCandidatesByLicense(candidates, 'review_required');
  assert.equal(reviewReq.length, 1);
  assert.equal(reviewReq[0].source_id, 's2');

  const restricted = filterCandidatesByLicense(candidates, 'restricted');
  assert.equal(restricted.length, 1);
  assert.equal(restricted[0].source_id, 's3');

  const unknown = filterCandidatesByLicense(candidates, 'unknown');
  assert.equal(unknown.length, 1);
  assert.equal(unknown[0].source_id, 's4');

  const rejected = filterCandidatesByLicense(candidates, 'rejected');
  assert.equal(rejected.length, 1);
  assert.equal(rejected[0].source_id, 's5');

  // 3.3: Non-matching filter returns empty list
  assert.equal(filterCandidatesByLicense(candidates, 'nonexistent_status').length, 0);

  console.log('✓ Catalog license status filtering verified across all authoritative states');
}

// ============================================================================
// Test Suite 4: Truthful Progress Bar State Invariants
// ============================================================================
{
  console.log('Test 4: Truthful Progress Bar State Resolution');

  // 4.1: Inactive without completion or error must be hidden (not 100%)
  const inactiveState = resolveProgressDisplayState({
    active: false,
    backendPercent: null,
    completed: false,
    error: null,
  });
  assert.equal(inactiveState.kind, 'hidden');
  assert.equal(inactiveState.isComplete, false);
  assert.equal(inactiveState.clampedPercent, null);

  // 4.2: Active without backend percent -> indeterminate progress (must NOT fake a number)
  const indeterminate = resolveProgressDisplayState({
    active: true,
    backendPercent: null,
  });
  assert.equal(indeterminate.kind, 'active-indeterminate');
  assert.equal(indeterminate.isIndeterminate, true);
  assert.equal(indeterminate.clampedPercent, null, 'Must not invent fake percent');
  assert.equal(indeterminate.isComplete, false);

  // 4.3: Active with real backend percentage -> reported accurately
  const withPercent = resolveProgressDisplayState({
    active: true,
    backendPercent: 73.4,
  });
  assert.equal(withPercent.kind, 'active-percent');
  assert.equal(withPercent.isIndeterminate, false);
  assert.equal(withPercent.clampedPercent, 73.4);

  // 4.4: Out-of-bounds percentage clamped to [0, 100]
  const clampedLow = resolveProgressDisplayState({ active: true, backendPercent: -15 });
  assert.equal(clampedLow.clampedPercent, 0);

  const clampedHigh = resolveProgressDisplayState({ active: true, backendPercent: 120 });
  assert.equal(clampedHigh.clampedPercent, 100);

  // 4.5: Explicit completion -> 100% complete
  const completedState = resolveProgressDisplayState({
    active: false,
    completed: true,
  });
  assert.equal(completedState.kind, 'completed');
  assert.equal(completedState.isComplete, true);
  assert.equal(completedState.clampedPercent, 100);

  // 4.6: Explicit error -> error state (never marked complete)
  const errorState = resolveProgressDisplayState({
    active: false,
    error: 'Validation schema mismatch',
    completed: false,
  });
  assert.equal(errorState.kind, 'error');
  assert.equal(errorState.isError, true);
  assert.equal(errorState.isComplete, false, 'Failed task must never report completion');
  assert.equal(errorState.errorMessage, 'Validation schema mismatch');

  // 4.7: Error takes precedence even if completed was mistakenly passed
  const errorWithDone = resolveProgressDisplayState({
    active: false,
    error: 'Fatal backend crash',
    completed: true,
  });
  assert.equal(errorWithDone.kind, 'error');
  assert.equal(errorWithDone.isComplete, false);

  console.log('✓ Truthful Progress Bar invariants verified across 7 scenarios');
}

// ============================================================================
// Test Suite 5: Cluster Map Pan, Zoom & Transform Computation
// ============================================================================
{
  console.log('Test 5: Cluster Map Bounded Pan & Transform Calculation');

  // 5.1: At zoom 1.0 (baseline), pan is strictly clamped to (0, 0)
  const panAtZoom1 = clampClusterPan({ x: 150, y: -200 }, 1.0, 800, 600);
  assert.equal(panAtZoom1.x, 0, 'Pan X at zoom 1.0 must be 0');
  assert.equal(panAtZoom1.y, 0, 'Pan Y at zoom 1.0 must be 0');

  // 5.2: At zoom 2.0, maxPan is Math.round(180 * 1.0) = 180
  const withinBounds = clampClusterPan({ x: 100, y: -80 }, 2.0);
  assert.equal(withinBounds.x, 100);
  assert.equal(withinBounds.y, -80);

  const exceededBounds = clampClusterPan({ x: 300, y: -250 }, 2.0);
  assert.equal(exceededBounds.x, 180, 'Exceeded pan X must clamp to 180');
  assert.equal(exceededBounds.y, -180, 'Exceeded pan Y must clamp to -180');

  // 5.3: SVG transform calculation
  const transform1 = computeClusterTransform(1.0, { x: 0, y: 0 });
  assert.equal(transform1, 'translate(0px, 0px) scale(1)');

  const transform2 = computeClusterTransform(2.5, { x: 120, y: -80 });
  assert.equal(transform2, 'translate(120px, -80px) scale(2.5)');

  console.log('✓ Cluster Map zoom & pan bounding calculation verified');
}

// ============================================================================
// Test Suite 6: Rate Limiting Truthfulness & Policy Documentation
// ============================================================================
{
  console.log('Test 6: Rate Limiting Policy Truthfulness');

  // 6.1: Enforced policies must correspond to active backend rate limiters
  const enforced = RATE_LIMIT_POLICIES.filter((p) => p.isEnforced);
  assert.equal(enforced.length, 2, 'Exactly 2 enforced rate limits in routes');
  assert.ok(enforced.some((p) => p.name === 'Batch AI Inference' && p.tier === 'Active Enforced'));
  assert.ok(enforced.some((p) => p.name === 'Synthetic Sample Generation' && p.tier === 'Active Enforced'));

  // 6.2: API Ingestion is documented operational capacity, NOT an active sliding window
  const apiIngestion = RATE_LIMIT_POLICIES.find((p) => p.name === 'API Ingestion');
  assert.ok(apiIngestion, 'API Ingestion policy must exist');
  assert.equal(apiIngestion?.isEnforced, false);
  assert.equal(apiIngestion?.tier, 'Documented Operational Tier');
  assert.ok(apiIngestion?.source.includes('DESIGN.md'));

  console.log('✓ Rate limiting truthfulness verified (active routes vs documented operational tiers)');
}

console.log('--- ALL Phase R8 UI Integrity & Regression Unit Tests PASSED Successfully! ---');
