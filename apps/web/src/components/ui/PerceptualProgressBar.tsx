import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle2, Loader2, AlertCircle } from 'lucide-react';

export interface PerceptualProgressProps {
  /** Whether the operation is actively running */
  active: boolean;
  /** Optional real backend percentage (0-100) if reported by ProcessingRun */
  backendPercent?: number | null;
  /** Task context to tailor stage micro-copy */
  taskType?: 'ingest' | 'annotate' | 'validate' | 'export' | 'synthesize';
  /** Explicit completion state if known */
  completed?: boolean;
  /** Optional error message if the operation failed */
  error?: string | null;
  onComplete?: () => void;
}

const STAGE_MESSAGES: Record<NonNullable<PerceptualProgressProps['taskType']>, string[]> = {
  ingest: [
    'Inspecting magic-byte signatures & archive headers...',
    'Streaming assets & computing SHA-256 checksums...',
    'Calculating 64-bit perceptual pHash matrices...',
    'Bundling multi-modal record pairs...',
    'Indexing records & staging assets...',
  ],
  annotate: [
    'Validating task schema against dataset configuration...',
    'Dispatching multi-modal batches to provider gateway...',
    'Running Critic verification & consensus scoring...',
    'Normalizing spatial coordinates & confidence bounds...',
    'Committing append-only annotation revisions...',
  ],
  validate: [
    'Scanning schema contracts & required label ontologies...',
    'Checking exact SHA-256 & perceptual pHash duplicate clusters...',
    'Auditing train / val / test splits for cross-split leakage...',
    'Running Confident Learning label-noise neighborhoods...',
    'Compiling validation metrics & quality scorecard...',
  ],
  export: [
    'Verifying immutable DatasetVersion cryptographic manifest...',
    'Serializing records & transforming spatial coordinates...',
    'Compiling automated Dataset Card (README.md) statistics...',
    'Packaging archive & computing file SHA-256 digests...',
    'Finalizing downloadable artifact...',
  ],
  synthesize: [
    'Sampling seed records & target class distributions...',
    'Generating candidate multi-modal variations...',
    'Running 3-gram & perceptual anti-collapse diversity filter...',
    'Attaching synthetic lineage & provenance metadata...',
    'Staging synthetic candidates for review...',
  ],
};

export const PerceptualProgressBar: React.FC<PerceptualProgressProps> = ({
  active,
  backendPercent = null,
  taskType = 'ingest',
  completed = false,
  error = null,
  onComplete,
}) => {
  const [stageIndex, setStageIndex] = useState(0);

  // Cycle stage micro-copy at a steady interval while active and no real backend percent
  useEffect(() => {
    if (!active) {
      setStageIndex(0);
      return;
    }

    const messages = STAGE_MESSAGES[taskType];
    const interval = setInterval(() => {
      setStageIndex((prev) => (prev + 1) % messages.length);
    }, 2800);

    return () => clearInterval(interval);
  }, [active, taskType]);

  // Handle onComplete notification when genuine completion occurs
  useEffect(() => {
    if (completed && onComplete) {
      const timer = setTimeout(() => onComplete(), 300);
      return () => clearTimeout(timer);
    }
  }, [completed, onComplete]);

  // Do not render if not active, not completed, and no error
  if (!active && !completed && !error) return null;

  const messages = STAGE_MESSAGES[taskType];
  const hasValidBackendPercent =
    typeof backendPercent === 'number' && !isNaN(backendPercent) && backendPercent >= 0 && backendPercent <= 100;

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
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={hasValidBackendPercent ? Math.round(backendPercent) : undefined}
      aria-label={messages[stageIndex]}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', marginBottom: '0.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', minWidth: 0 }}>
          {error ? (
            <span style={{ color: 'var(--rose)', display: 'flex', flexShrink: 0 }}>
              <AlertCircle size={16} strokeWidth={2} />
            </span>
          ) : completed ? (
            <motion.span
              initial={{ scale: 0.4, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 520, damping: 20 }}
              style={{ color: 'var(--emerald)', display: 'flex', flexShrink: 0 }}
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
              key={error ? 'err' : completed ? 'done' : stageIndex}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.16 }}
              style={{
                fontSize: '0.8rem',
                fontWeight: 500,
                color: error ? 'var(--rose)' : 'var(--text-primary)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {error ? error : completed ? 'Operation completed successfully' : messages[stageIndex]}
            </motion.span>
          </AnimatePresence>
        </div>

        {/* Numeric indicator: shown ONLY when real backend percentage exists */}
        {hasValidBackendPercent ? (
          <span
            style={{
              fontSize: '0.8rem',
              fontFamily: 'var(--font-mono)',
              color: 'var(--text-secondary)',
              flexShrink: 0,
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {Math.round(backendPercent)}%
          </span>
        ) : active ? (
          <span
            style={{
              fontSize: '0.725rem',
              fontFamily: 'var(--font-mono)',
              color: 'var(--text-muted)',
              flexShrink: 0,
            }}
          >
            Processing...
          </span>
        ) : null}
      </div>

      {/* Progress Track */}
      <div
        style={{
          position: 'relative',
          height: '6px',
          width: '100%',
          overflow: 'hidden',
          borderRadius: '9999px',
          backgroundColor: 'var(--bg-elevated)',
        }}
      >
        {error ? (
          <div style={{ height: '100%', width: '100%', backgroundColor: 'var(--rose)' }} />
        ) : completed ? (
          <motion.div
            style={{ height: '100%', width: '100%', backgroundColor: 'var(--emerald)' }}
            initial={{ scaleX: 0 }}
            animate={{ scaleX: 1 }}
            transition={{ duration: 0.25 }}
          />
        ) : hasValidBackendPercent ? (
          <motion.div
            style={{
              height: '100%',
              borderRadius: '9999px',
              backgroundColor: 'var(--accent-interactive)',
            }}
            initial={{ width: '0%' }}
            animate={{ width: `${backendPercent}%` }}
            transition={{ type: 'spring', stiffness: 200, damping: 25 }}
          />
        ) : (
          /* Indeterminate progress shimmer */
          <motion.div
            style={{
              position: 'absolute',
              height: '100%',
              width: '35%',
              borderRadius: '9999px',
              backgroundColor: 'var(--accent-interactive)',
            }}
            animate={{
              left: ['-35%', '100%'],
            }}
            transition={{
              repeat: Infinity,
              duration: 1.4,
              ease: 'easeInOut',
            }}
          />
        )}
      </div>
    </div>
  );
};
