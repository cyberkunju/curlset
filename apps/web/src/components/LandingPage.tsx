import React from 'react';
import {
  ArrowRight,
  ShieldCheck,
  Crosshair,
  FileCheck2,
  GitCompare,
  HardDrive,
  Package,
  Activity,
  FolderPlus,
  Layers,
  Terminal,
} from 'lucide-react';
import { SpringButton } from './ui/SpringButton';

interface LandingPageProps {
  onOpenProjects: () => void;
  onOpenHealth: () => void;
  onOpenGovernance: () => void;
  onOpenCreateProject?: () => void;
  projectCount?: number;
}

export const LandingPage: React.FC<LandingPageProps> = ({
  onOpenProjects,
  onOpenHealth,
  onOpenGovernance,
  onOpenCreateProject,
  projectCount = 0,
}) => {
  return (
    <div style={{ maxWidth: '1140px', margin: '0 auto', padding: '0.5rem 1rem 3rem 1rem' }}>
      {/* Compact Hero Section */}
      <section style={{ textAlign: 'center', padding: '2rem 1rem 2.25rem 1rem' }}>
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.45rem',
            padding: '0.28rem 0.8rem',
            borderRadius: '9999px',
            backgroundColor: 'var(--brand-tint)',
            border: '1px solid var(--brand-border)',
            fontSize: '0.78rem',
            color: 'var(--brand-primary)',
            fontWeight: 500,
            marginBottom: '1rem',
            fontFamily: 'var(--font-mono)',
            boxShadow: 'var(--brand-shadow-sm)',
          }}
        >
          <span className="brand-pulse-dot" style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: 'var(--brand-primary)' }}></span>
          Curlset — Multimodal Platform
        </div>

        <h1
          style={{
            fontSize: '2.5rem',
            fontWeight: 800,
            letterSpacing: 'var(--letter-spacing-heading)',
            lineHeight: 1.18,
            color: 'var(--text-primary)',
            maxWidth: '780px',
            margin: '0 auto 1rem auto',
          }}
        >
          Turn Raw Multimodal Data into <span className="brand-gradient-text">Reviewed, Versioned Datasets</span>
        </h1>

        <p
          style={{
            fontSize: '1.05rem',
            lineHeight: 1.55,
            color: 'var(--text-secondary)',
            maxWidth: '680px',
            margin: '0 auto 1.75rem auto',
          }}
        >
          A desktop-grade platform for developers and researchers to ingest, annotate, validate,
          version, and export multimodal training datasets with cryptographic provenance.
        </p>

        {/* Primary & Secondary Action Group */}
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          <SpringButton variant="brand" onClick={onOpenProjects} style={{ padding: '0.65rem 1.4rem', fontSize: '0.9rem' }}>
            <span>Launch Workspace</span>
            <ArrowRight size={16} strokeWidth={2} style={{ marginLeft: '4px' }} />
          </SpringButton>

          {onOpenCreateProject && (
            <SpringButton variant="secondary" onClick={onOpenCreateProject} style={{ padding: '0.65rem 1.25rem', fontSize: '0.9rem' }}>
              <FolderPlus size={16} strokeWidth={1.75} style={{ marginRight: '6px' }} />
              <span>New Project</span>
            </SpringButton>
          )}

          <SpringButton variant="ghost" onClick={onOpenHealth} style={{ padding: '0.65rem 1.15rem', fontSize: '0.9rem' }}>
            <Activity size={16} strokeWidth={1.75} style={{ marginRight: '6px' }} />
            <span>Diagnostics</span>
          </SpringButton>
        </div>
      </section>

      {/* Quick-Start Summary Bar */}
      <section
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0.85rem 1.25rem',
          backgroundColor: 'var(--bg-surface)',
          border: '1px solid var(--border-hairline)',
          borderRadius: 'var(--radius-md)',
          boxShadow: 'var(--shadow-sm)',
          marginBottom: '2.5rem',
          flexWrap: 'wrap',
          gap: '1rem',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Layers size={16} strokeWidth={1.75} style={{ color: 'var(--text-muted)' }} />
            <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>Projects Available:</span>
            <span style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>
              {projectCount}
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Terminal size={16} strokeWidth={1.75} style={{ color: 'var(--text-muted)' }} />
            <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>Shortcut:</span>
            <kbd
              style={{
                fontSize: '0.72rem',
                fontFamily: 'var(--font-mono)',
                padding: '0.1rem 0.35rem',
                backgroundColor: 'var(--bg-elevated)',
                border: '1px solid var(--border-hairline)',
                borderRadius: 'var(--radius-sm)',
                color: 'var(--text-primary)',
              }}
            >
              Ctrl + K
            </kbd>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Jump anywhere</span>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <button
            type="button"
            onClick={onOpenProjects}
            style={{
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--accent-interactive)',
              fontSize: '0.82rem',
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: '0.25rem',
            }}
          >
            <span>View All Projects</span>
            <ArrowRight size={14} strokeWidth={2} />
          </button>
        </div>
      </section>

      {/* 5-Stage Dataset Engineering Lifecycle */}
      <section style={{ marginBottom: '2.5rem' }}>
        <div style={{ marginBottom: '1.25rem' }}>
          <h2 style={{ fontSize: '1.35rem', fontWeight: 700, letterSpacing: 'var(--letter-spacing-heading)', color: 'var(--text-primary)' }}>
            The 5-Stage Engineering Lifecycle
          </h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem', marginTop: '0.2rem' }}>
            A disciplined, verifiable workflow from raw ingestion to model export.
          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(310px, 1fr))', gap: '1rem' }}>
          {/* Stage 1 */}
          <div className="card" style={{ cursor: 'default', padding: '1.15rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', marginBottom: '0.65rem' }}>
              <div style={{ padding: '0.45rem', borderRadius: 'var(--radius-sm)', backgroundColor: 'var(--brand-tint)', color: 'var(--brand-primary)' }}>
                <HardDrive size={18} strokeWidth={1.75} />
              </div>
              <div>
                <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--brand-primary)', textTransform: 'uppercase', fontFamily: 'var(--font-mono)' }}>Stage 01</span>
                <h3 style={{ fontSize: '0.98rem', fontWeight: 700, color: 'var(--text-primary)' }}>Ingestion & Rights</h3>
              </div>
            </div>
            <p style={{ fontSize: '0.84rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              Safe multi-format ingestion (JSONL, CSV, ZIP, images, audio). Defends against path traversal and decompression bombs. Tracks source provenance, license attribution, and intended-use rights.
            </p>
          </div>

          {/* Stage 2 */}
          <div className="card" style={{ cursor: 'default', padding: '1.15rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', marginBottom: '0.65rem' }}>
              <div style={{ padding: '0.45rem', borderRadius: 'var(--radius-sm)', backgroundColor: 'var(--brand-tint)', color: 'var(--brand-primary)' }}>
                <Crosshair size={18} strokeWidth={1.75} />
              </div>
              <div>
                <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--brand-primary)', textTransform: 'uppercase', fontFamily: 'var(--font-mono)' }}>Stage 02</span>
                <h3 style={{ fontSize: '0.98rem', fontWeight: 700, color: 'var(--text-primary)' }}>Annotation & Review</h3>
              </div>
            </div>
            <p style={{ fontSize: '0.84rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              Interactive bounding-box canvas with luminance-gradient edge snapping. Audio transcription with segment scrubbing. Model proposals are generated through the backend provider gateway and always land in pending review.
            </p>
          </div>

          {/* Stage 3 */}
          <div className="card" style={{ cursor: 'default', padding: '1.15rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', marginBottom: '0.65rem' }}>
              <div style={{ padding: '0.45rem', borderRadius: 'var(--radius-sm)', backgroundColor: 'var(--brand-tint)', color: 'var(--brand-primary)' }}>
                <FileCheck2 size={18} strokeWidth={1.75} />
              </div>
              <div>
                <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--brand-primary)', textTransform: 'uppercase', fontFamily: 'var(--font-mono)' }}>Stage 03</span>
                <h3 style={{ fontSize: '0.98rem', fontWeight: 700, color: 'var(--text-primary)' }}>Quality & Invariants</h3>
              </div>
            </div>
            <p style={{ fontSize: '0.84rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              Automated split leakage detection (SHA-256 + pHash cross-split checks), coordinate boundary invariants, label distribution balance checks, and Confident Learning label noise discovery.
            </p>
          </div>

          {/* Stage 4 */}
          <div className="card" style={{ cursor: 'default', padding: '1.15rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', marginBottom: '0.65rem' }}>
              <div style={{ padding: '0.45rem', borderRadius: 'var(--radius-sm)', backgroundColor: 'var(--brand-tint)', color: 'var(--brand-primary)' }}>
                <GitCompare size={18} strokeWidth={1.75} />
              </div>
              <div>
                <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--brand-primary)', textTransform: 'uppercase', fontFamily: 'var(--font-mono)' }}>Stage 04</span>
                <h3 style={{ fontSize: '0.98rem', fontWeight: 700, color: 'var(--text-primary)' }}>Versions & Visual Diff</h3>
              </div>
            </div>
            <p style={{ fontSize: '0.84rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              Immutable cryptographic dataset versions with auto-generated Markdown dataset cards. Visual Git-Diff comparing v1 vs v2 bounding boxes and class balance shifts.
            </p>
          </div>

          {/* Stage 5 */}
          <div className="card" style={{ cursor: 'default', padding: '1.15rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', marginBottom: '0.65rem' }}>
              <div style={{ padding: '0.45rem', borderRadius: 'var(--radius-sm)', backgroundColor: 'var(--brand-tint)', color: 'var(--brand-primary)' }}>
                <Package size={18} strokeWidth={1.75} />
              </div>
              <div>
                <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--brand-primary)', textTransform: 'uppercase', fontFamily: 'var(--font-mono)' }}>Stage 05</span>
                <h3 style={{ fontSize: '0.98rem', fontWeight: 700, color: 'var(--text-primary)' }}>Framework Exports</h3>
              </div>
            </div>
            <p style={{ fontSize: '0.84rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              Export ready-to-run bundles for <strong>Unsloth</strong> (ShareGPT + script), <strong>Axolotl</strong> (ChatML config), <strong>LLaMA-Factory</strong> (registry info), and <strong>Ultralytics YOLO</strong> (v8/v11 YAML).
            </p>
          </div>

          {/* Governance & Privacy Notice */}
          <div className="card" style={{ cursor: 'default', padding: '1.15rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', marginBottom: '0.65rem' }}>
              <div style={{ padding: '0.45rem', borderRadius: 'var(--radius-sm)', backgroundColor: 'var(--brand-tint)', color: 'var(--brand-primary)' }}>
                <ShieldCheck size={18} strokeWidth={1.75} />
              </div>
              <div>
                <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--brand-primary)', textTransform: 'uppercase', fontFamily: 'var(--font-mono)' }}>Storage</span>
                <h3 style={{ fontSize: '0.98rem', fontWeight: 700, color: 'var(--text-primary)' }}>Local & Portable Architecture</h3>
              </div>
            </div>
            <p style={{ fontSize: '0.84rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              Datasets and metadata are stored in a local SQLite database and a local object-storage directory by default. Provider calls happen only after you configure a provider; diagnostics are available under System Diagnostics.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
};
