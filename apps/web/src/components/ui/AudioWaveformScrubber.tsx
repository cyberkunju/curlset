import React, { useRef, useState, useMemo } from 'react';

interface AudioSegment {
  start_time: number;
  end_time: number;
  text?: string;
  speaker?: string;
}

interface AudioWaveformScrubberProps {
  currentTime: number;
  duration: number;
  segments: AudioSegment[];
  onSeek: (timeSeconds: number) => void;
  assetId?: string;
}

export const AudioWaveformScrubber: React.FC<AudioWaveformScrubberProps> = ({
  currentTime,
  duration,
  segments,
  onSeek,
  assetId = 'default_audio',
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [hoverTime, setHoverTime] = useState<number | null>(null);

  // Generate deterministic, realistic acoustic amplitude envelope bars for the audio asset
  const bars = useMemo(() => {
    const numBars = 96;
    const generated: number[] = [];
    let seed = 0;
    for (let i = 0; i < assetId.length; i++) {
      seed = (seed << 5) - seed + assetId.charCodeAt(i);
      seed |= 0;
    }
    const pseudoRandom = () => {
      seed = (seed * 9301 + 49297) % 233280;
      return seed / 233280;
    };

    for (let i = 0; i < numBars; i++) {
      // Natural envelope with peaks and pauses
      const base = 0.25 + 0.65 * Math.sin((i / numBars) * Math.PI);
      const noise = pseudoRandom() * 0.45;
      const height = Math.min(1.0, Math.max(0.12, base * 0.7 + noise * 0.3));
      generated.push(height);
    }
    return generated;
  }, [assetId]);

  const effectiveDuration = duration > 0 ? duration : 10;
  const progressPercent = Math.min(100, Math.max(0, (currentTime / effectiveDuration) * 100));

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    onSeek(ratio * effectiveDuration);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    setHoverTime(ratio * effectiveDuration);
  };

  const formatSeconds = (sec: number) => {
    const mins = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    const ms = Math.floor((sec % 1) * 10);
    return `${mins}:${s < 10 ? '0' : ''}${s}.${ms}`;
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', width: '100%' }}>
      {/* Waveform Scrubber Surface */}
      <div
        ref={containerRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerLeave={() => setHoverTime(null)}
        style={{
          position: 'relative',
          height: '64px',
          background: 'var(--bg-elevated)',
          border: '1px solid var(--border-hairline)',
          borderRadius: 'var(--radius-sm)',
          cursor: 'pointer',
          userSelect: 'none',
          touchAction: 'none',
          overflow: 'hidden',
          display: 'flex',
          alignItems: 'center',
          padding: '0 4px',
        }}
        title="Click to seek playback position"
      >
        {/* Waveform Amplitude Bars */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            width: '100%',
            height: '100%',
            gap: '2px',
          }}
        >
          {bars.map((amplitude, i) => {
            const barPosPercent = (i / bars.length) * 100;
            const isPlayed = barPosPercent <= progressPercent;

            return (
              <div
                key={i}
                style={{
                  flex: 1,
                  height: `${amplitude * 80}%`,
                  borderRadius: '2px',
                  backgroundColor: isPlayed ? 'var(--accent-interactive)' : 'var(--border-strong)',
                  transition: 'background-color 0.1s ease',
                  minWidth: '2px',
                }}
              />
            );
          })}
        </div>

        {/* Timed Segment Markers Overlay */}
        {segments.map((seg, idx) => {
          const startPct = (seg.start_time / effectiveDuration) * 100;
          const endPct = (seg.end_time / effectiveDuration) * 100;
          const widthPct = Math.max(0.75, endPct - startPct);
          const isActive = currentTime >= seg.start_time && currentTime <= seg.end_time;

          return (
            <div
              key={idx}
              style={{
                position: 'absolute',
                left: `${startPct}%`,
                width: `${widthPct}%`,
                top: 0,
                bottom: 0,
                background: isActive ? 'rgba(37, 99, 235, 0.28)' : 'rgba(16, 185, 129, 0.18)',
                borderLeft: `2px solid ${isActive ? 'var(--accent-interactive)' : 'var(--emerald)'}`,
                borderRight: `2px solid ${isActive ? 'var(--accent-interactive)' : 'var(--emerald)'}`,
                pointerEvents: 'none',
                boxSizing: 'border-box',
              }}
              title={`Cue #${idx + 1}: ${seg.start_time.toFixed(1)}s - ${seg.end_time.toFixed(1)}s`}
            />
          );
        })}

        {/* Playhead Needle Cursor */}
        <div
          style={{
            position: 'absolute',
            left: `${progressPercent}%`,
            top: 0,
            bottom: 0,
            width: '2px',
            backgroundColor: 'var(--rose)',
            boxShadow: '0 0 4px rgba(239, 68, 68, 0.6)',
            pointerEvents: 'none',
            zIndex: 10,
          }}
        >
          <div
            style={{
              position: 'absolute',
              top: '2px',
              left: '-4px',
              width: '10px',
              height: '10px',
              borderRadius: '50%',
              backgroundColor: 'var(--rose)',
            }}
          />
        </div>

        {/* Hover Time Tooltip */}
        {hoverTime !== null && (
          <div
            style={{
              position: 'absolute',
              left: `${Math.min(92, Math.max(8, (hoverTime / effectiveDuration) * 100))}%`,
              bottom: '4px',
              transform: 'translateX(-50%)',
              background: 'var(--bg-canvas)',
              border: '1px solid var(--border-hairline)',
              padding: '1px 6px',
              borderRadius: '3px',
              fontSize: '0.7rem',
              fontFamily: 'var(--font-mono)',
              color: 'var(--text-primary)',
              pointerEvents: 'none',
              boxShadow: 'var(--shadow-sm)',
            }}
          >
            {formatSeconds(hoverTime)}
          </div>
        )}
      </div>

      {/* Scrubber Time Labels */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          fontSize: '0.75rem',
          fontFamily: 'var(--font-mono)',
          color: 'var(--text-muted)',
          padding: '0 2px',
        }}
      >
        <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{formatSeconds(currentTime)}</span>
        <span>{formatSeconds(effectiveDuration)}</span>
      </div>
    </div>
  );
};
