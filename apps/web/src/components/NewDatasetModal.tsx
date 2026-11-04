import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Database, Sparkles } from 'lucide-react';
import { ModalShell } from './ui/ModalShell';
import { SpringButton } from './ui/SpringButton';
import {
  createDataset,
  createProject,
  fetchDatasetTypes,
  fetchProjects,
} from '../api';
import type { DatasetTypeInfo } from '../types';

interface NewDatasetModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Text/image types with generation go straight to the wizard. */
  onUseWizard: (datasetTypeId: string) => void;
  /** Beta types without guided generation create a dataset and open it. */
  onOpenDataset: (datasetId: string) => void;
}

const STATUS_STYLES: Record<string, { label: string; className: string; hint: string }> = {
  available: { label: 'Available', className: 'badge badge-emerald', hint: 'Works today end to end.' },
  beta: { label: 'Beta', className: 'badge badge-amber', hint: 'Engine works; guided flow is incomplete.' },
  planned: { label: 'Planned', className: 'badge badge-neutral', hint: 'Roadmap only — not creatable yet.' },
};

const field: React.CSSProperties = {
  width: '100%',
  padding: '0.45rem 0.6rem',
  fontSize: '0.84rem',
  borderRadius: 'var(--radius-sm)',
  border: '1px solid var(--border-hairline)',
  backgroundColor: 'var(--bg-base)',
  color: 'var(--text-primary)',
};

/**
 * "New dataset" chooser: all dataset types with their real status.
 *
 * Available types with generation open the wizard; beta types create a dataset and open it so the
 * user can import/annotate; planned types are disabled with an honest "coming soon" label.
 */
export const NewDatasetModal: React.FC<NewDatasetModalProps> = ({
  isOpen,
  onClose,
  onUseWizard,
  onOpenDataset,
}) => {
  const [types, setTypes] = useState<DatasetTypeInfo[]>([]);
  const [selected, setSelected] = useState<DatasetTypeInfo | null>(null);
  const [name, setName] = useState('');
  const [classes, setClasses] = useState('Class A, Class B');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const rows = await fetchDatasetTypes();
      setTypes(rows);
    } catch (err: any) {
      setError(err?.message || 'Could not load dataset types');
    }
  }, []);

  useEffect(() => {
    if (!isOpen) {
      setSelected(null);
      setName('');
      setClasses('Class A, Class B');
      setError(null);
      return;
    }
    void load();
  }, [isOpen, load]);

  const groups = useMemo(() => {
    const available = types.filter((row) => row.status === 'available');
    const beta = types.filter((row) => row.status === 'beta');
    const planned = types.filter((row) => row.status === 'planned');
    return { available, beta, planned };
  }, [types]);

  const pick = (row: DatasetTypeInfo) => {
    if (row.status === 'planned') return;
    setSelected(row);
    setName('');
    setClasses(row.id === 'object_detection' ? 'object' : 'Class A, Class B');
    setError(null);
  };

  const createAndOpen = async () => {
    if (!selected) return;
    setBusy(true);
    setError(null);
    try {
      const projects = await fetchProjects();
      const project = projects.find((row) => row.name === 'Scratch')
        ?? projects[0]
        ?? await createProject({ name: 'Scratch' });
      const labels = classes.split(',').map((value) => value.trim()).filter(Boolean);
      const dataset = await createDataset(project.id, {
        name: name.trim() || `${selected.label} dataset`,
        task_type: selected.task_type as any,
        label_schema: { labels },
      } as any);
      onOpenDataset(dataset.id);
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Could not create the dataset');
    } finally {
      setBusy(false);
    }
  };

  const status = (row: DatasetTypeInfo) => STATUS_STYLES[row.status] ?? STATUS_STYLES.planned;

  const renderType = (row: DatasetTypeInfo) => {
    const style = status(row);
    const disabled = row.status === 'planned';
    return (
      <button
        key={row.id}
        type="button"
        disabled={disabled}
        onClick={() => pick(row)}
        title={style.hint}
        style={{
          textAlign: 'left',
          padding: '0.6rem 0.7rem',
          borderRadius: 'var(--radius-md)',
          border: `1px solid ${selected?.id === row.id ? 'var(--accent-primary)' : 'var(--border-hairline)'}`,
          backgroundColor: 'var(--bg-surface)',
          color: 'inherit',
          cursor: disabled ? 'not-allowed' : 'pointer',
          opacity: disabled ? 0.55 : 1,
          display: 'flex',
          flexDirection: 'column',
          gap: '0.25rem',
        }}
      >
        <span style={{ display: 'flex', justifyContent: 'space-between', gap: '0.4rem', alignItems: 'center' }}>
          <strong style={{ fontSize: '0.85rem' }}>{row.label}</strong>
          <span className={style.className} style={{ textTransform: 'none' }}>{style.label}</span>
        </span>
        <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)', lineHeight: 1.4 }}>{row.description}</span>
      </button>
    );
  };

  return (
    <ModalShell
      isOpen={isOpen}
      onClose={onClose}
      size="lg"
      icon={<Database size={20} strokeWidth={1.75} />}
      title="New dataset"
      description="Pick the kind of data you have. Availability is real: only Available and Beta types can be created today."
      footer={
        <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center', width: '100%' }}>
          <div style={{ flex: 1 }} />
          <SpringButton variant="secondary" size="sm" onClick={onClose}>Close</SpringButton>
          {selected && selected.status !== 'planned' && (
            selected.can_generate ? (
              <SpringButton
                variant="primary"
                size="sm"
                onClick={() => { onUseWizard(selected.id); onClose(); }}
                icon={<Sparkles size={14} />}
              >
                Continue to wizard
              </SpringButton>
            ) : (
              <SpringButton variant="primary" size="sm" onClick={createAndOpen} disabled={busy}>
                {busy ? 'Creating…' : 'Create dataset'}
              </SpringButton>
            )
          )}
        </div>
      }
    >
      {error && (
        <div className="card" style={{ borderColor: 'var(--rose)', padding: '0.7rem 0.85rem', marginBottom: '0.9rem' }}>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start' }}>
            <AlertTriangle size={16} strokeWidth={1.9} style={{ color: 'var(--rose)', marginTop: 2 }} />
            <div style={{ fontSize: '0.82rem' }}>{error}</div>
          </div>
        </div>
      )}

      {types.length === 0 && !error && (
        <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>Loading dataset types…</div>
      )}

      {groups.available.length > 0 && (
        <section style={{ marginBottom: '1rem' }}>
          <h3 style={{ fontSize: '0.85rem', margin: '0 0 0.45rem' }}>
            <CheckCircle2 size={13} strokeWidth={2} style={{ verticalAlign: '-2px', marginRight: 4 }} />
            Available now
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: '0.5rem' }}>
            {groups.available.map(renderType)}
          </div>
        </section>
      )}

      {groups.beta.length > 0 && (
        <section style={{ marginBottom: '1rem' }}>
          <h3 style={{ fontSize: '0.85rem', margin: '0 0 0.45rem' }}>Beta — engine works, guided flow partial</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: '0.5rem' }}>
            {groups.beta.map(renderType)}
          </div>
        </section>
      )}

      {groups.planned.length > 0 && (
        <section style={{ marginBottom: '1rem' }}>
          <h3 style={{ fontSize: '0.85rem', margin: '0 0 0.45rem' }}>Planned — coming later</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '0.45rem' }}>
            {groups.planned.map(renderType)}
          </div>
        </section>
      )}

      {selected && (
        <div className="card" style={{ padding: '0.75rem 0.9rem' }}>
          <div style={{ fontSize: '0.82rem', fontWeight: 600, marginBottom: '0.4rem' }}>
            {selected.label}
            {selected.can_generate ? ' — continue to the wizard to generate examples' : ' — create an empty dataset, then import data'}
          </div>
          <div style={{ display: 'grid', gap: '0.5rem', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
            <label style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
              Dataset name
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder={`${selected.label} dataset`}
                style={{ ...field, marginTop: '0.2rem' }}
              />
            </label>
            <label style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
              Classes / labels (comma separated)
              <input
                value={classes}
                onChange={(event) => setClasses(event.target.value)}
                style={{ ...field, marginTop: '0.2rem' }}
              />
            </label>
          </div>
          {selected.import_hint && (
            <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginTop: '0.4rem' }}>
              Import: {selected.import_hint}
            </div>
          )}
        </div>
      )}
    </ModalShell>
  );
};
