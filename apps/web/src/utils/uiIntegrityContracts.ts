/**
 * UI Integrity Contracts & Shared Pure Production Logic (Phase R8)
 * 
 * Centralizes pure business rules, validation, and transformation logic
 * shared between frontend components (SystemHealth, Governance, ClusterMap,
 * Progress, SourceDiscovery) and unit test runners.
 */

export interface AuditLogItem {
  id: string;
  action: string;
  user_id?: string;
  actor_id?: string;
  resource_type?: string;
  resource_id?: string;
  details?: Record<string, any> | string | null;
  created_at?: string | null;
}

export type AuditLogRecord = AuditLogItem;

export interface CandidateSource {
  source_id: string;
  title?: string;
  license_status: string;
  media_type?: string;
  [key: string]: any;
}

export interface HealthProbeResult {
  ok: boolean;
  healthy: boolean;
  status: number | null;
  httpStatus: number | null;
  statusText: string;
  latencyMs: number | null;
  data?: any;
  error?: string;
  isHtmlFallback?: boolean;
}

/**
 * Validates and parses health and readiness probe responses, guarding against
 * unproxied Nginx HTML SPA fallback responses and HTTP degradation.
 */
export function parseHealthProbeResult(
  status: number | null,
  param2?: string | null,
  param3?: string | null,
  networkError?: string | null,
  latencyMs?: number | null
): HealthProbeResult {
  if (networkError || status === null) {
    return {
      ok: false,
      healthy: false,
      status: null,
      httpStatus: null,
      statusText: 'network_failure',
      latencyMs: latencyMs ?? null,
      error: networkError || 'Network request failed',
    };
  }

  let contentType = (param2 || '').toLowerCase();
  let bodyText = (param3 || '').trim();

  // If arguments were swapped (bodyText passed as param2 and contentType as param3)
  if (contentType.startsWith('<!doctype') || contentType.startsWith('<html') || contentType.startsWith('{')) {
    const swap = bodyText;
    bodyText = (param2 || '').trim();
    contentType = (swap || '').toLowerCase();
  }

  const isHtml =
    contentType.includes('text/html') ||
    bodyText.startsWith('<!doctype') ||
    bodyText.startsWith('<html');

  if (isHtml) {
    return {
      ok: false,
      healthy: false,
      status,
      httpStatus: status,
      statusText: 'route_fallback_error',
      latencyMs: latencyMs ?? null,
      isHtmlFallback: true,
      error: 'Received HTML SPA fallback page instead of valid API JSON. Verify reverse proxy route.',
    };
  }

  if (status < 200 || status >= 300) {
    let errorMsg = `Probe returned HTTP ${status}`;
    let parsedStatusText = status === 503 ? 'degraded' : 'unreachable';
    try {
      const errData = JSON.parse(bodyText);
      if (errData && typeof errData === 'object') {
        if (errData.status) parsedStatusText = errData.status;
        if (errData.error || errData.detail) errorMsg = errData.error || errData.detail;
      }
    } catch {
      // not json
    }
    return {
      ok: false,
      healthy: false,
      status,
      httpStatus: status,
      statusText: parsedStatusText,
      latencyMs: latencyMs ?? null,
      error: errorMsg,
    };
  }

  try {
    const data = JSON.parse(bodyText);
    if (!data || typeof data !== 'object') {
      return {
        ok: false,
        healthy: false,
        status,
        httpStatus: status,
        statusText: 'malformed_payload',
        latencyMs: latencyMs ?? null,
        error: 'JSON payload is not an object',
      };
    }
    const isHealthy = data.status === 'ok' || data.status === 'healthy';
    return {
      ok: isHealthy,
      healthy: isHealthy,
      status,
      httpStatus: status,
      statusText: data.status || 'unknown',
      latencyMs: latencyMs ?? null,
      data,
      error: isHealthy ? undefined : `Service reported non-healthy status: ${data.status}`,
    };
  } catch (err: any) {
    return {
      ok: false,
      healthy: false,
      status,
      httpStatus: status,
      statusText: 'malformed_json',
      latencyMs: latencyMs ?? null,
      error: `Non-JSON response: ${err?.message || 'Parse error'}`,
    };
  }
}

/**
 * Validates whether start date is chronologically before or equal to end date.
 */
export const isDateRangeValid = (startDate?: string, endDate?: string): boolean => {
  if (!startDate || !endDate) return true;
  return new Date(startDate) <= new Date(endDate);
};

export interface AuditFilterOptions {
  searchQuery?: string;
  startDate?: string;
  endDate?: string;
}

/**
 * Filters audit logs client-side over loaded event history.
 * Excludes records with missing or invalid timestamps whenever date filters are active.
 */
export const filterAuditLogs = <T extends AuditLogItem>(
  logs: T[],
  optionsOrQuery: AuditFilterOptions | string = {},
  startDateParam?: string,
  endDateParam?: string
): T[] => {
  let query = '';
  let startDate = '';
  let endDate = '';

  if (typeof optionsOrQuery === 'object') {
    query = optionsOrQuery.searchQuery || '';
    startDate = optionsOrQuery.startDate || '';
    endDate = optionsOrQuery.endDate || '';
  } else {
    query = optionsOrQuery || '';
    startDate = startDateParam || '';
    endDate = endDateParam || '';
  }

  if (startDate && endDate && startDate > endDate) {
    return [];
  }

  const normalizedQuery = query.trim().toLowerCase();

  return logs.filter((log) => {
    // 1. Keyword search across actor, action, resource, details
    if (normalizedQuery) {
      const matchActor =
        log.user_id?.toLowerCase().includes(normalizedQuery) ||
        log.actor_id?.toLowerCase().includes(normalizedQuery);
      const matchAction = log.action?.toLowerCase().includes(normalizedQuery);
      const matchResource =
        log.resource_type?.toLowerCase().includes(normalizedQuery) ||
        log.resource_id?.toLowerCase().includes(normalizedQuery);
      const matchDetails =
        log.details &&
        (typeof log.details === 'string'
          ? log.details.toLowerCase().includes(normalizedQuery)
          : JSON.stringify(log.details).toLowerCase().includes(normalizedQuery));

      if (!matchActor && !matchAction && !matchResource && !matchDetails) {
        return false;
      }
    }

    // 2. Date range filtering with strict timestamp integrity
    if (startDate || endDate) {
      if (!log.created_at) {
        return false;
      }
      const logDate = new Date(log.created_at);
      if (isNaN(logDate.getTime())) {
        return false;
      }

      if (startDate) {
        const start = new Date(startDate.includes('T') ? startDate : `${startDate}T00:00:00.000Z`);
        if (logDate < start) return false;
      }
      if (endDate) {
        const end = new Date(endDate.includes('T') ? endDate : `${endDate}T23:59:59.999Z`);
        if (logDate > end) return false;
      }
    }

    return true;
  });
};

/**
 * Filters catalog candidates by explicit license status.
 */
export const filterCandidatesByLicense = <T extends { license_status: string }>(
  candidates: T[],
  licenseFilter: string
): T[] => {
  if (!licenseFilter || licenseFilter === 'all') {
    return candidates;
  }
  return candidates.filter((c) => c.license_status === licenseFilter);
};

export interface ProgressStateResult {
  kind: 'hidden' | 'active-indeterminate' | 'active-percent' | 'completed' | 'error';
  show: boolean;
  isIndeterminate: boolean;
  isComplete: boolean;
  isCompleted: boolean;
  isError: boolean;
  percent: number | null;
  clampedPercent: number | null;
  errorMessage?: string;
}

/**
 * Evaluates the truthful display state of the progress component.
 * Ensures simulated progress percentages are never displayed without real backend metrics,
 * and completion is signaled only upon genuine success.
 */
export const resolveProgressDisplayState = (props: {
  active: boolean;
  backendPercent?: number | null;
  completed?: boolean;
  error?: string | null;
}): ProgressStateResult => {
  const { active, backendPercent, completed = false, error = null } = props;

  if (error) {
    return {
      kind: 'error',
      show: true,
      isIndeterminate: false,
      isComplete: false,
      isCompleted: false,
      isError: true,
      percent: null,
      clampedPercent: null,
      errorMessage: error,
    };
  }

  if (completed) {
    return {
      kind: 'completed',
      show: true,
      isIndeterminate: false,
      isComplete: true,
      isCompleted: true,
      isError: false,
      percent: 100,
      clampedPercent: 100,
    };
  }

  if (!active) {
    return {
      kind: 'hidden',
      show: false,
      isIndeterminate: false,
      isComplete: false,
      isCompleted: false,
      isError: false,
      percent: null,
      clampedPercent: null,
    };
  }

  if (typeof backendPercent === 'number' && !isNaN(backendPercent)) {
    const clamped = Math.min(100, Math.max(0, backendPercent));
    return {
      kind: 'active-percent',
      show: true,
      isIndeterminate: false,
      isComplete: false,
      isCompleted: false,
      isError: false,
      percent: clamped,
      clampedPercent: clamped,
    };
  }

  return {
    kind: 'active-indeterminate',
    show: true,
    isIndeterminate: true,
    isComplete: false,
    isCompleted: false,
    isError: false,
    percent: null,
    clampedPercent: null,
  };
};

/**
 * Bounded pan and zoom math for Cluster Map SVG projection.
 * Prevents panning off-canvas and preserves view bounds.
 */
export function clampClusterPan(
  xOrPan: number | { x: number; y: number },
  yOrZoom: number,
  zoomOrWidth?: number
): { x: number; y: number } {
  let x: number;
  let y: number;
  let currentZoom: number;

  if (typeof xOrPan === 'object') {
    x = xOrPan.x;
    y = xOrPan.y;
    currentZoom = yOrZoom;
  } else {
    x = xOrPan;
    y = yOrZoom;
    currentZoom = zoomOrWidth ?? 1.0;
  }

  if (currentZoom <= 1.0) {
    return { x: 0, y: 0 };
  }
  const maxPan = Math.round(180 * (currentZoom - 1.0));
  return {
    x: Math.max(-maxPan, Math.min(maxPan, x)),
    y: Math.max(-maxPan, Math.min(maxPan, y)),
  };
}

/**
 * Computes SVG CSS transform style for cluster map.
 */
export const computeClusterTransform = (
  zoom: number,
  pan: { x: number; y: number }
): string => {
  return `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`;
};

export interface RateLimitPolicy {
  name: string;
  limit: string;
  tier: string;
  source: string;
  isEnforced: boolean;
}

/**
 * Truthful rate limit specification categorization.
 */
export const RATE_LIMIT_POLICIES: RateLimitPolicy[] = [
  {
    name: 'Batch AI Inference',
    limit: '30 requests / 60s window',
    tier: 'Active Enforced',
    source: 'services/api/routes/inference.py (global_rate_limiter)',
    isEnforced: true,
  },
  {
    name: 'Synthetic Sample Generation',
    limit: '25 requests / 60s window',
    tier: 'Active Enforced',
    source: 'services/api/routes/synthesis.py (global_rate_limiter)',
    isEnforced: true,
  },
  {
    name: 'API Ingestion',
    limit: '300 requests / 60s per token (Baseline Capacity)',
    tier: 'Documented Operational Tier',
    source: 'docs/DESIGN.md & Hardening Specification',
    isEnforced: false,
  },
];
