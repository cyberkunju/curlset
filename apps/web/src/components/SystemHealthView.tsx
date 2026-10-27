import React, { useEffect, useState } from 'react';

export const SystemHealthView: React.FC = () => {
  const [health, setHealth] = useState<any>(null);
  const [readiness, setReadiness] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const checkStatus = async () => {
    setLoading(true);
    try {
      const [hRes, rRes] = await Promise.all([
        fetch('/health').then((r) => r.json()),
        fetch('/readiness').then((r) => r.json()),
      ]);
      setHealth(hRes);
      setReadiness(rRes);
    } catch (err: any) {
      setHealth({ status: 'offline', error: err.message });
      setReadiness({ status: 'unavailable' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    checkStatus();
  }, []);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 800 }}>System Health & Diagnostics</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginTop: '0.25rem' }}>
            Local backend services, storage verification, and privacy enforcement indicators.
          </p>
        </div>
        <button className="btn btn-secondary" onClick={checkStatus} disabled={loading}>
          {loading ? 'Probing...' : 'Refresh Status'}
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.5rem' }}>
        <div className="card" style={{ cursor: 'default' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h3 style={{ fontSize: '1rem', fontWeight: 600 }}>API Service</h3>
            <span className={`badge ${health?.status === 'ok' ? 'badge-emerald' : 'badge-rose'}`}>
              {health?.status || 'Unknown'}
            </span>
          </div>
          <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <div>Service: <code style={{ fontFamily: 'var(--font-mono)' }}>{health?.service || 'N/A'}</code></div>
            <div>Version: <code style={{ fontFamily: 'var(--font-mono)' }}>{health?.version || 'N/A'}</code></div>
            <div>Environment: <code style={{ fontFamily: 'var(--font-mono)' }}>{health?.environment || 'N/A'}</code></div>
            <div>Uptime: <strong>{health?.uptime_seconds ? `${health.uptime_seconds}s` : 'N/A'}</strong></div>
          </div>
        </div>

        <div className="card" style={{ cursor: 'default' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h3 style={{ fontSize: '1rem', fontWeight: 600 }}>Privacy Mode</h3>
            <span className="badge badge-indigo">
              {health?.privacy_mode || 'local_only'}
            </span>
          </div>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: '1.5' }}>
            {health?.privacy_mode === 'local_only'
              ? 'Local-only privacy mode is active. No datasets or telemetry are transmitted to third-party providers. Offline workflows guaranteed.'
              : 'External inference allowed upon explicit user authorization.'}
          </p>
        </div>

        <div className="card" style={{ cursor: 'default' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h3 style={{ fontSize: '1rem', fontWeight: 600 }}>Database & Storage</h3>
            <span className={`badge ${readiness?.status === 'ready' ? 'badge-emerald' : 'badge-amber'}`}>
              {readiness?.status || 'Probing'}
            </span>
          </div>
          <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <div>Database: <strong style={{ color: readiness?.database === 'connected' ? 'var(--emerald)' : 'var(--rose)' }}>{readiness?.database || 'checking'}</strong></div>
            <div>Storage Backend: <code style={{ fontFamily: 'var(--font-mono)' }}>{health?.storage_backend || 'local'}</code></div>
            <div>Storage Access: <strong style={{ color: readiness?.storage === 'accessible' ? 'var(--emerald)' : 'var(--rose)' }}>{readiness?.storage || 'checking'}</strong></div>
          </div>
        </div>
      </div>
    </div>
  );
};
