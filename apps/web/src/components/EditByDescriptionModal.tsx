import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, History, Pencil, Undo2 } from 'lucide-react';
import { ModalShell } from './ui/ModalShell';
import { SpringButton } from './ui/SpringButton';
import {
  applyDatasetEdit,
  fetchDatasetEdits,
  fetchProviders,
  previewDatasetEdit,
  undoDatasetEdit,
} from '../api';

interface EditByDescriptionModalProps {
  isOpen: boolean;
  onClose: () => void;
  datasetId: string;
  onApplied?: () => void;
}

const SUGGESTIONS = [
  'add 50 more examples',
  'shorten examples to 10 words',
  'remove examples labelled billing',
  'rename label billing to invoices',
];

const input: React.CSSProperties = {
  width: '100%',
  padding: '0.5rem 0.65rem',
  fontSize: '0.86rem',
  borderRadius: 'var(--radius-sm)',
  border: '1px solid var(--border-hairline)',
  backgroundColor: 'var(--bg-base)',
  color: 'var(--text-primary)',
};

const cell: React.CSSProperties = {
  padding: '0.35rem 0.5rem',
  borderBottom: '1px solid var(--border-hairline)',
  fontSize: '0.78rem',
  textAlign: 'left',
};

/**
 * Natural-language dataset editing.
 *
 * The instruction is turned into explicit operations with real counts, shown *before* anything is
 * applied. Applying records a reversible change set; the history panel can undo it. Instructions that
 * cannot be mapped to a supported operation are reported as such — never half-applied.
 */
export const EditByDescriptionModal: React.FC<EditByDescriptionModalProps> = ({
  isOpen,
  onClose,
  datasetId,
  onApplied,
}) => {
  const [instruction, setInstruction] = useState('');
  const [preview, setPreview] = useState<any | null>(null);
  const [result, setResult] = useState<any | null>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadHistory = useCallback(async () => {
    try {
      setHistory(await fetchDatasetEdits(datasetId));
    } catch {
      setHistory([]);
    }
  }, [datasetId]);

  useEffect(() => {
    if (!isOpen) {
      setInstruction('');
      setPreview(null);
      setResult(null);
      setError(null);
      return;
    }
    void loadHistory();
  }, [isOpen, loadHistory]);

  const handlePreview = async () => {
    if (instruction.trim().length < 3) {
      setError('Describe the change you want (for example: “shorten examples to 10 words”).');
      return;
    }
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      setPreview(await previewDatasetEdit(datasetId, instruction.trim()));
    } catch (err: any) {
      setError(err?.message || 'Could not preview that change');
    } finally {
      setBusy(false);
    }
  };

  const handleApply = async () => {
    if (!preview) return;
    setBusy(true);
    setError(null);
    try {
      let provider: string | undefined;
      let model: string | undefined;
      let verifierProviders: Array<{ provider: string; model: string }> = [];
      if ((preview.operations || []).some((operation: any) => operation.kind === 'add_examples')) {
        const providers = await fetchProviders();
        const rank = (row: any) => {
          const name = String(row?.name || '');
          if (name.startsWith('sim-')) return 0;
          if (name === 'fake') return 1;
          if (name === 'ollama') return 2;
          return 3;
        };
        const ordered = [...(providers || [])].sort((a: any, b: any) => rank(a) - rank(b));
        const generator = ordered.find((row: any) =>
          Array.isArray(row?.capabilities) && row.capabilities.includes('text_generation'));
        if (generator) {
          provider = generator.name;
          model = generator.models[0];
          verifierProviders = ordered
            .filter((row: any) => Array.isArray(row?.capabilities)
              && row.capabilities.includes('text_classification') && row.name !== generator.name)
            .slice(0, 2)
            .map((row: any) => ({ provider: row.name, model: row.models[0] }));
        }
      }
      const applied = await applyDatasetEdit(datasetId, {
        instruction: instruction.trim(),
        confirm: true,
        provider,
        model,
        verifier_providers: verifierProviders,
      });
      if (applied?.error) throw new Error(applied.error.message || 'Could not apply that change');
      setResult(applied);
      setPreview(null);
      await loadHistory();
      if (onApplied) onApplied();
    } catch (err: any) {
      setError(err?.message || 'Could not apply that change');
    } finally {
      setBusy(false);
    }
  };

  const handleUndo = async (changeSetId: string) => {
    setBusy(true);
    setError(null);
    try {
      const undone = await undoDatasetEdit(datasetId, changeSetId);
      setResult(null);
      await loadHistory();
      if (onApplied) onApplied();
      setError(null);
      return undone;
    } catch (err: any) {
      setError(err?.message || 'Could not undo that change');
    } finally {
      setBusy(false);
    }
  };

  const operations: any[] = preview?.operations ?? [];
  const applies = Boolean(preview?.applies_changes);

  return (
    <ModalShell
      isOpen={isOpen}
      onClose={onClose}
      size="lg"
      icon={<Pencil size={20} strokeWidth={1.75} />}
      title="Edit by description"
      description="Describe the change in plain words. You always see exactly what will change before it is applied."
      footer={
        <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center', width: '100%' }}>
          <div style={{ flex: 1 }} />
          <SpringButton variant="secondary" size="sm" onClick={onClose}>
            Close
          </SpringButton>
          <SpringButton
            variant="secondary"
            size="sm"
            onClick={handlePreview}
            disabled={busy}
          >
            {busy ? 'Checking…' : 'Preview change'}
          </SpringButton>
          <SpringButton
            variant="primary"
            size="sm"
            onClick={handleApply}
            disabled={busy || !applies}
          >
            Apply
          </SpringButton>
        </div>
      }
    >
      {error && (
        <div className="card" style={{ borderColor: 'var(--rose)', padding: '0.7rem 0.85rem', marginBottom: '0.9rem' }}>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start' }}>
            <AlertTriangle size={16} strokeWidth={1.9} style={{ color: 'var(--rose)', flexShrink: 0, marginTop: 2 }} />
            <div style={{ fontSize: '0.82rem' }}>{error}</div>
          </div>
        </div>
      )}

      <textarea
        value={instruction}
        onChange={(event) => setInstruction(event.target.value)}
        rows={3}
        placeholder="e.g. shorten examples to 12 words and rename billing to invoices"
        style={{ ...input, resize: 'vertical', lineHeight: 1.5 }}
      />
      <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap', margin: '0.45rem 0 0.9rem' }}>
        {SUGGESTIONS.map((suggestion) => (
          <button
            key={suggestion}
            type="button"
            onClick={() => setInstruction(suggestion)}
            style={{
              fontSize: '0.74rem',
              padding: '0.2rem 0.5rem',
              borderRadius: 'var(--radius-sm)',
              border: '1px dashed var(--border-hairline)',
              backgroundColor: 'transparent',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
            }}
          >
            {suggestion}
          </button>
        ))}
      </div>

      {preview && (
        <section className="card" style={{ padding: '0.75rem 0.9rem', marginBottom: '0.9rem' }}>
          <div style={{ fontSize: '0.82rem', fontWeight: 600, marginBottom: '0.35rem' }}>
            {applies ? 'This will change:' : 'Nothing can be applied yet'}
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <tbody>
              {operations.map((operation, index) => (
                <tr key={`${operation.kind}-${index}`}>
                  <td style={cell}>
                    {operation.supported ? '✓' : '—'}
                  </td>
                  <td style={cell}>{operation.description}</td>
                  <td style={{ ...cell, textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
                    {operation.count > 0 ? operation.count : ''}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {(preview.warnings || []).map((warning: string) => (
            <div key={warning} style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.3rem' }}>
              {warning}
            </div>
          ))}
          {(preview.notes || []).map((note: string) => (
            <div key={note} style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
              {note}
            </div>
          ))}
          <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginTop: '0.35rem' }}>
            {preview.reversible
              ? 'Reversible: previous state is stored and can be undone from the history below.'
              : 'Adding examples starts a generation job; generated rows arrive as pending review.'}
          </div>
        </section>
      )}

      {result && (
        <section className="card" style={{ padding: '0.75rem 0.9rem', marginBottom: '0.9rem', borderColor: 'var(--emerald)' }}>
          <div style={{ fontSize: '0.82rem', fontWeight: 600, marginBottom: '0.2rem' }}>Applied</div>
          {Object.entries(result.counts || {}).map(([kind, count]) => (
            <div key={kind} style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
              {kind.replace(/_/g, ' ')}: {String(count)}
            </div>
          ))}
          {result.job_id && (
            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
              Generation started — live progress appears on Home.
            </div>
          )}
        </section>
      )}

      <section>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.4rem' }}>
          <History size={14} strokeWidth={1.9} />
          <strong style={{ fontSize: '0.84rem' }}>Change history</strong>
        </div>
        {history.length === 0 && (
          <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>No changes yet.</div>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
          {history.map((entry) => (
            <div
              key={entry.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.6rem',
                fontSize: '0.78rem',
                padding: '0.35rem 0.5rem',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border-hairline)',
              }}
            >
              <span style={{ flex: 1, color: 'var(--text-secondary)' }}>“{entry.instruction}”</span>
              <span className="badge badge-neutral" style={{ textTransform: 'none' }}>{entry.status}</span>
              {entry.undoable && (
                <button
                  type="button"
                  onClick={() => void handleUndo(entry.id)}
                  disabled={busy}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.25rem',
                    fontSize: '0.74rem',
                    padding: '0.15rem 0.4rem',
                    borderRadius: '4px',
                    border: '1px solid var(--border-hairline)',
                    backgroundColor: 'transparent',
                    color: 'var(--text-primary)',
                    cursor: 'pointer',
                  }}
                >
                  <Undo2 size={12} strokeWidth={2} /> Undo
                </button>
              )}
            </div>
          ))}
        </div>
      </section>
    </ModalShell>
  );
};
