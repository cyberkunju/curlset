import React, { useEffect, useState, useRef, useCallback } from 'react';

export interface FloatingScrollbarProps {
  containerRef?: React.RefObject<HTMLElement | null>;
  offsetTop?: number;      // Height of top sticky header (default: 56px)
  offsetBottom?: number;   // Inset from bottom of viewport (default: 8px)
  thumbMinHeight?: number; // Minimum thumb height (default: 36px)
  thumbMaxHeight?: number; // Maximum thumb height to keep it compact (default: 80px)
  autoHideDelay?: number;  // Delay before fading out (default: 1100ms)
}

export const FloatingScrollbar: React.FC<FloatingScrollbarProps> = ({
  containerRef,
  offsetTop = 56,
  offsetBottom = 8,
  thumbMinHeight = 36,
  thumbMaxHeight = 80,
  autoHideDelay = 1100,
}) => {
  const [scrollTop, setScrollTop] = useState(0);
  const [scrollHeight, setScrollHeight] = useState(0);
  const [clientHeight, setClientHeight] = useState(0);
  const [isScrolling, setIsScrolling] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  const hideTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dragStartYRef = useRef(0);
  const dragStartScrollTopRef = useRef(0);
  const trackRef = useRef<HTMLDivElement>(null);

  // Measure and sync metrics from container or window
  const updateMetrics = useCallback(() => {
    const el = containerRef?.current;
    if (el && el.scrollHeight > el.clientHeight + 4) {
      setScrollTop(el.scrollTop);
      setScrollHeight(el.scrollHeight);
      setClientHeight(el.clientHeight);
    } else if (typeof window !== 'undefined') {
      const doc = document.documentElement;
      const body = document.body;
      const winScrollTop = window.scrollY || doc.scrollTop || body.scrollTop || 0;
      const winScrollHeight = Math.max(doc.scrollHeight, body.scrollHeight, window.innerHeight);
      const winClientHeight = window.innerHeight || doc.clientHeight || 0;
      setScrollTop(winScrollTop);
      setScrollHeight(winScrollHeight);
      setClientHeight(winClientHeight);
    }
  }, [containerRef]);

  // Initial gentle presence preview on mount to show user where the scrollbar sits
  useEffect(() => {
    setIsScrolling(true);
    const timer = setTimeout(() => {
      setIsScrolling(false);
    }, 1500);
    return () => clearTimeout(timer);
  }, []);

  // Attach scroll & resize observers to container AND window
  useEffect(() => {
    updateMetrics();

    const handleScroll = () => {
      updateMetrics();
      setIsScrolling(true);

      if (hideTimeoutRef.current) {
        clearTimeout(hideTimeoutRef.current);
      }

      hideTimeoutRef.current = setTimeout(() => {
        setIsScrolling(false);
      }, autoHideDelay);
    };

    const el = containerRef?.current;
    if (el) {
      el.addEventListener('scroll', handleScroll, { passive: true });
    }
    window.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('resize', handleScroll, { passive: true });

    // Observe size changes
    let resizeObserver: ResizeObserver | null = null;
    if (el) {
      resizeObserver = new ResizeObserver(() => {
        updateMetrics();
      });
      resizeObserver.observe(el);
      if (el.firstElementChild) {
        resizeObserver.observe(el.firstElementChild);
      }
    }

    return () => {
      if (el) el.removeEventListener('scroll', handleScroll);
      window.removeEventListener('scroll', handleScroll);
      window.removeEventListener('resize', handleScroll);
      resizeObserver?.disconnect();
      if (hideTimeoutRef.current) {
        clearTimeout(hideTimeoutRef.current);
      }
    };
  }, [containerRef, updateMetrics, autoHideDelay]);

  // Handle Dragging
  const handlePointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const el = containerRef?.current;
    const isUsingContainer = el && el.scrollHeight > el.clientHeight + 4;
    const initialScrollTop = isUsingContainer
      ? el.scrollTop
      : (window.scrollY || document.documentElement.scrollTop);

    setIsDragging(true);
    dragStartYRef.current = e.clientY;
    dragStartScrollTopRef.current = initialScrollTop;

    const onPointerMove = (moveEvent: PointerEvent) => {
      const deltaY = moveEvent.clientY - dragStartYRef.current;
      const trackHeight = clientHeight - (offsetTop + 4) - offsetBottom;
      const rawThumbHeight = clientHeight > 0 && scrollHeight > 0
        ? (clientHeight / scrollHeight) * trackHeight * 0.7
        : thumbMinHeight;
      const thumbHeight = Math.max(thumbMinHeight, Math.min(thumbMaxHeight, rawThumbHeight));
      const availableTrack = trackHeight - thumbHeight;

      if (availableTrack <= 0) return;

      const maxScroll = scrollHeight - clientHeight;
      const scrollDelta = (deltaY / availableTrack) * maxScroll;
      const targetScroll = Math.max(0, Math.min(maxScroll, dragStartScrollTopRef.current + scrollDelta));

      if (isUsingContainer && el) {
        el.scrollTop = targetScroll;
      } else {
        window.scrollTo({ top: targetScroll });
      }
    };

    const onPointerUp = () => {
      setIsDragging(false);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);

      // Start hide timer
      if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current);
      hideTimeoutRef.current = setTimeout(() => {
        setIsScrolling(false);
      }, autoHideDelay);
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
  };

  // Jump scroll when clicking on track outside thumb
  const handleTrackClick = (e: React.MouseEvent) => {
    const el = containerRef?.current;
    const isUsingContainer = el && el.scrollHeight > el.clientHeight + 4;
    const track = trackRef.current;
    if (!track) return;

    const rect = track.getBoundingClientRect();
    const clickY = e.clientY - rect.top;
    const trackHeight = rect.height;

    const rawThumbHeight = (clientHeight / scrollHeight) * trackHeight * 0.7;
    const thumbHeight = Math.max(thumbMinHeight, Math.min(thumbMaxHeight, rawThumbHeight));
    const availableTrack = trackHeight - thumbHeight;
    if (availableTrack <= 0) return;

    const maxScroll = scrollHeight - clientHeight;
    const clickRatio = Math.max(0, Math.min(1, (clickY - thumbHeight / 2) / availableTrack));
    const targetTop = clickRatio * maxScroll;

    if (isUsingContainer && el) {
      el.scrollTo({ top: targetTop, behavior: 'smooth' });
    } else {
      window.scrollTo({ top: targetTop, behavior: 'smooth' });
    }
  };

  const canScroll = scrollHeight > clientHeight + 4;
  const trackTop = offsetTop + 4;
  const trackHeight = Math.max(0, clientHeight - trackTop - offsetBottom);
  const rawThumbHeight = (clientHeight / scrollHeight) * trackHeight * 0.7;
  const thumbHeight = Math.max(thumbMinHeight, Math.min(thumbMaxHeight, rawThumbHeight));
  const maxScroll = scrollHeight - clientHeight;
  const scrollRatio = maxScroll > 0 ? Math.max(0, Math.min(1, scrollTop / maxScroll)) : 0;
  const thumbTop = scrollRatio * (trackHeight - thumbHeight);

  // Visible only when actively scrolling, hovered on right rail, or dragging
  const isVisible = canScroll && (isScrolling || isHovered || isDragging);

  if (!canScroll) return null;

  return (
    <div
      ref={trackRef}
      onClick={handleTrackClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        position: 'fixed',
        top: `${trackTop}px`,
        height: `${trackHeight}px`,
        right: '4px',
        width: '16px',
        zIndex: 9999,
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'flex-start',
        backgroundColor: isHovered || isDragging ? 'rgba(255, 255, 255, 0.05)' : 'transparent',
        borderRadius: '9999px',
        pointerEvents: isVisible || isHovered ? 'auto' : 'none',
        userSelect: 'none',
        transition: 'background-color 0.2s ease',
      }}
      title="Scroll indicator"
    >
      {/* Shorter Pill Thumb */}
      <div
        onPointerDown={handlePointerDown}
        style={{
          width: isHovered || isDragging ? '8px' : '5px',
          height: `${thumbHeight}px`,
          transform: `translateY(${thumbTop}px) ${isVisible ? 'translateX(0)' : 'translateX(8px)'}`,
          opacity: isVisible ? 1 : 0,
          borderRadius: '9999px',
          backgroundColor: isDragging
            ? 'var(--accent-interactive, #3b82f6)'
            : isHovered
            ? 'var(--text-primary, #ffffff)'
            : 'var(--text-secondary, rgba(161, 161, 170, 0.75))',
          boxShadow: isDragging
            ? '0 0 10px rgba(59, 130, 246, 0.6)'
            : '0 1px 4px rgba(0, 0, 0, 0.4)',
          cursor: 'pointer',
          transition: isDragging
            ? 'width 0.15s ease, background-color 0.15s ease'
            : 'opacity 0.25s cubic-bezier(0.16, 1, 0.3, 1), transform 0.25s cubic-bezier(0.16, 1, 0.3, 1), width 0.15s ease, background-color 0.15s ease',
        }}
      />
    </div>
  );
};
