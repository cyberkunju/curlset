import React, { useEffect, useState, useRef, useCallback } from 'react';

export interface FloatingScrollbarProps {
  containerRef: React.RefObject<HTMLElement | null>;
  offsetTop?: number;      // Inset from top of scroll container (default: 6px)
  offsetBottom?: number;   // Inset from bottom of scroll container (default: 6px)
  thumbMinHeight?: number; // Minimum thumb height (default: 64px)
  autoHideDelay?: number;  // Delay before fading out (default: 1200ms)
}

export const FloatingScrollbar: React.FC<FloatingScrollbarProps> = ({
  containerRef,
  offsetTop = 6,
  offsetBottom = 6,
  thumbMinHeight = 64,
  autoHideDelay = 1200,
}) => {
  const [scrollTop, setScrollTop] = useState(0);
  const [scrollHeight, setScrollHeight] = useState(0);
  const [clientHeight, setClientHeight] = useState(0);
  const [containerRect, setContainerRect] = useState({ top: 56, height: 800 });
  const [isScrolling, setIsScrolling] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  const hideTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dragStartYRef = useRef(0);
  const dragStartScrollTopRef = useRef(0);
  const trackRef = useRef<HTMLDivElement>(null);

  // Measure and sync metrics strictly from the target container
  const updateMetrics = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    setScrollTop(el.scrollTop);
    setScrollHeight(el.scrollHeight);
    setClientHeight(el.clientHeight);
    const rect = el.getBoundingClientRect();
    setContainerRect({ top: rect.top, height: rect.height });
  }, [containerRef]);

  // Initial gentle presence preview on mount/route change
  useEffect(() => {
    setIsScrolling(true);
    const timer = setTimeout(() => {
      setIsScrolling(false);
    }, 1800);
    return () => clearTimeout(timer);
  }, []);

  // Attach scroll & resize observers strictly to container
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    updateMetrics();

    const handleScroll = () => {
      setScrollTop(el.scrollTop);
      setIsScrolling(true);

      if (hideTimeoutRef.current) {
        clearTimeout(hideTimeoutRef.current);
      }

      hideTimeoutRef.current = setTimeout(() => {
        setIsScrolling(false);
      }, autoHideDelay);
    };

    el.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('resize', updateMetrics);

    // Observe size changes of container and its content
    const resizeObserver = new ResizeObserver(() => {
      updateMetrics();
    });

    resizeObserver.observe(el);
    if (el.firstElementChild) {
      resizeObserver.observe(el.firstElementChild);
    }

    return () => {
      el.removeEventListener('scroll', handleScroll);
      window.removeEventListener('resize', updateMetrics);
      resizeObserver.disconnect();
      if (hideTimeoutRef.current) {
        clearTimeout(hideTimeoutRef.current);
      }
    };
  }, [containerRef, updateMetrics, autoHideDelay]);

  // Handle Dragging
  const handlePointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const el = containerRef.current;
    if (!el) return;

    setIsDragging(true);
    dragStartYRef.current = e.clientY;
    dragStartScrollTopRef.current = el.scrollTop;

    const trackHeight = Math.max(0, containerRect.height - offsetTop - offsetBottom);
    const rawThumbHeight = scrollHeight > 0
      ? (clientHeight / scrollHeight) * trackHeight
      : thumbMinHeight;
    const thumbHeight = Math.max(thumbMinHeight, Math.min(trackHeight - 4, Math.round(rawThumbHeight)));
    const availableTrack = trackHeight - thumbHeight;

    const onPointerMove = (moveEvent: PointerEvent) => {
      if (availableTrack <= 0) return;
      const deltaY = moveEvent.clientY - dragStartYRef.current;
      const maxScroll = scrollHeight - clientHeight;
      const scrollDelta = (deltaY / availableTrack) * maxScroll;
      el.scrollTop = Math.max(0, Math.min(maxScroll, dragStartScrollTopRef.current + scrollDelta));
    };

    const onPointerUp = () => {
      setIsDragging(false);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);

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
    const el = containerRef.current;
    const track = trackRef.current;
    if (!el || !track) return;

    const rect = track.getBoundingClientRect();
    const clickY = e.clientY - rect.top;
    const trackHeight = rect.height;

    const rawThumbHeight = scrollHeight > 0 ? (clientHeight / scrollHeight) * trackHeight : thumbMinHeight;
    const thumbHeight = Math.max(thumbMinHeight, Math.min(trackHeight - 4, Math.round(rawThumbHeight)));
    const availableTrack = trackHeight - thumbHeight;
    if (availableTrack <= 0) return;

    const maxScroll = scrollHeight - clientHeight;
    const clickRatio = Math.max(0, Math.min(1, (clickY - thumbHeight / 2) / availableTrack));
    el.scrollTo({
      top: clickRatio * maxScroll,
      behavior: 'smooth',
    });
  };

  // Do not render if container content does not overflow visible client area
  const canScroll = scrollHeight > clientHeight + 4;
  if (!canScroll) return null;

  const trackTop = containerRect.top + offsetTop;
  const trackHeight = Math.max(0, containerRect.height - offsetTop - offsetBottom);
  if (trackHeight <= 20) return null;

  // Natural proportional thumb size (never artificially shrunken)
  const rawThumbHeight = (clientHeight / scrollHeight) * trackHeight;
  const thumbHeight = Math.max(thumbMinHeight, Math.min(trackHeight - 4, Math.round(rawThumbHeight)));
  const maxScroll = scrollHeight - clientHeight;
  const scrollRatio = maxScroll > 0 ? Math.max(0, Math.min(1, scrollTop / maxScroll)) : 0;
  const thumbTop = scrollRatio * (trackHeight - thumbHeight);

  // Visible when actively scrolling, hovered on right rail, or dragging
  const isVisible = isScrolling || isHovered || isDragging;

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
        right: '3px',
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
      {/* Natural Proportional Thumb with Comfortable Size */}
      <div
        onPointerDown={handlePointerDown}
        style={{
          width: isHovered || isDragging ? '10px' : '7px',
          height: `${thumbHeight}px`,
          transform: `translateY(${thumbTop}px) ${isVisible ? 'translateX(0)' : 'translateX(6px)'}`,
          opacity: isVisible ? 1 : 0,
          borderRadius: '9999px',
          backgroundColor: isDragging
            ? 'var(--accent-interactive, #3b82f6)'
            : isHovered
            ? 'rgba(255, 255, 255, 0.85)'
            : 'rgba(161, 161, 170, 0.55)',
          boxShadow: isDragging
            ? '0 0 10px rgba(59, 130, 246, 0.6)'
            : '0 1px 4px rgba(0, 0, 0, 0.35)',
          cursor: 'pointer',
          transition: isDragging
            ? 'width 0.15s ease, background-color 0.15s ease'
            : 'opacity 0.25s cubic-bezier(0.16, 1, 0.3, 1), transform 0.25s cubic-bezier(0.16, 1, 0.3, 1), width 0.15s ease, background-color 0.15s ease',
        }}
      />
    </div>
  );
};
