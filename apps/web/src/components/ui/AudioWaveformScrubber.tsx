import React, { useRef, useState, useEffect } from 'react';
import { Volume2, AlertCircle } from 'lucide-react';

interface AudioSegment {
  start_time: number;
  end_time: number;
  text?: string;
  speaker?: string;
}

// Bounded resource limits for waveform extraction
export const MAX_WAVEFORM_SOURCE_BYTES = 25 * 1024 * 1024; // 25 MB max encoded source size
export const MAX_WAVEFORM_DURATION_SECONDS = 300; // 5 minutes max decoded duration
export const MAX_WAVEFORM_CACHE_ENTRIES = 50; // Maximum LRU cache capacity
export const SILENCE_AMPLITUDE_THRESHOLD = 0.0001; // Acoustic floor below which signal is flat silence

interface CachedWaveform {
  bars: number[];
  isSilent: boolean;
}

// In-memory LRU cache for decoded waveforms to prevent redundant processing and unbounded memory growth
const waveformCache = new Map<string, CachedWaveform>();

export interface AudioWaveformScrubberProps {
  currentTime: number;
  duration: number;
  segments: AudioSegment[];
  onSeek: (timeSeconds: number) => void;
  assetId?: string;
  audioSrc?: string;
  assetByteSize?: number;
  assetDuration?: number;
}

export const AudioWaveformScrubber: React.FC<AudioWaveformScrubberProps> = ({
  currentTime,
  duration,
  segments,
  onSeek,
  assetId,
  audioSrc,
  assetByteSize,
  assetDuration,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [hoverTime, setHoverTime] = useState<number | null>(null);

  // Sample-derived waveform state
  const [bars, setBars] = useState<number[] | null>(null);
  const [isSilentAudio, setIsSilentAudio] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [decodeError, setDecodeError] = useState<string | null>(null);

  const effectiveSrc = audioSrc || (assetId ? `/api/v1/assets/${assetId}/raw` : null);

  // Decode audio data using browser Web Audio API with strict resource limits
  useEffect(() => {
    if (!effectiveSrc || !assetId) {
      setBars(null);
      setIsSilentAudio(false);
      setDecodeError(null);
      setLoading(false);
      return;
    }

    // 1. Check memory cache first (LRU touch)
    if (waveformCache.has(assetId)) {
      const cached = waveformCache.get(assetId)!;
      // Refresh key in map for LRU ordering
      waveformCache.delete(assetId);
      waveformCache.set(assetId, cached);

      setBars(cached.bars);
      setIsSilentAudio(cached.isSilent);
      setLoading(false);
      setDecodeError(null);
      return;
    }

    // 2. Pre-fetch metadata guardrails: reject oversized or overlong assets before network activity
    if (assetByteSize && assetByteSize > MAX_WAVEFORM_SOURCE_BYTES) {
      const sizeMb = (assetByteSize / (1024 * 1024)).toFixed(1);
      const limitMb = (MAX_WAVEFORM_SOURCE_BYTES / (1024 * 1024)).toFixed(0);
      setDecodeError(`File (${sizeMb}MB) exceeds ${limitMb}MB waveform budget`);
      setBars(null);
      setIsSilentAudio(false);
      setLoading(false);
      return;
    }

    const knownDuration = assetDuration || (duration > 0 ? duration : null);
    if (knownDuration && knownDuration > MAX_WAVEFORM_DURATION_SECONDS) {
      const durMin = (knownDuration / 60).toFixed(1);
      const limitMin = (MAX_WAVEFORM_DURATION_SECONDS / 60).toFixed(0);
      setDecodeError(`Duration (${durMin}m) exceeds ${limitMin}m waveform budget`);
      setBars(null);
      setIsSilentAudio(false);
      setLoading(false);
      return;
    }

    const abortController = new AbortController();
    let isCancelled = false;

    const decodeWaveform = async () => {
      setLoading(true);
      setDecodeError(null);
      setBars(null);
      setIsSilentAudio(false);

      try {
        const response = await fetch(effectiveSrc, { signal: abortController.signal });
        if (!response.ok) {
          throw new Error(`Failed to load audio asset (HTTP ${response.status})`);
        }

        // Header check: verify Content-Length if reported by server
        const contentLengthHeader = response.headers.get('content-length');
        if (contentLengthHeader) {
          const parsedBytes = parseInt(contentLengthHeader, 10);
          if (!isNaN(parsedBytes) && parsedBytes > MAX_WAVEFORM_SOURCE_BYTES) {
            const sizeMb = (parsedBytes / (1024 * 1024)).toFixed(1);
            const limitMb = (MAX_WAVEFORM_SOURCE_BYTES / (1024 * 1024)).toFixed(0);
            throw new Error(`File (${sizeMb}MB) exceeds ${limitMb}MB waveform budget`);
          }
        }

        // Enforce encoded-response byte limit during streaming (even if Content-Length was absent or wrong)
        let arrayBuffer: ArrayBuffer;
        if (response.body && typeof response.body.getReader === 'function') {
          const reader = response.body.getReader();
          const chunks: Uint8Array[] = [];
          let totalBytes = 0;

          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              if (value) {
                totalBytes += value.length;
                if (totalBytes > MAX_WAVEFORM_SOURCE_BYTES) {
                  try {
                    await reader.cancel();
                  } catch {
                    // Ignore cancel cleanup errors
                  }
                  const limitMb = (MAX_WAVEFORM_SOURCE_BYTES / (1024 * 1024)).toFixed(0);
                  throw new Error(`Download exceeded ${limitMb}MB waveform budget`);
                }
                chunks.push(value);
              }
            }
          } finally {
            try {
              reader.releaseLock();
            } catch {
              // Reader lock already released
            }
          }

          const concatenated = new Uint8Array(totalBytes);
          let offset = 0;
          for (const chunk of chunks) {
            concatenated.set(chunk, offset);
            offset += chunk.length;
          }
          arrayBuffer = concatenated.buffer;
        } else {
          // Fallback buffer reading when streaming reader is unavailable
          arrayBuffer = await response.arrayBuffer();
          if (arrayBuffer.byteLength > MAX_WAVEFORM_SOURCE_BYTES) {
            const limitMb = (MAX_WAVEFORM_SOURCE_BYTES / (1024 * 1024)).toFixed(0);
            throw new Error(`File exceeds ${limitMb}MB waveform budget`);
          }
        }

        if (isCancelled) return;

        // Verify AudioContext availability
        const AudioContextClass =
          window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;

        if (!AudioContextClass) {
          throw new Error('Web Audio API is not supported in this browser.');
        }

        const audioCtx = new AudioContextClass();
        let audioBuffer: AudioBuffer;

        try {
          // Decode audio file into raw PCM audio buffer
          audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
        } catch {
          throw new Error('Unable to decode audio samples (unsupported codec or corrupt audio).');
        } finally {
          try {
            await audioCtx.close();
          } catch {
            // Context cleanup
          }
        }

        if (isCancelled) return;

        // Guard against decoded audio duration exceeding budget
        if (audioBuffer.duration > MAX_WAVEFORM_DURATION_SECONDS) {
          const durMin = (audioBuffer.duration / 60).toFixed(1);
          const limitMin = (MAX_WAVEFORM_DURATION_SECONDS / 60).toFixed(0);
          throw new Error(`Duration (${durMin}m) exceeds ${limitMin}m waveform budget`);
        }

        // Read primary audio channel PCM samples
        const channelData = audioBuffer.getChannelData(0);
        const sampleCount = channelData.length;

        if (sampleCount === 0) {
          throw new Error('Audio recording contains no playable audio samples.');
        }

        // Bounded processing: downsample into 96 representative time-window bins
        const numBars = 96;
        const blockSize = Math.floor(sampleCount / numBars);
        const amplitudes: number[] = [];

        for (let i = 0; i < numBars; i++) {
          const start = i * blockSize;
          const end = i === numBars - 1 ? sampleCount : start + blockSize;
          let peak = 0;
          let sumSquares = 0;
          const count = end - start;

          for (let j = start; j < end; j++) {
            const val = channelData[j];
            const abs = Math.abs(val);
            if (abs > peak) peak = abs;
            sumSquares += val * val;
          }

          const rms = count > 0 ? Math.sqrt(sumSquares / count) : 0;
          // Combine peak (70%) and RMS (30%) for an expressive, accurate acoustic envelope
          amplitudes.push(peak * 0.7 + rms * 0.3);
        }

        const maxAmp = Math.max(...amplitudes);
        const isSilent = maxAmp < SILENCE_AMPLITUDE_THRESHOLD;

        let normalizedBars: number[];
        if (isSilent) {
          // True silent audio: do not normalize background noise into artificial peaks.
          // Render a clean, subtle hairline (0.02) without fabricating acoustic signals.
          normalizedBars = new Array(numBars).fill(0.02);
        } else {
          // Normalize true acoustic signals to [0.06, 0.95]
          normalizedBars = amplitudes.map((amp) =>
            Math.min(1.0, Math.max(0.06, (amp / maxAmp) * 0.95))
          );
        }

        if (!isCancelled) {
          // Bounded LRU cache eviction
          if (waveformCache.size >= MAX_WAVEFORM_CACHE_ENTRIES) {
            const oldestKey = waveformCache.keys().next().value;
            if (oldestKey) {
              waveformCache.delete(oldestKey);
            }
          }
          waveformCache.set(assetId, { bars: normalizedBars, isSilent });
          setBars(normalizedBars);
          setIsSilentAudio(isSilent);
          setLoading(false);
        }
      } catch (err: unknown) {
        if (!isCancelled) {
          const message = err instanceof Error ? err.message : 'Audio decode failed';
          setDecodeError(message);
          setBars(null);
          setIsSilentAudio(false);
          setLoading(false);
        }
      }
    };

    decodeWaveform();

    return () => {
      isCancelled = true;
      abortController.abort();
    };
  }, [effectiveSrc, assetId, assetByteSize, assetDuration, duration]);

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
        {/* State A: Loading Acoustic Samples */}
        {loading && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.5rem',
              color: 'var(--text-muted)',
              fontSize: '0.78rem',
              zIndex: 5,
            }}
          >
            <div className="spinner" style={{ width: '14px', height: '14px' }}></div>
            <span>Decoding acoustic sample envelope...</span>
          </div>
        )}

        {/* State B: Sample-Derived Acoustic Waveform Bars */}
        {bars && !loading && (
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
        )}

        {/* State C: Standard Usable Timeline (when decode is unavailable or failed) */}
        {!bars && !loading && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              padding: '0 1rem',
            }}
          >
            {/* Horizontal timeline track */}
            <div
              style={{
                width: '100%',
                height: '8px',
                background: 'var(--bg-canvas)',
                borderRadius: '4px',
                overflow: 'hidden',
                border: '1px solid var(--border-hairline)',
                position: 'relative',
              }}
            >
              <div
                style={{
                  width: `${progressPercent}%`,
                  height: '100%',
                  background: 'var(--accent-interactive)',
                  transition: 'width 0.1s ease',
                }}
              />
            </div>
            {decodeError && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.35rem',
                  fontSize: '0.7rem',
                  color: 'var(--text-muted)',
                  marginTop: '0.4rem',
                }}
              >
                <AlertCircle size={12} style={{ color: 'var(--amber)' }} />
                <span>Standard Timeline ({decodeError})</span>
              </div>
            )}
          </div>
        )}

        {/* Timed Segment Markers Overlay (Always rendered with accurate stored timestamps) */}
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

      {/* Scrubber Time Labels & Status Note */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          fontSize: '0.75rem',
          fontFamily: 'var(--font-mono)',
          color: 'var(--text-muted)',
          padding: '0 2px',
        }}
      >
        <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{formatSeconds(currentTime)}</span>
        {bars && (
          <span
            style={{
              fontSize: '0.68rem',
              color: isSilentAudio ? 'var(--amber)' : 'var(--text-muted)',
              fontFamily: 'var(--font-sans)',
            }}
          >
            {isSilentAudio ? 'Silent Audio Signal (Flatline)' : 'Sample-Derived Waveform'}
          </span>
        )}
        <span>{formatSeconds(effectiveDuration)}</span>
      </div>
    </div>
  );
};
