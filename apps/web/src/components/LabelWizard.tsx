import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle, CheckCircle2, FileUp, FolderOpen, Keyboard, Tags, Upload,
} from 'lucide-react';
import { ModalShell } from './ui/ModalShell';
import { SpringButton } from './ui/SpringButton';
import {
  analyzeGenerationSample,
  cancelGenerationJob,
  createAnnotation,
  createDataset,
  createProject,
  fetchDatasetDetail,
  fetchDatasetQueue,
  fetchDatasets,
  fetchGenerationJob,
  fetchProviders,
  fetchProjects,
  importDatasetFile,
  runDatasetValidation,
  startAutoLabel,
  transitionReviewStatus,
} from '../api';

interface LabelWizardProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenDataset?: (datasetId: string) => void;
  initialDatasetId?: string | null;
}

type Step = 'bring' | 'loading' | 'label' | 'done';

interface QueueItem {
  id: string;
  primary_asset?: { id: string; mime_type?: string } | null;
  metadata?: Record<string, any>;
  review_status?: string;
  split?: string;
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '0.45rem 0.6rem',
  fontSize: '0.85rem',
  borderRadius: 'var(--radius-sm)',
  border: '1px solid var(--border-hairline)',
  backgroundColor: 'var(--bg-base)',
  color: 'var(--text-primary)',
};

const KBD: React.CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: '0.7rem',
  padding: '0.05rem 0.3rem',
  borderRadius: '4px',
  border: '1px solid var(--border-hairline)',
  color: 'var(--text-muted)',
};

/**
 * Simple-Mode labeling path: bring data → confirm → label one item at a time (keyboard first) → done.
 *
 * The wizard intentionally shows ONE example at a time with numbered classes: that is the fastest
 * possible surface for a beginner. Advanced state (revisions, review machine, bulk actions) stays in
 * the full workbench, and nothing here bypasses it — each choice creates a real annotation and an
 * explicit review transition.
 */
export const LabelWizard: React.FC<LabelWizardProps> = ({
  isOpen,
  onClose,
  onOpenDataset,
  initialDatasetId,
}) => {
  const [step, setStep] = useState<Step>('bring');
  const [datasets, setDatasets] = useState<Array<{ id: string; name: string; project_id: string }>>([]);
  const [selectedDataset, setSelectedDataset] = useState<string | null>(initialDatasetId ?? null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [detected, setDetected] = useState<any | null>(null);
  const [datasetName, setDatasetName] = useState('');
  const [classes, setClasses] = useState<string[]>([]);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [index, setIndex] = useState(0);
  const [labelled, setLabelled] = useState(0);
  const [skipped, setSkipped] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [validation, setValidation] = useState<any | null>(null);
  const [autoJob, setAutoJob] = useState<any | null>(null);
  const [autoRunning, setAutoRunning] = useState(false);
  const [autoSummary, setAutoSummary] = useState<any | null>(null);
  const [autoError, setAutoError] = useState<string | null>(null);
  const [isImageMode, setIsImageMode] = useState(false);
  const [datasetTaskType, setDatasetTaskType] = useState('text_classification');
  const [datasetId, setDatasetId] = useState<string | null>(initialDatasetId ?? null);
  const busyRef = useRef(false);

  const reset = useCallback(() => {
    setStep(initialDatasetId ? 'loading' : 'bring');
    setPendingFile(null);
    setDetected(null);
    setFileName(null);
    setDatasetName('');
    setClasses([]);
    setQueue([]);
    setIndex(0);
    setLabelled(0);
    setSkipped(0);
    setError(null);
    setValidation(null);
    setDatasetId(initialDatasetId ?? null);
    setSelectedDataset(initialDatasetId ?? null);
  }, [initialDatasetId]);

  useEffect(() => {
    if (isOpen) reset();
  }, [isOpen, reset]);

  // Load the dataset list once the dialog opens (for "bring your own existing dataset").
  useEffect(() => {
    if (!isOpen) return;
    void (async () => {
      try {
        const projects = await fetchProjects();
        const collected: Array<{ id: string; name: string; project_id: string }> = [];
        for (const project of projects.slice(0, 8)) {
          const rows = await fetchDatasets(project.id);
          for (const row of rows) {
            if (row.task_type === 'text_classification') {
              collected.push({ id: row.id, name: row.name, project_id: project.id });
            }
          }
          if (collected.length >= 40) break;
        }
        setDatasets(collected);
      } catch {
        setDatasets([]);
      }
    })();
  }, [isOpen]);

  const current = useMemo(() => queue[index] ?? null, [queue, index]);
  const total = queue.length;
  const position = Math.min(index + 1, Math.max(total, 1));

  const loadQueue = useCallback(async (id: string) => {
    const detail = await fetchDatasetDetail(id);
    const labels: string[] =
      (detail?.dataset?.label_schema?.labels as string[] | undefined) ??
      (detail?.dataset?.label_schema?.classes as string[] | undefined) ??
      [];
    setClasses(labels);
    const taskType = String(detail?.dataset?.task_type || 'text_classification');
    setDatasetTaskType(taskType);
    setIsImageMode(taskType === 'image_classification');
    setDatasetName(detail?.dataset?.name ?? '');
    setDatasetId(id);

    const response = await fetchDatasetQueue(id, undefined, undefined, 200, 0);
    const items: QueueItem[] = (response?.items ?? []).filter(
      (item: QueueItem) => item.review_status !== 'approved',
    );
    setQueue(items);
    setIndex(0);
    setLabelled(0);
    setSkipped(0);
    setStep(items.length > 0 ? 'label' : 'done');
  }, []);

  // Hand-off from another screen with a dataset already chosen.
  useEffect(() => {
    if (!isOpen || !initialDatasetId) return;
    void (async () => {
      try {
        setStep('loading');
        await loadQueue(initialDatasetId);
      } catch (err: any) {
        setError(err?.message || 'Could not open that dataset');
        setStep('bring');
      }
    })();
  }, [isOpen, initialDatasetId, loadQueue]);

  const handleFileChosen = async (file: File) => {
    setBusy(true);
    setError(null);
    const baseName = file.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim();
    const isImageFile = /\.(png|jpe?g|webp|gif|bmp)$/i.test(file.name);
    try {
      if (isImageFile) {
        // Images are examples, not rows: create an image-classification dataset and let the user
        // name the classes (nothing can be inferred from pixels without a vision model).
        setPendingFile(file);
        setIsImageMode(true);
        setDetected({ modality: 'image', row_count: 0, notes: ['Image dataset — labels are applied per image.'] });
        setFileName(file.name);
        setClasses(['Class A', 'Class B']);
        setDatasetName(baseName ? `${baseName} (images)` : 'My image dataset');
        setStep('bring');
        return;
      }
      const analysis = await analyzeGenerationSample(file);
      const isImageArchive = analysis?.modality === 'archive' && (analysis?.row_count ?? 0) === 0;
      setPendingFile(file);
      setDetected(analysis);
      setFileName(file.name);
      if (isImageArchive) {
        setIsImageMode(true);
        setClasses(['Class A', 'Class B']);
        setDatasetName(baseName ? `${baseName} (images)` : 'My image dataset');
      } else {
        setIsImageMode(false);
        const labels: string[] = Array.isArray(analysis?.classes) && analysis.classes.length > 0
          ? analysis.classes
          : ['Class A', 'Class B'];
        setClasses(labels);
        setDatasetName(baseName ? `${baseName} (labelled)` : 'My labelled dataset');
      }
      setStep('bring');
    } catch (err: any) {
      setError(err?.message || 'Could not read that file');
    } finally {
      setBusy(false);
    }
  };

  const handleCreateAndImport = async () => {
    if (!pendingFile) {
      setError('Choose a file first.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const projects = await fetchProjects();
      const project =
        projects.find((row) => row.name === 'Scratch') ??
        (projects.length > 0 ? projects[0] : await createProject({ name: 'Scratch' }));

      const dataset = await createDataset(project.id, {
        name: datasetName || 'My labelled dataset',
        task_type: isImageMode ? 'image_classification' : 'text_classification',
        label_schema: { labels: classes },
      } as any);
      const imported = await importDatasetFile(dataset.id, pendingFile);
      if (imported?.accepted_count === 0) {
        throw new Error(
          `No rows were imported. ${imported?.rejected_items?.[0]?.reason ?? 'Check that the file has a text column.'}`,
        );
      }
      await loadQueue(dataset.id);
      setStep('label');
    } catch (err: any) {
      setError(err?.message || 'Could not import that file');
    } finally {
      setBusy(false);
    }
  };

  const labelCurrent = useCallback(
    async (label: string) => {
      if (!current || busyRef.current) return;
      busyRef.current = true;
      setBusy(true);
      setError(null);
      try {
        const annotation = await createAnnotation(current.id, { label });
        if (annotation?.id) {
          await transitionReviewStatus(annotation.id, 'approved', 'Simple-mode labeling');
        }
        setLabelled((count) => count + 1);
        setIndex((value) => value + 1);
      } catch (err: any) {
        setError(err?.message || 'Could not save that label');
      } finally {
        busyRef.current = false;
        setBusy(false);
      }
    },
    [current],
  );

  const skipCurrent = useCallback(() => {
    setSkipped((count) => count + 1);
    setIndex((value) => value + 1);
  }, []);

  // Keyboard-first: 1..9 choose a class, S skips.
  useEffect(() => {
    if (!isOpen || step !== 'label') return;
    const handler = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;
      const digit = Number(event.key);
      if (Number.isInteger(digit) && digit >= 1 && digit <= classes.length) {
        event.preventDefault();
        void labelCurrent(classes[digit - 1]);
        return;
      }
      if (event.key.toLowerCase() === 's') {
        event.preventDefault();
        skipCurrent();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, step, classes, labelCurrent, skipCurrent]);

  const finished = step === 'label' && index >= total;

  useEffect(() => {
    if (step === 'label' && index >= total && total > 0) setStep('done');
  }, [step, index, total]);

  const startAutonomousLabeling = async () => {
    if (!datasetId) return;
    setAutoRunning(true);
    setAutoError(null);
    setAutoSummary(null);
    try {
      const providers = await fetchProviders();
      const rank = (row: any) => {
        const name = String(row?.name || '');
        if (name.startsWith('sim-')) return 0;
        if (name === 'fake') return 1;
        if (name === 'ollama') return 2;
        return 3;
      };
      const neededCapability = datasetTaskType === 'image_classification'
        ? 'image_classification'
        : 'text_classification';
      const candidates = [...(providers || [])]
        .filter((row: any) => Array.isArray(row?.capabilities)
          && row.capabilities.includes(neededCapability))
        .sort((a: any, b: any) => rank(a) - rank(b))
        .slice(0, 3)
        .map((row: any) => ({ provider: row.name, model: row.models[0] }));
      if (candidates.length === 0) {
        throw new Error(
          `No ${neededCapability.replace('_', ' ')} model is available. Configure a provider key or enable simulated models.`,
        );
      }
      const created = await startAutoLabel(datasetId, {
        providers: candidates,
        auto_accept_confidence: 0.9,
        limit: Math.max(50, total),
      });
      if (created?.error) throw new Error(created.error.message || 'Could not start automatic labelling');
      setAutoJob(created);
      const poll = window.setInterval(async () => {
        try {
          const latest = await fetchGenerationJob(created.id);
          setAutoJob(latest);
          if (['completed', 'failed', 'cancelled', 'interrupted'].includes(latest.status)) {
            window.clearInterval(poll);
            setAutoRunning(false);
            if (latest.status === 'completed') {
              setAutoSummary(latest);
              await loadQueue(datasetId);
            } else {
              setAutoError(latest.error || 'Automatic labelling stopped before finishing.');
            }
          }
        } catch {
          window.clearInterval(poll);
          setAutoRunning(false);
          setAutoError('Lost contact with the automatic labelling job.');
        }
      }, 700);
    } catch (err: any) {
      setAutoRunning(false);
      setAutoError(err?.message || 'Could not start automatic labelling');
    }
  };

  const runValidation = async () => {
    if (!datasetId) return;
    setBusy(true);
    try {
      setValidation(await runDatasetValidation(datasetId));
    } catch (err: any) {
      setError(err?.message || 'Validation failed');
    } finally {
      setBusy(false);
    }
  };

  const chosenLabels = detected?.classes?.length ? detected.classes : classes;

  return (
    <ModalShell
      isOpen={isOpen}
      onClose={onClose}
      size="lg"
      icon={<Tags size={20} strokeWidth={1.75} />}
      title="Label my data"
      description={
        step === 'bring'
          ? 'Bring a text file, or pick a dataset you already have. You will label one example at a time.'
          : step === 'label'
            ? 'Press 1–9 to label, S to skip. One example at a time.'
            : step === 'done'
              ? 'Labeling session finished.'
              : 'Opening…'
      }
      footer={
        <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center', width: '100%' }}>
          {step === 'label' && (
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
              {Math.min(index + 1, total)} / {total}
            </span>
          )}
          <div style={{ flex: 1 }} />
          {step === 'bring' && selectedDataset && (
            <SpringButton
              variant="primary"
              size="sm"
              onClick={async () => {
                setBusy(true);
                try {
                  await loadQueue(selectedDataset);
                } catch (err: any) {
                  setError(err?.message || 'Could not open that dataset');
                } finally {
                  setBusy(false);
                }
              }}
              disabled={busy}
              icon={<FolderOpen size={14} />}
            >
              Open dataset
            </SpringButton>
          )}
          {step === 'bring' && pendingFile && (
            <SpringButton variant="primary" size="sm" onClick={handleCreateAndImport} disabled={busy}>
              {busy
                ? 'Importing…'
                : isImageMode
                  ? 'Import images and start'
                  : `Import ${detected?.row_count ?? ''} rows and start`}
            </SpringButton>
          )}
          {step === 'label' && (
            <SpringButton variant="secondary" size="sm" onClick={() => setStep('done')}>
              Finish
            </SpringButton>
          )}
          {step === 'done' && (
            <SpringButton variant="secondary" size="sm" onClick={onClose}>
              Close
            </SpringButton>
          )}
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

      {/* ------------------------------------------------------------ bring */}
      {step === 'bring' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.4rem' }}>
              1. Import a file
            </div>
            <label
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '0.35rem',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '1.2rem',
                borderRadius: 'var(--radius-md)',
                border: '1px dashed var(--border-hairline)',
                cursor: busy ? 'wait' : 'pointer',
                color: 'var(--text-secondary)',
              }}
            >
              <Upload size={20} strokeWidth={1.7} />
              <span style={{ fontSize: '0.85rem' }}>
                {busy
                  ? 'Reading…'
                  : fileName
                    ? fileName
                    : 'Drop or choose text (CSV / JSONL / TXT) or images (PNG / JPG / ZIP)'}
              </span>
              <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                Text columns are detected automatically; images are imported as examples. Nothing leaves your machine unless you use AI.
              </span>
              <input
                type="file"
                accept=".csv,.jsonl,.ndjson,.json,.txt,.png,.jpg,.jpeg,.webp,.gif,.zip,image/*"
                style={{ display: 'none' }}
                disabled={busy}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void handleFileChosen(file);
                }}
              />
            </label>

            {detected && (
              <div className="card" style={{ marginTop: '0.6rem', padding: '0.65rem 0.8rem', fontSize: '0.78rem' }}>
                <div style={{ fontWeight: 600, marginBottom: '0.25rem' }}>
                  {isImageMode ? 'Images selected' : `Detected ${detected.row_count} row(s)`}
                  {chosenLabels?.length ? ` · ${chosenLabels.length} classes` : ''}
                </div>
                {chosenLabels?.length > 0 && (
                  <div style={{ color: 'var(--text-muted)' }}>{chosenLabels.join(' · ')}</div>
                )}
                <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.5rem', flexWrap: 'wrap' }}>
                  <input
                    value={datasetName}
                    onChange={(event) => setDatasetName(event.target.value)}
                    placeholder="Dataset name"
                    style={{ ...inputStyle, maxWidth: '320px' }}
                  />
                </div>
                <div style={{ marginTop: '0.4rem' }}>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>
                    Classes (comma separated) — used for the numbering:
                  </div>
                  <input
                    value={classes.join(', ')}
                    onChange={(event) => setClasses(event.target.value.split(',').map((v) => v.trim()).filter(Boolean))}
                    style={inputStyle}
                  />
                </div>
              </div>
            )}
          </div>

          <div style={{ borderTop: '1px solid var(--border-hairline)', paddingTop: '0.9rem' }}>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.4rem' }}>
              2. …or continue an existing dataset
            </div>
            <select
              value={selectedDataset ?? ''}
              onChange={(event) => setSelectedDataset(event.target.value || null)}
              style={inputStyle}
            >
              <option value="">Select a text dataset…</option>
              {datasets.map((dataset) => (
                <option key={dataset.id} value={dataset.id}>{dataset.name}</option>
              ))}
            </select>
            {datasets.length === 0 && (
              <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginTop: '0.3rem' }}>
                No text datasets yet — import a file above to create your first one.
              </div>
            )}
          </div>
        </div>
      )}

      {step === 'loading' && (
        <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', padding: '1rem 0' }}>Opening dataset…</div>
      )}

      {step === 'label' && (
        <div className="card" style={{ padding: '0.7rem 0.85rem', marginBottom: '0.85rem' }}>
          <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap' }}>
            <div style={{ fontSize: '0.82rem', flex: '1 1 260px' }}>
              <strong>Let the models label these.</strong>{' '}
              High-agreement, high-confidence labels are approved automatically (marked as
              machine-labelled); the rest are left for you.
            </div>
            {!autoRunning && !autoSummary && (
              <SpringButton variant="primary" size="sm" onClick={startAutonomousLabeling}>
                Label automatically
              </SpringButton>
            )}
            {autoRunning && (
              <SpringButton
                variant="secondary"
                size="sm"
                onClick={() => { if (autoJob) { void cancelGenerationJob(autoJob.id); setAutoRunning(false); } }}
              >
                Stop
              </SpringButton>
            )}
            {autoSummary && (
              <span className="badge badge-emerald" style={{ textTransform: 'none' }}>
                {autoSummary.auto_approved} auto-labelled · {autoSummary.needs_review} need review
              </span>
            )}
          </div>
          {autoError && (
            <div style={{ fontSize: '0.78rem', color: 'var(--rose)', marginTop: '0.35rem' }}>{autoError}</div>
          )}
          {autoRunning && autoJob && (
            <div style={{ marginTop: '0.5rem' }}>
              <div style={{ height: '6px', borderRadius: '999px', backgroundColor: 'var(--bg-elevated)', overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${Math.round((autoJob.progress || 0) * 100)}%`, backgroundColor: 'var(--accent-primary)', transition: 'width 300ms ease' }} />
              </div>
              <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                {autoJob.processed_items}/{autoJob.total_items} checked
                {autoJob.eta_seconds !== null && autoJob.eta_seconds !== undefined
                  ? ` · about ${autoJob.eta_seconds}s left`
                  : ' · estimating…'}
              </div>
            </div>
          )}
          {autoSummary && (
            <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)', marginTop: '0.35rem' }}>
              {autoSummary.needs_review > 0
                ? `${autoSummary.needs_review} example(s) need your judgement — continue below.`
                : 'Everything was labelled automatically; nothing needs review.'}
            </div>
          )}
        </div>
      )}

      {/* ------------------------------------------------------------ label */}
      {step === 'label' && current && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
          <div
            className="card"
            style={{ padding: '1rem 1.1rem', fontSize: '0.95rem', lineHeight: 1.55, minHeight: '90px' }}
          >
            {current.primary_asset ? (
              <img
                src={`/api/v1/assets/${current.primary_asset.id}/raw`}
                alt="example"
                style={{ maxWidth: '100%', maxHeight: '320px', display: 'block', margin: '0 auto', borderRadius: 'var(--radius-sm)' }}
              />
            ) : (
              String((current.metadata || {}).text || '(this row has no text)')
            )}
          </div>
          {(current.metadata || {}).label && (
            <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>
              Imported label: <strong>{String((current.metadata || {}).label)}</strong> — press its number to confirm.
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            {classes.map((label, position_) => (
              <button
                key={label}
                type="button"
                onClick={() => void labelCurrent(label)}
                disabled={busy}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.6rem',
                  textAlign: 'left',
                  padding: '0.5rem 0.7rem',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--border-hairline)',
                  backgroundColor: 'var(--bg-base)',
                  color: 'var(--text-primary)',
                  cursor: 'pointer',
                  fontSize: '0.85rem',
                }}
              >
                <span style={KBD}>{position_ + 1}</span>
                {label}
              </button>
            ))}
          </div>

          <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center' }}>
            <SpringButton variant="ghost" size="sm" onClick={skipCurrent} disabled={busy}>
              Skip <span style={{ ...KBD, marginLeft: '0.35rem' }}>S</span>
            </SpringButton>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              <Keyboard size={12} strokeWidth={2} style={{ verticalAlign: '-2px' }} /> labelled {labelled}
              {skipped > 0 ? ` · skipped ${skipped}` : ''}
            </span>
            <div style={{ flex: 1 }} />
            <div style={{ height: '6px', width: '160px', borderRadius: '999px', backgroundColor: 'var(--bg-elevated)', overflow: 'hidden' }}>
              <div
                style={{
                  height: '100%',
                  width: `${Math.round((index / Math.max(total, 1)) * 100)}%`,
                  backgroundColor: 'var(--accent-primary)',
                  transition: 'width 200ms ease',
                }}
              />
            </div>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------ done */}
      {(step === 'done' || finished) && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
          <div className="card" style={{ padding: '0.85rem 1rem' }}>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start' }}>
              <CheckCircle2 size={17} strokeWidth={2} style={{ color: 'var(--emerald)', marginTop: 2 }} />
              <div style={{ fontSize: '0.86rem' }}>
                <div>
                  {autoSummary && (autoSummary.auto_approved ?? 0) > 0
                    ? `${autoSummary.auto_approved} example(s) were labelled automatically by the models.`
                    : labelled > 0
                      ? `Saved ${labelled} label${labelled === 1 ? '' : 's'}${skipped ? `, skipped ${skipped}` : ''}.`
                      : total === 0
                        ? 'Every example in this dataset already has an approved label.'
                        : 'No labels saved yet.'}
                </div>
                <div style={{ color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                  {autoSummary && (autoSummary.auto_approved ?? 0) > 0
                    ? `Auto-approved labels are recorded as machine-labelled (origin=ensemble/model), never as human work.${
                        (autoSummary.needs_review ?? 0) > 0
                          ? ` ${autoSummary.needs_review} example(s) still need your judgement.`
                          : ' Nothing was left for manual review.'
                      }`
                    : 'Each answer was saved as your own label and approved one at a time — nothing was approved in bulk.'}
                </div>
                {autoSummary && (autoSummary.needs_review ?? 0) === 0 && labelled === 0 && (
                  <div style={{ color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                    Reopen this dataset if you want to spot-check the machine labels in the full workbench.
                  </div>
                )}
              </div>
            </div>
          </div>

          {validation && (
            <div className="card" style={{ padding: '0.75rem 0.9rem', fontSize: '0.8rem' }}>
              <div style={{ fontWeight: 600, marginBottom: '0.25rem' }}>
                {validation.is_publishable ? 'Ready to export' : 'A few checks are still open'}
              </div>
              {(validation.findings || []).slice(0, 4).map((finding: any) => (
                <div key={finding.rule_id ?? finding.message} style={{ color: 'var(--text-muted)' }}>
                  {finding.message || finding.rule_id}
                </div>
              ))}
            </div>
          )}

          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <SpringButton variant="primary" size="sm" onClick={runValidation} disabled={busy || !datasetId}>
              {busy ? 'Checking…' : 'Check this dataset'}
            </SpringButton>
            <SpringButton
              variant="secondary"
              size="sm"
              onClick={() => {
                if (datasetId && onOpenDataset) onOpenDataset(datasetId);
                onClose();
              }}
              disabled={!datasetId}
            >
              Open dataset (export, versions)
            </SpringButton>
          </div>
        </div>
      )}
    </ModalShell>
  );
};
