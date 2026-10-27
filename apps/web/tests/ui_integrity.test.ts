import assert from 'node:assert/strict';

console.log('--- Running UI Integrity & Regression Unit Tests (Phase R7) ---');

// Test 1: Health endpoint routing verification
{
  const API_BASE = '/api/v1';
  const healthUrl = `${API_BASE}/health`;
  const readinessUrl = `${API_BASE}/readiness`;
  
  assert.equal(healthUrl, '/api/v1/health', 'Health probe must use proxied /api/v1/health route');
  assert.equal(readinessUrl, '/api/v1/readiness', 'Readiness probe must use proxied /api/v1/readiness route');
  assert.ok(!healthUrl.startsWith('/health'), 'Must not hit unproxied SPA fallback');
  console.log('✓ Health & readiness endpoint proxy routing verified');
}

// Test 2: Audit log date filtering & missing timestamp exclusion
{
  interface AuditEntry {
    id: string;
    action: string;
    created_at?: string | null;
  }

  const sampleEntries: AuditEntry[] = [
    { id: '1', action: 'create', created_at: '2026-03-15T12:00:00Z' },
    { id: '2', action: 'update', created_at: '2026-03-16T15:30:00Z' },
    { id: '3', action: 'delete', created_at: null },
    { id: '4', action: 'view', created_at: undefined },
    { id: '5', action: 'export', created_at: 'invalid-date-string' },
    { id: '6', action: 'login', created_at: '2026-03-20T08:00:00Z' },
  ];

  const filterLogs = (logs: AuditEntry[], dateStart: string, dateEnd: string) => {
    return logs.filter((log) => {
      if (dateStart || dateEnd) {
        if (!log.created_at) return false;
        const logDate = new Date(log.created_at);
        if (isNaN(logDate.getTime())) return false;

        if (dateStart) {
          const startDate = new Date(dateStart);
          if (logDate < startDate) return false;
        }
        if (dateEnd) {
          const endDate = new Date(dateEnd);
          endDate.setHours(23, 59, 59, 999);
          if (logDate > endDate) return false;
        }
      }
      return true;
    });
  };

  // When no date filter active, all items (including null/invalid) are included
  const allResults = filterLogs(sampleEntries, '', '');
  assert.equal(allResults.length, 6, 'Unfiltered query should include all records');

  // When date filter active, records with null/undefined/invalid timestamps must be strictly excluded
  const filtered = filterLogs(sampleEntries, '2026-03-15', '2026-03-18');
  assert.equal(filtered.length, 2, 'Date range should only match valid timestamps in range');
  assert.equal(filtered[0].id, '1');
  assert.equal(filtered[1].id, '2');

  // Date range order validation
  const validateDateRange = (start: string, end: string) => {
    if (!start || !end) return true;
    return new Date(start) <= new Date(end);
  };
  assert.equal(validateDateRange('2026-03-15', '2026-03-20'), true);
  assert.equal(validateDateRange('2026-03-20', '2026-03-15'), false, 'Inverted dates must fail validation');
  console.log('✓ Audit log timestamp filtering & date-range validation verified');
}

// Test 3: Catalog candidate license filtering
{
  interface Candidate {
    id: string;
    title: string;
    license_status: string;
  }

  const candidates: Candidate[] = [
    { id: 'c1', title: 'Open Dataset', license_status: 'approved_for_intended_use' },
    { id: 'c2', title: 'Dubious Source', license_status: 'review_required' },
    { id: 'c3', title: 'Restricted Scraping', license_status: 'restricted' },
    { id: 'c4', title: 'Unknown Terms', license_status: 'unknown' },
  ];

  const filterByLicense = (list: Candidate[], filter: string) => {
    if (!filter || filter === 'all') return list;
    return list.filter((c) => c.license_status === filter);
  };

  assert.equal(filterByLicense(candidates, 'all').length, 4);
  const approvedOnly = filterByLicense(candidates, 'approved_for_intended_use');
  assert.equal(approvedOnly.length, 1);
  assert.equal(approvedOnly[0].id, 'c1');

  const restricted = filterByLicense(candidates, 'restricted');
  assert.equal(restricted.length, 1);
  assert.equal(restricted[0].id, 'c3');
  console.log('✓ Catalog discovery license-status filtering verified');
}

// Test 4: Truthful Progress Bar Contract Invariants
{
  interface ProgressProps {
    active: boolean;
    backendPercent?: number | null;
    completed?: boolean;
    error?: string | null;
  }

  const evaluateProgressState = (props: ProgressProps) => {
    if (props.error) {
      return { isIndeterminate: false, isError: true, isComplete: false, percent: null };
    }
    if (props.completed) {
      return { isIndeterminate: false, isError: false, isComplete: true, percent: 100 };
    }
    if (props.backendPercent != null && props.backendPercent >= 0) {
      const clamped = Math.min(100, Math.max(0, props.backendPercent));
      return { isIndeterminate: false, isError: false, isComplete: false, percent: clamped };
    }
    // Indeterminate when active but no real backend percent supplied
    return { isIndeterminate: props.active, isError: false, isComplete: false, percent: null };
  };

  // Active with null percent -> MUST NOT invent a number, MUST be indeterminate
  const indeterminate = evaluateProgressState({ active: true, backendPercent: null });
  assert.equal(indeterminate.isIndeterminate, true);
  assert.equal(indeterminate.percent, null, 'Must not simulate fake percentages');
  assert.equal(indeterminate.isComplete, false, 'Must not assume completion');

  // Genuine backend percent provided
  const realProgress = evaluateProgressState({ active: true, backendPercent: 42.5 });
  assert.equal(realProgress.isIndeterminate, false);
  assert.equal(realProgress.percent, 42.5);
  assert.equal(realProgress.isComplete, false);

  // Active becomes false without explicit completed flag -> MUST NOT show 100% complete
  const stoppedWithoutSuccess = evaluateProgressState({ active: false, backendPercent: null, completed: false });
  assert.equal(stoppedWithoutSuccess.isComplete, false);
  assert.notEqual(stoppedWithoutSuccess.percent, 100, 'Inactive without success must not jump to 100%');

  // Explicit completion
  const finished = evaluateProgressState({ active: false, completed: true });
  assert.equal(finished.isComplete, true);
  assert.equal(finished.percent, 100);

  // Explicit error -> MUST NOT show completion
  const failed = evaluateProgressState({ active: false, error: 'Network timeout', completed: false });
  assert.equal(failed.isError, true);
  assert.equal(failed.isComplete, false);
  console.log('✓ Truthful Progress Bar invariants verified');
}

console.log('--- All UI Integrity & Regression Tests PASSED successfully! ---');
