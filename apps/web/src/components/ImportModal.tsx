import React, { useState } from 'react';
import { UploadCloud, CheckCircle2, X } from 'lucide-react';
import { SpringButton } from './ui/SpringButton';
import { PerceptualProgressBar } from './ui/PerceptualProgressBar';

interface ImportReport {
  run_id: string;
  dataset_id: string;
  total_processed: number;

  accepted_count: number;
  duplicate_count: number;
  rejected_count: number;
  duplicates: Array<{ filename: string; sha256: string; existing_asset_id: string }>;
  rejected_items: Array<{ filename: string; reason: string }>;
}

interface ImportModalProps {
  datasetId: string;
  isOpen: boolean;
  onClose: () => void;
  onImportComplete: () => void;
}

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
      setError('Please select a file to import.');
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
        let msg = `Upload failed (Status ${res.status})`;
        try {
          const data = await res.json();
          if (data.detail) msg = data.detail;
        } catch {}
        throw new Error(msg);
      }

      const rep: ImportReport = await res.json();
      setReport(rep);
      onImportComplete();
    } catch (err: any) {
      setError(err.message || 'File upload failed');
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

  return (
    <div className="modal-overlay" onClick={resetAndClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '620px' }}>
        <div className="modal-header">
          <h2 className="modal-title">Import Data & Media Assets</h2>
          <button className="modal-close" onClick={resetAndClose} aria-label="Close dialog" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <X size={18} />
          </button>
        </div>

        {error && (
          <div style={{ padding: '0.75rem', marginBottom: '1rem', borderRadius: 'var(--radius-sm)', background: 'rgba(239, 68, 68, 0.1)', color: 'var(--rose)', border: '1px solid rgba(239, 68, 68, 0.2)', fontSize: '0.85rem' }}>
            {error}
          </div>
        )}

        {!report ? (
          <form onSubmit={handleUpload}>
            <div className="form-group">
              <label className="form-label">Select File to Ingest</label>
              <div style={{
                border: '2px dashed var(--border-subtle)',
                borderRadius: 'var(--radius-md)',
                padding: '2rem',
                textAlign: 'center',
                background: 'rgba(15, 23, 42, 0.4)',
                cursor: 'pointer',
                transition: 'border-color 0.15s ease',
              }}>
                <input
                  type="file"
                  id="fileUploadInput"
                  onChange={handleFileChange}
                  style={{ display: 'none' }}
                  accept=".jpg,.jpeg,.png,.webp,.txt,.csv,.json,.jsonl,.zip"
                  disabled={uploading}
                />
                <label htmlFor="fileUploadInput" style={{ cursor: 'pointer', display: 'block' }}>
                  <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '0.5rem' }}>
                    <UploadCloud size={36} className="text-blue-500" />
                  </div>
                  <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: '0.25rem' }}>
                    {file ? file.name : 'Click or Drag file to upload'}
                  </div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                    Supported: JPEG, PNG, WebP, UTF-8 Text, CSV, JSON, JSONL, and multimodal ZIP
                  </div>
                  {file && (
                    <div style={{ marginTop: '0.5rem', fontSize: '0.8rem', color: 'var(--text-accent)' }}>
                      {(file.size / 1024).toFixed(1)} KB
                    </div>
                  )}
                </label>
              </div>
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="splitSelect">Target Split</label>
              <select
                id="splitSelect"
                className="form-select"
                value={split}
                onChange={(e) => setSplit(e.target.value)}
                disabled={uploading}
              >
                <option value="train">Train</option>
                <option value="val">Validation</option>
                <option value="test">Test</option>
                <option value="unassigned">Unassigned</option>
              </select>
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
                {uploading ? 'Processing Ingestion...' : 'Start Ingest'}
              </SpringButton>
            </div>
          </form>
        ) : (
          <div>
            <div style={{ textAlign: 'center', margin: '1rem 0 1.5rem 0' }}>
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '0.5rem' }}>
                <CheckCircle2 size={40} style={{ color: 'var(--emerald)' }} />
              </div>
              <h3 style={{ fontSize: '1.2rem', fontWeight: 700 }}>Ingestion Completed</h3>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                Run ID: <code style={{ fontFamily: 'var(--font-mono)' }}>{report.run_id}</code>
              </p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.75rem', marginBottom: '1.5rem' }}>
              <div className="stat-card" style={{ borderColor: 'rgba(16, 185, 129, 0.3)' }}>
                <span className="stat-value" style={{ color: 'var(--emerald)' }}>{report.accepted_count}</span>
                <span className="stat-label">Accepted</span>
              </div>
              <div className="stat-card" style={{ borderColor: 'rgba(245, 158, 11, 0.3)' }}>
                <span className="stat-value" style={{ color: 'var(--amber)' }}>{report.duplicate_count}</span>
                <span className="stat-label">Duplicates</span>
              </div>
              <div className="stat-card" style={{ borderColor: 'rgba(239, 68, 68, 0.3)' }}>
                <span className="stat-value" style={{ color: 'var(--rose)' }}>{report.rejected_count}</span>
                <span className="stat-label">Rejected</span>
              </div>
            </div>

            {report.duplicates.length > 0 && (
              <div style={{ marginBottom: '1rem', padding: '0.75rem', background: 'rgba(245, 158, 11, 0.08)', borderRadius: 'var(--radius-sm)', border: '1px solid rgba(245, 158, 11, 0.2)' }}>
                <div style={{ fontWeight: 600, fontSize: '0.85rem', color: 'var(--amber)', marginBottom: '0.25rem' }}>
                  Exact SHA-256 Duplicates Detected ({report.duplicates.length}):
                </div>
                {report.duplicates.map((dup, i) => (
                  <div key={i} style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                    • {dup.filename} (matching asset {dup.existing_asset_id})
                  </div>
                ))}
              </div>
            )}

            {report.rejected_items.length > 0 && (
              <div style={{ marginBottom: '1rem', padding: '0.75rem', background: 'rgba(239, 68, 68, 0.08)', borderRadius: 'var(--radius-sm)', border: '1px solid rgba(239, 68, 68, 0.2)' }}>
                <div style={{ fontWeight: 600, fontSize: '0.85rem', color: 'var(--rose)', marginBottom: '0.25rem' }}>
                  Rejected Items ({report.rejected_items.length}):
                </div>
                {report.rejected_items.map((rej, i) => (
                  <div key={i} style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                    • {rej.filename}: {rej.reason}
                  </div>
                ))}
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1.5rem' }}>
              <button className="btn btn-primary" onClick={resetAndClose}>
                Done
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
