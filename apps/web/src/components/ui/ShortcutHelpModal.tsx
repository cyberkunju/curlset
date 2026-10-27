import React from 'react';
import { Keyboard, Check, Navigation, PenTool, CheckCircle2 } from 'lucide-react';
import { ModalShell } from './ModalShell';

interface ShortcutHelpModalProps {
  isOpen: boolean;
  onClose: () => void;
  taskType?: string;
}

interface ShortcutItem {
  key: string;
  description: string;
  context?: string;
}

export const ShortcutHelpModal: React.FC<ShortcutHelpModalProps> = ({
  isOpen,
  onClose,
  taskType,
}) => {
  const navigationShortcuts: ShortcutItem[] = [
    { key: 'J  /  ↓', description: 'Next record in filtered queue' },
    { key: 'K  /  ↑', description: 'Previous record in filtered queue' },
    { key: '?', description: 'Toggle keyboard shortcut help' },
    { key: 'Esc', description: 'Dismiss modal or overlay' },
  ];

  const annotationShortcuts: ShortcutItem[] = [
    { key: '1 – 9', description: 'Quick-select configured classes 1 through 9' },
    { key: 'Enter', description: 'Save current annotation and advance to next record' },
  ];

  if (taskType === 'object_detection') {
    annotationShortcuts.push(
      { key: 'Shift', description: 'Toggle / hold Sobel magnetic edge-snap' },
      { key: 'Del / Backspace', description: 'Remove selected bounding box' }
    );
  }

  if (taskType === 'audio_transcription') {
    annotationShortcuts.push({
      key: 'Space',
      description: 'Play / Pause audio playback (when outside text input)',
    });
  }

  const reviewShortcuts: ShortcutItem[] = [
    { key: 'A', description: 'Approve record (status: approved)' },
    { key: 'R', description: 'Reject record (status: rejected)' },
    { key: 'C', description: 'Needs correction (status: needs_correction)' },
    { key: 'N', description: 'Mark as Not Similar / Disagreement' },
  ];

  return (
    <ModalShell
      isOpen={isOpen}
      onClose={onClose}
      title="Workbench Keyboard Shortcuts"
      description="Keyboard navigation and high-speed labeling shortcuts"
      icon={<Keyboard size={20} strokeWidth={1.75} />}
      size="md"
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
        {/* Navigation Section */}
        <div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.45rem',
              fontSize: '0.8rem',
              fontWeight: 700,
              color: 'var(--text-secondary)',
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
              marginBottom: '0.5rem',
            }}
          >
            <Navigation size={14} strokeWidth={1.75} />
            <span>Navigation</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
            {navigationShortcuts.map((item) => (
              <ShortcutRow key={item.key} shortcut={item.key} description={item.description} />
            ))}
          </div>
        </div>

        {/* Annotation Section */}
        <div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.45rem',
              fontSize: '0.8rem',
              fontWeight: 700,
              color: 'var(--text-secondary)',
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
              marginBottom: '0.5rem',
            }}
          >
            <PenTool size={14} strokeWidth={1.75} />
            <span>Annotation & Editing</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
            {annotationShortcuts.map((item) => (
              <ShortcutRow key={item.key} shortcut={item.key} description={item.description} />
            ))}
          </div>
        </div>

        {/* Review Actions Section */}
        <div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.45rem',
              fontSize: '0.8rem',
              fontWeight: 700,
              color: 'var(--text-secondary)',
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
              marginBottom: '0.5rem',
            }}
          >
            <CheckCircle2 size={14} strokeWidth={1.75} />
            <span>Review Decisions</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
            {reviewShortcuts.map((item) => (
              <ShortcutRow key={item.key} shortcut={item.key} description={item.description} />
            ))}
          </div>
        </div>

        <div
          style={{
            fontSize: '0.75rem',
            color: 'var(--text-muted)',
            padding: '0.5rem 0.75rem',
            background: 'var(--bg-elevated)',
            borderRadius: 'var(--radius-sm)',
            border: '1px solid var(--border-hairline)',
          }}
        >
          * Shortcuts are safely paused while typing inside notes, transcripts, or input fields.
        </div>
      </div>
    </ModalShell>
  );
};

const ShortcutRow: React.FC<{ shortcut: string; description: string }> = ({
  shortcut,
  description,
}) => (
  <div
    style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '0.45rem 0.65rem',
      background: 'var(--bg-surface)',
      border: '1px solid var(--border-hairline)',
      borderRadius: 'var(--radius-sm)',
      fontSize: '0.825rem',
    }}
  >
    <span style={{ color: 'var(--text-secondary)' }}>{description}</span>
    <kbd
      style={{
        background: 'var(--bg-elevated)',
        border: '1px solid var(--border-hairline)',
        borderRadius: '3px',
        padding: '0.15rem 0.45rem',
        fontFamily: 'var(--font-mono)',
        fontSize: '0.75rem',
        fontWeight: 600,
        color: 'var(--text-primary)',
      }}
    >
      {shortcut}
    </kbd>
  </div>
);
