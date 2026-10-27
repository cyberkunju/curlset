import React from 'react';
import { AnimatePresence, motion } from 'framer-motion';

export interface DirectionalTransitionProps {
  activeKey: string;
  direction: 1 | -1; // +1 when moving right/forward, -1 when moving left/back
  children: React.ReactNode;
}

const variants = {
  enter: (direction: number) => ({
    x: direction > 0 ? 24 : -24,
    opacity: 0,
    filter: 'blur(2px)',
  }),
  center: {
    x: 0,
    opacity: 1,
    filter: 'blur(0px)',
  },
  exit: (direction: number) => ({
    x: direction > 0 ? -18 : 18,
    opacity: 0,
    filter: 'blur(1px)',
  }),
};

export const DirectionalPageTransition: React.FC<DirectionalTransitionProps> = ({
  activeKey,
  direction,
  children,
}) => {
  return (
    <div style={{ position: 'relative', width: '100%', overflow: 'hidden' }}>
      <AnimatePresence custom={direction} initial={false} mode="wait">
        <motion.div
          key={activeKey}
          custom={direction}
          variants={variants}
          initial="enter"
          animate="center"
          exit="exit"
          transition={{
            x: { type: 'spring', stiffness: 420, damping: 34, mass: 0.8 },
            opacity: { duration: 0.18, ease: [0.16, 1, 0.3, 1] },
            filter: { duration: 0.16 },
          }}
          style={{ width: '100%' }}
        >
          {children}
        </motion.div>
      </AnimatePresence>
    </div>
  );
};
