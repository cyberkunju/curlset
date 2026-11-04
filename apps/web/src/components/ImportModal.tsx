import React, { useState } from 'react';
import { UploadCloud, CheckCircle2, AlertTriangle, AlertCircle, RotateCcw } from 'lucide-react';
import { SpringButton } from './ui/SpringButton';
import { PerceptualProgressBar } from './ui/PerceptualProgressBar';
import { CustomSelect } from './ui/CustomSelect';
import { ModalShell } from './ui/ModalShell';

/**
 * Row-level import diagnostics.
 *
 * The API reports a per-row verdict (`rejected_items`, `duplicates`). Row numbers
 * and reasons are rendered exactly as reported; when an older API version omits a
 * field it is shown as "not reported" rather than guessed.
 */
interface ImportRejectedItem {
  filename?: string;
  reason?: string;
  message?: string;
  row?: number | string;
  line?: number | string;
  row_number?: number | string;
  index?: number | string;
  [key: string]: any;
}

interface ImportDuplicateItem {
  filename?: string;
  sha256?: string;
  existing_asset_id?: string;
  row?: number | string;
  line?: number | string;
  row_number?: number | string;
  [key: string]: any;
}

interface ImportReport {
  run_id?: string;
  dataset_id?: string;
  total_processed?: number;
  accepted_count?: number;
  duplicate_count?: number;
  rejected_count?: number;
  duplicates?: ImportDuplicateItem[];
  rejected_items?: ImportRejectedItem[];
  [key: string]: any;
}

interface ImportModalProps {
  datasetId: string;
  isOpen: boolean;
  onClose: () => void;
  onImportComplete: () => void;
}

const rowLabel = (item: { row?: unknown; line?: unknown; row_number?: unknown; index?: unknown }): string | null => {
  const candidate = item.row ?? item.line ?? item.row_number ?? item.index;
  if (typeof candidate === 'number' && Number.isFinite(candidate)) return String(candidate);
  if (typeof candidate === 'string' && candidate.trim() !== '') return candidate.trim();
  return null;
};

export const ImportModal: React.FC<ImportModalProps> = ({
  datasetId,
  isOpen,
  onClose,
  onImportComplete,
}) => {
  const [file, setFile] = useState<File | null>(null);
  const [split, setSplit] = useState('train');
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<ImportReport | null>(null);

  if (!isOpen) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      setError(null);
      setReport(null);
    }
  };

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) {
      setError('Select a file to import.');
      return;
    }

    setUploading(true);
    setError(null);

    const formData = new FormData();
    formData.append('file', file);
    formData.append('split', split);

    try {
      const res = await fetch(`/api/v1/datasets/${datasetId}/import/file`, {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        let msg = `Import failed (HTTP ${res.status})`;
        try {
          const data = await res.json();
          if (data?.error?.message) msg = data.error.message;
          else if (typeof data?.detail === 'string') msg = data.detail;
          else if (data?.detail) msg = JSON.stringify(data.detail);
        } catch {
          // Keep the status-based message when the body is not JSON.
        }
        throw new Error(msg);
      }

      const rep: ImportReport = await res.json();
      setReport(rep);
      onImportComplete();
    } catch (err: any) {
      setError(err?.message || 'File import failed');
    } finally {
      setUploading(false);
    }
  };

  const resetAndClose = () => {
    setFile(null);
    setReport(null);
    setError(null);
    onClose();
  };

  const startAnotherImport = () => {
    setFile(null);
    setReport(null);
    setError(null);
  };

  const rejectedItems: ImportRejectedItem[] = Array.isArray(report?.rejected_items)
    ? report!.rejected_items!
    : [];
  const duplicates: ImportDuplicateItem[] = Array.isArray(report?.duplicates) ? report!.duplicates! : [];
  const totalProcessed = typeof report?.total_processed === 'number' ? report.total_processed : null;
  const accepted = typeof report?.accepted_count === 'number' ? report.accepted_count : 0;
  const duplicateCount =
    typeof report?.duplicate_count === 'number' ? report.duplicate_count : duplicates.length;
  const rejectedCount =
    typeof report?.rejected_count === 'number' ? report.rejected_count : rejectedItems.length;

  return (
    <ModalShell
      isOpen={isOpen}
      onClose={resetAndClose}
      title="Import Text & Media Records"
      description="CSV (RFC 4180), JSONL / JSON array, .txt (one record per non-empty line), images and ZIP bundles. Imports are reported per row."
      icon={<UploadCloud size={20} strokeWidth={1.75} style={{ color: 'var(--accent-interactive)' }} />}
      size="lg"
    >
      {error && (
        <div style={{ padding: '0.75rem', marginBottom: '1rem', borderRadius: 'var(--radius-sm)', background: 'rgba(239, 68, 68, 0.1)', color: 'var(--rose)', border: '1px solid rgba(239, 68, 68, 0.25)', fontSize: '0.85rem', display: 'flex', alignItems: 'flex-start', gap: '0.4rem' }}>
          <AlertCircle size={15} style={{ flexShrink: 0, marginTop: '2px' }} />
          <span>{error}</span>
        </div>
      )}

      {!report ? (
        <form onSubmit={handleUpload}>
          <div className="form-group">
            <label className="form-label" htmlFor="fileUploadInput">Select File to Import</label>
            <div style={{
              border: '2px dashed var(--border-subtle)',
              borderRadius: 'var(--radius-md)',
              padding: '2rem',
              textAlign: 'center',
              background: 'var(--bg-elevated)',
              cursor: 'pointer',
              transition: 'border-color 0.15s ease',
            }}>
              <input
                type="file"
                id="fileUploadInput"
                onChange={handleFileChange}
                style={{ display: 'none' }}
                accept=".csv,.jsonl,.json,.txt,.tsv,.jpg,.jpeg,.png,.webp,.zip"
                disabled={uploading}
              />
              <label htmlFor="fileUploadInput" style={{ cursor: 'pointer', display: 'block' }}>
                <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '0.5rem' }}>
                  <UploadCloud size={36} style={{ color: 'var(--accent-interactive)' }} />
                </div>
                <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: '0.25rem' }}>
                  {file ? file.name : 'Choose a file'}
                </div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  CSV, JSONL, JSON array, TXT, JPEG/PNG/WebP, or multimodal ZIP
                </div>
                {file && (
                  <div style={{ marginTop: '0.5rem', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                    {(file.size / 1024).toFixed(1)} KB
                  </div>
                )}
              </label>
            </div>
            <div style={{ marginTop: '0.65rem', fontSize: '0.75rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
              <strong>Text formats:</strong> CSV rows use column aliases such as{' '}
              <code>text|sentence|content|prompt|input|question|document</code> for the input text and{' '}
              <code>label|category|class|intent|target|sentiment</code> for the proposed label. JSONL / JSON-array
              records use the same field names. A <code>.txt</code> file imports one record per non-empty line.
              Labels outside the dataset label schema, blank text and invalid split values are rejected per row with
              a row number and reason; accepted rows are imported.
            </div>
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="splitSelect">Target Split (used when a row has no split column)</label>
            <CustomSelect
              id="splitSelect"
              value={split}
              onChange={(val) => setSplit(val)}
              disabled={uploading}
              options={[
                { value: 'train', label: 'Train' },
                { value: 'val', label: 'Validation' },
                { value: 'test', label: 'Test' },
                { value: 'unassigned', label: 'Unassigned' },
              ]}
              style={{ width: '100%' }}
              ariaLabel="Select target split"
            />
          </div>

          {uploading && (
            <div style={{ marginTop: '1.25rem' }}>
              <PerceptualProgressBar active={uploading} taskType="ingest" />
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.5rem' }}>
            <SpringButton type="button" variant="secondary" onClick={resetAndClose} disabled={uploading}>
              Cancel
            </SpringButton>
            <SpringButton type="submit" variant="primary" disabled={uploading || !file}>
              {uploading ? 'Importing...' : 'Start Import'}
            </SpringButton>
          </div>
        </form>
      ) : (
        <div>
          <div style={{ textAlign: 'center', margin: '0.5rem 0 1.25rem 0' }}>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '0.5rem' }}>
              <CheckCircle2 size={36} style={{ color: 'var(--emerald)' }} />
            </div>
            <h3 style={{ fontSize: '1.15rem', fontWeight: 700 }}>Import run finished</h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.82rem', marginTop: '0.2rem' }}>
              {totalProcessed !== null ? `${totalProcessed} row(s) processed` : 'Row count not reported by this API version'}
              {report.run_id ? (
                <>
                  {' · '}Run ID: <code style={{ fontFamily: 'var(--font-mono)' }}>{report.run_id}</code>
                </>
              ) : null}
            </p>
          </div>

          {/* Accepted / duplicate / rejected breakdown */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.75rem', marginBottom: '1.25rem' }}>
            <div className="stat-card" style={{ borderColor: 'rgba(16, 185, 129, 0.3)' }}>
              <span className="stat-value" style={{ color: 'var(--emerald)' }}>{accepted}</span>
              <span className="stat-label">Accepted records</span>
            </div>
            <div className="stat-card" style={{ borderColor: 'rgba(245, 158, 11, 0.3)' }}>
              <span className="stat-value" style={{ color: 'var(--amber)' }}>{duplicateCount}</span>
              <span className="stat-label">Skipped duplicates</span>
            </div>
            <div className="stat-card" style={{ borderColor: 'rgba(239, 68, 68, 0.3)' }}>
              <span className="stat-value" style={{ color: 'var(--rose)' }}>{rejectedCount}</span>
              <span className="stat-label">Rejected rows</span>
            </div>
          </div>

          {/* Row-level rejections */}
          <div style={{ marginBottom: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontWeight: 700, fontSize: '0.85rem', color: rejectedCount > 0 ? 'var(--rose)' : 'var(--text-secondary)', marginBottom: '0.4rem' }}>
              <AlertTriangle size={14} /> Rejected rows ({rejectedCount})
            </div>
            {rejectedItems.length === 0 ? (
              <div style={{ padding: '0.6rem 0.75rem', background: 'var(--bg-elevated)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-hairline)', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                {rejectedCount > 0
                  ? 'The server reported rejected rows but did not include row-level detail in this response.'
                  : 'No rows were rejected.'}
              </div>
            ) : (
              <div style={{ maxHeight: '220px', overflowY: 'auto', border: '1px solid var(--border-hairline)', borderRadius: 'var(--radius-sm)' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem', textAlign: 'left' }}>
                  <thead>
                    <tr style={{ background: 'var(--bg-elevated)', color: 'var(--text-secondary)' }}>
                      <th style={{ padding: '0.45rem 0.6rem', width: '90px' }}>Row</th>
                      <th style={{ padding: '0.45rem 0.6rem' }}>Filename</th>
                      <th style={{ padding: '0.45rem 0.6rem' }}>Reason</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rejectedItems.map((item, idx) => {
                      const row = rowLabel(item);
                      return (
                        <tr key={idx} style={{ borderTop: '1px solid var(--border-hairline)' }}>
                          <td style={{ padding: '0.4rem 0.6rem', fontFamily: 'var(--font-mono)', color: row ? 'var(--text-primary)' : 'var(--text-muted)' }}>
                            {row ?? 'not reported'}
                          </td>
                          <td style={{ padding: '0.4rem 0.6rem', fontFamily: 'var(--font-mono)', wordBreak: 'break-all' }}>
                            {item.filename ?? '—'}
                          </td>
                          <td style={{ padding: '0.4rem 0.6rem', color: 'var(--text-secondary)', wordBreak: 'break-word' }}>
                            {item.reason ?? item.message ?? 'No reason reported'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Duplicates */}
          <div style={{ marginBottom: '1rem' }}>
            <div style={{ fontWeight: 700, fontSize: '0.85rem', color: duplicateCount > 0 ? 'var(--amber)' : 'var(--text-secondary)', marginBottom: '0.4rem' }}>
              Duplicate content skipped ({duplicateCount})
            </div>
            {duplicates.length === 0 ? (
              <div style={{ padding: '0.6rem 0.75rem', background: 'var(--bg-elevated)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-hairline)', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                {duplicateCount > 0
                  ? 'The server reported duplicates but did not include per-file detail in this response.'
                  : 'No duplicate content detected.'}
              </div>
            ) : (
              <ul style={{ margin: 0, paddingLeft: '1.1rem', fontSize: '0.78rem', color: 'var(--text-secondary)', maxHeight: '160px', overflowY: 'auto' }}>
                {duplicates.map((dup, idx) => {
                  const row = rowLabel(dup);
                  return (
                    <li key={idx} style={{ marginBottom: '0.2rem', wordBreak: 'break-word' }}>
                      <code style={{ fontFamily: 'var(--font-mono)' }}>{dup.filename ?? 'unnamed file'}</code>
                      {row ? ` (row ${row})` : ''}
                      {dup.existing_asset_id ? ` — identical to existing asset ${dup.existing_asset_id}` : ''}
                      {dup.sha256 ? ` — sha256 ${String(dup.sha256).slice(0, 12)}…` : ''}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', marginTop: '1.25rem', flexWrap: 'wrap' }}>
            <button className="btn btn-secondary" onClick={startAnotherImport} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
              <RotateCcw size={14} /> Import another file
            </button>
            <button className="btn btn-primary" onClick={resetAndClose}>
              Done
            </button>
          </div>
        </div>
      )}
    </ModalShell>
  );
};

export default ImportModal;
