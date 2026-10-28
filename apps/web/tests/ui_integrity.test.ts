/**
 * Regression and Integrity Tests for Shared UI Logic & Component Contracts (Phase R8)
 *
 * Imports directly from production module: apps/web/src/utils/uiIntegrityContracts.ts
 * Tests fail if production implementation is broken or regressed.
 */
import assert from 'node:assert/strict';
import {
  parseHealthProbeResult,
  computeOverallSystemStatus,
  mapParsedProbeToServiceStatus,
  resolveServiceDisplaySeverity,
  getServiceDisplayBadgeClass,
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

  // 1.1: Healthy API response with status: "ok" (using typed options)
  const healthyJson = JSON.stringify({
    status: 'ok',
    service: 'dataset-platform-api',
    version: '0.1.0',
    environment: 'development',
    uptime_seconds: 3600,
  });
  const healthyResult = parseHealthProbeResult(
    200,
    'application/json; charset=utf-8',
    healthyJson,
    { probeType: 'health', latencyMs: 14 }
  );
  assert.equal(healthyResult.ok, true, '200 JSON with status:ok on /health must be healthy');
  assert.equal(healthyResult.healthy, true);
  assert.equal(healthyResult.statusText, 'ok');
  assert.equal(healthyResult.latencyMs, 14);
  assert.equal(healthyResult.httpStatus, 200);

  // 1.1b: Health response with status: "healthy" (accepted health status)
  const healthyAltResult = parseHealthProbeResult(
    200,
    'application/json',
    JSON.stringify({ status: 'healthy' }),
    { probeType: 'health', latencyMs: 10 }
  );
  assert.equal(healthyAltResult.ok, true);
  assert.equal(healthyAltResult.healthy, true);
  assert.equal(healthyAltResult.statusText, 'healthy');

  // 1.2: Successful readiness response with status: "ready", database connected, and storage accessible
  const readyJson = JSON.stringify({
    status: 'ready',
    database: 'connected',
    storage: 'accessible',
  });
  const readyResult = parseHealthProbeResult(
    200,
    'application/json; charset=utf-8',
    readyJson,
    { probeType: 'readiness', latencyMs: 18 }
  );
  assert.equal(readyResult.ok, true, 'readiness response with status:ready must be healthy');
  assert.equal(readyResult.healthy, true);
  assert.equal(readyResult.statusText, 'ready');
  assert.equal(readyResult.httpStatus, 200);
  assert.equal(readyResult.latencyMs, 18);
  assert.equal(readyResult.data.database, 'connected');
  assert.equal(readyResult.data.storage, 'accessible');

  // 1.2b: Readiness response with status: "ok" (standard alternate readiness driver)
  const readyAltResult = parseHealthProbeResult(
    200,
    'application/json',
    JSON.stringify({ status: 'ok', database: 'connected', storage: 'accessible' }),
    'readiness'
  );
  assert.equal(readyAltResult.ok, true);
  assert.equal(readyAltResult.healthy, true);

  // 1.3: HTTP 503 with status: "degraded"
  const degraded503Json = JSON.stringify({
    status: 'degraded',
    database: 'unhealthy: connection timeout',
    storage: 'accessible',
  });
  const degradedResult = parseHealthProbeResult(
    503,
    'application/json',
    degraded503Json,
    { probeType: 'readiness', latencyMs: 45 }
  );
  assert.equal(degradedResult.ok, false, 'HTTP 503 must not be marked healthy');
  assert.equal(degradedResult.healthy, false);
  assert.equal(degradedResult.httpStatus, 503);
  assert.equal(degradedResult.statusText, 'degraded');
  assert.ok(degradedResult.error?.includes('503'));

  // 1.4: HTTP 200 with an unexpected or degraded status
  // 1.4a: Unexpected status on /health (e.g., 'maintenance' or 'ready' on health endpoint)
  const unexpectedHealth = parseHealthProbeResult(
    200,
    'application/json',
    JSON.stringify({ status: 'maintenance' }),
    { probeType: 'health', latencyMs: 10 }
  );
  assert.equal(unexpectedHealth.ok, false, 'Unexpected status on health must fail');
  assert.equal(unexpectedHealth.healthy, false);
  assert.equal(unexpectedHealth.statusText, 'maintenance');

  const readyOnHealthEndpoint = parseHealthProbeResult(
    200,
    'application/json',
    JSON.stringify({ status: 'ready' }),
    { probeType: 'health' }
  );
  assert.equal(readyOnHealthEndpoint.ok, false, 'status:ready on /health is unexpected');

  // 1.4b: HTTP 200 on /readiness with status: 'degraded'
  const degraded200 = parseHealthProbeResult(
    200,
    'application/json',
    JSON.stringify({ status: 'degraded', database: 'connected' }),
    { probeType: 'readiness', latencyMs: 12 }
  );
  assert.equal(degraded200.ok, false, 'status: degraded on 200 must fail');
  assert.equal(degraded200.healthy, false);
  assert.equal(degraded200.statusText, 'degraded');

  // 1.4c: HTTP 200 on /readiness with failed database dependency flag
  const failedDbReadiness = parseHealthProbeResult(
    200,
    'application/json',
    JSON.stringify({ status: 'ready', database: 'failed', storage: 'accessible' }),
    { probeType: 'readiness', latencyMs: 15 }
  );
  assert.equal(failedDbReadiness.ok, false, 'Readiness with database:failed must fail');
  assert.equal(failedDbReadiness.healthy, false);
  assert.ok(failedDbReadiness.error?.includes('dependency check failed'));

  // 1.4d: HTTP 200 on /readiness with failed storage dependency flag
  const failedStorageReadiness = parseHealthProbeResult(
    200,
    'application/json',
    JSON.stringify({ status: 'ready', database: 'connected', storage: 'failed' }),
    { probeType: 'readiness' }
  );
  assert.equal(failedStorageReadiness.ok, false, 'Readiness with storage:failed must fail');
  assert.equal(failedStorageReadiness.healthy, false);

  // 1.5: Malformed JSON, HTML SPA fallback, and network failure
  // 1.5a: Malformed JSON
  const malformedResult = parseHealthProbeResult(
    200,
    'application/json',
    'Not Valid JSON{',
    { latencyMs: 18 }
  );
  assert.equal(malformedResult.ok, false);
  assert.equal(malformedResult.healthy, false);
  assert.equal(malformedResult.statusText, 'malformed_json');
  assert.ok(malformedResult.error?.includes('Non-JSON response'));

  // 1.5b: HTML SPA fallback
  const spaFallbackHtml = '<!doctype html><html><head><title>Vite App</title></head><body><div id="root"></div></body></html>';
  const htmlFallbackResult = parseHealthProbeResult(
    200,
    'text/html; charset=utf-8',
    spaFallbackHtml,
    { latencyMs: 22 }
  );
  assert.equal(htmlFallbackResult.ok, false);
  assert.equal(htmlFallbackResult.healthy, false);
  assert.equal(htmlFallbackResult.isHtmlFallback, true);
  assert.equal(htmlFallbackResult.statusText, 'route_fallback_error');
  assert.ok(htmlFallbackResult.error?.includes('HTML SPA fallback'));

  // 1.5c: Network failure
  const networkFailure = parseHealthProbeResult(
    null,
    null,
    null,
    { networkError: 'Connection refused at 127.0.0.1:8000' }
  );
  assert.equal(networkFailure.ok, false);
  assert.equal(networkFailure.healthy, false);
  assert.equal(networkFailure.statusText, 'network_failure');
  assert.equal(networkFailure.httpStatus, null);
  assert.equal(networkFailure.latencyMs, null);
  assert.equal(networkFailure.error, 'Connection refused at 127.0.0.1:8000');

  // 1.6: Correct mapping from parser results to displayed overall system states
  // Operational combinations (all accepted successes)
  assert.equal(computeOverallSystemStatus('ok', 'ready'), 'operational', 'ok + ready must map to operational');
  assert.equal(computeOverallSystemStatus('healthy', 'ready'), 'operational', 'healthy + ready must map to operational');
  assert.equal(computeOverallSystemStatus('ok', 'ok'), 'operational', 'ok + ok must map to operational');
  assert.equal(computeOverallSystemStatus('healthy', 'ok'), 'operational', 'healthy + ok must map to operational');

  // Degraded combinations
  assert.equal(computeOverallSystemStatus('ok', 'degraded'), 'degraded', 'ok + degraded must map to degraded');
  assert.equal(computeOverallSystemStatus('healthy', 'degraded'), 'degraded', 'healthy + degraded must map to degraded');
  assert.equal(computeOverallSystemStatus('degraded', 'ready'), 'degraded', 'degraded + ready must map to degraded');
  assert.equal(computeOverallSystemStatus('degraded', 'ok'), 'degraded', 'degraded + ok must map to degraded');
  assert.equal(computeOverallSystemStatus('degraded', 'degraded'), 'degraded', 'degraded + degraded must map to degraded');
  assert.equal(computeOverallSystemStatus('ok', 'maintenance'), 'degraded', 'unexpected readiness status maps to degraded');
  assert.equal(computeOverallSystemStatus('warning', 'ready'), 'degraded', 'warning health status maps to degraded');

  // Unreachable combinations
  assert.equal(computeOverallSystemStatus('ok', 'unreachable'), 'unreachable', 'ok + unreachable must map to unreachable');
  assert.equal(computeOverallSystemStatus('unreachable', 'ready'), 'unreachable', 'unreachable + ready must map to unreachable');
  assert.equal(computeOverallSystemStatus('unreachable', 'unreachable'), 'unreachable', 'unreachable + unreachable must map to unreachable');
  assert.equal(computeOverallSystemStatus(null, 'ready'), 'unreachable', 'null health status must map to unreachable');
  assert.equal(computeOverallSystemStatus('ok', null), 'unreachable', 'null readiness status must map to unreachable');
  assert.equal(computeOverallSystemStatus(null, null), 'unreachable', 'missing statuses must map to unreachable');
  // 1.7: End-to-End Integration Contract: mapParsedProbeToServiceStatus + computeOverallSystemStatus
  // 1.7.1: Health 'ok' and readiness 'ready' produce 'operational'
  const hOperational = mapParsedProbeToServiceStatus(
    parseHealthProbeResult(200, 'application/json', JSON.stringify({ status: 'ok', service: 'api' }), { probeType: 'health' })
  );
  const rOperational = mapParsedProbeToServiceStatus(
    parseHealthProbeResult(200, 'application/json', JSON.stringify({ status: 'ready', database: 'connected' }), { probeType: 'readiness' })
  );
  assert.equal(hOperational.displayStatus, 'operational');
  assert.equal(hOperational.status, 'ok');
  assert.equal(rOperational.displayStatus, 'operational');
  assert.equal(rOperational.status, 'ready');
  assert.equal(computeOverallSystemStatus(hOperational.status, rOperational.status), 'operational');

  // 1.7.2: A valid HTTP 200 JSON response with health status 'maintenance' produces 'degraded'
  const hMaintenance = mapParsedProbeToServiceStatus(
    parseHealthProbeResult(200, 'application/json', JSON.stringify({ status: 'maintenance', service: 'api' }), { probeType: 'health' })
  );
  assert.equal(hMaintenance.displayStatus, 'degraded');
  assert.equal(hMaintenance.status, 'maintenance');
  assert.equal(hMaintenance.isDegraded, true);
  assert.equal(hMaintenance.isUnreachable, false);
  assert.equal(computeOverallSystemStatus(hMaintenance.status, rOperational.status), 'degraded');

  // 1.7.3: A valid HTTP 200 JSON response with readiness status 'warning' produces 'degraded'
  const rWarning = mapParsedProbeToServiceStatus(
    parseHealthProbeResult(200, 'application/json', JSON.stringify({ status: 'warning', database: 'connected' }), { probeType: 'readiness' })
  );
  assert.equal(rWarning.displayStatus, 'degraded');
  assert.equal(rWarning.status, 'warning');
  assert.equal(rWarning.isDegraded, true);
  assert.equal(rWarning.isUnreachable, false);
  assert.equal(computeOverallSystemStatus(hOperational.status, rWarning.status), 'degraded');

  // 1.7.4: A valid 'degraded' response remains degraded
  const rDegraded200 = mapParsedProbeToServiceStatus(
    parseHealthProbeResult(200, 'application/json', JSON.stringify({ status: 'degraded', database: 'connected' }), { probeType: 'readiness' })
  );
  assert.equal(rDegraded200.displayStatus, 'degraded');
  assert.equal(rDegraded200.status, 'degraded');
  assert.equal(computeOverallSystemStatus(hOperational.status, rDegraded200.status), 'degraded');

  // Also readiness 200 with failed dependency flag
  const rFailedDep = mapParsedProbeToServiceStatus(
    parseHealthProbeResult(200, 'application/json', JSON.stringify({ status: 'ready', database: 'failed' }), { probeType: 'readiness' })
  );
  assert.equal(rFailedDep.displayStatus, 'degraded');
  assert.equal(rFailedDep.status, 'degraded');
  assert.equal(computeOverallSystemStatus(hOperational.status, rFailedDep.status), 'degraded');

  // 1.7.5: HTTP 503 readiness remains degraded
  const rDegraded503 = mapParsedProbeToServiceStatus(
    parseHealthProbeResult(503, 'application/json', JSON.stringify({ status: 'degraded', database: 'timeout' }), { probeType: 'readiness' })
  );
  assert.equal(rDegraded503.displayStatus, 'degraded');
  assert.equal(rDegraded503.status, 'degraded');
  assert.equal(rDegraded503.httpStatus, 503);
  assert.equal(computeOverallSystemStatus(hOperational.status, rDegraded503.status), 'degraded');

  // 1.7.6: Network failure, HTML SPA fallback, and malformed JSON remain unreachable
  const netUnreachable = mapParsedProbeToServiceStatus(
    parseHealthProbeResult(null, null, null, { networkError: 'Connection refused' })
  );
  assert.equal(netUnreachable.displayStatus, 'unreachable');
  assert.equal(netUnreachable.status, 'unreachable');
  assert.equal(netUnreachable.isUnreachable, true);
  assert.equal(computeOverallSystemStatus(netUnreachable.status, rOperational.status), 'unreachable');

  const htmlUnreachable = mapParsedProbeToServiceStatus(
    parseHealthProbeResult(200, 'text/html', '<!doctype html><html>SPA</html>')
  );
  assert.equal(htmlUnreachable.displayStatus, 'unreachable');
  assert.equal(htmlUnreachable.status, 'unreachable');
  assert.equal(htmlUnreachable.isUnreachable, true);
  assert.equal(computeOverallSystemStatus(hOperational.status, htmlUnreachable.status), 'unreachable');

  const malformedUnreachable = mapParsedProbeToServiceStatus(
    parseHealthProbeResult(200, 'application/json', 'Not JSON{')
  );
  assert.equal(malformedUnreachable.displayStatus, 'unreachable');
  assert.equal(malformedUnreachable.status, 'unreachable');
  assert.equal(malformedUnreachable.isUnreachable, true);
  assert.equal(computeOverallSystemStatus(malformedUnreachable.status, rOperational.status), 'unreachable');

  // 1.8: Card Badge Severity Classification & Overall System Consistency Contract
  // 1.8.1: Operational statuses resolve to 'operational' severity and 'badge-emerald'
  assert.equal(resolveServiceDisplaySeverity('ok', 'health'), 'operational');
  assert.equal(resolveServiceDisplaySeverity('healthy', 'health'), 'operational');
  assert.equal(resolveServiceDisplaySeverity('ready', 'readiness'), 'operational');
  assert.equal(resolveServiceDisplaySeverity('ok', 'readiness'), 'operational');
  assert.equal(getServiceDisplayBadgeClass('ok', 'health'), 'badge-emerald');
  assert.equal(getServiceDisplayBadgeClass('healthy', 'health'), 'badge-emerald');
  assert.equal(getServiceDisplayBadgeClass('ready', 'readiness'), 'badge-emerald');
  assert.equal(getServiceDisplayBadgeClass('operational'), 'badge-emerald');

  // 1.8.2: Reachable non-operational statuses (degraded, maintenance, warning, read_only) resolve to 'degraded' and 'badge-amber'
  assert.equal(resolveServiceDisplaySeverity('degraded'), 'degraded');
  assert.equal(resolveServiceDisplaySeverity('maintenance'), 'degraded');
  assert.equal(resolveServiceDisplaySeverity('warning'), 'degraded');
  assert.equal(resolveServiceDisplaySeverity('read_only'), 'degraded');
  assert.equal(getServiceDisplayBadgeClass('degraded'), 'badge-amber');
  assert.equal(getServiceDisplayBadgeClass('maintenance'), 'badge-amber');
  assert.equal(getServiceDisplayBadgeClass('warning'), 'badge-amber');
  assert.equal(getServiceDisplayBadgeClass('read_only'), 'badge-amber');

  // 1.8.3: Unreachable, network errors, HTML fallbacks, malformed JSON, and missing statuses resolve to 'unreachable' and 'badge-rose'
  assert.equal(resolveServiceDisplaySeverity('unreachable'), 'unreachable');
  assert.equal(resolveServiceDisplaySeverity(null), 'unreachable');
  assert.equal(resolveServiceDisplaySeverity(undefined), 'unreachable');
  assert.equal(getServiceDisplayBadgeClass('unreachable'), 'badge-rose');
  assert.equal(getServiceDisplayBadgeClass(null), 'badge-rose');
  assert.equal(getServiceDisplayBadgeClass(undefined), 'badge-rose');

  // 1.8.4: Read-only probe test: raw status remains intact and displayStatus is 'degraded'
  const hReadOnly = mapParsedProbeToServiceStatus(
    parseHealthProbeResult(200, 'application/json', JSON.stringify({ status: 'read_only', service: 'api' }), { probeType: 'health' })
  );
  assert.equal(hReadOnly.displayStatus, 'degraded');
  assert.equal(hReadOnly.status, 'read_only');
  assert.equal((hReadOnly.data as any).status, 'read_only');
  assert.equal((hReadOnly.data as any).displayStatus, 'degraded');
  assert.equal(getServiceDisplayBadgeClass(hReadOnly.displayStatus), 'badge-amber');
  assert.equal(getServiceDisplayBadgeClass((hReadOnly.data as any).displayStatus), 'badge-amber');

  // 1.8.5: Verification that data carries displayStatus across all probe results
  assert.equal((hOperational.data as any).displayStatus, 'operational');
  assert.equal((hOperational.data as any).status, 'ok');
  assert.equal((rOperational.data as any).displayStatus, 'operational');
  assert.equal((rOperational.data as any).status, 'ready');
  assert.equal((hMaintenance.data as any).displayStatus, 'degraded');
  assert.equal((hMaintenance.data as any).status, 'maintenance');
  assert.equal((rWarning.data as any).displayStatus, 'degraded');
  assert.equal((rWarning.data as any).status, 'warning');
  assert.equal((netUnreachable.data as any).displayStatus, 'unreachable');
  assert.equal((htmlUnreachable.data as any).displayStatus, 'unreachable');
  assert.equal((malformedUnreachable.data as any).displayStatus, 'unreachable');

  // 1.8.6: Individual card severity does not contradict overall system severity
  // Scenario A: Both operational -> Card 1 emerald, Card 2 emerald -> Overall system emerald
  assert.equal(getServiceDisplayBadgeClass(hOperational.displayStatus), 'badge-emerald');
  assert.equal(getServiceDisplayBadgeClass(rOperational.displayStatus), 'badge-emerald');
  assert.equal(getServiceDisplayBadgeClass(computeOverallSystemStatus(hOperational.status, rOperational.status)), 'badge-emerald');

  // Scenario B: Health maintenance (amber) + Readiness ready (emerald) -> Overall system amber
  assert.equal(getServiceDisplayBadgeClass(hMaintenance.displayStatus), 'badge-amber');
  assert.equal(getServiceDisplayBadgeClass(rOperational.displayStatus), 'badge-emerald');
  assert.equal(getServiceDisplayBadgeClass(computeOverallSystemStatus(hMaintenance.status, rOperational.status)), 'badge-amber');

  // Scenario C: Health ok (emerald) + Readiness warning (amber) -> Overall system amber
  assert.equal(getServiceDisplayBadgeClass(hOperational.displayStatus), 'badge-emerald');
  assert.equal(getServiceDisplayBadgeClass(rWarning.displayStatus), 'badge-amber');
  assert.equal(getServiceDisplayBadgeClass(computeOverallSystemStatus(hOperational.status, rWarning.status)), 'badge-amber');

  // Scenario D: Health read_only (amber) + Readiness degraded (amber) -> Overall system amber
  assert.equal(getServiceDisplayBadgeClass(hReadOnly.displayStatus), 'badge-amber');
  assert.equal(getServiceDisplayBadgeClass(rDegraded200.displayStatus), 'badge-amber');
  assert.equal(getServiceDisplayBadgeClass(computeOverallSystemStatus(hReadOnly.status, rDegraded200.status)), 'badge-amber');

  // Scenario E: Health ok (emerald) + Readiness unreachable (rose) -> Overall system rose
  assert.equal(getServiceDisplayBadgeClass(hOperational.displayStatus), 'badge-emerald');
  assert.equal(getServiceDisplayBadgeClass(netUnreachable.displayStatus), 'badge-rose');
  assert.equal(getServiceDisplayBadgeClass(computeOverallSystemStatus(hOperational.status, netUnreachable.status)), 'badge-rose');

  // Invariants:
  // - A degraded service card (amber) can never yield an overall operational system (emerald)
  assert.notEqual(getServiceDisplayBadgeClass(computeOverallSystemStatus(hMaintenance.status, rOperational.status)), 'badge-emerald');
  assert.notEqual(getServiceDisplayBadgeClass(computeOverallSystemStatus(hOperational.status, rWarning.status)), 'badge-emerald');
  assert.notEqual(getServiceDisplayBadgeClass(computeOverallSystemStatus(hReadOnly.status, rOperational.status)), 'badge-emerald');
  // - A reachable degraded service card (amber) is never styled as unreachable (rose)
  assert.notEqual(getServiceDisplayBadgeClass(hMaintenance.displayStatus), 'badge-rose');
  assert.notEqual(getServiceDisplayBadgeClass(rWarning.displayStatus), 'badge-rose');
  assert.notEqual(getServiceDisplayBadgeClass(hReadOnly.displayStatus), 'badge-rose');

  console.log('✓ Health & readiness endpoint handling verified across all production scenarios');
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

  // 5.1: Zoom levels from 1.0x to 2.5x: At zoom 1.0 (baseline), pan is strictly clamped to (0, 0)
  const panAtZoom1 = clampClusterPan({ x: 150, y: -200 }, 1.0, 800, 600);
  assert.equal(panAtZoom1.x, 0, 'Pan X at zoom 1.0 must be 0');
  assert.equal(panAtZoom1.y, 0, 'Pan Y at zoom 1.0 must be 0');

  // 5.2: At zoom 2.0, maxPan is Math.round(180 * (2.0 - 1.0)) = 180
  const withinBounds = clampClusterPan({ x: 100, y: -80 }, 2.0);
  assert.equal(withinBounds.x, 100);
  assert.equal(withinBounds.y, -80);

  const exceededBounds = clampClusterPan({ x: 300, y: -250 }, 2.0);
  assert.equal(exceededBounds.x, 180, 'Exceeded pan X must clamp to 180');
  assert.equal(exceededBounds.y, -180, 'Exceeded pan Y must clamp to -180');

  // 5.3: At zoom 2.5 (maximum zoom), maxPan is Math.round(180 * (2.5 - 1.0)) = 270
  const maxZoomClamped = clampClusterPan({ x: 350, y: -400 }, 2.5);
  assert.equal(maxZoomClamped.x, 270);
  assert.equal(maxZoomClamped.y, -270);

  // 5.4: Arrow keys step navigation within bounds
  const step = 20;
  const initialPan = { x: 0, y: 0 };
  const pannedRight = clampClusterPan(initialPan.x - step, initialPan.y, 2.0);
  assert.equal(pannedRight.x, -20);
  const pannedUp = clampClusterPan(initialPan.x, initialPan.y + step, 2.0);
  assert.equal(pannedUp.y, 20);

  // 5.5: Reset restores baseline zoom 1.0 and pan (0, 0)
  const resetPan = clampClusterPan({ x: 180, y: -180 }, 1.0);
  assert.equal(resetPan.x, 0);
  assert.equal(resetPan.y, 0);

  // 5.6: Valid SVG transform syntax & Mathematical Centering around (250, 250)
  // Baseline zoom 1.0, pan (0, 0) -> translate(0, 0) scale(1)
  const transformBaseline = computeClusterTransform(1.0, { x: 0, y: 0 });
  assert.equal(transformBaseline, 'translate(0, 0) scale(1)');

  // Zoom 2.0, pan (0, 0) -> tx = 0 + 250 * (1 - 2) = -250, ty = -250
  const transformZoom2 = computeClusterTransform(2.0, { x: 0, y: 0 });
  assert.equal(transformZoom2, 'translate(-250, -250) scale(2)');

  // Zoom 2.5, pan (120, -80) -> tx = 120 + 250 * (1 - 2.5) = 120 - 375 = -255, ty = -80 - 375 = -455
  const transformZoom25 = computeClusterTransform(2.5, { x: 120, y: -80 });
  assert.equal(transformZoom25, 'translate(-255, -455) scale(2.5)');

  // Strict check: valid SVG presentation attribute format, NO CSS 'px' units allowed
  assert.ok(!transformBaseline.includes('px'), 'SVG transform attribute must not contain "px" units');
  assert.ok(!transformZoom2.includes('px'), 'SVG transform attribute must not contain "px" units');
  assert.ok(!transformZoom25.includes('px'), 'SVG transform attribute must not contain "px" units');
  assert.ok(
    /^translate\(-?\d+(\.\d+)?, -?\d+(\.\d+)?\) scale\(-?\d+(\.\d+)?\)$/.test(transformZoom25),
    'Transform string must adhere strictly to SVG transform presentation grammar'
  );

  // 5.7: Mathematical projection invariant:
  // Center point (250, 250) mapped under zoom 2.0:
  // x' = zoom * x + tx = 2.0 * 250 + (-250) = 500 - 250 = 250
  // y' = zoom * y + ty = 2.0 * 250 + (-250) = 500 - 250 = 250
  const cx = 250;
  const cy = 250;
  const zoomFactor = 2.0;
  const tx = 0 + cx * (1 - zoomFactor);
  const ty = 0 + cy * (1 - zoomFactor);
  const mappedCx = zoomFactor * cx + tx;
  const mappedCy = zoomFactor * cy + ty;
  assert.equal(mappedCx, cx, 'Center point X must remain invariant under centered zoom');
  assert.equal(mappedCy, cy, 'Center point Y must remain invariant under centered zoom');

  console.log('✓ Cluster Map zoom (1.0x-2.5x), bounded pan, and unitless SVG transform verified');
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
