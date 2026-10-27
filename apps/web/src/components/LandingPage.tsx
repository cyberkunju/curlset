import React from 'react';
import {
  ArrowRight,
  ShieldCheck,
  Cpu,
  FileCheck2,
  GitCompare,
  HardDrive,
  Sparkles,
  Download,
  Activity,
} from 'lucide-react';
import { SpringButton } from './ui/SpringButton';

interface LandingPageProps {
  onOpenProjects: () => void;
  onOpenHealth: () => void;
  onOpenGovernance: () => void;
}

export const LandingPage: React.FC<LandingPageProps> = ({
  onOpenProjects,
  onOpenHealth,
  onOpenGovernance,
}) => {
  return (
    <div style={{ maxWidth: '1180px', margin: '0 auto', padding: '1rem 0 4rem 0' }}>
      {/* Hero Section */}
      <section style={{ textAlign: 'center', padding: '3rem 1.5rem 3.5rem 1.5rem' }}>

        <h1
          style={{
            fontSize: '3.2rem',
            fontWeight: 800,
            letterSpacing: '-0.035em',
            lineHeight: 1.15,
            color: 'var(--text-primary)',
            maxWidth: '860px',
            margin: '0 auto 1.25rem auto',
          }}
        >
          Precision Engineering for Multimodal AI Training Data
        </h1>

        <p
          style={{
            fontSize: '1.15rem',
            lineHeight: 1.6,
            color: 'var(--text-secondary)',
            maxWidth: '720px',
            margin: '0 auto 2.25rem auto',
          }}
        >
          Turn raw unstructured images, text, and audio into human-reviewed, invariant-tested,
          cryptographically versioned, and training-ready datasets for LLMs, VLMs, and computer vision models.
        </p>

        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
          <SpringButton variant="primary" onClick={onOpenProjects} style={{ padding: '0.75rem 1.6rem', fontSize: '0.95rem' }}>
            <span>Launch Workspace</span>
            <ArrowRight size={18} strokeWidth={2} style={{ marginLeft: '4px' }} />
          </SpringButton>

          <SpringButton variant="secondary" onClick={onOpenHealth} style={{ padding: '0.75rem 1.4rem', fontSize: '0.95rem' }}>
            <Activity size={18} strokeWidth={1.75} style={{ marginRight: '6px' }} />
            <span>System Diagnostics</span>
          </SpringButton>

          <SpringButton variant="ghost" onClick={onOpenGovernance} style={{ padding: '0.75rem 1.2rem', fontSize: '0.95rem' }}>
            <ShieldCheck size={18} strokeWidth={1.75} style={{ marginRight: '6px' }} />
            <span>Governance & Quotas</span>
          </SpringButton>
        </div>
      </section>

      {/* Feature Highlights Grid */}
      <section style={{ marginBottom: '4rem' }}>
        <div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
          <h2 style={{ fontSize: '1.65rem', fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--text-primary)' }}>
            The 5-Stage Dataset Engineering Lifecycle
          </h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', marginTop: '0.35rem' }}>
            A rigorous, reproducible pipeline from raw ingestion to fine-tuning export.
          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.25rem' }}>
          {/* Stage 1 */}
          <div className="card" style={{ cursor: 'default' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', marginBottom: '0.85rem' }}>
              <div style={{ padding: '0.5rem', borderRadius: 'var(--radius-sm)', backgroundColor: 'var(--bg-elevated)', color: 'var(--text-primary)' }}>
                <HardDrive size={20} strokeWidth={1.75} />
              </div>
              <div>
                <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', fontFamily: 'var(--font-mono)' }}>Stage 01</span>
                <h3 style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-primary)' }}>Ingestion & Rights Tracking</h3>
              </div>
            </div>
            <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', lineHeight: 1.55 }}>
              Safe multi-format ingestion (JSONL, CSV, ZIP, images, audio). Defends against path traversal and decompression bombs. Tracks source provenance, license attribution, and intended-use rights.
            </p>
          </div>

          {/* Stage 2 */}
          <div className="card" style={{ cursor: 'default' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', marginBottom: '0.85rem' }}>
              <div style={{ padding: '0.5rem', borderRadius: 'var(--radius-sm)', backgroundColor: 'var(--bg-elevated)', color: 'var(--text-primary)' }}>
                <Cpu size={20} strokeWidth={1.75} />
              </div>
              <div>
                <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', fontFamily: 'var(--font-mono)' }}>Stage 02</span>
                <h3 style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-primary)' }}>Precision Annotation & AI</h3>
              </div>
            </div>
            <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', lineHeight: 1.55 }}>
              Interactive bounding-box canvas with <strong>Sobel magnetic edge-snapping</strong> (&lt;150ms). Audio transcription with segment scrubbing. Local AI model proposal generation via Ollama with consensus review.
            </p>
          </div>

          {/* Stage 3 */}
          <div className="card" style={{ cursor: 'default' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', marginBottom: '0.85rem' }}>
              <div style={{ padding: '0.5rem', borderRadius: 'var(--radius-sm)', backgroundColor: 'var(--bg-elevated)', color: 'var(--text-primary)' }}>
                <FileCheck2 size={20} strokeWidth={1.75} />
              </div>
              <div>
                <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', fontFamily: 'var(--font-mono)' }}>Stage 03</span>
                <h3 style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-primary)' }}>Quality Engine & Invariants</h3>
              </div>
            </div>
            <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', lineHeight: 1.55 }}>
              Automated split leakage detection (SHA-256 + pHash cross-split checks), coordinate boundary invariants, label distribution balance checks, and Confident Learning label noise discovery.
            </p>
          </div>

          {/* Stage 4 */}
          <div className="card" style={{ cursor: 'default' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', marginBottom: '0.85rem' }}>
              <div style={{ padding: '0.5rem', borderRadius: 'var(--radius-sm)', backgroundColor: 'var(--bg-elevated)', color: 'var(--text-primary)' }}>
                <GitCompare size={20} strokeWidth={1.75} />
              </div>
              <div>
                <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', fontFamily: 'var(--font-mono)' }}>Stage 04</span>
                <h3 style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-primary)' }}>Version Control & Visual Git-Diff</h3>
              </div>
            </div>
            <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', lineHeight: 1.55 }}>
              Immutable cryptographic dataset versions with auto-generated Markdown dataset cards. Visual Git-Diff comparing $v_1$ vs $v_2$ bounding boxes (dashed red vs solid emerald) and class balance shifts.
            </p>
          </div>

          {/* Stage 5 */}
          <div className="card" style={{ cursor: 'default' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', marginBottom: '0.85rem' }}>
              <div style={{ padding: '0.5rem', borderRadius: 'var(--radius-sm)', backgroundColor: 'var(--bg-elevated)', color: 'var(--text-primary)' }}>
                <Download size={20} strokeWidth={1.75} />
              </div>
              <div>
                <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', fontFamily: 'var(--font-mono)' }}>Stage 05</span>
                <h3 style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-primary)' }}>1-Click Framework Exports</h3>
              </div>
            </div>
            <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', lineHeight: 1.55 }}>
              Export ready-to-run bundles for <strong>Unsloth</strong> (ShareGPT + script), <strong>Axolotl</strong> (ChatML config), <strong>LLaMA-Factory</strong> (registry info), and <strong>Ultralytics YOLO</strong> (v8/v11 YAML).
            </p>
          </div>

          {/* Token Simulator Card */}
          <div className="card" style={{ cursor: 'default' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', marginBottom: '0.85rem' }}>
              <div style={{ padding: '0.5rem', borderRadius: 'var(--radius-sm)', backgroundColor: 'var(--bg-elevated)', color: 'var(--text-primary)' }}>
                <Sparkles size={20} strokeWidth={1.75} />
              </div>
              <div>
                <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', fontFamily: 'var(--font-mono)' }}>Simulate</span>
                <h3 style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-primary)' }}>Live Multimodal Token Simulator</h3>
              </div>
            </div>
            <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', lineHeight: 1.55 }}>
              Calculate subword text tokens + ViT $28\times 28$ patch tokens dynamically. Test against target context windows ($2048$, $4096$, $8192$) with live truncation risk alerts before training.
            </p>
          </div>
        </div>
      </section>

      {/* Bottom CTA */}
      <section style={{ textAlign: 'center', marginTop: '4rem' }}>
        <h3 style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.5rem' }}>
          Ready to engineer your dataset?
        </h3>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.92rem', marginBottom: '1.5rem' }}>
          Create a project workspace or inspect existing multimodal datasets.
        </p>
        <SpringButton variant="primary" onClick={onOpenProjects} style={{ padding: '0.75rem 1.75rem', fontSize: '0.95rem' }}>
          <span>Enter Workspace</span>
          <ArrowRight size={18} strokeWidth={2} style={{ marginLeft: '6px' }} />
        </SpringButton>
      </section>
    </div>
  );
};
