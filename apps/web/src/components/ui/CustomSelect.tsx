import React, { useState, useRef, useEffect, useId } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, Check } from 'lucide-react';

export interface SelectOption {
  value: string;
  label: string;
  icon?: React.ReactNode;
  description?: string;
  disabled?: boolean;
}

export interface CustomSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: (SelectOption | string)[];
  placeholder?: string;
  prefix?: string;
  icon?: React.ReactNode;
  disabled?: boolean;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  style?: React.CSSProperties;
  menuStyle?: React.CSSProperties;
  ariaLabel?: string;
  id?: string;
}

const SPRING_MENU = {
  type: 'spring' as const,
  stiffness: 550,
  damping: 28,
  mass: 0.6,
};

export const CustomSelect: React.FC<CustomSelectProps> = ({
  value,
  onChange,
  options,
  placeholder = 'Select option...',
  prefix,
  icon,
  disabled = false,
  size = 'md',
  className = '',
  style,
  menuStyle,
  ariaLabel,
  id,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const listboxRef = useRef<HTMLDivElement>(null);
  const generatedId = useId();
  const selectId = id || generatedId;

  // Normalize options into SelectOption objects
  const normalizedOptions: SelectOption[] = options.map((opt) => {
    if (typeof opt === 'string') {
      return { value: opt, label: opt };
    }
    return opt;
  });

  const selectedOption = normalizedOptions.find((opt) => opt.value === value);

  // Close when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  // Handle keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return;

    if (!isOpen) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        setIsOpen(true);
        const currentIdx = normalizedOptions.findIndex((opt) => opt.value === value);
        setHighlightedIndex(currentIdx >= 0 ? currentIdx : 0);
      }
      return;
    }

    switch (e.key) {
      case 'Escape':
        e.preventDefault();
        setIsOpen(false);
        break;
      case 'ArrowDown': {
        e.preventDefault();
        setHighlightedIndex((prev) => {
          let next = prev + 1;
          while (next < normalizedOptions.length && normalizedOptions[next].disabled) {
            next++;
          }
          return next < normalizedOptions.length ? next : prev;
        });
        break;
      }
      case 'ArrowUp': {
        e.preventDefault();
        setHighlightedIndex((prev) => {
          let next = prev - 1;
          while (next >= 0 && normalizedOptions[next].disabled) {
            next--;
          }
          return next >= 0 ? next : prev;
        });
        break;
      }
      case 'Enter':
      case ' ': {
        e.preventDefault();
        if (highlightedIndex >= 0 && highlightedIndex < normalizedOptions.length) {
          const opt = normalizedOptions[highlightedIndex];
          if (!opt.disabled) {
            onChange(opt.value);
            setIsOpen(false);
          }
        }
        break;
      }
      case 'Tab':
        setIsOpen(false);
        break;
      default:
        break;
    }
  };

  const sizeStyles: Record<string, { height: string; padding: string; fontSize: string }> = {
    sm: { height: '30px', padding: '0 0.65rem', fontSize: '0.8rem' },
    md: { height: '36px', padding: '0 0.85rem', fontSize: '0.85rem' },
    lg: { height: '42px', padding: '0 1.1rem', fontSize: '0.92rem' },
  };

  const currentSize = sizeStyles[size] || sizeStyles.md;

  return (
    <div
      ref={containerRef}
      className={`custom-select-container ${className}`}
      style={{
        position: 'relative',
        display: 'inline-block',
        minWidth: '180px',
        ...style,
      }}
      onKeyDown={handleKeyDown}
    >
      <button
        type="button"
        id={selectId}
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-label={ariaLabel}
        disabled={disabled}
        onClick={() => !disabled && setIsOpen((prev) => !prev)}
        style={{
          width: '100%',
          height: currentSize.height,
          padding: currentSize.padding,
          fontSize: currentSize.fontSize,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '0.5rem',
          backgroundColor: 'var(--bg-surface)',
          color: selectedOption ? 'var(--text-primary)' : 'var(--text-muted)',
          border: `1px solid ${isOpen ? 'var(--accent-primary)' : 'var(--border-hairline)'}`,
          borderRadius: 'var(--radius-sm)',
          cursor: disabled ? 'not-allowed' : 'pointer',
          opacity: disabled ? 0.5 : 1,
          outline: 'none',
          boxShadow: isOpen ? '0 0 0 2px rgba(255, 255, 255, 0.08)' : 'none',
          transition: 'all 0.15s ease',
          userSelect: 'none',
        }}
      >
        <span
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.45rem',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {icon && <span style={{ display: 'inline-flex', flexShrink: 0, color: 'var(--text-muted)' }}>{icon}</span>}
          {prefix && <span style={{ color: 'var(--text-secondary)', fontWeight: 400 }}>{prefix}</span>}
          {selectedOption ? (
            <span style={{ fontWeight: 500, color: 'var(--text-primary)' }}>
              {selectedOption.icon && <span style={{ marginRight: '0.35rem' }}>{selectedOption.icon}</span>}
              {selectedOption.label}
            </span>
          ) : (
            <span style={{ color: 'var(--text-muted)' }}>{placeholder}</span>
          )}
        </span>

        <motion.span
          animate={{ rotate: isOpen ? 180 : 0 }}
          transition={{ duration: 0.18, ease: 'easeOut' }}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            color: 'var(--text-muted)',
            flexShrink: 0,
            marginLeft: '0.35rem',
          }}
        >
          <ChevronDown size={14} strokeWidth={2} />
        </motion.span>
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            ref={listboxRef}
            role="listbox"
            tabIndex={-1}
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
            transition={SPRING_MENU}
            style={{
              position: 'absolute',
              top: 'calc(100% + 4px)',
              left: 0,
              minWidth: '100%',
              maxWidth: '360px',
              maxHeight: '260px',
              backgroundColor: 'var(--bg-elevated)',
              border: '1px solid var(--border-hairline)',
              borderRadius: 'var(--radius-sm)',
              boxShadow: '0 12px 32px -4px rgba(0, 0, 0, 0.4), 0 0 1px 1px rgba(255, 255, 255, 0.06)',
              backdropFilter: 'blur(16px)',
              WebkitBackdropFilter: 'blur(16px)',
              zIndex: 1000,
              overflowY: 'auto',
              padding: '0.25rem',
              outline: 'none',
              ...menuStyle,
            }}
          >
            {normalizedOptions.map((option, idx) => {
              const isSelected = option.value === value;
              const isHighlighted = idx === highlightedIndex;

              return (
                <div
                  key={option.value}
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => {
                    if (!option.disabled) {
                      onChange(option.value);
                      setTimeout(() => {
                        setIsOpen(false);
                      }, 120);
                    }
                  }}
                  onMouseEnter={() => !option.disabled && setHighlightedIndex(idx)}
                  style={{
                    position: 'relative',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '0.65rem',
                    padding: '0.45rem 0.65rem',
                    borderRadius: '4px',
                    fontSize: '0.84rem',
                    fontWeight: isSelected ? 600 : 450,
                    color: isSelected
                      ? 'var(--text-primary)'
                      : option.disabled
                      ? 'var(--text-muted)'
                      : 'var(--text-secondary)',
                    backgroundColor: isHighlighted && !isSelected
                      ? 'var(--bg-subtle-hover)'
                      : 'transparent',
                    cursor: option.disabled ? 'not-allowed' : 'pointer',
                    opacity: option.disabled ? 0.45 : 1,
                    userSelect: 'none',
                    overflow: 'hidden',
                  }}
                >
                  {isSelected && (
                    <motion.div
                      layoutId={`custom-select-active-${selectId}`}
                      transition={{ type: 'spring' as const, stiffness: 500, damping: 35 }}
                      style={{
                        position: 'absolute',
                        inset: 0,
                        backgroundColor: 'var(--accent-subtle, rgba(59, 130, 246, 0.12))',
                        border: '1px solid var(--accent-interactive)',
                        borderRadius: '4px',
                        zIndex: 0,
                        pointerEvents: 'none',
                      }}
                    />
                  )}
                  <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                      {option.icon && <span>{option.icon}</span>}
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {option.label}
                      </span>
                    </div>
                    {option.description && (
                      <span
                        style={{
                          fontSize: '0.72rem',
                          color: 'var(--text-muted)',
                          marginTop: '0.1rem',
                          fontWeight: 400,
                        }}
                      >
                        {option.description}
                      </span>
                    )}
                  </div>

                  {isSelected && (
                    <span
                      style={{
                        position: 'relative',
                        zIndex: 1,
                        display: 'inline-flex',
                        alignItems: 'center',
                        color: 'var(--accent-interactive)',
                        flexShrink: 0,
                        marginLeft: '0.45rem',
                      }}
                    >
                      <Check size={14} strokeWidth={2.5} />
                    </span>
                  )}
                </div>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
