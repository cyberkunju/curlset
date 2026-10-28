import React, { useRef } from 'react';
import { flushSync } from 'react-dom';
import { Sun, Moon } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface ThemeToggleProps {
  isDark: boolean;
  onThemeChange: (isDark: boolean) => void;
  className?: string;
  style?: React.CSSProperties;
}

export const ThemeToggle: React.FC<ThemeToggleProps> = ({
  isDark,
  onThemeChange,
  className = '',
  style = {},
}) => {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const isTransitioningRef = useRef(false);

  const handleToggle = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (isTransitioningRef.current) return;

    const willBeDark = !isDark;

    // Retrieve origin coordinates from button capsule center
    const rect = buttonRef.current?.getBoundingClientRect();
    const x = e.clientX || (rect ? rect.left + rect.width / 2 : window.innerWidth / 2);
    const y = e.clientY || (rect ? rect.top + rect.height / 2 : 32);

    const applyTheme = () => {
      if (willBeDark) {
        document.documentElement.classList.add('dark');
        localStorage.setItem('theme', 'dark');
      } else {
        document.documentElement.classList.remove('dark');
        localStorage.setItem('theme', 'light');
      }
      onThemeChange(willBeDark);
    };

    // Fallback if View Transitions API is not supported or user prefers reduced motion
    const startViewTransition = (document as any).startViewTransition;
    if (
      typeof startViewTransition !== 'function' ||
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      applyTheme();
      return;
    }

    isTransitioningRef.current = true;

    // Calculate maximum radius to engulf the farthest corner of the viewport
    const endRadius = Math.hypot(
      Math.max(x, window.innerWidth - x),
      Math.max(y, window.innerHeight - y)
    );

    try {
      const transition = startViewTransition.call(document, () => {
        flushSync(() => {
          applyTheme();
        });
      });

      transition.ready
        .then(() => {
          const animation = document.documentElement.animate(
            {
              clipPath: [
                `circle(0px at ${x}px ${y}px)`,
                `circle(${endRadius}px at ${x}px ${y}px)`,
              ],
            },
            {
              duration: 800,
              easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
              pseudoElement: '::view-transition-new(root)',
            }
          );

          animation.onfinish = () => {
            isTransitioningRef.current = false;
          };
        })
        .catch(() => {
          isTransitioningRef.current = false;
        });

      transition.finished.finally(() => {
        isTransitioningRef.current = false;
      });
    } catch {
      applyTheme();
      isTransitioningRef.current = false;
    }
  };

  return (
    <motion.button
      ref={buttonRef}
      type="button"
      onClick={handleToggle}
      whileTap={{ scale: 0.88 }}
      whileHover={{ scale: 1.05 }}
      transition={{ type: 'spring', stiffness: 500, damping: 28 }}
      aria-label={isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
      title={isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
      className={`theme-toggle-btn ${className}`}
      style={{
        position: 'relative',
        width: '32px',
        height: '32px',
        padding: 0,
        borderRadius: 'var(--radius-sm)',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'var(--bg-surface)',
        border: '1px solid var(--border-hairline)',
        color: 'var(--text-secondary)',
        cursor: 'pointer',
        overflow: 'hidden',
        boxShadow: 'var(--shadow-xs)',
        ...style,
      }}
    >
      <AnimatePresence mode="wait" initial={false}>
        {isDark ? (
          <motion.div
            key="sun-icon"
            initial={{ rotate: -90, scale: 0.5, opacity: 0 }}
            animate={{ rotate: 0, scale: 1, opacity: 1 }}
            exit={{ rotate: 90, scale: 0.5, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 26 }}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            <Sun size={15} strokeWidth={2} style={{ color: 'var(--amber, #F59E0B)' }} />
          </motion.div>
        ) : (
          <motion.div
            key="moon-icon"
            initial={{ rotate: 90, scale: 0.5, opacity: 0 }}
            animate={{ rotate: 0, scale: 1, opacity: 1 }}
            exit={{ rotate: -90, scale: 0.5, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 26 }}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            <Moon size={15} strokeWidth={2} style={{ color: 'var(--text-secondary)' }} />
          </motion.div>
        )}
      </AnimatePresence>
    </motion.button>
  );
};
