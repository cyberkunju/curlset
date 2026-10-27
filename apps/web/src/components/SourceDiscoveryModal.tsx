import React, { useState, useEffect, useMemo } from 'react';
import {
  Globe,
  Scale,
  BookOpen,
  ShieldCheck,
  FileText,
} from 'lucide-react';
import {
  searchCandidateSources,
  inspectSourceUrl,
  importCandidateSource,
  recordRightsReview,
  fetchDatasetSources,
} from '../api';
import { DiscoveredSource, SourceProvenanceSummary } from '../types';
import { CustomSelect } from './ui/CustomSelect';
import { ModalShell } from './ui/ModalShell';

interface SourceDiscoveryModalProps {
  datasetId: string;
  isOpen: boolean;
  onClose: () => void;
  onImportComplete?: () => void;
}

export const SourceDiscoveryModal: React.FC<SourceDiscoveryModalProps> = ({
  datasetId,
  isOpen,
  onClose,
  onImportComplete,
}) => {
  const [activeTab, setActiveTab] = useState<'catalog' | 'url' | 'provenance'>('catalog');
  const [searchQuery, setSearchQuery] = useState('');
  const [licenseFilter, setLicenseFilter] = useState<string>('all');
  const [candidates, setCandidates] = useState<DiscoveredSource[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [urlInput, setUrlInput] = useState('');
  const [isInspecting, setIsInspecting] = useState(false);
  const [inspectedSource, setInspectedSource] = useState<DiscoveredSource | null>(null);
  const [importingSourceId, setImportingSourceId] = useState<string | null>(null);
  const [provenanceList, setProvenanceList] = useState<SourceProvenanceSummary[]>([]);
  const [isLoadingProvenance, setIsLoadingProvenance] = useState(false);
  const [feedbackMsg, setFeedbackMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Review modal / inline review form state
  const [reviewingRecordId, setReviewingRecordId] = useState<string | null>(null);
  const [reviewStatus, setReviewStatus] = useState<string>('review_required');
  const [reviewEvidence, setReviewEvidence] = useState<string>('');
  const [reviewNotes, setReviewNotes] = useState<string>('');
  const [reviewAttribution, setReviewAttribution] = useState<string>('');
  const [isSubmittingReview, setIsSubmittingReview] = useState(false);

  const filteredCandidates = useMemo(() => {
    if (!licenseFilter || licenseFilter === 'all') return candidates;
    return candidates.filter((c) => c.license_status === licenseFilter);
  }, [candidates, licenseFilter]);

  useEffect(() => {
    if (isOpen) {
      handleSearch();
      loadProvenance();
    }
  }, [isOpen, datasetId]);

  if (!isOpen) return null;

  const handleSearch = async () => {
    setIsSearching(true);
    setFeedbackMsg(null);
    try {
      const results = await searchCandidateSources(searchQuery);
      setCandidates(results);
    } catch (err: any) {
      setFeedbackMsg({ type: 'error', text: err.message || 'Failed to search catalog candidates' });
    } finally {
      setIsSearching(false);
    }
  };

  const handleInspectUrl = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!urlInput.trim()) return;
    setIsInspecting(true);
    setFeedbackMsg(null);
    setInspectedSource(null);
    try {
      const res = await inspectSourceUrl(urlInput.trim());
      setInspectedSource(res);
    } catch (err: any) {
      setFeedbackMsg({
        type: 'error',
        text: err.message || 'URL inspection failed or was blocked by SSRF defense filters',
      });
    } finally {
      setIsInspecting(false);
    }
  };

  const handleImport = async (sourceId: string, split = 'train') => {
    setImportingSourceId(sourceId);
    setFeedbackMsg(null);
    try {
      await importCandidateSource(datasetId, sourceId, split);
      setFeedbackMsg({ type: 'success', text: `Source ${sourceId} successfully imported into dataset.` });
      await loadProvenance();
      if (onImportComplete) onImportComplete();
    } catch (err: any) {
      setFeedbackMsg({
        type: 'error',
        text: err.message || 'Import denied: Candidate cannot be imported without acceptable license clearance',
      });
    } finally {
      setImportingSourceId(null);
    }
  };

  const loadProvenance = async () => {
    setIsLoadingProvenance(true);
    try {
      const list = await fetchDatasetSources(datasetId);
      setProvenanceList(list);
    } catch (err: any) {
      // Ignore or log quietly
    } finally {
      setIsLoadingProvenance(false);
    }
  };

  const handleSubmitReview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reviewingRecordId) return;
    if (reviewEvidence.trim().length < 5) {
      setFeedbackMsg({ type: 'error', text: 'Auditable evidence text must be at least 5 characters long.' });
      return;
    }
    setIsSubmittingReview(true);
    setFeedbackMsg(null);
    try {
      await recordRightsReview(reviewingRecordId, {
        license_status: reviewStatus,
        evidence_text: reviewEvidence.trim(),
        terms_notes: reviewNotes.trim() || undefined,
        attribution_text: reviewAttribution.trim() || undefined,
      });
      setFeedbackMsg({ type: 'success', text: 'Rights review decision recorded successfully.' });
      setReviewingRecordId(null);
      setReviewEvidence('');
      setReviewNotes('');
      setReviewAttribution('');
      await loadProvenance();
    } catch (err: any) {
      setFeedbackMsg({ type: 'error', text: err.message || 'Failed to record rights review decision' });
    } finally {
      setIsSubmittingReview(false);
    }
  };

  const getBadgeClass = (status: string) => {
    switch (status) {
      case 'approved_for_intended_use':
        return 'badge-emerald';
      case 'review_required':
        return 'badge-amber';
      case 'restricted':
      case 'rejected':
        return 'badge-rose';
      default:
        return 'badge-cyan';
    }
  };

  return (
    <ModalShell
      isOpen={isOpen}
      onClose={onClose}
      title="Source Discovery & Provenance Rights Review"
      description="Discover public datasets, inspect URLs with SSRF safeguards, and record auditable rights clearances."
      icon={<Globe size={20} strokeWidth={1.75} style={{ color: 'var(--accent-interactive)' }} />}
      size="xl"
    >
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: '1rem' }}>
        {/* Legal Disclaimer Alert */}
        <div style={{
          padding: '0.75rem 1rem',
          borderRadius: 'var(--radius-sm)',
          background: 'rgba(245, 158, 11, 0.1)',
          border: '1px solid rgba(245, 158, 11, 0.3)',
          color: 'var(--amber)',
          fontSize: '0.8rem',
          lineHeight: '1.4',
          display: 'flex',
          gap: '0.5rem',
          alignItems: 'flex-start',
        }}>
          <Scale size={16} style={{ flexShrink: 0, marginTop: '2px' }} />
          <div>
            <strong>Legal & Compliance Invariant (AGENTS.md Rule 8):</strong> Public accessibility does NOT imply permission
            for AI training or redistribution. All external sources require explicit licensing review and recorded auditable evidence.
          </div>
        </div>

        {feedbackMsg && (
          <div style={{
            padding: '0.75rem 1rem',
            borderRadius: 'var(--radius-sm)',
            background: feedbackMsg.type === 'success' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
            border: `1px solid ${feedbackMsg.type === 'success' ? 'var(--emerald)' : 'var(--rose)'}`,
            color: feedbackMsg.type === 'success' ? 'var(--emerald)' : 'var(--rose)',
            fontSize: '0.85rem',
          }}>
            {feedbackMsg.text}
          </div>
        )}

        {/* Tabs */}
        <div style={{ display: 'flex', gap: '0.5rem', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '0.5rem' }}>
          <button
            className={`btn ${activeTab === 'catalog' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ fontSize: '0.85rem', padding: '0.4rem 0.8rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}
            onClick={() => setActiveTab('catalog')}
          >
            <BookOpen size={15} /> Catalog Discovery
          </button>
          <button
            className={`btn ${activeTab === 'url' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ fontSize: '0.85rem', padding: '0.4rem 0.8rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}
            onClick={() => setActiveTab('url')}
          >
            <ShieldCheck size={15} /> SSRF-Protected URL Inspector
          </button>
          <button
            className={`btn ${activeTab === 'provenance' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ fontSize: '0.85rem', padding: '0.4rem 0.8rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}
            onClick={() => {
              setActiveTab('provenance');
              loadProvenance();
            }}
          >
            <FileText size={15} /> Dataset Rights Audit ({provenanceList.length})
          </button>
        </div>

        {/* Content Body */}
        <div style={{ flex: 1, overflowY: 'auto', paddingRight: '0.5rem' }}>
          {activeTab === 'catalog' && (
            <div>
              <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
                <input
                  type="text"
                  className="input-text"
                  placeholder="Filter candidates (e.g. sentiment, autonomous, open images)..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                  style={{ flex: 1, minWidth: '220px' }}
                />
                <div style={{ width: '180px' }}>
                  <CustomSelect
                    value={licenseFilter}
                    onChange={setLicenseFilter}
                    options={[
                      { value: 'all', label: 'All Licenses' },
                      { value: 'approved_for_intended_use', label: 'Approved' },
                      { value: 'review_required', label: 'Review Required' },
                      { value: 'unknown', label: 'Unknown' },
                      { value: 'restricted', label: 'Restricted' },
                      { value: 'rejected', label: 'Rejected' },
                    ]}
                  />
                </div>
                <button className="btn btn-primary" onClick={handleSearch} disabled={isSearching}>
                  {isSearching ? 'Searching...' : 'Search Catalogs'}
                </button>
              </div>

              {filteredCandidates.length === 0 ? (
                <div className="empty-state" style={{ padding: '2rem' }}>
                  <p className="empty-desc">
                    {candidates.length > 0 && licenseFilter !== 'all'
                      ? `No candidate sources match license filter "${licenseFilter}".`
                      : 'No matching candidate sources found.'}
                  </p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                  {filteredCandidates.map((cand) => (
                    <div
                      key={cand.source_id}
                      className="card"
                      style={{ padding: '1rem', border: '1px solid var(--border-subtle)' }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <h4 style={{ fontSize: '1rem', fontWeight: 700 }}>{cand.title}</h4>
                            <span className={`badge ${getBadgeClass(cand.license_status)}`}>
                              {cand.license_status.toUpperCase()}
                            </span>
                          </div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                            Source ID: <code>{cand.source_id}</code> | Publisher: {cand.publisher || 'Unknown'} | Type: {cand.media_type}
                          </div>
                        </div>

                        <button
                          className="btn btn-primary"
                          style={{ fontSize: '0.8rem', padding: '0.35rem 0.75rem' }}
                          disabled={importingSourceId === cand.source_id || cand.license_status === 'restricted' || cand.license_status === 'rejected'}
                          onClick={() => handleImport(cand.source_id)}
                          title={cand.license_status === 'restricted' ? 'Restricted sources cannot be imported' : 'Import reference into dataset'}
                        >
                          {importingSourceId === cand.source_id ? 'Importing...' : 'Import to Dataset'}
                        </button>
                      </div>

                      <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>
                        {cand.description}
                      </p>

                      <div style={{ fontSize: '0.8rem', background: 'rgba(15, 23, 42, 0.4)', padding: '0.5rem', borderRadius: '4px' }}>
                        <div><strong>License Evidence:</strong> {cand.license_evidence || 'No machine-readable license asserted.'}</div>
                        {cand.attribution_required && (
                          <div><strong>Attribution:</strong> {cand.attribution_required}</div>
                        )}
                        <div style={{ wordBreak: 'break-all', marginTop: '0.2rem', color: 'var(--text-muted)' }}>
                          <strong>URL:</strong> <a href={cand.url} target="_blank" rel="noreferrer" style={{ color: 'var(--cyan)' }}>{cand.url}</a>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'url' && (
            <div>
              <form onSubmit={handleInspectUrl} style={{ marginBottom: '1.25rem' }}>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.35rem' }}>
                  Target Remote URL (Sandboxed with SSRF verification)
                </label>
                <div style={{ display: 'flex', gap: '0.75rem' }}>
                  <input
                    type="url"
                    className="input-text"
                    placeholder="https://example.com/dataset-info.json"
                    value={urlInput}
                    onChange={(e) => setUrlInput(e.target.value)}
                    style={{ flex: 1 }}
                    required
                  />
                  <button type="submit" className="btn btn-primary" disabled={isInspecting}>
                    {isInspecting ? 'Verifying & Inspecting...' : 'Inspect URL'}
                  </button>
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.35rem' }}>
                  Protected against SSRF: Private IPs, loopbacks, internal DNS, and cloud metadata (169.254.169.254) are rejected immediately. Max payload: 10MB.
                </div>
              </form>

              {inspectedSource && (
                <div className="card" style={{ padding: '1.25rem', border: '1px solid var(--border-subtle)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
                    <div>
                      <h4 style={{ fontSize: '1.1rem', fontWeight: 700 }}>{inspectedSource.title}</h4>
                      <span className={`badge ${getBadgeClass(inspectedSource.license_status)}`}>
                        Status: {inspectedSource.license_status}
                      </span>
                    </div>
                    <button
                      className="btn btn-primary"
                      onClick={() => handleImport(inspectedSource.source_id)}
                      disabled={importingSourceId === inspectedSource.source_id || inspectedSource.license_status === 'restricted' || inspectedSource.license_status === 'rejected'}
                    >
                      {importingSourceId === inspectedSource.source_id ? 'Importing...' : 'Import Inspected Source'}
                    </button>
                  </div>

                  <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>
                    {inspectedSource.description}
                  </p>

                  <div style={{ fontSize: '0.8rem', background: 'rgba(15, 23, 42, 0.4)', padding: '0.75rem', borderRadius: '4px', marginBottom: '0.75rem' }}>
                    <div><strong>SHA-256 Digest:</strong> <code>{inspectedSource.content_sha256}</code></div>
                    <div><strong>Content-Type:</strong> {inspectedSource.media_type}</div>
                    <div><strong>Retrieval Time:</strong> {inspectedSource.retrieval_timestamp}</div>
                    <div><strong>Terms Notes:</strong> {inspectedSource.terms_notes}</div>
                  </div>

                  {inspectedSource.raw_content_preview && (
                    <div>
                      <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.25rem' }}>
                        Content Preview (Truncated):
                      </label>
                      <pre style={{
                        background: 'rgba(0,0,0,0.4)',
                        padding: '0.75rem',
                        borderRadius: '4px',
                        fontSize: '0.75rem',
                        maxHeight: '180px',
                        overflowY: 'auto',
                        whiteSpace: 'pre-wrap',
                      }}>
                        {inspectedSource.raw_content_preview}
                      </pre>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {activeTab === 'provenance' && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <h4 style={{ fontSize: '0.95rem', fontWeight: 700 }}>Dataset Source Records & Rights Decisions</h4>
                <button className="btn btn-secondary" onClick={loadProvenance} disabled={isLoadingProvenance} style={{ fontSize: '0.8rem' }}>
                  {isLoadingProvenance ? 'Refreshing...' : 'Refresh Audit List'}
                </button>
              </div>

              {provenanceList.length === 0 ? (
                <div className="empty-state" style={{ padding: '2rem' }}>
                  <p className="empty-desc">No external sources imported for this dataset yet.</p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  {provenanceList.map((item) => (
                    <div key={item.record_id} className="card" style={{ padding: '1rem', border: '1px solid var(--border-subtle)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                            <span style={{ fontWeight: 700, fontSize: '0.9rem' }}>Record: {item.record_id}</span>
                            <span className={`badge ${getBadgeClass(item.license_status)}`}>
                              {item.license_status.toUpperCase()}
                            </span>
                          </div>
                          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                            Source ID: <code>{item.source_id}</code> | Type: {item.source_type}
                          </div>
                          {item.source_uri && (
                            <div style={{ fontSize: '0.8rem', marginTop: '0.2rem' }}>
                              URI: <span style={{ color: 'var(--cyan)' }}>{item.source_uri}</span>
                            </div>
                          )}
                          {item.creator_attribution && (
                            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                              Attribution: {item.creator_attribution}
                            </div>
                          )}
                          {item.terms_notes && (
                            <div style={{ fontSize: '0.8rem', marginTop: '0.25rem', color: 'var(--amber)' }}>
                              Notes: {item.terms_notes}
                            </div>
                          )}
                        </div>

                        <button
                          className="btn btn-secondary"
                          style={{ fontSize: '0.8rem', padding: '0.3rem 0.6rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}
                          onClick={() => {
                            setReviewingRecordId(item.record_id);
                            setReviewStatus(item.license_status);
                            setReviewNotes(item.terms_notes || '');
                            setReviewAttribution(item.creator_attribution || '');
                          }}
                        >
                          <Scale size={14} /> Review Rights
                        </button>
                      </div>

                      {reviewingRecordId === item.record_id && (
                        <form
                          onSubmit={handleSubmitReview}
                          style={{
                            marginTop: '1rem',
                            padding: '1rem',
                            background: 'rgba(15, 23, 42, 0.5)',
                            borderRadius: 'var(--radius-sm)',
                            border: '1px solid var(--border-subtle)',
                          }}
                        >
                          <h5 style={{ fontSize: '0.85rem', fontWeight: 700, marginBottom: '0.5rem' }}>
                            Record Rights Review Decision for {item.record_id}
                          </h5>

                          <div style={{ marginBottom: '0.75rem' }}>
                            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, marginBottom: '0.25rem' }}>
                              Decision Status
                            </label>
                            <CustomSelect
                              value={reviewStatus}
                              onChange={(val) => setReviewStatus(val)}
                              options={[
                                { value: 'review_required', label: 'REVIEW_REQUIRED (Default / Pending Evidence)' },
                                { value: 'approved_for_intended_use', label: 'APPROVED_FOR_INTENDED_USE (Clearance Verified)' },
                                { value: 'restricted', label: 'RESTRICTED (Training Disallowed)' },
                                { value: 'rejected', label: 'REJECTED (Illegal / Incompatible Terms)' },
                              ]}
                              style={{ width: '100%' }}
                              ariaLabel="Select rights review decision status"
                            />
                          </div>

                          <div style={{ marginBottom: '0.5rem' }}>
                            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, marginBottom: '0.2rem' }}>
                              Auditable Reasoning / Evidence (Required, min 5 chars) *
                            </label>
                            <textarea
                              className="input-text"
                              placeholder="Cite specific license text, author permission, or terms of service clause..."
                              value={reviewEvidence}
                              onChange={(e) => setReviewEvidence(e.target.value)}
                              style={{ width: '100%', minHeight: '60px', fontSize: '0.85rem' }}
                              required
                            />
                          </div>

                          <div style={{ marginBottom: '0.5rem' }}>
                            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, marginBottom: '0.2rem' }}>
                              Attribution Text (Optional)
                            </label>
                            <input
                              type="text"
                              className="input-text"
                              placeholder="e.g. Created by Jane Doe, licensed under CC BY 4.0"
                              value={reviewAttribution}
                              onChange={(e) => setReviewAttribution(e.target.value)}
                              style={{ width: '100%', fontSize: '0.85rem' }}
                            />
                          </div>

                          <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: '0.75rem' }}>
                            <button
                              type="button"
                              className="btn btn-secondary"
                              style={{ fontSize: '0.8rem', padding: '0.3rem 0.6rem' }}
                              onClick={() => setReviewingRecordId(null)}
                            >
                              Cancel
                            </button>
                            <button
                              type="submit"
                              className="btn btn-primary"
                              style={{ fontSize: '0.8rem', padding: '0.3rem 0.6rem' }}
                              disabled={isSubmittingReview}
                            >
                              {isSubmittingReview ? 'Submitting...' : 'Save Decision'}
                            </button>
                          </div>
                        </form>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </ModalShell>
  );
};
