import React, { useEffect, useState, useCallback } from 'react';
import {
  fetchDatasetQueue,
  fetchRecordDetail,
  createAnnotation,
  updateAnnotation,
  transitionReviewStatus,
} from '../api';
import { Dataset, RecordQueueItem, RecordDetail } from '../types';
import { ObjectDetectionCanvas, BoundingBox } from './ObjectDetectionCanvas';

interface AnnotationWorkspaceProps {
  dataset: Dataset;
  onBack: () => void;
}

export const AnnotationWorkspace: React.FC<AnnotationWorkspaceProps> = ({ dataset, onBack }) => {
  const [queue, setQueue] = useState<RecordQueueItem[]>([]);
  const [totalQueue, setTotalQueue] = useState(0);
  const [loadingQueue, setLoadingQueue] = useState(true);
  const [queueError, setQueueError] = useState<string | null>(null);

  // Filters
  const [selectedSplit, setSelectedSplit] = useState<string>('');
  const [selectedStatus, setSelectedStatus] = useState<string>('');

  // Active Record
  const [currentIndex, setCurrentIndex] = useState(0);
  const [currentRecord, setCurrentRecord] = useState<RecordDetail | null>(null);
  const [loadingRecord, setLoadingRecord] = useState(false);

  // Annotation Editor Form
  const [selectedLabel, setSelectedLabel] = useState<string>('');
  const [confidence, setConfidence] = useState<number>(1.0);
  const [notes, setNotes] = useState<string>('');
  const [boxes, setBoxes] = useState<BoundingBox[]>([]);
  const [transcriptText, setTranscriptText] = useState<string>('');
  const [transcriptSegments, setTranscriptSegments] = useState<Array<{ start_time: number; end_time: number; speaker?: string; text: string }>>([]);
  const [playbackRate, setPlaybackRate] = useState<number>(1.0);
  const audioRef = React.useRef<HTMLAudioElement | null>(null);
  const [saving, setSaving] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);

  // Extract allowed classes from label_schema
  const allowedClasses: string[] = dataset.label_schema?.classes || dataset.label_schema?.labels || [];

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  // Load Record Queue
  const loadQueue = useCallback(async () => {
    setLoadingQueue(true);
    setQueueError(null);
    try {
      const res = await fetchDatasetQueue(
        dataset.id,
        selectedSplit || undefined,
        selectedStatus || undefined,
        100,
        0
      );
      setQueue(res.items);
      setTotalQueue(res.total);
      setCurrentIndex(0);
    } catch (err: any) {
      setQueueError(err.message || 'Failed to load record queue');
    } finally {
      setLoadingQueue(false);
    }
  }, [dataset.id, selectedSplit, selectedStatus]);

  useEffect(() => {
    loadQueue();
  }, [loadQueue]);

  // Load Active Record Details
  const loadActiveRecord = useCallback(async (recordId: string) => {
    setLoadingRecord(true);
    try {
      const detail: RecordDetail = await fetchRecordDetail(recordId);
      setCurrentRecord(detail);
      // Pre-populate with existing annotation if present
      if (detail.annotation?.payload?.label) {
        setSelectedLabel(detail.annotation.payload.label);
        setConfidence(detail.annotation.confidence ?? 1.0);
        setNotes(detail.annotation.payload.notes || detail.annotation.payload.rationale || '');
      } else {
        setSelectedLabel(allowedClasses[0] || '');
        setConfidence(1.0);
        setNotes('');
      }

      if (detail.annotation?.payload?.boxes && Array.isArray(detail.annotation.payload.boxes)) {
        setBoxes(detail.annotation.payload.boxes);
      } else {
        setBoxes([]);
      }

      if (detail.annotation?.payload?.text && dataset.task_type === 'audio_transcription') {
        setTranscriptText(detail.annotation.payload.text);
        setTranscriptSegments(detail.annotation.payload.segments || []);
      } else if (dataset.task_type === 'audio_transcription') {
        setTranscriptText('');
        setTranscriptSegments([]);
      }
    } catch (err: any) {
      showToast(`Error: ${err.message}`);
    } finally {
      setLoadingRecord(false);
    }
  }, [allowedClasses]);

  useEffect(() => {
    if (queue.length > 0 && currentIndex < queue.length) {
      loadActiveRecord(queue[currentIndex].id);
    } else {
      setCurrentRecord(null);
    }
  }, [queue, currentIndex, loadActiveRecord]);

  // Save / Submit Annotation
  const handleSaveAnnotation = async (customLabel?: string) => {
    if (!currentRecord) return;
    const labelToSave = customLabel || selectedLabel;
    if (dataset.task_type === 'audio_transcription') {
      if (!transcriptText.trim() && transcriptSegments.length === 0) {
        showToast('Please enter transcript text or add segments.');
        return;
      }
    } else if (dataset.task_type !== 'object_detection' && !labelToSave) {
      showToast('Please select or enter a label first.');
      return;
    }

    setSaving(true);
    try {
      const payload: Record<string, any> = {};
      if (dataset.task_type === 'audio_transcription') {
        payload.text = transcriptText;
        if (transcriptSegments.length > 0) {
          payload.segments = transcriptSegments;
        }
      } else if (dataset.task_type === 'object_detection') {
        payload.boxes = boxes;
        if (boxes.length > 0) {
          payload.label = boxes[0].label;
        }
      } else {
        payload.label = labelToSave;
      }

      if (dataset.task_type === 'text_classification' && notes) {
        payload.rationale = notes;
      } else if (notes) {
        payload.notes = notes;
      }

      if (currentRecord.annotation) {
        // Update existing (creates new revision)
        await updateAnnotation(
          currentRecord.annotation.id,
          payload,
          'Human manual update',
          confidence
        );
        showToast(`Updated to '${labelToSave}' (Revision added)`);
      } else {
        // Create initial annotation
        await createAnnotation(
          currentRecord.id,
          payload,
          'human',
          'pending_review',
          'default_user',
          confidence
        );
        showToast(`Created annotation '${labelToSave}'`);
      }

      // Refresh record and queue
      await loadActiveRecord(currentRecord.id);
      loadQueue();

      // Automatically advance to next item
      if (currentIndex < queue.length - 1) {
        setCurrentIndex((prev) => prev + 1);
      }
    } catch (err: any) {
      showToast(`Failed to save: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  // Review status transitions
  const handleReviewAction = async (action: 'approved' | 'rejected' | 'needs_correction') => {
    if (!currentRecord?.annotation) {
      showToast('Record must have an annotation before review transition.');
      return;
    }
    setSaving(true);
    try {
      await transitionReviewStatus(
        currentRecord.annotation.id,
        action,
        `Reviewer marked as ${action}`
      );
      showToast(`Status changed to ${action}`);
      await loadActiveRecord(currentRecord.id);
      loadQueue();

      if (currentIndex < queue.length - 1) {
        setCurrentIndex((prev) => prev + 1);
      }
    } catch (err: any) {
      showToast(`Transition failed: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  // Keyboard navigation & hotkeys
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if user is typing in notes or text input
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;

      if (e.key === 'j' || e.key === 'ArrowDown') {
        e.preventDefault();
        if (currentIndex < queue.length - 1) setCurrentIndex((i) => i + 1);
      } else if (e.key === 'k' || e.key === 'ArrowUp') {
        e.preventDefault();
        if (currentIndex > 0) setCurrentIndex((i) => i - 1);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        handleSaveAnnotation();
      } else if (e.key === 'a' || e.key === 'A') {
        e.preventDefault();
        handleReviewAction('approved');
      } else if (e.key === 'r' || e.key === 'R') {
        e.preventDefault();
        handleReviewAction('rejected');
      } else if (e.key === 'c' || e.key === 'C') {
        e.preventDefault();
        handleReviewAction('needs_correction');
      } else if (e.key >= '1' && e.key <= '9') {
        const classIdx = parseInt(e.key, 10) - 1;
        if (classIdx < allowedClasses.length) {
          e.preventDefault();
          const chosen = allowedClasses[classIdx];
          setSelectedLabel(chosen);
          handleSaveAnnotation(chosen);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentIndex, queue.length, allowedClasses, currentRecord]);

  const activeAsset = currentRecord?.assets?.[0];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 120px)', gap: '1rem' }}>
      {/* Toast Alert */}
      {toastMessage && (
        <div
          style={{
            position: 'fixed',
            top: '20px',
            right: '20px',
            zIndex: 1000,
            background: 'var(--surface-hover)',
            border: '1px solid var(--border-subtle)',
            boxShadow: 'var(--shadow-lg)',
            padding: '0.75rem 1.25rem',
            borderRadius: 'var(--radius-sm)',
            fontSize: '0.9rem',
            color: 'var(--text-primary)',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
          }}
        >
          <span>💡</span>
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Top Navigation Bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0.75rem 1.25rem',
          background: 'var(--surface-elevated)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 'var(--radius-md)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <button className="btn btn-secondary" onClick={onBack} style={{ padding: '0.4rem 0.8rem' }}>
            ← Back to Dataset
          </button>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ fontWeight: 700, fontSize: '1rem' }}>{dataset.name}</span>
              <span className="badge badge-indigo">{dataset.task_type}</span>
            </div>
          </div>
        </div>

        {/* Filter Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <select
            className="input"
            value={selectedSplit}
            onChange={(e) => setSelectedSplit(e.target.value)}
            style={{ width: '130px', padding: '0.4rem 0.6rem', fontSize: '0.85rem' }}
          >
            <option value="">All Splits</option>
            <option value="train">Train</option>
            <option value="val">Val</option>
            <option value="test">Test</option>
          </select>

          <select
            className="input"
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            style={{ width: '160px', padding: '0.4rem 0.6rem', fontSize: '0.85rem' }}
          >
            <option value="">All Statuses</option>
            <option value="unannotated">Unannotated</option>
            <option value="pending_review">Pending Review</option>
            <option value="approved">Approved</option>
            <option value="needs_correction">Needs Correction</option>
            <option value="rejected">Rejected</option>
          </select>

          {/* Queue Navigation Progress */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginLeft: '0.5rem' }}>
            <button
              className="btn btn-secondary"
              disabled={currentIndex === 0 || queue.length === 0}
              onClick={() => setCurrentIndex((i) => i - 1)}
              title="Previous Record (K or Up)"
              style={{ padding: '0.4rem 0.75rem' }}
            >
              ▲ Prev
            </button>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', minWidth: '90px', textAlign: 'center' }}>
              {queue.length > 0 ? `${currentIndex + 1} of ${totalQueue}` : '0 of 0'}
            </span>
            <button
              className="btn btn-secondary"
              disabled={currentIndex >= queue.length - 1 || queue.length === 0}
              onClick={() => setCurrentIndex((i) => i + 1)}
              title="Next Record (J or Down)"
              style={{ padding: '0.4rem 0.75rem' }}
            >
              ▼ Next
            </button>
          </div>
        </div>
      </div>

      {/* Main Workspace 3-Column Grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '260px 1fr 340px',
          gap: '1rem',
          flex: 1,
          minHeight: 0,
        }}
      >
        {/* Left Column: Queue List */}
        <div
          style={{
            background: 'var(--surface-elevated)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-md)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          <div style={{ padding: '0.75rem 1rem', borderBottom: '1px solid var(--border-subtle)', fontWeight: 600, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            QUEUE ITEMS ({queue.length})
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: '0.5rem' }}>
            {loadingQueue ? (
              <div style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--text-muted)' }}>Loading queue...</div>
            ) : queueError ? (
              <div style={{ padding: '1rem', color: 'var(--rose)', fontSize: '0.85rem' }}>{queueError}</div>
            ) : queue.length === 0 ? (
              <div style={{ padding: '2rem 1rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                No records match active filters.
              </div>
            ) : (
              queue.map((item, idx) => {
                const isActive = idx === currentIndex;
                const statusColor =
                  item.review_status === 'approved'
                    ? 'var(--emerald)'
                    : item.review_status === 'rejected'
                    ? 'var(--rose)'
                    : item.review_status === 'needs_correction'
                    ? 'var(--amber)'
                    : item.review_status === 'pending_review'
                    ? 'var(--text-accent)'
                    : 'var(--text-muted)';

                return (
                  <div
                    key={item.id}
                    onClick={() => setCurrentIndex(idx)}
                    style={{
                      padding: '0.6rem 0.75rem',
                      borderRadius: 'var(--radius-sm)',
                      background: isActive ? 'rgba(99, 102, 241, 0.15)' : 'transparent',
                      border: isActive ? '1px solid var(--primary-glow)' : '1px solid transparent',
                      marginBottom: '0.25rem',
                      cursor: 'pointer',
                      transition: 'all var(--transition-fast)',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
                      <span style={{ fontSize: '0.85rem', fontWeight: isActive ? 700 : 500, color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
                        #{idx + 1} {item.external_key || item.id.slice(0, 8)}
                      </span>
                      <span style={{ fontSize: '0.75rem', fontWeight: 600, color: statusColor }}>
                        {item.review_status.replace('_', ' ')}
                      </span>
                    </div>
                    {item.annotation_payload?.label && (
                      <span className="badge badge-indigo" style={{ fontSize: '0.75rem', padding: '0.15rem 0.4rem' }}>
                        {item.annotation_payload.label}
                      </span>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Center Stage: Media / Document Viewer */}
        <div
          style={{
            background: 'var(--surface-elevated)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-md)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          {loadingRecord ? (
            <div className="loading-container" style={{ flex: 1 }}>
              <div className="spinner"></div>
              <div>Loading record asset...</div>
            </div>
          ) : !currentRecord ? (
            <div className="empty-state" style={{ flex: 1 }}>
              <div className="empty-icon">📁</div>
              <h3 className="empty-title">No Record Selected</h3>
              <p className="empty-desc">Choose a record from the queue to start labeling.</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
              {/* Asset Information Header */}
              <div
                style={{
                  padding: '0.75rem 1.25rem',
                  borderBottom: '1px solid var(--border-subtle)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  background: 'rgba(15, 23, 42, 0.4)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>
                    Record: <code style={{ fontFamily: 'var(--font-mono)' }}>{currentRecord.external_key || currentRecord.id}</code>
                  </span>
                  <span className="badge badge-cyan">Split: {currentRecord.split}</span>
                </div>
                {activeAsset && (
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                    {activeAsset.original_filename && <span>{activeAsset.original_filename} • </span>}
                    {activeAsset.dimensions && (
                      <span>
                        {activeAsset.dimensions.width}×{activeAsset.dimensions.height}px •{' '}
                      </span>
                    )}
                    <span>{(activeAsset.byte_size / 1024).toFixed(1)} KB</span>
                  </div>
                )}
              </div>

              {/* Viewer Stage */}
              <div
                style={{
                  flex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '1.5rem',
                  overflow: 'auto',
                  background: 'radial-gradient(circle, rgba(30, 41, 59, 0.5) 0%, rgba(15, 23, 42, 0.9) 100%)',
                }}
              >
                {dataset.task_type === 'image_classification' && activeAsset ? (
                  <img
                    src={`/api/v1/assets/${activeAsset.id}/raw`}
                    alt={activeAsset.original_filename || 'Record Asset'}
                    style={{
                      maxWidth: '100%',
                      maxHeight: '100%',
                      objectFit: 'contain',
                      borderRadius: 'var(--radius-sm)',
                      boxShadow: 'var(--shadow-lg)',
                      border: '1px solid var(--border-subtle)',
                    }}
                  />
                ) : dataset.task_type === 'object_detection' && activeAsset ? (
                  <ObjectDetectionCanvas
                    imageUrl={`/api/v1/assets/${activeAsset.id}/raw`}
                    boxes={boxes}
                    classes={allowedClasses}
                    selectedClass={selectedLabel || allowedClasses[0] || 'object'}
                    onChange={(newBoxes) => setBoxes(newBoxes)}
                  />
                ) : dataset.task_type === 'audio_transcription' && activeAsset ? (
                  <div
                    style={{
                      width: '100%',
                      maxWidth: '720px',
                      background: 'rgba(15, 23, 42, 0.85)',
                      padding: '2rem',
                      borderRadius: 'var(--radius-md)',
                      border: '1px solid var(--border-subtle)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '1.5rem',
                      boxShadow: 'var(--shadow-lg)',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <span style={{ fontSize: '2rem' }}>🎙️</span>
                        <div>
                          <div style={{ fontWeight: 700, fontSize: '1.1rem' }}>
                            {activeAsset.original_filename || 'Audio Recording'}
                          </div>
                          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                            {activeAsset.dimensions?.duration_seconds ? `${activeAsset.dimensions.duration_seconds}s • ` : ''}
                            {activeAsset.dimensions?.sample_rate_hz ? `${activeAsset.dimensions.sample_rate_hz} Hz • ` : ''}
                            {activeAsset.dimensions?.channels ? `${activeAsset.dimensions.channels} ch • ` : ''}
                            {(activeAsset.byte_size / 1024).toFixed(1)} KB
                          </div>
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Speed:</span>
                        {[0.75, 1.0, 1.25, 1.5].map((rate) => (
                          <button
                            key={rate}
                            type="button"
                            onClick={() => {
                              setPlaybackRate(rate);
                              if (audioRef.current) audioRef.current.playbackRate = rate;
                            }}
                            style={{
                              padding: '0.2rem 0.5rem',
                              borderRadius: 'var(--radius-sm)',
                              background: playbackRate === rate ? 'var(--primary)' : 'rgba(30, 41, 59, 0.8)',
                              color: 'var(--text-primary)',
                              border: playbackRate === rate ? '1px solid var(--primary-glow)' : '1px solid var(--border-subtle)',
                              fontSize: '0.75rem',
                              cursor: 'pointer',
                              fontWeight: playbackRate === rate ? 700 : 400,
                            }}
                          >
                            {rate}x
                          </button>
                        ))}
                      </div>
                    </div>

                    <audio
                      ref={audioRef}
                      controls
                      src={`/api/v1/assets/${activeAsset.id}/raw`}
                      style={{ width: '100%', borderRadius: 'var(--radius-sm)' }}
                      onLoadedMetadata={(e) => {
                        (e.target as HTMLAudioElement).playbackRate = playbackRate;
                      }}
                    />

                    {/* Quick Cue Playback List */}
                    {transcriptSegments.length > 0 && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
                          Segment Cues ({transcriptSegments.length})
                        </div>
                        <div style={{ maxHeight: '180px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                          {transcriptSegments.map((seg, sIdx) => (
                            <div
                              key={sIdx}
                              onClick={() => {
                                if (audioRef.current) {
                                  audioRef.current.currentTime = seg.start_time;
                                  audioRef.current.play();
                                }
                              }}
                              style={{
                                padding: '0.5rem 0.75rem',
                                background: 'rgba(30, 41, 59, 0.5)',
                                border: '1px solid var(--border-subtle)',
                                borderRadius: 'var(--radius-sm)',
                                cursor: 'pointer',
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                fontSize: '0.85rem',
                              }}
                              title="Click to seek and play"
                            >
                              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                                <span className="badge badge-indigo" style={{ fontSize: '0.7rem' }}>
                                  {seg.start_time.toFixed(2)}s - {seg.end_time.toFixed(2)}s
                                </span>
                                {seg.speaker && <strong style={{ color: 'var(--text-accent)' }}>{seg.speaker}:</strong>}
                                <span>{seg.text}</span>
                              </div>
                              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>▶</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div
                    style={{
                      width: '100%',
                      maxWidth: '680px',
                      background: 'rgba(15, 23, 42, 0.8)',
                      padding: '1.75rem',
                      borderRadius: 'var(--radius-md)',
                      border: '1px solid var(--border-subtle)',
                    }}
                  >
                    <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '0.75rem', textTransform: 'uppercase' }}>
                      Text Payload
                    </div>
                    <div
                      style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: '1rem',
                        lineHeight: 1.7,
                        color: 'var(--text-primary)',
                        whiteSpace: 'pre-wrap',
                      }}
                    >
                      {currentRecord.metadata?.text ||
                        currentRecord.metadata?.content ||
                        JSON.stringify(currentRecord.metadata, null, 2)}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Right Column: Label Selector, Review Controls & Revision History */}
        <div
          style={{
            background: 'var(--surface-elevated)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-md)',
            display: 'flex',
            flexDirection: 'column',
            overflowY: 'auto',
            padding: '1.25rem',
            gap: '1.25rem',
          }}
        >
          {/* Guidelines */}
          <div>
            <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '0.4rem', textTransform: 'uppercase' }}>
              Guidelines
            </div>
            <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
              {dataset.annotation_instructions ||
                (dataset.task_type === 'audio_transcription'
                  ? 'Listen to the audio, transcribe speech accurately, and review cue timestamps.'
                  : 'Select the most accurate label. Use hotkeys 1-9 for quick classification.')}
            </div>
          </div>

          {/* Audio Transcription Inputs vs Class Selection Buttons */}
          {dataset.task_type === 'audio_transcription' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '0.4rem', textTransform: 'uppercase' }}>
                  Verbatim Transcript
                </div>
                <textarea
                  className="input"
                  rows={4}
                  placeholder="Enter full transcript of the audio..."
                  value={transcriptText}
                  onChange={(e) => setTranscriptText(e.target.value)}
                  style={{ width: '100%', resize: 'vertical' }}
                />
              </div>

              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                  <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
                    Timed Cues / Segments
                  </span>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    style={{ fontSize: '0.75rem', padding: '0.2rem 0.5rem' }}
                    onClick={() => {
                      const cur = audioRef.current?.currentTime || 0;
                      setTranscriptSegments([
                        ...transcriptSegments,
                        { start_time: Math.max(0, Math.floor(cur)), end_time: Math.ceil(cur + 2), text: '', speaker: 'Speaker 1' },
                      ]);
                    }}
                  >
                    + Add Cue
                  </button>
                </div>
                {transcriptSegments.map((seg, idx) => (
                  <div
                    key={idx}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.3rem',
                      padding: '0.5rem',
                      marginBottom: '0.4rem',
                      background: 'rgba(30, 41, 59, 0.4)',
                      borderRadius: 'var(--radius-sm)',
                      border: '1px solid var(--border-subtle)',
                    }}
                  >
                    <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                      <input
                        type="number"
                        step="0.1"
                        className="input"
                        placeholder="Start"
                        value={seg.start_time}
                        onChange={(e) => {
                          const val = parseFloat(e.target.value) || 0;
                          const next = [...transcriptSegments];
                          next[idx] = { ...seg, start_time: val };
                          setTranscriptSegments(next);
                        }}
                        style={{ width: '70px', padding: '0.2rem 0.4rem', fontSize: '0.8rem' }}
                      />
                      <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>to</span>
                      <input
                        type="number"
                        step="0.1"
                        className="input"
                        placeholder="End"
                        value={seg.end_time}
                        onChange={(e) => {
                          const val = parseFloat(e.target.value) || 0;
                          const next = [...transcriptSegments];
                          next[idx] = { ...seg, end_time: val };
                          setTranscriptSegments(next);
                        }}
                        style={{ width: '70px', padding: '0.2rem 0.4rem', fontSize: '0.8rem' }}
                      />
                      <button
                        type="button"
                        onClick={() => {
                          setTranscriptSegments(transcriptSegments.filter((_, i) => i !== idx));
                        }}
                        style={{
                          marginLeft: 'auto',
                          background: 'transparent',
                          border: 'none',
                          color: 'var(--rose)',
                          cursor: 'pointer',
                          fontSize: '0.85rem',
                        }}
                      >
                        ✕
                      </button>
                    </div>
                    <input
                      type="text"
                      className="input"
                      placeholder="Cue text..."
                      value={seg.text}
                      onChange={(e) => {
                        const next = [...transcriptSegments];
                        next[idx] = { ...seg, text: e.target.value };
                        setTranscriptSegments(next);
                      }}
                      style={{ fontSize: '0.8rem', padding: '0.3rem 0.5rem' }}
                    />
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div>
              <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '0.6rem', textTransform: 'uppercase' }}>
                Class Labels ({allowedClasses.length})
              </div>
              {allowedClasses.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                  {allowedClasses.map((lbl, idx) => {
                    const isSelected = selectedLabel === lbl;
                    const shortcutKey = idx < 9 ? `${idx + 1}` : null;

                    return (
                      <button
                        key={lbl}
                        onClick={() => setSelectedLabel(lbl)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '0.6rem 0.85rem',
                          borderRadius: 'var(--radius-sm)',
                          background: isSelected ? 'var(--primary)' : 'rgba(30, 41, 59, 0.6)',
                          border: isSelected ? '1px solid var(--primary-glow)' : '1px solid var(--border-subtle)',
                          color: 'var(--text-primary)',
                          fontWeight: isSelected ? 700 : 500,
                          cursor: 'pointer',
                          textAlign: 'left',
                          transition: 'all var(--transition-fast)',
                        }}
                      >
                        <span>{lbl}</span>
                        {shortcutKey && (
                          <kbd
                            style={{
                              background: 'rgba(0, 0, 0, 0.4)',
                              padding: '0.15rem 0.4rem',
                              borderRadius: '3px',
                              fontSize: '0.75rem',
                              border: '1px solid rgba(255, 255, 255, 0.1)',
                            }}
                          >
                            {shortcutKey}
                          </kbd>
                        )}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <input
                  type="text"
                  className="input"
                  placeholder="Enter classification label..."
                  value={selectedLabel}
                  onChange={(e) => setSelectedLabel(e.target.value)}
                />
              )}
            </div>
          )}

          {/* Confidence Slider */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '0.4rem', textTransform: 'uppercase' }}>
              <span>Confidence</span>
              <span style={{ color: 'var(--text-accent)' }}>{(confidence * 100).toFixed(0)}%</span>
            </div>
            <input
              type="range"
              min="0.1"
              max="1.0"
              step="0.05"
              value={confidence}
              onChange={(e) => setConfidence(parseFloat(e.target.value))}
              style={{ width: '100%', accentColor: 'var(--primary)' }}
            />
          </div>

          {/* Rationale / Notes */}
          <div>
            <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '0.4rem', textTransform: 'uppercase' }}>
              Annotation Notes / Rationale
            </div>
            <textarea
              className="input"
              rows={2}
              placeholder="Optional notes or reason for label..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              style={{ resize: 'vertical' }}
            />
          </div>

          {/* Save Action Button */}
          <button
            className="btn btn-primary"
            disabled={
              saving ||
              !currentRecord ||
              (dataset.task_type === 'audio_transcription'
                ? !transcriptText.trim() && transcriptSegments.length === 0
                : dataset.task_type !== 'object_detection' && !selectedLabel)
            }
            onClick={() => handleSaveAnnotation()}
            style={{ width: '100%', padding: '0.65rem', justifyContent: 'center' }}
          >
            {saving ? 'Saving...' : '💾 Save & Next (Enter)'}
          </button>

          {/* Review Workflow Controls */}
          {currentRecord?.annotation && (
            <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: '1rem' }}>
              <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '0.6rem', textTransform: 'uppercase' }}>
                Review Transition
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginBottom: '0.5rem' }}>
                <button
                  className="btn"
                  onClick={() => handleReviewAction('approved')}
                  disabled={saving}
                  style={{
                    background: 'rgba(16, 185, 129, 0.2)',
                    borderColor: 'var(--emerald)',
                    color: 'var(--emerald)',
                    justifyContent: 'center',
                    padding: '0.5rem',
                  }}
                  title="Approve (A)"
                >
                  ✓ Approve (A)
                </button>
                <button
                  className="btn"
                  onClick={() => handleReviewAction('rejected')}
                  disabled={saving}
                  style={{
                    background: 'rgba(239, 68, 68, 0.2)',
                    borderColor: 'var(--rose)',
                    color: 'var(--rose)',
                    justifyContent: 'center',
                    padding: '0.5rem',
                  }}
                  title="Reject (R)"
                >
                  ✕ Reject (R)
                </button>
              </div>
              <button
                className="btn"
                onClick={() => handleReviewAction('needs_correction')}
                disabled={saving}
                style={{
                  width: '100%',
                  background: 'rgba(245, 158, 11, 0.2)',
                  borderColor: 'var(--amber)',
                  color: 'var(--amber)',
                  justifyContent: 'center',
                  padding: '0.5rem',
                }}
                title="Needs Correction (C)"
              >
                ⚠️ Needs Correction (C)
              </button>
            </div>
          )}

          {/* Revisions & Audit Drawer */}
          {currentRecord?.revisions && currentRecord.revisions.length > 0 && (
            <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: '1rem' }}>
              <button
                onClick={() => setShowHistory(!showHistory)}
                style={{
                  width: '100%',
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--text-accent)',
                  cursor: 'pointer',
                  fontSize: '0.85rem',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '0.25rem 0',
                }}
              >
                <span>📜 Revision History ({currentRecord.revisions.length})</span>
                <span>{showHistory ? '▲' : '▼'}</span>
              </button>

              {showHistory && (
                <div style={{ marginTop: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {currentRecord.revisions.map((rev) => (
                    <div
                      key={rev.id}
                      style={{
                        padding: '0.5rem 0.75rem',
                        background: 'rgba(15, 23, 42, 0.6)',
                        borderRadius: 'var(--radius-sm)',
                        border: '1px solid var(--border-subtle)',
                        fontSize: '0.8rem',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 600, marginBottom: '0.2rem' }}>
                        <span>Rev #{rev.revision_number} • {rev.payload?.label}</span>
                        <span style={{ color: 'var(--text-muted)' }}>{rev.origin}</span>
                      </div>
                      <div style={{ color: 'var(--text-secondary)', fontSize: '0.75rem' }}>
                        {rev.change_reason || 'Initial creation'} • {new Date(rev.created_at).toLocaleTimeString()}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
