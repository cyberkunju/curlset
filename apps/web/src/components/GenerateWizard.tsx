import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, Clock, Sparkles, Square, Upload, Wand2 } from 'lucide-react';
import { ModalShell } from './ui/ModalShell';
import { SpringButton } from './ui/SpringButton';
import {
  analyzeGenerationSample,
  createDataset,
  createProject,
  fetchDatasetQueue,
  fetchDatasetTypes,
  fetchProjects,
  generateImages,
  cancelGenerationJob,
  createGenerationJob,
  draftGenerationPlan,
  fetchGenerationJob,
  fetchProviders,
} from '../api';
import type { GenerationJob, GenerationPlan } from '../types';

interface GenerateWizardProps {
  isOpen: boolean;
  onClose: () => void;
  projectId?: string | null;
  onOpenDataset?: (datasetId: string) => void;
  onStartLabeling?: (datasetId: string) => void;
  initialPrompt?: string;
  /** Catalogue dataset-type id (e.g. 'image', 'object_detection', 'audio') chosen before opening. */
  initialDatasetType?: string;
}

type Step = 'describe' | 'confirm' | 'running' | 'done';

const SHORT_EXAMPLES = [
  'A dataset for identifying whether an English sentence uses “these” correctly — about 200 examples, beginner level.',
  'Support tickets labelled by intent: billing, technical support, feature request — 300 examples.',
  'Product reviews with sentiment: positive, negative, neutral — 150 examples.',
];

const chip = (active: boolean): React.CSSProperties => ({
  fontSize: '0.78rem',
  padding: '0.25rem 0.6rem',
  borderRadius: 'var(--radius-sm)',
  cursor: 'pointer',
  border: `1px solid ${active ? 'var(--accent-primary)' : 'var(--border-hairline)'}`,
  backgroundColor: active ? 'color-mix(in srgb, var(--accent-primary) 14%, transparent)' : 'var(--bg-base)',
  color: 'var(--text-primary)',
});

const input: React.CSSProperties = {
  width: '100%',
  padding: '0.5rem 0.65rem',
  fontSize: '0.85rem',
  borderRadius: 'var(--radius-sm)',
  border: '1px solid var(--border-hairline)',
  backgroundColor: 'var(--bg-base)',
  color: 'var(--text-primary)',
};

const fmtTime = (seconds: number | null): string => {
  if (seconds === null || seconds === undefined) return 'estimating…';
  if (seconds < 1) return 'a moment';
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const minutes = Math.floor(seconds / 60);
  const rest = Math.round(seconds % 60);
  return `${minutes}m ${rest}s`;
};

/**
 * Simple-Mode generation wizard: describe → confirm a few plain questions → live progress → done.
 *
 * Deliberately minimal: one text box, at most three questions with sensible defaults, and a progress
 * bar whose ETA comes from measured throughput (never a hard-coded promise).
 */
export const GenerateWizard: React.FC<GenerateWizardProps> = ({
  isOpen,
  onClose,
  projectId,
  onOpenDataset,
  onStartLabeling,
  initialPrompt,
  initialDatasetType,
}) => {
  const [step, setStep] = useState<Step>('describe');
  const [prompt, setPrompt] = useState(initialPrompt ?? '');
  const [plan, setPlan] = useState<GenerationPlan | null>(null);
  const [classes, setClasses] = useState<string[]>([]);
  const [classDraft, setClassDraft] = useState('');
  const [difficulty, setDifficulty] = useState('mixed');
  const [total, setTotal] = useState(200);
  const [job, setJob] = useState<GenerationJob | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [advanced, setAdvanced] = useState(false);
  const [customCount, setCustomCount] = useState(false);
  const [analysis, setAnalysis] = useState<any | null>(null);
  const [uploading, setUploading] = useState(false);
  const [sampleName, setSampleName] = useState<string | null>(null);
  const [options, setOptions] = useState<any[]>([]);
  const [selProvider, setSelProvider] = useState('');
  const [selModel, setSelModel] = useState('');
  const [maxClassShare, setMaxClassShare] = useState(0.6);
  const [minPreservation, setMinPreservation] = useState(0.85);
  const [targetSplit, setTargetSplit] = useState('train');
  const [imageQuality, setImageQuality] = useState('low');
  const [imageStyle, setImageStyle] = useState('');
  const [imageProvider, setImageProvider] = useState('');
  const [imageModel, setImageModel] = useState('');
  const [imagePreviews, setImagePreviews] = useState<Array<{ id: string; assetId: string }>>([]);
  const [datasetTypes, setDatasetTypes] = useState<any[]>([]);
  const [chosenType, setChosenType] = useState<string>(initialDatasetType || 'text_classification');
  const pollRef = useRef<number | null>(null);
  const lastProgressRef = useRef<{ value: number; at: number }>({ value: -1, at: Date.now() });
  const [stalled, setStalled] = useState(false);

  const stopPolling = useCallback(() => {
    if (pollRef.current !== null) {
      window.clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!isOpen) {
      stopPolling();
      setStep('describe');
      setPlan(null);
      setJob(null);
      setError(null);
      setPrompt(initialPrompt ?? '');
      setAnalysis(null);
      setSampleName(null);
    }
  }, [isOpen, initialPrompt, stopPolling]);

  useEffect(() => () => stopPolling(), [stopPolling]);

  const handleSampleUpload = async (file: File) => {
    setUploading(true);
    setError(null);
    try {
      const detected = await analyzeGenerationSample(file);
      setAnalysis(detected);
      setSampleName(file.name);
      const suggested = detected?.plan;
      if (suggested) {
        setClasses(Array.isArray(suggested.classes) ? suggested.classes : []);
        setTotal(Number(suggested.suggested_total) || 200);
        setDifficulty(String(suggested.difficulty || 'mixed'));
      }
      if (!prompt.trim()) {
        setPrompt(
          `Generate a dataset like the uploaded sample (${detected?.row_count ?? 0} rows detected).`,
        );
      }
    } catch (err: any) {
      setError(err?.message || 'Could not read that file');
    } finally {
      setUploading(false);
    }
  };

  useEffect(() => {
    if (!isOpen) return;
    void (async () => {
      try {
        const rows = await fetchDatasetTypes();
        setDatasetTypes(rows || []);
        if (initialDatasetType) {
          const info = (rows || []).find((row: any) => row.id === initialDatasetType);
          if (info?.task_type) setChosenType(String(info.task_type));
        }
      } catch {
        setDatasetTypes([]);
      }
    })();
  }, [isOpen, initialDatasetType]);

  useEffect(() => {
    if (!advanced || options.length > 0) return;
    void (async () => {
      try {
        setOptions(await fetchProviders());
      } catch {
        setOptions([]);
      }
    })();
  }, [advanced, options.length]);

  const handleDraftPlan = async () => {
    if (prompt.trim().length < 3) {
      setError('Describe the dataset you want in a sentence or two.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const drafted: GenerationPlan = await draftGenerationPlan(prompt.trim());
      setPlan(drafted);
      if (!initialDatasetType) setChosenType(String(drafted.task_type || 'text_classification'));
      setClasses(drafted.classes);
      setTotal(drafted.suggested_total);
      setDifficulty(drafted.difficulty);
      setStep('confirm');
    } catch (err: any) {
      setError(err?.message || 'Could not draft a plan');
    } finally {
      setBusy(false);
    }
  };

  const loadImagePreviews = async (datasetId: string) => {
    try {
      const queue = await fetchDatasetQueue(datasetId, undefined, undefined, 25, 0);
      setImagePreviews(
        (queue?.items || [])
          .filter((item: any) => item?.primary_asset?.id)
          .map((item: any) => ({ id: item.id, assetId: String(item.primary_asset.id) })),
      );
    } catch {
      setImagePreviews([]);
    }
  };

  const handleCreateOnly = async () => {
    const finalClasses = classes.map((value) => value.trim()).filter(Boolean);
    setBusy(true);
    setError(null);
    try {
      const projects = await fetchProjects();
      const project = projects.find((row) => row.name === 'Scratch')
        ?? projects[0]
        ?? await createProject({ name: 'Scratch' });
      const dataset = await createDataset(project.id, {
        name: (plan?.title || `${chosenTypeInfo?.label || 'New'} dataset`).slice(0, 150),
        task_type: chosenType as any,
        label_schema: { labels: finalClasses.length > 0 ? finalClasses : ['Class A', 'Class B'] },
      } as any);
      if (onOpenDataset) onOpenDataset(dataset.id);
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Could not create the dataset');
    } finally {
      setBusy(false);
    }
  };

  const beginPolling = (created: GenerationJob) => {
    lastProgressRef.current = { value: 0, at: Date.now() };
    setStalled(false);
    setJob(created);
    setStep('running');
    stopPolling();
    pollRef.current = window.setInterval(async () => {
      try {
        const latest: GenerationJob = await fetchGenerationJob(created.id);
        const now = Date.now();
        const progressValue = latest.processed_items ?? 0;
        const heartbeatAt = latest.updated_at ? Date.parse(latest.updated_at) : NaN;
        if (progressValue !== lastProgressRef.current.value
            || (Number.isFinite(heartbeatAt) && heartbeatAt > lastProgressRef.current.at)) {
          lastProgressRef.current = { value: progressValue, at: Number.isFinite(heartbeatAt) ? heartbeatAt : now };
          setStalled(false);
        } else if (
          ['pending', 'running', 'cancelling'].includes(latest.status)
          && now - (Number.isFinite(heartbeatAt) ? heartbeatAt : lastProgressRef.current.at) > 70000
        ) {
          setStalled(true);
        }
        if (latest.stale) setStalled(true);
        setJob(latest);
        if (['completed', 'failed', 'cancelled', 'interrupted'].includes(latest.status)) {
          stopPolling();
          setStep('done');
          if (latest.kind === 'image_generation' && latest.status === 'completed') {
            void loadImagePreviews(latest.dataset_id);
          }
        }
      } catch {
        stopPolling();
        setError('Lost contact with the generation job. It may still be running — check Home.');
      }
    }, 700);
  };

  const handleStart = async () => {
    const finalClasses = classes.map((value) => value.trim()).filter(Boolean);
    if (finalClasses.length === 0) {
      setError('Add at least one category (for example: correct usage, incorrect usage).');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (isImagePlan || isDetectionPlan) {
        const providers = await fetchProviders();
        const imageProviders = (providers || []).filter((row: any) =>
          Array.isArray(row?.capabilities) && row.capabilities.includes('image_generation'));
        if (imageProviders.length === 0) {
          throw new Error(
            'No image model is connected. Configure OPENAI_API_KEY (gpt-image-2) or META_API_KEY '
            + '(muse-image-1.0) on the server, then reopen this dialog.',
          );
        }
        const chosenImage = imageProviders.find((row: any) => row.name === imageProvider) || imageProviders[0];
        const projects = await fetchProjects();
        const project = projects.find((row) => row.name === 'Scratch')
          ?? projects[0]
          ?? await createProject({ name: 'Scratch' });
        const dataset = await createDataset(project.id, {
          name: (plan?.title || 'Generated images').slice(0, 150),
          task_type: chosenType as any,
          label_schema: { labels: finalClasses },
        } as any);
        const created = await generateImages(dataset.id, {
          prompt: prompt.trim(),
          count: Math.min(25, Math.max(1, total)),
          provider: chosenImage.name,
          model: imageModel || chosenImage.models[0],
          quality: imageQuality,
          style: imageStyle.trim(),
          max_cost_usd: 2.0,
        });
        if (created?.error) throw new Error(created.error.message || 'Could not start image generation');
        beginPolling(created);
        return;
      }
      const providers = await fetchProviders();
      // Prefer models that need no network or key (simulated trio, then the local fake) so the
      // default path works out of the box; cloud providers are only auto-picked when nothing
      // local is available.
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
      if (!generator) {
        throw new Error(
          'No model service is connected yet. In development you can switch on the built-in simulated models '
          + '(ALLOW_SIMULATED_PROVIDERS=true); otherwise add a key under Model Providers.',
        );
      }
      const verifiers = ordered
        .filter((row: any) => Array.isArray(row?.capabilities)
          && row.capabilities.includes('text_classification') && row.name !== generator.name)
        .slice(0, 2)
        .map((row: any) => ({ provider: row.name, model: row.models[0] }));

      const chosen = selProvider ? options.find((row: any) => row.name === selProvider) : null;
      const effectiveProvider = chosen?.name || generator.name;
      const effectiveModel =
        selModel || (chosen?.models?.[0] ?? generator.models[0]);
      const perClass = Math.max(1, Math.round(total / finalClasses.length));
      const created: GenerationJob = await createGenerationJob({
        prompt: prompt.trim(),
        classes: finalClasses,
        per_class: perClass,
        provider: effectiveProvider,
        model: effectiveModel,
        verifier_providers: verifiers,
        project_id: projectId ?? null,
        dataset_name: plan?.title ?? null,
        difficulty,
        style_hint: analysis?.style_hint || '',
        seed_examples: analysis?.seed_examples || [],
        description: analysis?.plan?.summary || prompt.trim(),
        min_label_preservation: minPreservation,
        max_class_share: maxClassShare,
        target_split: targetSplit,
      });
      if ((created as any).error) {
        throw new Error((created as any).error.message || 'Could not start generation');
      }
      beginPolling(created);
    } catch (err: any) {
      setError(err?.message || 'Could not start generation');
    } finally {
      setBusy(false);
    }
  };

  const handleCancel = async () => {
    if (!job) return;
    try {
      const updated: GenerationJob = await cancelGenerationJob(job.id);
      setJob(updated);
    } catch (err: any) {
      setError(err?.message || 'Could not cancel');
    }
  };

  const addClass = () => {
    const value = classDraft.trim();
    if (!value) return;
    if (!classes.includes(value)) setClasses([...classes, value]);
    setClassDraft('');
  };

  // Limits mirrored from the API: <=500 per category, <=2,000 per run. The UI clamps so a user can
  // never build a request the service will reject with a validation error.
  const MAX_PER_CLASS = 500;
  const MAX_PER_RUN = 2000;
  const MAX_IMAGES = 25;
  const chosenTypeInfo = datasetTypes.find((row: any) => row.task_type === chosenType);
  const chosenTypeStatus = String(chosenTypeInfo?.status || 'available');
  const isImagePlan = chosenType === 'image_classification';
  const isDetectionPlan = chosenType === 'object_detection';
  const isTextPlan = chosenType === 'text_classification';
  const isGeneratable = isTextPlan || isImagePlan || isDetectionPlan;
  const isImageLike = isImagePlan || isDetectionPlan;

  // Keep the requested count inside the image-mode limit whenever the type changes.
  useEffect(() => {
    if (isImageLike) setTotal((current) => Math.min(current, 25));
  }, [isImageLike]);
  const maxTotal = isImageLike
    ? MAX_IMAGES
    : Math.min(MAX_PER_RUN, MAX_PER_CLASS * Math.max(1, classes.length));
  const perCategory = Math.max(1, Math.round(total / Math.max(1, classes.length)));

  return (
    <ModalShell
      isOpen={isOpen}
      onClose={onClose}
      size="lg"
      icon={<Wand2 size={20} strokeWidth={1.75} />}
      title="Generate a dataset"
      description={
        step === 'describe'
          ? 'Describe what you need in plain words — text or images. You can change everything on the next screen.'
          : step === 'confirm'
            ? 'A few quick questions — the suggestions are already filled in.'
            : step === 'running'
              ? 'Working on it. You can keep this open or cancel.'
              : 'Finished. Review the result and continue.'
      }
      footer={
        <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center', width: '100%' }}>
          {step === 'confirm' && (
            <SpringButton variant="ghost" size="sm" onClick={() => setStep('describe')}>
              Back
            </SpringButton>
          )}
          <div style={{ flex: 1 }} />
          {step === 'running' && (
            <SpringButton variant="secondary" size="sm" onClick={handleCancel} icon={<Square size={13} />}>
              Cancel
            </SpringButton>
          )}
          {step === 'describe' && (
            <SpringButton variant="primary" size="sm" onClick={handleDraftPlan} disabled={busy}
                          icon={<Sparkles size={14} />}>
              {busy ? 'Reading…' : 'Continue'}
            </SpringButton>
          )}
          {step === 'confirm' && (
            <SpringButton
              variant="primary"
              size="sm"
              onClick={isGeneratable ? handleStart : handleCreateOnly}
              disabled={busy}
            >
              {busy
                ? 'Starting…'
                : !isGeneratable
                  ? 'Create dataset and open'
                  : isImageLike
                    ? `Generate ${Math.min(total, maxTotal)} image${Math.min(total, maxTotal) === 1 ? '' : 's'}`
                    : `Generate ${total} examples`}
            </SpringButton>
          )}
          {(step === 'done' || step === 'running') && (
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

      {/* ------------------------------------------------------------ step 1 */}
      {step === 'describe' && (
        <div>
          <textarea
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            placeholder={SHORT_EXAMPLES[0]}
            rows={5}
            style={{ ...input, resize: 'vertical', fontSize: '0.9rem', lineHeight: 1.5 }}
            autoFocus
          />
          <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', margin: '0.4rem 0 0.9rem' }}>
            Mention what the categories are and roughly how many examples you want. Anything you leave
            out will be asked on the next screen.
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.35rem' }}>
            Try one of these:
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
            {SHORT_EXAMPLES.map((example) => (
              <button
                key={example}
                type="button"
                onClick={() => setPrompt(example)}
                style={{
                  textAlign: 'left',
                  fontSize: '0.78rem',
                  padding: '0.4rem 0.55rem',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px dashed var(--border-hairline)',
                  backgroundColor: 'transparent',
                  color: 'var(--text-secondary)',
                  cursor: 'pointer',
                }}
              >
                {example}
              </button>
            ))}
          </div>

          <div style={{ marginTop: '1.1rem', paddingTop: '0.9rem', borderTop: '1px solid var(--border-hairline)' }}>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.4rem' }}>
              Have a sample? <span style={{ color: 'var(--text-muted)' }}>(optional — CSV, JSONL, TXT, or a ZIP of those)</span>
            </div>
            <label
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.4rem',
                fontSize: '0.8rem',
                padding: '0.4rem 0.7rem',
                borderRadius: 'var(--radius-sm)',
                border: '1px dashed var(--border-hairline)',
                cursor: uploading ? 'wait' : 'pointer',
                color: 'var(--text-primary)',
              }}
            >
              <Upload size={14} strokeWidth={1.9} />
              {uploading ? 'Reading sample…' : sampleName ? `Replace ${sampleName}` : 'Upload a sample'}
              <input
                type="file"
                accept=".csv,.jsonl,.ndjson,.json,.txt,.zip,image/*"
                style={{ display: 'none' }}
                disabled={uploading}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void handleSampleUpload(file);
                }}
              />
            </label>
            <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginTop: '0.35rem' }}>
              We read the labels and writing style from it so the generated examples match. Images are
              accepted as a style reference only — this build generates text.
            </div>
            {analysis && (
              <div className="card" style={{ marginTop: '0.6rem', padding: '0.65rem 0.8rem', fontSize: '0.78rem' }}>
                <div style={{ fontWeight: 600, marginBottom: '0.25rem' }}>
                  Detected in {sampleName}: {analysis.row_count} row(s)
                  {analysis.classes?.length ? ` · labels: ${analysis.classes.join(', ')}` : ''}
                </div>
                {analysis.style_hint && (
                  <div style={{ color: 'var(--text-muted)' }}>Style: {analysis.style_hint}</div>
                )}
                {analysis.samples?.length > 0 && (
                  <ul style={{ margin: '0.3rem 0 0 1rem', padding: 0, color: 'var(--text-secondary)' }}>
                    {analysis.samples.slice(0, 2).map((sample: string) => (
                      <li key={sample} style={{ marginBottom: '0.15rem' }}>“{sample}”</li>
                    ))}
                  </ul>
                )}
                {(analysis.notes || []).map((note: string) => (
                  <div key={note} style={{ color: 'var(--text-muted)', marginTop: '0.2rem' }}>{note}</div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------ step 2 */}
      {step === 'confirm' && plan && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.35rem' }}>
              Dataset type{plan.dataset_type ? ` — I read this as ${plan.dataset_type_label}` : ''}
            </div>
            <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
              {datasetTypes
                .filter((row: any) => row.status !== 'planned' && row.task_type)
                .map((row: any) => (
                  <button
                    key={row.id}
                    type="button"
                    onClick={() => setChosenType(String(row.task_type))}
                    style={chip(chosenType === row.task_type)}
                    title={row.description}
                  >
                    {row.label}
                    <span style={{ marginLeft: '0.35rem', fontSize: '0.66rem', color: 'var(--text-muted)' }}>
                      {row.status}
                    </span>
                  </button>
                ))}
            </div>
            {!isGeneratable && (
              <div className="card" style={{ marginTop: '0.5rem', padding: '0.6rem 0.75rem', fontSize: '0.78rem' }}>
                “{chosenTypeInfo?.label || chosenType}” cannot be generated automatically yet. Create the
                dataset and use Import / the Workbench to add data.
              </div>
            )}
            {isDetectionPlan && (
              <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginTop: '0.3rem' }}>
                Detection needs boxes: this run generates base images only, then you draw boxes in the
                workbench.
              </div>
            )}
          </div>

          {isGeneratable && (
          <div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.35rem' }}>
              1. How many {isImageLike ? 'images' : 'examples'}?
            </div>
            <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', alignItems: 'center' }}>
              {(isImageLike ? [2, 4, 8, 12, MAX_IMAGES] : [50, 200, 500, 1000]).map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => { setCustomCount(false); setTotal(Math.min(maxTotal, option)); }}
                  style={chip(!customCount && total === Math.min(maxTotal, option))}
                >
                  {option}
                </button>
              ))}
              <button type="button" onClick={() => setCustomCount(true)} style={chip(customCount)}>
                Custom
              </button>
              {customCount && (
                <input
                  type="number"
                  min={1}
                  max={maxTotal}
                  value={total}
                  onChange={(event) => {
                    const value = Number(event.target.value) || 1;
                    setTotal(Math.max(1, Math.min(maxTotal, Math.round(value))));
                  }}
                  style={{ ...input, width: '100px' }}
                  autoFocus
                />
              )}
            </div>
            <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginTop: '0.3rem' }}>
              {isImageLike
                ? `Images are billed per image · max ${MAX_IMAGES} per run · low quality keeps cost down.`
                : `${perCategory} per category · up to ${maxTotal.toLocaleString()} for ${classes.length} ${
                    classes.length === 1 ? 'category' : 'categories'
                  } · 2,000 per run.`}
              {total >= maxTotal ? ' Capped at the per-run limit.' : ''} You can add more later.
            </div>
          </div>
          )}

          {isGeneratable && (
          <div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.35rem' }}>
              2. Which {isDetectionPlan ? 'object categories' : 'categories'}?
            </div>
            <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginBottom: '0.4rem' }}>
              {classes.map((label) => (
                <span key={label} className="badge badge-blue" style={{ textTransform: 'none' }}>
                  {label}
                  <button
                    type="button"
                    onClick={() => setClasses(classes.filter((item) => item !== label))}
                    style={{ marginLeft: '0.35rem', background: 'transparent', border: 0, cursor: 'pointer', color: 'inherit' }}
                    aria-label={`Remove ${label}`}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
            <div style={{ display: 'flex', gap: '0.4rem' }}>
              <input
                value={classDraft}
                onChange={(event) => setClassDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    addClass();
                  }
                }}
                placeholder="add a category…"
                style={input}
              />
              <SpringButton variant="secondary" size="sm" onClick={addClass}>
                Add
              </SpringButton>
            </div>
          </div>
          )}

          {isGeneratable && (
          <div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.35rem' }}>
              {isImageLike ? '3. Image quality and style' : '3. How hard should the examples be?'}
            </div>
            {isImageLike ? (
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
                {['low', 'medium'].map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setImageQuality(option)}
                    style={chip(imageQuality === option)}
                  >
                    {option} quality
                  </button>
                ))}
                <input
                  value={imageStyle}
                  onChange={(event) => setImageStyle(event.target.value)}
                  placeholder="style, e.g. flat illustration, photo, no text"
                  style={{ ...input, flex: '1 1 260px', width: 'auto' }}
                />
                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', flexBasis: '100%' }}>
                  Images are generated by the configured image model and saved for review; cost is shown when the
                  run finishes.
                </span>
              </div>
            ) : (
              <div style={{ display: 'flex', gap: '0.4rem' }}>
                {['beginner', 'mixed', 'hard'].map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setDifficulty(option)}
                    style={chip(difficulty === option)}
                  >
                    {option}
                  </button>
                ))}
              </div>
            )}
          </div>
          )}

          {plan.notes.length > 0 && (
            <div className="card" style={{ padding: '0.6rem 0.75rem', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
              {plan.notes.map((note) => (
                <div key={note}>{note}</div>
              ))}
            </div>
          )}

          <button
            type="button"
            onClick={() => setAdvanced(!advanced)}
            style={{ alignSelf: 'flex-start', background: 'transparent', border: 0, cursor: 'pointer',
                     color: 'var(--text-muted)', fontSize: '0.76rem', padding: 0 }}
          >
            {advanced ? '▾' : '▸'} Advanced
          </button>
          {advanced && (
            <div
              className="card"
              style={{
                padding: '0.7rem 0.85rem',
                display: 'grid',
                gap: '0.6rem',
                gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
              }}
            >
              <label style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                Model service
                <select
                  value={selProvider}
                  onChange={(event) => { setSelProvider(event.target.value); setSelModel(''); }}
                  style={{ ...input, marginTop: '0.2rem' }}
                >
                  <option value="">Automatic (recommended)</option>
                  {options
                    .filter((row: any) => Array.isArray(row?.capabilities) && row.capabilities.includes('text_generation'))
                    .map((row: any) => (
                      <option key={row.name} value={row.name}>{row.name}</option>
                    ))}
                </select>
              </label>
              <label style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                Model
                <select
                  value={selModel}
                  onChange={(event) => setSelModel(event.target.value)}
                  style={{ ...input, marginTop: '0.2rem' }}
                >
                  <option value="">Default</option>
                  {(options.find((row: any) => row.name === selProvider)?.models ?? []).map((model: string) => (
                    <option key={model} value={model}>{model}</option>
                  ))}
                </select>
              </label>
              <label style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                Max share of one class
                <input
                  type="number" step={0.05} min={0.1} max={1} value={maxClassShare}
                  onChange={(event) => setMaxClassShare(Number(event.target.value) || 0.6)}
                  style={{ ...input, marginTop: '0.2rem' }}
                />
              </label>
              <label style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                Min label agreement
                <input
                  type="number" step={0.05} min={0.3} max={1} value={minPreservation}
                  onChange={(event) => setMinPreservation(Number(event.target.value) || 0.85)}
                  style={{ ...input, marginTop: '0.2rem' }}
                />
              </label>
              <label style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                Put examples in
                <select
                  value={targetSplit}
                  onChange={(event) => setTargetSplit(event.target.value)}
                  style={{ ...input, marginTop: '0.2rem' }}
                >
                  <option value="train">Training set</option>
                  <option value="val">Validation set</option>
                  <option value="test">Test set</option>
                </select>
              </label>
              <div style={{ gridColumn: '1 / -1', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                Generated rows are always saved for your review — never approved automatically.
              </div>
            </div>
          )}
        </div>
      )}

      {/* ------------------------------------------------------------ step 3/4 */}
      {(step === 'running' || step === 'done') && job && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', marginBottom: '0.35rem' }}>
              <span>{job.dataset_name}</span>
              <span style={{ fontFamily: 'var(--font-mono)' }}>
                {job.processed_items}/{job.total_items}
              </span>
            </div>
            <div style={{ height: '8px', borderRadius: '999px', backgroundColor: 'var(--bg-elevated)', overflow: 'hidden' }}>
              <div
                style={{
                  height: '100%',
                  width: `${Math.min(100, Math.round((job.progress || 0) * 100))}%`,
                  backgroundColor: 'var(--accent-primary)',
                  transition: 'width 300ms ease',
                }}
              />
            </div>
            <div style={{ display: 'flex', gap: '1rem', fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.35rem' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
                <Clock size={12} strokeWidth={1.9} /> elapsed {fmtTime(job.elapsed_seconds)}
              </span>
              <span>
                {job.status === 'completed'
                  ? 'finished'
                  : job.status === 'cancelled'
                    ? 'cancelled'
                    : job.status === 'failed' || job.status === 'interrupted'
                      ? 'stopped'
                      : job.phase === 'checking quality and saving'
                        ? 'checking quality…'
                        : job.eta_seconds === null
                          ? 'estimating…'
                          : `about ${fmtTime(job.eta_seconds)} left`}
              </span>
            </div>
            {stalled && (
              <div className="card" style={{ marginTop: '0.55rem', padding: '0.6rem 0.75rem', borderColor: 'var(--amber)' }}>
                <div style={{ fontSize: '0.8rem' }}>
                  This run has stopped reporting progress. The server may have restarted mid-run — you
                  do not need to keep waiting. Close this and start a new run; anything unsaved was
                  discarded.
                </div>
                <SpringButton
                  variant="secondary"
                  size="sm"
                  style={{ marginTop: '0.45rem' }}
                  onClick={() => { stopPolling(); setStep('done'); }}
                >
                  Stop waiting
                </SpringButton>
              </div>
            )}
            {job.status === 'running' && job.phase === 'checking quality and saving' && !stalled && (
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                All examples are written — now checking their quality and saving them. This step has no
                time estimate.
              </div>
            )}
            {job.status === 'running' && job.eta_seconds === null
              && job.phase !== 'checking quality and saving' && !stalled && (
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                Estimating from measured speed — no guess until a few examples are done.
              </div>
            )}
          </div>

          {step === 'done' && (
            <div
              className="card"
              style={{
                padding: '0.8rem 0.9rem',
                borderColor: job.verdict === 'accept' ? 'var(--emerald)' : 'var(--rose)',
              }}
            >
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start' }}>
                {job.verdict === 'accept' ? (
                  <CheckCircle2 size={17} strokeWidth={2} style={{ color: 'var(--emerald)', marginTop: 2 }} />
                ) : (
                  <AlertTriangle size={17} strokeWidth={2} style={{ color: 'var(--rose)', marginTop: 2 }} />
                )}
                <div style={{ fontSize: '0.84rem' }}>
                  {job.status === 'failed' && <div>{job.error || 'Generation failed.'}</div>}
                  {job.status === 'cancelled' && <div>Cancelled. Nothing was added to the dataset.</div>}
                  {job.status === 'interrupted' && (
                    <div>{job.error || 'This run was interrupted before it finished.'}</div>
                  )}
                  {job.status === 'completed' && job.verdict === 'accept' && job.kind === 'image_generation' && (
                    <div>
                      Generated <strong>{job.accepted}</strong> image(s) into “{job.dataset_name}”.{' '}
                      {job.task_type === 'object_detection'
                        ? 'They are unannotated base images — draw boxes in the workbench.'
                        : ''}{' '}
                      {typeof job.cost_usd === 'number' && job.cost_usd > 0
                        ? `Cost: $${job.cost_usd.toFixed(3)}.`
                        : 'Cost: not reported (price not configured for this model).'}{' '}
                      They are saved as pending review.
                    </div>
                  )}
                  {job.status === 'completed' && job.verdict === 'accept' && job.kind !== 'image_generation' && (
                    <div>
                      Added <strong>{job.accepted}</strong> examples to “{job.dataset_name}”.
                      {typeof job.passed_filters === 'number'
                        && typeof job.total_items === 'number'
                        && job.passed_filters < job.total_items && (
                        <span>
                          {' '}The other {job.total_items - job.passed_filters} were too similar to each
                          other or to existing rows and were filtered out.
                        </span>
                      )}{' '}
                      They are marked as generated and wait for your review.
                    </div>
                  )}
                  {job.status === 'completed' && job.verdict === 'reject' && (
                    <div>
                      <div>The generated batch did not pass the quality check, so nothing was added.</div>
                      {job.rejection_reasons.map((reason) => (
                        <div key={reason} style={{ color: 'var(--text-muted)', marginTop: '0.2rem' }}>{reason}</div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {step === 'done' && job.kind === 'image_generation' && imagePreviews.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: '0.4rem' }}>
              {imagePreviews.slice(0, 12).map((preview) => (
                <img
                  key={preview.id}
                  src={`/api/v1/assets/${preview.assetId}/raw`}
                  alt="generated example"
                  style={{ width: '100%', height: '96px', objectFit: 'cover', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-hairline)' }}
                />
              ))}
            </div>
          )}

          {step === 'done' && job.status === 'completed' && (
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              <SpringButton
                variant="primary"
                size="sm"
                onClick={() => {
                  if (onOpenDataset) onOpenDataset(job.dataset_id);
                  onClose();
                }}
              >
                Open dataset
              </SpringButton>
              {job.verdict === 'accept' && (
                <SpringButton
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    if (job.task_type === 'object_detection') {
                      if (onOpenDataset) onOpenDataset(job.dataset_id);
                    } else if (onStartLabeling) {
                      onStartLabeling(job.dataset_id);
                    } else if (onOpenDataset) {
                      onOpenDataset(job.dataset_id);
                    }
                    onClose();
                  }}
                >
                  {job.task_type === 'object_detection'
                    ? 'Open dataset and draw boxes'
                    : job.kind === 'image_generation'
                      ? 'Label these images'
                      : 'Label these examples'}
                </SpringButton>
              )}
            </div>
          )}
        </div>
      )}
    </ModalShell>
  );
};
