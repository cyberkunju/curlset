import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ImageOff } from 'lucide-react';

type MaterializationStage = 'grain' | 'scanning' | 'blueprint_blur' | 'sharp' | 'error';

export interface ProgressiveAssetImageProps {
  src: string;
  alt: string;
  width?: number;
  height?: number;
  className?: string;
  style?: React.CSSProperties;
  /** Set true when an AI model is actively generating/labeling the image */
  isGeneratingOrScanning?: boolean;
}

export const ProgressiveAssetImage: React.FC<ProgressiveAssetImageProps> = ({
  src,
  alt,
  width = 640,
  height = 480,
  className = '',
  style,
  isGeneratingOrScanning = false,
}) => {
  const [stage, setStage] = useState<MaterializationStage>('grain');
  const [imageLoaded, setImageLoaded] = useState(false);

  useEffect(() => {
    setStage('grain');
    setImageLoaded(false);

    const scanTimer = setTimeout(() => {
      setStage((prev) => (prev === 'grain' ? 'scanning' : prev));
    }, 140);

    return () => clearTimeout(scanTimer);
  }, [src]);

  useEffect(() => {
    if (!imageLoaded || isGeneratingOrScanning) return;

    // Transition: scanning -> blueprint_blur -> sharp
    setStage('blueprint_blur');
    const sharpTimer = setTimeout(() => {
      setStage('sharp');
    }, 240);

    return () => clearTimeout(sharpTimer);
  }, [imageLoaded, isGeneratingOrScanning]);

  const getImageFilter = () => {
    switch (stage) {
      case 'grain':
      case 'scanning':
        return 'blur(8px) grayscale(100%)';
      case 'blueprint_blur':
        return 'blur(12px) contrast(1.1) sepia(0.35) hue-rotate(185deg) saturate(1.6)';
      case 'sharp':
        return 'none';
      default:
        return 'none';
    }
  };

  return (
    <div
      className={className}
      style={{
        position: 'relative',
        overflow: 'hidden',
        backgroundColor: 'var(--bg-elevated)',
        borderRadius: '8px',
        userSelect: 'none',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        aspectRatio: `${width} / ${height}`,
        ...style,
      }}
    >
      {/* Hidden preloader image */}
      <img
        src={src}
        alt={alt}
        onLoad={() => setImageLoaded(true)}
        onError={() => setStage('error')}
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'contain',
          transition: 'all 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
          opacity: stage === 'sharp' ? 1 : stage === 'blueprint_blur' ? 0.85 : 0.05,
          transform: stage === 'sharp' ? 'scale(1)' : 'scale(1.02)',
          filter: getImageFilter(),
          display: stage === 'error' ? 'none' : 'block',
        }}
      />

      {/* Stage 1 & 2: Film Grain + Optical Scanline Overlay */}
      <AnimatePresence>
        {(stage === 'grain' || stage === 'scanning' || stage === 'blueprint_blur') && (
          <motion.div
            key="materializer-overlay"
            initial={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.26, ease: [0.16, 1, 0.3, 1] }}
            style={{
              position: 'absolute',
              inset: 0,
              pointerEvents: 'none',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              padding: '0.75rem',
            }}
          >
            {/* Subtle SVG Film Grain Texture */}
            <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0.12 }}>
              <filter id="tactile-grain">
                <feTurbulence
                  type="fractalNoise"
                  baseFrequency="0.85"
                  numOctaves="3"
                  stitchTiles="stitch"
                />
              </filter>
              <rect width="100%" height="100%" filter="url(#tactile-grain)" />
            </svg>

            {/* Stage 2: Sweeping Diagnostic Scanline */}
            {(stage === 'scanning' || isGeneratingOrScanning) && (
              <motion.div
                initial={{ top: '-5%' }}
                animate={{ top: '105%' }}
                transition={{
                  duration: 1.15,
                  repeat: Infinity,
                  ease: 'linear',
                }}
                style={{
                  position: 'absolute',
                  left: 0,
                  right: 0,
                  height: '2px',
                  backgroundColor: 'var(--accent-interactive)',
                  boxShadow: '0 0 8px var(--accent-interactive)',
                }}
              />
            )}

            {/* Status Micro-Badge */}
            <div
              style={{
                position: 'relative',
                zIndex: 10,
                marginTop: 'auto',
                display: 'inline-flex',
                alignSelf: 'flex-start',
                alignItems: 'center',
                gap: '0.35rem',
                borderRadius: '4px',
                backgroundColor: 'rgba(9, 9, 11, 0.85)',
                padding: '0.2rem 0.5rem',
                fontSize: '0.65rem',
                fontFamily: 'var(--font-mono)',
                color: 'var(--text-secondary)',
                border: '1px solid var(--border-hairline)',
              }}
            >
              <span
                style={{
                  width: '6px',
                  height: '6px',
                  borderRadius: '50%',
                  backgroundColor: 'var(--accent-interactive)',
                  display: 'inline-block',
                }}
              />
              Loading asset…            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Error Fallback */}
      {stage === 'error' && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.5rem',
            padding: '1rem',
            textAlign: 'center',
            fontSize: '0.75rem',
            color: 'var(--text-muted)',
          }}
        >
          <ImageOff size={22} strokeWidth={1.75} />
          <span>Asset unreadable or missing from storage</span>
        </div>
      )}
    </div>
  );
};
