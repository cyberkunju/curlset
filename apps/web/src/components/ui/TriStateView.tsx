import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';

export interface TriStateViewProps<T> {
  /** Unique boneyard skeleton registry name */
  skeletonName: string;
  loading: boolean;
  data: T | null | undefined;
  isEmpty: (data: T) => boolean;
  /** Static fixture component rendered during skeleton capture or loading */
  boneyardFixture?: React.ReactNode;
  /** Rendered when loading is false and isEmpty(data) is true */
  emptyState: React.ReactNode;
  /** Rendered when loading is false and data is non-empty */
  children: (data: T) => React.ReactNode;
  minHeight?: number;
}

export function TriStateView<T>({
  skeletonName: _skeletonName,
  loading,
  data,
  isEmpty,
  boneyardFixture,
  emptyState,
  children,
  minHeight = 280,
}: TriStateViewProps<T>) {
  const hasData = Boolean(data && !isEmpty(data));

  return (
    <div style={{ position: 'relative', width: '100%', minHeight: loading ? `${minHeight}px` : undefined }}>
      <AnimatePresence mode="wait">
        {loading && (
          <motion.div
            key="skeleton-state"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            style={{ width: '100%' }}
          >
            {boneyardFixture || (
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '1rem',
                  padding: '1.5rem',
                  borderRadius: '10px',
                  backgroundColor: 'var(--bg-surface)',
                  border: '1px solid var(--border-hairline)',
                }}
              >
                <div style={{ height: '24px', width: '40%', borderRadius: '6px', backgroundColor: 'var(--bg-elevated)', animation: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite' }} />
                <div style={{ height: '14px', width: '70%', borderRadius: '4px', backgroundColor: 'var(--bg-elevated)', animation: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite' }} />
                <div style={{ height: '120px', width: '100%', borderRadius: '8px', backgroundColor: 'var(--bg-elevated)', animation: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite' }} />
              </div>
            )}
          </motion.div>
        )}

        {!loading && !hasData && (
          <motion.div
            key="empty-state"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            style={{ width: '100%' }}
          >
            {emptyState}
          </motion.div>
        )}

        {!loading && hasData && data && (
          <motion.div
            key="loaded-state"
            initial={{ opacity: 0, scale: 0.992 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            style={{ width: '100%' }}
          >
            {children(data)}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
