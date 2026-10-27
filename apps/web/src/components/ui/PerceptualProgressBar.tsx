import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle2, Loader2 } from 'lucide-react';

export interface PerceptualProgressProps {
  /** Whether the operation is actively running */
  active: boolean;
  /** Optional real backend percentage (0-100) if reported by ProcessingRun */
  backendPercent?: number | null;
  /** Task context to tailor stage micro-copy */
  taskType?: 'ingest' | 'annotate' | 'validate' | 'export' | 'synthesize';
  onComplete?: () => void;
}

const STAGE_MESSAGES: Record<NonNullable<PerceptualProgressProps['taskType']>, string[]> = {
  ingest: [
    'Inspecting magic-byte signatures & archive headers...',
    'Streaming assets & computing SHA-256 checksums...',
    'Calculating 64-bit perceptual pHash matrices...',
    'Bundling multi-modal record pairs...',
    'Almost finished — indexing records & cleaning staging buffers...',
  ],
  annotate: [
    'Warming provider gateway & validating task schema...',
    'Dispatching multi-modal batches to primary annotator...',
    'Running Critic verification & consensus scoring...',
    'Normalizing spatial coordinates & confidence bounds...',
    'Almost finished — committing append-only annotation revisions...',
  ],
  validate: [
    'Scanning schema contracts & required label ontologies...',
    'Checking exact SHA-256 & perceptual pHash duplicate clusters...',
    'Auditing train / val / test splits for cross-split leakage...',
    'Running Confident Learning label-noise neighborhoods...',
    'Almost finished — compiling quality report...',
  ],
  export: [
    'Verifying immutable DatasetVersion cryptographic manifest...',
    'Serializing records & transforming spatial coordinates...',
    'Compiling automated Dataset Card (README.md) statistics...',
    'Packaging archive & computing file SHA-256 digests...',
    'Almost finished — finalizing downloadable artifact...',
  ],
  synthesize: [
    'Sampling seed records & target class distributions...',
    'Generating candidate multi-modal variations...',
    'Running 3-gram & perceptual anti-collapse diversity filter...',
    'Attaching synthetic lineage & provenance metadata...',
    'Almost finished — staging candidates for review...',
  ],
};

export const PerceptualProgressBar: React.FC<PerceptualProgressProps> = ({
  active,
  backendPercent = null,
  taskType = 'ingest',
  onComplete,
}) => {
  const [progress, setProgress] = useState(0);
  const [completed, setCompleted] = useState(false);

  useEffect(() => {
    if (!active && progress > 0 && !completed) {
      setProgress(100);
      setCompleted(true);
      const timer = setTimeout(() => onComplete?.(), 420);
      return () => clearTimeout(timer);
    }

    if (!active) {
      setProgress(0);
      setCompleted(false);
      return;
    }

    // Phase 1: Instant ignition jump
    setProgress((prev) => (prev < 12 ? 16 : prev));

    const interval = setInterval(() => {
      setProgress((prev) => {
        if (backendPercent !== null && backendPercent > prev) {
          return Math.min(96.5, backendPercent);
        }
        if (prev < 35) {
          return prev + 4.8; // Fast initial surge
        }
        if (prev < 75) {
          const harmonicStep = 1.6 + Math.random() * 2.8;
          return prev + harmonicStep;
        }
        if (prev < 96.4) {
          // Phase 3: Zeno's asymptotic trickle
          const remaining = 96.5 - prev;
          return prev + Math.max(0.12, remaining * 0.075);
        }
        return prev;
      });
    }, 240);

    return () => clearInterval(interval);
  }, [active, backendPercent, completed, onComplete, progress]);

  const messages = STAGE_MESSAGES[taskType];
  const stageIndex =
    progress < 25
      ? 0
      : progress < 50
      ? 1
      : progress < 76
      ? 2
      : progress < 89
      ? 3
      : 4;

  if (!active && !completed) return null;

  return (
    <div
      style={{
        width: '100%',
        borderRadius: '10px',
        border: '1px solid var(--border-hairline)',
        backgroundColor: 'var(--bg-surface)',
        padding: '0.85rem',
        boxShadow: 'var(--shadow-sm)',
        marginBottom: '1rem',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', marginBottom: '0.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', minWidth: 0 }}>
          {completed ? (
            <motion.span
              initial={{ scale: 0.4, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 520, damping: 20 }}
              style={{ color: 'var(--status-approved)', display: 'flex', flexShrink: 0 }}
            >
              <CheckCircle2 size={16} strokeWidth={2} />
            </motion.span>
          ) : (
            <span style={{ color: 'var(--accent-interactive)', display: 'flex', flexShrink: 0 }}>
              <Loader2 className="animate-spin" size={15} strokeWidth={1.75} />
            </span>
          )}

          <AnimatePresence mode="wait">
            <motion.span
              key={completed ? 'done' : stageIndex}
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -5 }}
              transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
              style={{
                fontSize: '0.8rem',
                fontWeight: 500,
                color: 'var(--text-primary)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {completed ? 'Completed — dataset state synchronized' : messages[stageIndex]}
            </motion.span>
          </AnimatePresence>
        </div>

        <span style={{ fontSize: '0.8rem', fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)', flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>
          {Math.round(progress)}%
        </span>
      </div>

      {/* Progress Track */}
      <div style={{ position: 'relative', height: '6px', width: '100%', overflow: 'hidden', borderRadius: '9999px', backgroundColor: 'var(--bg-elevated)' }}>
        <motion.div
          style={{ height: '100%', borderRadius: '9999px', backgroundColor: 'var(--accent-interactive)' }}
          initial={{ width: '0%' }}
          animate={{ width: `${progress}%` }}
          transition={{
            type: 'spring',
            stiffness: completed ? 420 : 140,
            damping: 26,
            mass: 0.6,
          }}
        />
      </div>
    </div>
  );
};
