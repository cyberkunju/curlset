import React, { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';

export type ModalSize = 'sm' | 'md' | 'lg' | 'xl' | 'full';

export interface ModalShellProps {
  isOpen: boolean;
  onClose: () => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  icon?: React.ReactNode;
  size?: ModalSize;
  children: React.ReactNode;
  headerActions?: React.ReactNode;
  footer?: React.ReactNode;
  closeOnBackdropClick?: boolean;
  closeOnEsc?: boolean;
  ariaLabel?: string;
  className?: string;
  contentStyle?: React.CSSProperties;
  bodyStyle?: React.CSSProperties;
}

const SIZE_MAX_WIDTH: Record<ModalSize, string> = {
  sm: '440px',
  md: '580px',
  lg: '760px',
  xl: '960px',
  full: '95vw',
};

const SPRING_MODAL = {
  type: 'spring' as const,
  stiffness: 460,
  damping: 32,
  mass: 0.6,
};

export const ModalShell: React.FC<ModalShellProps> = ({
  isOpen,
  onClose,
  title,
  description,
  icon,
  size = 'md',
  children,
  headerActions,
  footer,
  closeOnBackdropClick = true,
  closeOnEsc = true,
  ariaLabel,
  className = '',
  contentStyle,
  bodyStyle,
}) => {
  const contentRef = useRef<HTMLDivElement>(null);
  const previouslyFocusedElementRef = useRef<HTMLElement | null>(null);
  const mouseDownTargetRef = useRef<EventTarget | null>(null);
  const titleId = useRef(`modal-title-${Math.random().toString(36).slice(2, 9)}`).current;
  const descId = useRef(`modal-desc-${Math.random().toString(36).slice(2, 9)}`).current;

  // Track and restore focus
  useEffect(() => {
    if (isOpen) {
      previouslyFocusedElementRef.current = document.activeElement as HTMLElement | null;

      // Focus first focusable element inside the modal once mounted
      const focusTimer = setTimeout(() => {
        if (contentRef.current) {
          const focusable = contentRef.current.querySelectorAll<HTMLElement>(
            'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
          );
          if (focusable.length > 0) {
            focusable[0].focus();
          } else {
            contentRef.current.focus();
          }
        }
      }, 50);

      return () => clearTimeout(focusTimer);
    } else {
      if (previouslyFocusedElementRef.current && typeof previouslyFocusedElementRef.current.focus === 'function') {
        previouslyFocusedElementRef.current.focus();
        previouslyFocusedElementRef.current = null;
      }
    }
  }, [isOpen]);

  // Restore focus if modal unmounts while open
  useEffect(() => {
    return () => {
      if (previouslyFocusedElementRef.current && typeof previouslyFocusedElementRef.current.focus === 'function') {
        previouslyFocusedElementRef.current.focus();
      }
    };
  }, []);

  // Keyboard Escape listener and Focus Trap
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && closeOnEsc) {
        e.stopPropagation();
        onClose();
        return;
      }

      // Focus trap for Tab and Shift+Tab
      if (e.key === 'Tab' && contentRef.current) {
        const focusable = Array.from(
          contentRef.current.querySelectorAll<HTMLElement>(
            'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
          )
        ).filter((el) => el.offsetParent !== null || el.getClientRects().length > 0);

        if (focusable.length === 0) {
          e.preventDefault();
          return;
        }

        const firstElement = focusable[0];
        const lastElement = focusable[focusable.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === firstElement || !contentRef.current.contains(document.activeElement)) {
            e.preventDefault();
            lastElement.focus();
          }
        } else {
          if (document.activeElement === lastElement || !contentRef.current.contains(document.activeElement)) {
            e.preventDefault();
            firstElement.focus();
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, closeOnEsc, onClose]);

  // Lock body scroll when open
  useEffect(() => {
    if (!isOpen) return;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [isOpen]);

  const handleBackdropMouseDown = (e: React.MouseEvent) => {
    mouseDownTargetRef.current = e.target;
  };

  const handleBackdropClick = (e: React.MouseEvent) => {
    // Dismiss strictly when mousedown AND mouseup occurred on the backdrop overlay
    if (
      closeOnBackdropClick &&
      e.target === e.currentTarget &&
      mouseDownTargetRef.current === e.currentTarget
    ) {
      onClose();
    }
  };

  const maxWidth = SIZE_MAX_WIDTH[size];
  const isFull = size === 'full';

  return (
    <AnimatePresence>
      {isOpen && (
        <div
          className="modal-overlay"
          onMouseDown={handleBackdropMouseDown}
          onClick={handleBackdropClick}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          aria-describedby={description ? descId : undefined}
          aria-label={typeof title === 'string' ? title : ariaLabel || 'Dialog'}
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.55)',
            backdropFilter: 'blur(2px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '1.25rem',
            overflowY: 'auto',
          }}
        >
          <motion.div
            ref={contentRef}
            tabIndex={-1}
            initial={{ opacity: 0, scale: 0.96, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            transition={SPRING_MODAL}
            className={`modal-shell-content ${className}`}
            onClick={(e) => e.stopPropagation()}
            style={{
              width: '100%',
              maxWidth,
              maxHeight: isFull ? '92vh' : '90vh',
              display: 'flex',
              flexDirection: 'column',
              backgroundColor: 'var(--bg-surface)',
              border: '1px solid var(--border-hairline)',
              borderRadius: isFull ? 'var(--radius-lg)' : 'var(--radius-lg)',
              boxShadow: 'var(--shadow-xl)',
              color: 'var(--text-primary)',
              overflow: 'hidden',
              position: 'relative',
              outline: 'none',
              ...contentStyle,
            }}
          >
            {/* Header */}
            <div
              className="modal-shell-header"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '1.15rem 1.35rem',
                borderBottom: '1px solid var(--border-hairline)',
                background: 'var(--bg-elevated)',
                flexShrink: 0,
                gap: '0.75rem',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', minWidth: 0, flex: 1 }}>
                {icon && (
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: 'var(--text-primary)',
                      flexShrink: 0,
                    }}
                  >
                    {icon}
                  </div>
                )}
                <div style={{ minWidth: 0 }}>
                  <h2
                    id={titleId}
                    style={{
                      fontSize: '1.15rem',
                      fontWeight: 700,
                      color: 'var(--text-primary)',
                      margin: 0,
                      letterSpacing: 'var(--letter-spacing-heading)',
                      lineHeight: 1.3,
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem',
                    }}
                  >
                    {title}
                  </h2>
                  {description && (
                    <p
                      id={descId}
                      style={{
                        margin: '0.2rem 0 0',
                        fontSize: '0.82rem',
                        color: 'var(--text-secondary)',
                        lineHeight: 1.4,
                      }}
                    >
                      {description}
                    </p>
                  )}
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }}>
                {headerActions}
                <button
                  type="button"
                  className="modal-shell-close-btn"
                  onClick={onClose}
                  aria-label="Close dialog"
                  style={{
                    background: 'transparent',
                    border: '1px solid transparent',
                    borderRadius: 'var(--radius-sm)',
                    padding: '0.35rem',
                    cursor: 'pointer',
                    color: 'var(--text-muted)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transition: 'all 0.15s ease',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.color = 'var(--text-primary)';
                    e.currentTarget.style.backgroundColor = 'var(--bg-subtle-hover)';
                    e.currentTarget.style.borderColor = 'var(--border-hairline)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.color = 'var(--text-muted)';
                    e.currentTarget.style.backgroundColor = 'transparent';
                    e.currentTarget.style.borderColor = 'transparent';
                  }}
                >
                  <X size={18} strokeWidth={1.75} />
                </button>
              </div>
            </div>

            {/* Scrollable Body */}
            <div
              className="modal-shell-body"
              style={{
                flex: 1,
                overflowY: 'auto',
                padding: '1.35rem',
                ...bodyStyle,
              }}
            >
              {children}
            </div>

            {/* Footer */}
            {footer && (
              <div
                className="modal-shell-footer"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'flex-end',
                  gap: '0.75rem',
                  padding: '1rem 1.35rem',
                  borderTop: '1px solid var(--border-hairline)',
                  background: 'var(--bg-elevated)',
                  flexShrink: 0,
                }}
              >
                {footer}
              </div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
