import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle2, Loader2, AlertCircle } from 'lucide-react';
import { resolveProgressDisplayState } from '../../utils/uiIntegrityContracts';

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

/**
 * Honest single-line status labels.
 *
 * This component renders only what it actually knows: an optional real backend
 * percentage, an indeterminate state, completion or an error. It deliberately does
 * NOT narrate fabricated backend stages — the client has no insight into which
 * server-side step is executing, so claiming one would be invented telemetry.
 */
const TASK_STATUS_LABELS: Record<NonNullable<PerceptualProgressProps['taskType']>, string> = {
  ingest: 'Importing records',
  annotate: 'Running batch labeling',
  validate: 'Running validation',
  export: 'Generating export package',
  synthesize: 'Generating synthetic samples',
};

export const PerceptualProgressBar: React.FC<PerceptualProgressProps> = ({
  active,
  backendPercent = null,
  taskType = 'ingest',
  completed = false,
  error = null,
  onComplete,
}) => {
  // Handle onComplete notification when genuine completion occurs
  useEffect(() => {
    if (completed && onComplete) {
      const timer = setTimeout(() => onComplete(), 300);
      return () => clearTimeout(timer);
    }
  }, [completed, onComplete]);

  const displayState = resolveProgressDisplayState({
    active,
    backendPercent,
    completed,
    error,
  });

  // Do not render if the resolved state is hidden
  if (displayState.kind === 'hidden') return null;

  const statusLabel = TASK_STATUS_LABELS[taskType];
  const hasValidBackendPercent = displayState.clampedPercent !== null;

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
      aria-valuenow={hasValidBackendPercent ? Math.round(displayState.clampedPercent!) : undefined}
      aria-label={statusLabel}
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
              key={error ? 'err' : completed ? 'done' : 'active'}
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
              {error ? error : completed ? 'Operation completed successfully' : statusLabel}
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
            {Math.round(displayState.clampedPercent!)}%
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
