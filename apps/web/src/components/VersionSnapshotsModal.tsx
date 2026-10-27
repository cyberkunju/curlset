import React, { useEffect, useState } from 'react';
import {
  GitBranch,
  History,
  Plus,
  GitCompare,
  Lock,
  FileText,
  FileCode,
  X,
} from 'lucide-react';
import {
  compareVersions,
  createDatasetVersion,
  fetchDatasetVersions,
  fetchVersionCard,
  fetchVersionManifest,
} from '../api';
import { DatasetVersion, VersionDiff } from '../types';

interface VersionSnapshotsModalProps {
  datasetId: string;
  isOpen: boolean;
  onClose: () => void;
}

export const VersionSnapshotsModal: React.FC<VersionSnapshotsModalProps> = ({
  datasetId,
  isOpen,
  onClose,
}) => {
  const [versions, setVersions] = useState<DatasetVersion[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'list' | 'publish' | 'compare'>('list');

  // Publish Form State
  const [versionTag, setVersionTag] = useState('');
  const [forcePublish, setForcePublish] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);

  // Card / Manifest Submodal Viewer
  const [viewingCard, setViewingCard] = useState<string | null>(null);
  const [viewingManifest, setViewingManifest] = useState<any | null>(null);
  const [viewerTitle, setViewerTitle] = useState<string>('');

  // Compare State
  const [compVersionA, setCompVersionA] = useState('');
  const [compVersionB, setCompVersionB] = useState('');
  const [diffResult, setDiffResult] = useState<VersionDiff | null>(null);
  const [comparing, setComparing] = useState(false);
  const [compareError, setCompareError] = useState<string | null>(null);

  const loadVersions = async () => {
    setLoading(true);
    try {
      const data = await fetchDatasetVersions(datasetId);
      setVersions(data);
      if (data.length >= 2) {
        setCompVersionA(data[1].id);
        setCompVersionB(data[0].id);
      } else if (data.length === 1) {
        setCompVersionA(data[0].id);
        setCompVersionB(data[0].id);
      }
    } catch {
      // Handled silently
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadVersions();
      setActiveTab('list');
      setViewingCard(null);
      setViewingManifest(null);
      setDiffResult(null);
    }
  }, [isOpen, datasetId]);

  const handlePublish = async (e: React.FormEvent) => {
    e.preventDefault();
    setPublishing(true);
    setPublishError(null);
    try {
      await createDatasetVersion(datasetId, versionTag || undefined, forcePublish);
      setVersionTag('');
      setForcePublish(false);
      await loadVersions();
      setActiveTab('list');
    } catch (err: any) {
      setPublishError(err.message || 'Failed to publish dataset version snapshot');
    } finally {
      setPublishing(false);
    }
  };

  const handleViewCard = async (v: DatasetVersion) => {
    setViewerTitle(`Dataset Card — ${v.version_tag}`);
    try {
      const text = await fetchVersionCard(v.id);
      setViewingCard(text);
      setViewingManifest(null);
    } catch (err: any) {
      alert(`Failed to load card: ${err.message}`);
    }
  };

  const handleViewManifest = async (v: DatasetVersion) => {
    setViewerTitle(`Canonical Cryptographic Manifest — ${v.version_tag}`);
    try {
      const json = await fetchVersionManifest(v.id);
      setViewingManifest(json);
      setViewingCard(null);
    } catch (err: any) {
      alert(`Failed to load manifest: ${err.message}`);
    }
  };

  const handleCompare = async () => {
    if (!compVersionA || !compVersionB) return;
    setComparing(true);
    setCompareError(null);
    try {
      const res = await compareVersions(compVersionA, compVersionB);
      setDiffResult(res);
    } catch (err: any) {
      setCompareError(err.message || 'Version comparison failed');
    } finally {
      setComparing(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-backdrop">
      <div className="modal-content" style={{ maxWidth: '960px', maxHeight: '92vh', overflowY: 'auto' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
          <div>
            <h2 style={{ fontSize: '1.35rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <GitBranch size={20} className="text-blue-500" /> Immutable Dataset Versions & Provenance
            </h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
              Phase 7 cryptographic snapshot manifests, automated dataset cards, and semantic version diffs
            </p>
          </div>
          <button className="btn btn-secondary" onClick={onClose} aria-label="Close dialog" style={{ padding: '0.35rem 0.5rem', display: 'flex', alignItems: 'center' }}>
            <X size={18} />
          </button>
        </div>

        {/* Tab Navigation */}
        <div style={{ display: 'flex', gap: '0.5rem', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '0.75rem', marginBottom: '1.5rem' }}>
          <button
            className={`btn ${activeTab === 'list' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => { setActiveTab('list'); setViewingCard(null); setViewingManifest(null); }}
            style={{ fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}
          >
            <History size={15} /> Published Versions ({versions.length})
          </button>
          <button
            className={`btn ${activeTab === 'publish' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => { setActiveTab('publish'); setViewingCard(null); setViewingManifest(null); }}
            style={{ fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}
          >
            <Plus size={15} /> Freeze New Snapshot
          </button>
          <button
            className={`btn ${activeTab === 'compare' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => { setActiveTab('compare'); setViewingCard(null); setViewingManifest(null); }}
            disabled={versions.length < 2}
            style={{ fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}
          >
            <GitCompare size={15} /> Compare Versions
          </button>
        </div>

        {/* Card or Manifest Sub-viewer */}
        {(viewingCard || viewingManifest) && (
          <div style={{ marginBottom: '1.5rem', background: 'rgba(15, 23, 42, 0.9)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', padding: '1.25rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '0.5rem' }}>
              <h3 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-accent)' }}>{viewerTitle}</h3>
              <button
                className="btn btn-secondary"
                onClick={() => { setViewingCard(null); setViewingManifest(null); }}
                style={{ padding: '0.2rem 0.5rem', fontSize: '0.8rem' }}
              >
                Close Viewer
              </button>
            </div>
            {viewingCard && (
              <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'var(--font-mono)', fontSize: '0.825rem', color: 'var(--text-primary)', lineHeight: '1.6', maxHeight: '450px', overflowY: 'auto' }}>
                {viewingCard}
              </pre>
            )}
            {viewingManifest && (
              <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'var(--font-mono)', fontSize: '0.8rem', color: 'var(--cyan)', maxHeight: '450px', overflowY: 'auto' }}>
                {JSON.stringify(viewingManifest, null, 2)}
              </pre>
            )}
          </div>
        )}

        {/* Tab 1: Version List */}
        {activeTab === 'list' && (
          <div>
            {loading ? (
              <div className="loading-container" style={{ padding: '3rem' }}>
                <div className="spinner"></div>
                <div>Loading immutable snapshots...</div>
              </div>
            ) : versions.length === 0 ? (
              <div className="empty-state" style={{ padding: '3rem' }}>
                <div className="empty-icon" style={{ display: 'flex', justifyContent: 'center', marginBottom: '0.5rem', color: 'var(--text-muted)' }}>
                  <GitBranch size={32} />
                </div>
                <h3 className="empty-title">No Version Snapshots Created</h3>
                <p className="empty-desc">
                  This dataset has not yet been frozen into an immutable version.
                  Once annotations are reviewed and quality checks pass, create your first release snapshot.
                </p>
                <button className="btn btn-primary" onClick={() => setActiveTab('publish')}>
                  Freeze First Version Snapshot
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {versions.map((ver) => (
                  <div
                    key={ver.id}
                    className="card"
                    style={{
                      padding: '1.25rem',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      flexWrap: 'wrap',
                      gap: '1rem',
                      background: 'rgba(30, 41, 59, 0.4)',
                    }}
                  >
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.35rem' }}>
                        <span style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--text-accent)' }}>
                          {ver.version_tag}
                        </span>
                        <span className="badge badge-blue">v{ver.version_number}</span>
                        <span className="badge badge-cyan">{ver.record_count} Records Frozen</span>
                        <span className="badge badge-emerald" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
                          <Lock size={11} /> Immutable
                        </span>
                      </div>
                      <div style={{ fontSize: '0.775rem', color: 'var(--text-muted)', display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                        <span>Published: {new Date(ver.created_at).toLocaleString()}</span>
                        <span>
                          Manifest SHA-256:{' '}
                          <code style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>
                            {ver.manifest_hash.slice(0, 16)}...
                          </code>
                        </span>
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <button
                        className="btn btn-secondary"
                        onClick={() => handleViewCard(ver)}
                        title="View generated Dataset Card (README.md)"
                        style={{ fontSize: '0.8rem', padding: '0.35rem 0.65rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}
                      >
                        <FileText size={13} /> Dataset Card
                      </button>
                      <button
                        className="btn btn-secondary"
                        onClick={() => handleViewManifest(ver)}
                        title="View cryptographic JSON manifest"
                        style={{ fontSize: '0.8rem', padding: '0.35rem 0.65rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}
                      >
                        <FileCode size={13} /> Manifest JSON
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Tab 2: Publish Form */}
        {activeTab === 'publish' && (
          <form onSubmit={handlePublish}>
            <div style={{ padding: '1rem', background: 'rgba(99, 102, 241, 0.08)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', marginBottom: '1.25rem', fontSize: '0.85rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'flex-start', gap: '0.5rem' }}>
              <Lock size={15} style={{ flexShrink: 0, marginTop: '2px', color: 'var(--accent-interactive)' }} />
              <div>
                <strong>Immutability Notice: </strong>
                Publishing a snapshot freezes exact record IDs, asset content hashes, and annotation revision IDs.
                Once published, a version can never be edited in-place. Further adjustments create a new sequential version.
              </div>
            </div>

            {publishError && (
              <div style={{ padding: '0.75rem 1rem', background: 'rgba(239, 68, 68, 0.15)', border: '1px solid var(--rose)', borderRadius: 'var(--radius-md)', color: 'var(--rose)', marginBottom: '1.25rem', fontSize: '0.875rem' }}>
                {publishError}
              </div>
            )}

            <div style={{ marginBottom: '1.25rem' }}>
              <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.5rem' }}>
                Version Tag (Optional)
              </label>
              <input
                type="text"
                className="input"
                placeholder="e.g. v1.0.0 or release-2026-10"
                value={versionTag}
                onChange={(e) => setVersionTag(e.target.value)}
                style={{ width: '100%' }}
              />
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                Leave blank to auto-generate standard sequential tag (v1.0.0, v2.0.0, etc.)
              </span>
            </div>

            <div style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <input
                type="checkbox"
                id="forcePublish"
                checked={forcePublish}
                onChange={(e) => setForcePublish(e.target.checked)}
              />
              <label htmlFor="forcePublish" style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                Bypass quality audit blocker checks (Not recommended for production datasets)
              </label>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setActiveTab('list')}
                disabled={publishing}
              >
                Cancel
              </button>
              <button type="submit" className="btn btn-primary" disabled={publishing}>
                {publishing ? 'Freezing Snapshot & Generating Card...' : 'Publish Immutable Version'}
              </button>
            </div>
          </form>
        )}

        {/* Tab 3: Compare Versions */}
        {activeTab === 'compare' && (
          <div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: '1rem', alignItems: 'flex-end', marginBottom: '1.5rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.35rem' }}>
                  Baseline Version (A)
                </label>
                <select
                  className="input"
                  value={compVersionA}
                  onChange={(e) => setCompVersionA(e.target.value)}
                  style={{ width: '100%' }}
                >
                  {versions.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.version_tag} ({v.record_count} records)
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.35rem' }}>
                  Target Version (B)
                </label>
                <select
                  className="input"
                  value={compVersionB}
                  onChange={(e) => setCompVersionB(e.target.value)}
                  style={{ width: '100%' }}
                >
                  {versions.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.version_tag} ({v.record_count} records)
                    </option>
                  ))}
                </select>
              </div>

              <button
                className="btn btn-primary"
                onClick={handleCompare}
                disabled={comparing || compVersionA === compVersionB}
                style={{ height: '42px', whiteSpace: 'nowrap' }}
              >
                {comparing ? 'Computing Diff...' : 'Compute Semantic Diff'}
              </button>
            </div>

            {compareError && (
              <div style={{ padding: '0.75rem 1rem', background: 'rgba(239, 68, 68, 0.15)', border: '1px solid var(--rose)', borderRadius: 'var(--radius-md)', color: 'var(--rose)', marginBottom: '1.25rem', fontSize: '0.875rem' }}>
                {compareError}
              </div>
            )}

            {diffResult && (
              <div>
                <div className="stats-grid" style={{ marginBottom: '1.5rem' }}>
                  <div className="stat-card" style={{ borderColor: 'rgba(16, 185, 129, 0.3)' }}>
                    <span className="stat-value" style={{ color: 'var(--emerald)' }}>
                      +{diffResult.records_added.length}
                    </span>
                    <span className="stat-label">Records Added in B</span>
                  </div>
                  <div className="stat-card" style={{ borderColor: 'rgba(239, 68, 68, 0.3)' }}>
                    <span className="stat-value" style={{ color: 'var(--rose)' }}>
                      -{diffResult.records_removed.length}
                    </span>
                    <span className="stat-label">Records Removed from A</span>
                  </div>
                  <div className="stat-card" style={{ borderColor: 'rgba(245, 158, 11, 0.3)' }}>
                    <span className="stat-value" style={{ color: 'var(--amber)' }}>
                      {diffResult.annotations_updated.length}
                    </span>
                    <span className="stat-label">Annotation Revisions Updated</span>
                  </div>
                  <div className="stat-card">
                    <span className="stat-value">
                      {diffResult.net_record_change > 0 ? `+${diffResult.net_record_change}` : diffResult.net_record_change}
                    </span>
                    <span className="stat-label">Net Record Delta</span>
                  </div>
                </div>

                {diffResult.records_added.length > 0 && (
                  <div style={{ marginBottom: '1rem', padding: '0.75rem 1rem', background: 'rgba(15, 23, 42, 0.5)', borderRadius: 'var(--radius-md)' }}>
                    <span style={{ fontWeight: 600, fontSize: '0.85rem', color: 'var(--emerald)' }}>Added Record IDs: </span>
                    <code style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>
                      {diffResult.records_added.slice(0, 5).join(', ')}
                      {diffResult.records_added.length > 5 && ` +${diffResult.records_added.length - 5} more`}
                    </code>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
