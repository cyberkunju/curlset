import React from 'react';
import { motion, HTMLMotionProps, useReducedMotion } from 'framer-motion';

export interface SpringButtonProps extends HTMLMotionProps<'button'> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'brand';
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
  const shouldReduceMotion = useReducedMotion();

  const baseStyles: React.CSSProperties = {
    position: 'relative',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '0.45rem',
    fontWeight: 500,
    userSelect: 'none',
    borderRadius: 'var(--radius-sm)',
    border: '1px solid transparent',
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.45 : 1,
    fontFamily: 'inherit',
    transition: 'background-color 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease',
  };

  const variantStyles: Record<string, React.CSSProperties> = {
    primary: {
      backgroundColor: 'var(--accent-primary)',
      color: 'var(--accent-primary-fg)',
      borderColor: 'transparent',
    },
    brand: {
      backgroundColor: 'var(--brand-primary)',
      color: '#FFFFFF',
      borderColor: 'transparent',
      boxShadow: 'var(--brand-shadow-sm)',
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
      backgroundColor: 'rgba(239, 68, 68, 0.08)',
      color: 'var(--status-rejected)',
      borderColor: 'rgba(239, 68, 68, 0.25)',
    },
  };

  const sizeStyles: Record<string, React.CSSProperties> = {
    sm: { height: '30px', padding: '0 0.65rem', fontSize: '0.78rem' },
    md: { height: '34px', padding: '0 0.85rem', fontSize: '0.85rem' },
    lg: { height: '38px', padding: '0 1.1rem', fontSize: '0.92rem' },
  };

  return (
    <motion.button
      whileHover={
        disabled
          ? undefined
          : shouldReduceMotion
          ? { opacity: 0.9 }
          : { scale: 1.015, y: -0.5 }
      }
      whileTap={
        disabled
          ? undefined
          : shouldReduceMotion
          ? { opacity: 0.8 }
          : { scale: 0.96, y: 0.5 }
      }
      transition={shouldReduceMotion ? { duration: 0.1 } : SPRING_BUBBLE}
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
          style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, lineHeight: 0 }}
          whileHover={shouldReduceMotion ? undefined : { rotate: -4, scale: 1.08 }}
          whileTap={shouldReduceMotion ? undefined : { scale: 0.9 }}
          transition={shouldReduceMotion ? { duration: 0.1 } : SPRING_BUBBLE}
        >
          {icon}
        </motion.span>
      )}
      {children && (
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'inherit',
            gap: 'inherit',
            lineHeight: 1,
          }}
        >
          {children as React.ReactNode}
        </span>
      )}
      {shortcut && (
        <kbd
          style={{
            marginLeft: '0.25rem',
            padding: '0.1rem 0.35rem',
            fontSize: '0.65rem',
            fontFamily: 'var(--font-mono)',
            borderRadius: '3px',
            backgroundColor: 'var(--bg-elevated)',
            color: 'var(--text-muted)',
            border: '1px solid var(--border-hairline)',
          }}
        >
          {shortcut}
        </kbd>
      )}
    </motion.button>
  );
};
