import React from 'react';
import { motion, HTMLMotionProps } from 'framer-motion';

export interface SpringButtonProps extends HTMLMotionProps<'button'> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  icon?: React.ReactNode;
  shortcut?: string;
}

const SPRING_BUBBLE = {
  type: 'spring' as const,
  stiffness: 540,
  damping: 22,
  mass: 0.65,
};

export const SpringButton: React.FC<SpringButtonProps> = ({
  variant = 'primary',
  size = 'md',
  icon,
  shortcut,
  children,
  className = '',
  disabled,
  style,
  ...props
}) => {
  const baseStyles: React.CSSProperties = {
    position: 'relative',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '0.5rem',
    fontWeight: 500,
    userSelect: 'none',
    borderRadius: '8px',
    border: '1px solid transparent',
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.45 : 1,
    fontFamily: 'inherit',
    transition: 'background-color 0.15s ease, border-color 0.15s ease',
  };

  const variantStyles: Record<string, React.CSSProperties> = {
    primary: {
      backgroundColor: 'var(--accent-primary)',
      color: 'var(--accent-primary-fg)',
      borderColor: 'transparent',
    },
    secondary: {
      backgroundColor: 'var(--bg-surface)',
      color: 'var(--text-primary)',
      borderColor: 'var(--border-hairline)',
    },
    ghost: {
      backgroundColor: 'transparent',
      color: 'var(--text-secondary)',
      borderColor: 'transparent',
    },
    danger: {
      backgroundColor: 'rgba(239, 68, 68, 0.12)',
      color: 'var(--status-rejected)',
      borderColor: 'rgba(239, 68, 68, 0.25)',
    },
  };

  const sizeStyles: Record<string, React.CSSProperties> = {
    sm: { height: '32px', padding: '0 0.65rem', fontSize: '0.75rem' },
    md: { height: '36px', padding: '0 0.85rem', fontSize: '0.875rem' },
    lg: { height: '40px', padding: '0 1.1rem', fontSize: '0.95rem' },
  };

  return (
    <motion.button
      whileHover={disabled ? undefined : { scale: 1.018, y: -0.5 }}
      whileTap={disabled ? undefined : { scale: 0.945, y: 0.5 }}
      transition={SPRING_BUBBLE}
      disabled={disabled}
      className={className}
      style={{
        ...baseStyles,
        ...variantStyles[variant],
        ...sizeStyles[size],
        ...style,
      }}
      {...props}
    >
      {icon && (
        <motion.span
          style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
          whileHover={{ rotate: -6, scale: 1.1 }}
          whileTap={{ scale: 0.88 }}
          transition={SPRING_BUBBLE}
        >
          {icon}
        </motion.span>
      )}
      <span>{children as React.ReactNode}</span>
      {shortcut && (
        <kbd
          style={{
            marginLeft: '0.25rem',
            padding: '0.1rem 0.35rem',
            fontSize: '0.65rem',
            fontFamily: 'var(--font-mono)',
            borderRadius: '4px',
            backgroundColor: 'rgba(255, 255, 255, 0.1)',
            color: 'inherit',
            opacity: 0.75,
            border: '1px solid rgba(255, 255, 255, 0.15)',
          }}
        >
          {shortcut}
        </kbd>
      )}
    </motion.button>
  );
};
