import React from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';

export interface DirectionalTransitionProps {
  activeKey: string;
  direction: 1 | -1; // +1 when moving right/forward, -1 when moving left/back
  children: React.ReactNode;
}

export const DirectionalPageTransition: React.FC<DirectionalTransitionProps> = ({
  activeKey,
  direction,
  children,
}) => {
  const shouldReduceMotion = useReducedMotion();

  const variants = {
    enter: (dir: number) => ({
      x: shouldReduceMotion ? 0 : dir > 0 ? 20 : -20,
      opacity: 0,
      filter: shouldReduceMotion ? 'none' : 'blur(2px)',
    }),
    center: {
      x: 0,
      opacity: 1,
      filter: 'none',
    },
    exit: (dir: number) => ({
      x: shouldReduceMotion ? 0 : dir > 0 ? -16 : 16,
      opacity: 0,
      filter: shouldReduceMotion ? 'none' : 'blur(1px)',
    }),
  };

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', display: 'flex', flexDirection: 'column', flex: 1 }}>
      <AnimatePresence custom={direction} initial={false} mode="wait">
        <motion.div
          key={activeKey}
          custom={direction}
          variants={variants}
          initial="enter"
          animate="center"
          exit="exit"
          transition={
            shouldReduceMotion
              ? { duration: 0.15, ease: 'linear' }
              : {
                  x: { type: 'spring', stiffness: 420, damping: 34, mass: 0.8 },
                  opacity: { duration: 0.18, ease: [0.16, 1, 0.3, 1] },
                  filter: { duration: 0.15 },
                }
          }
          style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', flex: 1 }}
        >
          {children}
        </motion.div>
      </AnimatePresence>
    </div>
  );
};
