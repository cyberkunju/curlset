import React, { useEffect, useState, useCallback } from 'react';
import {
  Activity,
  Server,
  Database,
  HardDrive,
  Shield,
  Cpu,
  Clock,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  AlertTriangle,
  Zap,
} from 'lucide-react';
import { fetchProviders } from '../api';

interface HealthData {
  status?: string;
  service?: string;
  version?: string;
  environment?: string;
  privacy_mode?: string;
  storage_backend?: string;
  uptime_seconds?: number;
  error?: string;
}

interface ReadinessData {
  status?: string;
  database?: string;
  storage?: string;
  error?: string;
}

interface ProviderInfo {
  name: string;
  capabilities: string[];
  models: string[];
}

export const SystemHealthView: React.FC = () => {
  const [health, setHealth] = useState<HealthData | null>(null);
  const [readiness, setReadiness] = useState<ReadinessData | null>(null);
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [providersError, setProvidersError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [lastProbeTime, setLastProbeTime] = useState<Date | null>(null);
  const [healthLatencyMs, setHealthLatencyMs] = useState<number | null>(null);
  const [readinessLatencyMs, setReadinessLatencyMs] = useState<number | null>(null);

  const probeEndpoint = async <T,>(url: string): Promise<{ data: T | { status: string; error?: string }; latency: number }> => {
    const start = performance.now();
    try {
      const res = await fetch(url);
      const contentType = res.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) {
        throw new Error(`Expected JSON response but received ${contentType || 'non-JSON payload'}`);
      }
      const data = await res.json();
      if (!res.ok && res.status !== 503) {
        throw new Error(`HTTP ${res.status}`);
      }
      const latency = Math.round(performance.now() - start);
      return { data, latency };
    } catch (err: any) {
      const latency = Math.round(performance.now() - start);
      return { data: { status: 'unreachable', error: err?.message || 'Probe request failed' }, latency };
    }
  };

  const checkStatus = useCallback(async () => {
    setLoading(true);
    setRefreshError(null);
    setProvidersError(null);

    try {
      // 1. Concurrently probe official API endpoints
      const [hResult, rResult] = await Promise.all([
        probeEndpoint<HealthData>('/api/v1/health'),
        probeEndpoint<ReadinessData>('/api/v1/readiness'),
      ]);

      setHealth(hResult.data as HealthData);
      setHealthLatencyMs(hResult.latency);
      setReadiness(rResult.data as ReadinessData);
      setReadinessLatencyMs(rResult.latency);
      setLastProbeTime(new Date());

      // 2. Fetch AI Providers via existing gateway API
      try {
        const provList = await fetchProviders();
        setProviders(Array.isArray(provList) ? provList : []);
      } catch (pErr: any) {
        setProviders([]);
        setProvidersError(pErr?.message || 'Failed to query registered model providers');
      }
    } catch (err: any) {
      setRefreshError(err?.message || 'Diagnostics check failed');
      setHealthLatencyMs(null);
      setReadinessLatencyMs(null);
      setHealth({ status: 'unreachable', error: err?.message });
      setReadiness({ status: 'unreachable', error: err?.message });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    checkStatus();
  }, [checkStatus]);

  const formatUptime = (seconds?: number): string => {
    if (seconds === undefined || seconds === null || seconds < 0) return 'N/A';
    const d = Math.floor(seconds / 86400);
    const h = Math.floor((seconds % 86400) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    if (d > 0) return `${d}d ${h}h ${m}m ${s}s`;
    if (h > 0) return `${h}h ${m}m ${s}s`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
  };

  const isSystemOperational = health?.status === 'ok' && readiness?.status === 'ready';
  const isSystemDegraded = health?.status === 'ok' && readiness?.status !== 'ready';
  const isSystemUnreachable = health?.status === 'unreachable' || readiness?.status === 'unreachable';

  return (
    <div className="system-health-view" style={{ maxWidth: '1200px', margin: '0 auto', width: '100%' }}>
      {/* Header & Refresh Action */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '1rem',
          marginBottom: '1.75rem',
        }}
      >
        <div>
          <h1
            style={{
              fontSize: '1.5rem',
              fontWeight: 700,
              letterSpacing: '-0.02em',
              display: 'flex',
              alignItems: 'center',
              gap: '0.65rem',
              color: 'var(--text-primary)',
            }}
          >
            <Activity size={24} style={{ color: 'var(--accent-interactive)' }} /> System Health & Diagnostics
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginTop: '0.25rem' }}>
            Real-time diagnostics console: core services, storage probes, provider gateways, and request latency.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          {healthLatencyMs !== null && readinessLatencyMs !== null && (
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.5rem',
                fontSize: '0.8rem',
                color: 'var(--text-secondary)',
                background: 'var(--bg-elevated)',
                padding: '0.35rem 0.65rem',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border-hairline)',
                fontFamily: 'var(--font-mono)',
              }}
              title="Measured client-to-backend request latency for health and readiness probes"
            >
              <Zap size={13} style={{ color: 'var(--accent-interactive)' }} />
              <span>Health: {healthLatencyMs} ms</span>
              <span style={{ color: 'var(--border-hairline)' }}>|</span>
              <span>Readiness: {readinessLatencyMs} ms</span>
            </div>
          )}

          <button
            className="btn btn-secondary"
            onClick={checkStatus}
            disabled={loading}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.45rem',
              fontSize: '0.85rem',
              padding: '0.45rem 0.9rem',
            }}
          >
            <RefreshCw size={14} className={loading ? 'spinning' : ''} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
            {loading ? 'Probing Services...' : 'Refresh Status'}
          </button>
        </div>
      </div>

      {refreshError && (
        <div
          style={{
            marginBottom: '1.25rem',
            padding: '0.75rem 1rem',
            background: 'rgba(239, 68, 68, 0.08)',
            border: '1px solid rgba(239, 68, 68, 0.25)',
            borderRadius: 'var(--radius-sm)',
            color: 'var(--rose)',
            fontSize: '0.85rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
          }}
        >
          <AlertCircle size={16} style={{ flexShrink: 0 }} />
          <span>{refreshError}</span>
        </div>
      )}

      {/* Main Status Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.25rem', marginBottom: '1.5rem' }}>
        {/* Card 1: API Service Core */}
        <div
          style={{
            background: 'var(--bg-surface)',
            border: '1px solid var(--border-hairline)',
            borderRadius: 'var(--radius-md)',
            padding: '1.25rem',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
          }}
        >
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Server size={18} style={{ color: 'var(--accent-interactive)' }} />
                <h3 style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-primary)' }}>API Service Core</h3>
              </div>
              <span
                className={`badge ${
                  health?.status === 'ok' ? 'badge-emerald' : isSystemUnreachable ? 'badge-rose' : 'badge-amber'
                }`}
              >
                {health?.status ? health.status.toUpperCase() : 'UNKNOWN'}
              </span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '0.825rem', color: 'var(--text-secondary)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-hairline)', paddingBottom: '0.35rem' }}>
                <span>Service Identifier:</span>
                <code style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>
                  {health?.service || 'N/A'}
                </code>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-hairline)', paddingBottom: '0.35rem' }}>
                <span>API Version:</span>
                <code style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>
                  {health?.version || 'N/A'}
                </code>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-hairline)', paddingBottom: '0.35rem' }}>
                <span>Environment:</span>
                <span style={{ fontWeight: 500, color: 'var(--text-primary)' }}>
                  {health?.environment || 'N/A'}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-hairline)', paddingBottom: '0.35rem' }}>
                <span>Request Latency:</span>
                <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>
                  {healthLatencyMs !== null ? `${healthLatencyMs} ms` : 'N/A'}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Service Uptime:</span>
                <strong style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>
                  {formatUptime(health?.uptime_seconds)}
                </strong>
              </div>
            </div>
          </div>

          <div style={{ marginTop: '1rem', paddingTop: '0.75rem', borderTop: '1px solid var(--border-hairline)', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            Endpoint: <code style={{ fontFamily: 'var(--font-mono)' }}>/api/v1/health</code>
          </div>
        </div>

        {/* Card 2: Database & Storage Probes */}
        <div
          style={{
            background: 'var(--bg-surface)',
            border: '1px solid var(--border-hairline)',
            borderRadius: 'var(--radius-md)',
            padding: '1.25rem',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
          }}
        >
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Database size={18} style={{ color: 'var(--accent-interactive)' }} />
                <h3 style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-primary)' }}>Database & Storage</h3>
              </div>
              <span
                className={`badge ${
                  readiness?.status === 'ready' ? 'badge-emerald' : readiness?.status === 'degraded' ? 'badge-amber' : 'badge-rose'
                }`}
              >
                {readiness?.status ? readiness.status.toUpperCase() : 'PROBING'}
              </span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '0.825rem', color: 'var(--text-secondary)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-hairline)', paddingBottom: '0.35rem' }}>
                <span>Relational Database:</span>
                <span
                  style={{
                    fontWeight: 600,
                    color: readiness?.database === 'connected' ? 'var(--emerald)' : 'var(--rose)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.25rem',
                  }}
                >
                  {readiness?.database === 'connected' ? <CheckCircle2 size={13} /> : <AlertCircle size={13} />}
                  {readiness?.database || 'checking...'}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-hairline)', paddingBottom: '0.35rem' }}>
                <span>Storage Backend Driver:</span>
                <code style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>
                  {health?.storage_backend || 'Not reported'}
                </code>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-hairline)', paddingBottom: '0.35rem' }}>
                <span>Probe Latency:</span>
                <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>
                  {readinessLatencyMs !== null ? `${readinessLatencyMs} ms` : 'N/A'}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>File Write/Read Probe:</span>
                <span
                  style={{
                    fontWeight: 600,
                    color: readiness?.storage === 'accessible' ? 'var(--emerald)' : 'var(--rose)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.25rem',
                  }}
                >
                  {readiness?.storage === 'accessible' ? <CheckCircle2 size={13} /> : <AlertCircle size={13} />}
                  {readiness?.storage || 'checking...'}
                </span>
              </div>
            </div>
          </div>

          <div style={{ marginTop: '1rem', paddingTop: '0.75rem', borderTop: '1px solid var(--border-hairline)', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            Endpoint: <code style={{ fontFamily: 'var(--font-mono)' }}>/api/v1/readiness</code>
          </div>
        </div>

        {/* Card 3: Privacy & Operating Policy */}
        <div
          style={{
            background: 'var(--bg-surface)',
            border: '1px solid var(--border-hairline)',
            borderRadius: 'var(--radius-md)',
            padding: '1.25rem',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
          }}
        >
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Shield size={18} style={{ color: 'var(--accent-interactive)' }} />
                <h3 style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-primary)' }}>Operating Policy</h3>
              </div>
              <span className="badge badge-blue">
                {health?.privacy_mode || 'Not reported'}
              </span>
            </div>

            <p style={{ fontSize: '0.825rem', color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: '0.75rem' }}>
              {health?.privacy_mode === 'local_only'
                ? 'System operates in local privacy mode. Inference runs using mock or local providers without automatic external network dispatch.'
                : health?.privacy_mode
                ? `System operates in ${health.privacy_mode} mode.`
                : 'Privacy mode not reported by active health endpoint.'}
            </p>

            <div style={{ fontSize: '0.775rem', color: 'var(--text-muted)', background: 'var(--bg-elevated)', padding: '0.5rem 0.65rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-hairline)' }}>
              Outbound Telemetry: <strong>Not exposed by this endpoint</strong>
            </div>
          </div>

          <div style={{ marginTop: '1rem', paddingTop: '0.75rem', borderTop: '1px solid var(--border-hairline)', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            Last verified: {lastProbeTime ? lastProbeTime.toLocaleTimeString() : 'Pending probe'}
          </div>
        </div>
      </div>

      {/* Model Providers Status Section */}
      <div
        style={{
          background: 'var(--bg-surface)',
          border: '1px solid var(--border-hairline)',
          borderRadius: 'var(--radius-md)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            padding: '1rem 1.25rem',
            background: 'var(--bg-elevated)',
            borderBottom: '1px solid var(--border-hairline)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '0.5rem',
          }}
        >
          <div>
            <div style={{ fontWeight: 600, fontSize: '0.95rem', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Cpu size={17} style={{ color: 'var(--accent-interactive)' }} /> Registered AI Model Providers
            </div>
            <div style={{ fontSize: '0.775rem', color: 'var(--text-secondary)', marginTop: '0.15rem' }}>
              Registration status from <code style={{ fontFamily: 'var(--font-mono)' }}>/api/v1/providers</code> (Registration and configuration reflect gateway registration, not a live connectivity test).
            </div>
          </div>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
            {providers.length} provider{providers.length === 1 ? '' : 's'} registered
          </span>
        </div>

        {providersError ? (
          <div style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--rose)', fontSize: '0.85rem' }}>
            <AlertTriangle size={28} style={{ margin: '0 auto 0.5rem' }} />
            <div>{providersError}</div>
          </div>
        ) : providers.length === 0 ? (
          <div style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
            No AI inference providers currently registered in gateway.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem' }}>
              <thead style={{ background: 'var(--bg-surface)', color: 'var(--text-secondary)', borderBottom: '1px solid var(--border-hairline)', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                <tr>
                  <th style={{ padding: '0.75rem 1.25rem' }}>Provider Identifier</th>
                  <th style={{ padding: '0.75rem 1.25rem' }}>Supported Capabilities</th>
                  <th style={{ padding: '0.75rem 1.25rem' }}>Configured Models</th>
                  <th style={{ padding: '0.75rem 1.25rem', textAlign: 'right' }}>Gateway State</th>
                </tr>
              </thead>
              <tbody>
                {providers.map((p) => (
                  <tr key={p.name} style={{ borderBottom: '1px solid var(--border-hairline)' }}>
                    <td style={{ padding: '0.75rem 1.25rem', fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--text-primary)' }}>
                      {p.name}
                      {p.name === 'fake' && (
                        <span className="badge" style={{ marginLeft: '0.5rem', fontSize: '0.65rem' }}>
                          Synthetic / Test
                        </span>
                      )}
                    </td>
                    <td style={{ padding: '0.75rem 1.25rem' }}>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
                        {p.capabilities && p.capabilities.length > 0 ? (
                          p.capabilities.map((c) => (
                            <span key={c} className="badge badge-blue" style={{ fontSize: '0.7rem' }}>
                              {c}
                            </span>
                          ))
                        ) : (
                          <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>None</span>
                        )}
                      </div>
                    </td>
                    <td style={{ padding: '0.75rem 1.25rem' }}>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
                        {p.models && p.models.length > 0 ? (
                          p.models.map((m) => (
                            <code key={m} style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', background: 'var(--bg-elevated)', padding: '0.15rem 0.4rem', borderRadius: 'var(--radius-sm)' }}>
                              {m}
                            </code>
                          ))
                        ) : (
                          <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>Standard default</span>
                        )}
                      </div>
                    </td>
                    <td style={{ padding: '0.75rem 1.25rem', textAlign: 'right' }}>
                      <span className="badge badge-blue" style={{ fontSize: '0.725rem' }}>
                        Registered
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
