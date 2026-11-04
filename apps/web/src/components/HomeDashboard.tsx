import React, { useCallback, useEffect, useState } from 'react';
import { ArrowRight, Clock, Database, FolderPlus, Sparkles, Tags } from 'lucide-react';
import { fetchGenerationJobs } from '../api';
import type { GenerationJob } from '../types';
import { SpringButton } from './ui/SpringButton';
import type { Project } from '../types';

interface HomeDashboardProps {
  projects: Project[];
  onOpenProjects: () => void;
  onSelectProject: (projectId: string) => void;
  onOpenDataset: (datasetId: string) => void;
  onStartGenerate: () => void;
  onStartLabel: () => void;
  onNewProject: () => void;
  onNewDataset: () => void;
}

const cardStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '0.55rem',
  padding: '1.1rem 1.2rem',
  borderRadius: 'var(--radius-lg)',
  border: '1px solid var(--border-hairline)',
  backgroundColor: 'var(--bg-surface)',
  boxShadow: 'var(--shadow-sm)',
  cursor: 'pointer',
  textAlign: 'left',
  transition: 'transform 160ms ease, border-color 160ms ease',
};

const fmtDuration = (seconds: number): string => {
  if (seconds < 60) return `${Math.max(0, Math.round(seconds))}s`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m ${Math.round(seconds % 60)}s`;
};

/**
 * Home: the only screen a beginner should need.
 *
 * Two doors (generate / label), recent work, and a quick-start that never forces project
 * bookkeeping first. Everything else lives one click away.
 */
export const HomeDashboard: React.FC<HomeDashboardProps> = ({
  projects,
  onOpenProjects,
  onSelectProject,
  onOpenDataset,
  onStartGenerate,
  onStartLabel,
  onNewProject,
  onNewDataset,
}) => {
  const [jobs, setJobs] = useState<GenerationJob[]>([]);
  const [loadingJobs, setLoadingJobs] = useState(true);

  const loadJobs = useCallback(async () => {
    try {
      setJobs(await fetchGenerationJobs(8));
    } catch {
      setJobs([]);
    } finally {
      setLoadingJobs(false);
    }
  }, []);

  useEffect(() => {
    void loadJobs();
    const timer = window.setInterval(() => { void loadJobs(); }, 3000);
    return () => window.clearInterval(timer);
  }, [loadJobs]);

  const recentProjects = [...projects].slice(0, 6);

  return (
    <div style={{ maxWidth: '1080px', margin: '0 auto', width: '100%' }}>
      <div style={{ marginBottom: '1.5rem' }}>
        <h1 style={{ fontSize: '1.7rem', fontWeight: 700, letterSpacing: 'var(--letter-spacing-heading)', marginBottom: '0.35rem' }}>
          What do you want to make?
        </h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', margin: 0 }}>
          Pick one. You can start from a description, or bring your own files — no setup required.
        </p>
      </div>

      {/* Two doors */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '0.9rem', marginBottom: '1.75rem' }}>
        <button
          type="button"
          style={cardStyle}
          onClick={onStartGenerate}
          onMouseEnter={(event) => { event.currentTarget.style.borderColor = 'var(--brand-border)'; }}
          onMouseLeave={(event) => { event.currentTarget.style.borderColor = 'var(--border-hairline)'; }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Sparkles size={20} strokeWidth={1.75} style={{ color: 'var(--accent-interactive)' }} />
            <strong style={{ fontSize: '1rem' }}>Generate a dataset</strong>
          </div>
          <div style={{ fontSize: '0.84rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
            Describe the dataset you want in plain words. We ask a couple of quick questions, generate
            examples, check their quality, and hand them to you for labelling.
          </div>
          <span style={{ fontSize: '0.8rem', color: 'var(--accent-interactive)', display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
            Start with a description <ArrowRight size={13} strokeWidth={2} />
          </span>
        </button>

        <button
          type="button"
          style={cardStyle}
          onClick={onStartLabel}
          onMouseEnter={(event) => { event.currentTarget.style.borderColor = 'var(--brand-border)'; }}
          onMouseLeave={(event) => { event.currentTarget.style.borderColor = 'var(--border-hairline)'; }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Tags size={20} strokeWidth={1.75} style={{ color: 'var(--accent-interactive)' }} />
            <strong style={{ fontSize: '1rem' }}>Label my data</strong>
          </div>
          <div style={{ fontSize: '0.84rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
            Bring a CSV, JSONL or text file (or an existing dataset) and label it with a fast,
            keyboard-first workspace. Validate and export when you are done.
          </div>
          <span style={{ fontSize: '0.8rem', color: 'var(--accent-interactive)', display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
            Choose or import data <ArrowRight size={13} strokeWidth={2} />
          </span>
        </button>
      </div>

      {/* Quick start */}
      <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap', marginBottom: '1.9rem' }}>
        <SpringButton variant="secondary" size="sm" onClick={onStartGenerate} icon={<Sparkles size={14} />}>
          Quick start (no project needed)
        </SpringButton>
        <SpringButton variant="secondary" size="sm" onClick={onOpenProjects} icon={<Database size={14} />}>
          Advanced workspace
        </SpringButton>
        <SpringButton variant="primary" size="sm" onClick={onNewDataset} icon={<Sparkles size={14} />}>
          New dataset
        </SpringButton>
        <SpringButton variant="secondary" size="sm" onClick={onNewProject} icon={<FolderPlus size={14} />}>
          New project
        </SpringButton>
      </div>

      {/* Recent generation */}
      <section style={{ marginBottom: '1.9rem' }}>
        <h2 style={{ fontSize: '1rem', fontWeight: 650, marginBottom: '0.6rem' }}>Recent generation</h2>
        {loadingJobs && <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>Loading…</div>}
        {!loadingJobs && jobs.length === 0 && (
          <div className="card" style={{ padding: '0.9rem 1rem', fontSize: '0.84rem', color: 'var(--text-muted)' }}>
            Nothing generated yet. Describe a dataset above and it will appear here with live progress.
          </div>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {jobs.map((job) => (
            <button
              key={job.id}
              type="button"
              onClick={() => onOpenDataset(job.dataset_id)}
              style={{
                textAlign: 'left',
                padding: '0.65rem 0.8rem',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border-hairline)',
                backgroundColor: 'var(--bg-surface)',
                cursor: 'pointer',
                color: 'inherit',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', alignItems: 'center' }}>
                <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>{job.dataset_name || job.prompt.slice(0, 60)}</span>
                <span className="badge badge-neutral" style={{ textTransform: 'none' }}>
                  {job.status === 'completed' && job.kind === 'auto_label'
                    ? `${job.auto_approved ?? 0} auto-labelled`
                    : job.status === 'completed' && job.verdict === 'accept'
                      ? `${job.accepted} examples`
                      : job.status}
                </span>
              </div>
              <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginTop: '0.2rem', display: 'flex', gap: '0.75rem' }}>
                <span>{(job.classes || []).join(' · ')}</span>
                {['pending', 'running', 'cancelling'].includes(job.status) && !job.stale && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
                    <Clock size={11} strokeWidth={2} />
                    {job.processed_items}/{job.total_items}
                    {job.eta_seconds !== null && ` · ~${fmtDuration(job.eta_seconds)} left`}
                  </span>
                )}
              </div>
              {['pending', 'running', 'cancelling'].includes(job.status) && (
                <div style={{ height: '4px', marginTop: '0.4rem', borderRadius: '999px', backgroundColor: 'var(--bg-elevated)', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${Math.round((job.progress || 0) * 100)}%`, backgroundColor: 'var(--accent-primary)', transition: 'width 300ms ease' }} />
                </div>
              )}
            </button>
          ))}
        </div>
      </section>

      {/* Recent projects */}
      <section>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '0.6rem' }}>
          <h2 style={{ fontSize: '1rem', fontWeight: 650, margin: 0 }}>Your projects</h2>
          <button
            type="button"
            onClick={onOpenProjects}
            style={{ background: 'transparent', border: 0, cursor: 'pointer', color: 'var(--accent-interactive)', fontSize: '0.8rem' }}
          >
            See all
          </button>
        </div>
        {recentProjects.length === 0 ? (
          <div className="card" style={{ padding: '0.9rem 1rem', fontSize: '0.84rem', color: 'var(--text-muted)' }}>
            No projects yet — but you do not need one. “Quick start” creates a scratch workspace for you.
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '0.6rem' }}>
            {recentProjects.map((project) => (
              <button
                key={project.id}
                type="button"
                onClick={() => onSelectProject(project.id)}
                style={{
                  textAlign: 'left',
                  padding: '0.7rem 0.85rem',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border-hairline)',
                  backgroundColor: 'var(--bg-surface)',
                  cursor: 'pointer',
                  color: 'inherit',
                }}
              >
                <div style={{ fontSize: '0.86rem', fontWeight: 600 }}>{project.name}</div>
                <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>
                  {project.description || 'No description'}
                </div>
              </button>
            ))}
          </div>
        )}
      </section>
    </div>
  );
};
