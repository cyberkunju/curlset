import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  fetchDatasetQueue,
  fetchRecordDetail,
  createAnnotation,
  updateAnnotation,
  transitionReviewStatus,
} from '../api';
import { Dataset, RecordQueueItem, RecordDetail } from '../types';
import { ObjectDetectionCanvas, BoundingBox } from './ObjectDetectionCanvas';
import { ProgressiveAssetImage } from './ui/ProgressiveAssetImage';
import { SpringButton } from './ui/SpringButton';
import {
  ArrowLeft,
  Copy,
  Check,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  History,
  Volume2,
  FileText,
  Search,
  Sparkles,
  Play,
  Pause,
  Plus,
  Trash2,
  Inbox,
} from 'lucide-react';

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
  const [queueSearch, setQueueSearch] = useState<string>('');

  // Active Record
  const [currentIndex, setCurrentIndex] = useState(0);
  const [currentRecord, setCurrentRecord] = useState<RecordDetail | null>(null);
  const [loadingRecord, setLoadingRecord] = useState(false);
  const [copied, setCopied] = useState(false);

  // Annotation Editor Form
  const [selectedLabel, setSelectedLabel] = useState<string>('');
  const [confidence, setConfidence] = useState<number>(1.0);
  const [notes, setNotes] = useState<string>('');
  const [boxes, setBoxes] = useState<BoundingBox[]>([]);
  const [transcriptText, setTranscriptText] = useState<string>('');
  const [transcriptSegments, setTranscriptSegments] = useState<Array<{ start_time: number; end_time: number; speaker?: string; text: string }>>([]);
  const [playbackRate, setPlaybackRate] = useState<number>(1.0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [saving, setSaving] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);

  useEffect(() => {
    document.body.classList.add('workbench-active');
    return () => {
      document.body.classList.remove('workbench-active');
    };
  }, []);

  // Extract allowed classes from label_schema
  const allowedClasses: string[] = dataset.label_schema?.classes || dataset.label_schema?.labels || [];

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  const handleCopyId = (id: string) => {
    navigator.clipboard.writeText(id);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
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
  }, [allowedClasses, dataset.task_type]);

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
  const handleReviewAction = async (action: 'approved' | 'rejected' | 'needs_correction', comment?: string) => {
    if (!currentRecord?.annotation) {
      showToast('Record must have an annotation before review transition.');
      return;
    }
    setSaving(true);
    try {
      await transitionReviewStatus(
        currentRecord.annotation.id,
        action,
        comment || `Reviewer marked as ${action}`
      );
      showToast(`Status changed to ${action.replace('_', ' ')}`);
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

  // Dedicated "Not Similar / Disagree" review action
  const handleNotSimilarAction = async () => {
    if (currentRecord?.annotation) {
      await handleReviewAction('rejected', 'Marked as Not Similar / Disagreement');
    } else if (currentRecord) {
      setSaving(true);
      try {
        await createAnnotation(
          currentRecord.id,
          {
            label: 'not_similar',
            rationale: 'Reviewer marked as Not Similar / Disagreement',
            ...(notes ? { notes } : {}),
          },
          'human',
          'rejected',
          'default_user',
          confidence
        );
        showToast("Marked as 'Not Similar / Disagree' (Rejected)");
        await loadActiveRecord(currentRecord.id);
        loadQueue();
        if (currentIndex < queue.length - 1) {
          setCurrentIndex((prev) => prev + 1);
        }
      } catch (err: any) {
        showToast(`Failed to mark not similar: ${err.message}`);
      } finally {
        setSaving(false);
      }
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
      } else if (e.key === 'n' || e.key === 'N') {
        e.preventDefault();
        handleNotSimilarAction();
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

  // Filtered queue items
  const filteredQueue = queue.filter((item) => {
    if (!queueSearch.trim()) return true;
    const q = queueSearch.toLowerCase();
    return (
      (item.external_key && item.external_key.toLowerCase().includes(q)) ||
      item.id.toLowerCase().includes(q) ||
      (item.annotation_payload?.label && item.annotation_payload.label.toLowerCase().includes(q))
    );
  });

  const reviewedCount = queue.filter(
    (q) => q.review_status === 'approved' || q.review_status === 'rejected' || q.review_status === 'needs_correction'
  ).length;
  const reviewPct = queue.length > 0 ? Math.round((reviewedCount / queue.length) * 100) : 0;

  return (
    <div className="workbench-viewport">
      {/* Toast Alert */}
      {toastMessage && (
        <div
          style={{
            position: 'fixed',
            top: '20px',
            right: '20px',
            zIndex: 1000,
            background: 'var(--bg-surface)',
            border: '1px solid var(--border-hairline)',
            boxShadow: 'var(--shadow-lg)',
            padding: '0.65rem 1.15rem',
            borderRadius: 'var(--radius-sm)',
            fontSize: '0.85rem',
            color: 'var(--text-primary)',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
          }}
        >
          <Sparkles size={16} style={{ color: 'var(--accent-interactive)' }} />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Top Workbench Navigation Bar */}
      <div className="workbench-top-bar">
        {/* Left: Back & Dataset Identity */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
          <button
            className="btn btn-secondary"
            onClick={onBack}
            style={{ padding: '0.35rem 0.65rem', fontSize: '0.825rem' }}
          >
            <ArrowLeft size={14} style={{ marginRight: '4px' }} />
            <span>Dataset</span>
          </button>
          <div style={{ width: '1px', height: '18px', background: 'var(--border-hairline)' }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-primary)' }}>
              {dataset.name}
            </span>
            <span className="badge badge-blue">{dataset.task_type.replace(/_/g, ' ')}</span>
          </div>
        </div>

        {/* Center: Filters & Progress Meter */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <select
            className="input"
            value={selectedSplit}
            onChange={(e) => setSelectedSplit(e.target.value)}
            style={{ width: '115px', padding: '0.35rem 0.55rem', fontSize: '0.825rem' }}
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
            style={{ width: '145px', padding: '0.35rem 0.55rem', fontSize: '0.825rem' }}
          >
            <option value="">All Statuses</option>
            <option value="unannotated">Unannotated</option>
            <option value="pending_review">Pending Review</option>
            <option value="approved">Approved</option>
            <option value="needs_correction">Needs Fix</option>
            <option value="rejected">Rejected</option>
          </select>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.45rem',
              padding: '0.3rem 0.65rem',
              background: 'var(--bg-elevated)',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--border-hairline)',
              fontSize: '0.78rem',
            }}
          >
            <span style={{ color: 'var(--text-secondary)' }}>Reviewed:</span>
            <span style={{ fontWeight: 700, color: 'var(--accent-interactive)' }}>
              {reviewedCount} / {queue.length} ({reviewPct}%)
            </span>
          </div>
        </div>

        {/* Right: Quick Pagination Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          <button
            className="btn btn-secondary"
            disabled={currentIndex === 0 || queue.length === 0}
            onClick={() => setCurrentIndex((i) => i - 1)}
            title="Previous Record (K or Up)"
            style={{ padding: '0.35rem 0.65rem', fontSize: '0.8rem' }}
          >
            Prev <kbd style={{ marginLeft: '4px', fontSize: '0.7rem' }}>K</kbd>
          </button>
          <span
            style={{
              fontSize: '0.82rem',
              fontFamily: 'var(--font-mono)',
              color: 'var(--text-secondary)',
              minWidth: '85px',
              textAlign: 'center',
            }}
          >
            {queue.length > 0 ? `${currentIndex + 1} of ${totalQueue}` : '0 of 0'}
          </span>
          <button
            className="btn btn-secondary"
            disabled={currentIndex >= queue.length - 1 || queue.length === 0}
            onClick={() => setCurrentIndex((i) => i + 1)}
            title="Next Record (J or Down)"
            style={{ padding: '0.35rem 0.65rem', fontSize: '0.8rem' }}
          >
            Next <kbd style={{ marginLeft: '4px', fontSize: '0.7rem' }}>J</kbd>
          </button>
        </div>
      </div>

      {/* Main 3-Panel Balanced Workspace Layout */}
      <div className="workbench-body">
        {/* ========================================================================= */}
        {/* Left Column: Record Queue Navigator */}
        {/* ========================================================================= */}
        <div className="workbench-panel-left">
          {/* Queue Header & Search */}
          <div style={{ padding: '0.75rem 1rem', borderBottom: '1px solid var(--border-hairline)' }}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '0.5rem',
              }}
            >
              <span style={{ fontWeight: 700, fontSize: '0.8rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Queue ({filteredQueue.length})
              </span>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                Sorted by Index
              </span>
            </div>
            <div style={{ position: 'relative' }}>
              <Search
                size={14}
                style={{
                  position: 'absolute',
                  left: '8px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: 'var(--text-muted)',
                }}
              />
              <input
                type="text"
                className="input"
                placeholder="Search key, label, ID..."
                value={queueSearch}
                onChange={(e) => setQueueSearch(e.target.value)}
                style={{ width: '100%', paddingLeft: '28px', fontSize: '0.8rem', padding: '0.35rem 0.5rem 0.35rem 26px' }}
              />
            </div>
          </div>

          {/* Queue Items List */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '0.5rem' }}>
            {loadingQueue ? (
              <div style={{ padding: '2rem 1rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                Loading dataset records...
              </div>
            ) : queueError ? (
              <div style={{ padding: '1rem', color: 'var(--rose)', fontSize: '0.85rem' }}>{queueError}</div>
            ) : filteredQueue.length === 0 ? (
              <div style={{ padding: '2rem 1rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                No records match active filters.
              </div>
            ) : (
              filteredQueue.map((item, idx) => {
                const isActive = item.id === (currentRecord?.id || queue[currentIndex]?.id);
                const statusBadgeClass =
                  item.review_status === 'approved'
                    ? 'badge-emerald'
                    : item.review_status === 'rejected'
                    ? 'badge-rose'
                    : item.review_status === 'needs_correction'
                    ? 'badge-amber'
                    : item.review_status === 'pending_review'
                    ? 'badge-blue'
                    : 'badge-neutral';

                return (
                  <div
                    key={item.id}
                    onClick={() => {
                      const originalIdx = queue.findIndex((q) => q.id === item.id);
                      if (originalIdx !== -1) setCurrentIndex(originalIdx);
                    }}
                    className={`workbench-queue-item ${isActive ? 'active' : ''}`}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span
                        style={{
                          fontSize: '0.825rem',
                          fontFamily: 'var(--font-mono)',
                          fontWeight: isActive ? 700 : 500,
                          color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
                        }}
                      >
                        #{idx + 1} {item.external_key || item.id.slice(0, 8)}
                      </span>
                      <span className={`badge ${statusBadgeClass}`} style={{ fontSize: '0.68rem', padding: '0.1rem 0.35rem' }}>
                        {item.review_status.replace(/_/g, ' ')}
                      </span>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      <span>Split: {item.split || 'train'}</span>
                      {item.annotation_payload?.label && (
                        <span className="badge badge-blue" style={{ fontSize: '0.7rem', padding: '0.1rem 0.35rem' }}>
                          {item.annotation_payload.label}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* ========================================================================= */}
        {/* Center Column: Media & Canvas Viewer Stage (Primary Focus) */}
        {/* ========================================================================= */}
        <div className="workbench-panel-center">
          {loadingRecord ? (
            <div className="loading-container" style={{ flex: 1 }}>
              <div className="spinner"></div>
              <div>Loading record asset...</div>
            </div>
          ) : !currentRecord ? (
            <div className="empty-state" style={{ flex: 1 }}>
              <div className="empty-icon" style={{ display: 'flex', justifyContent: 'center', marginBottom: '0.5rem' }}>
                <Inbox size={36} style={{ color: 'var(--text-muted)' }} />
              </div>
              <h3 className="empty-title">No Record Selected</h3>
              <p className="empty-desc">Choose a record from the queue to start labeling.</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
              {/* Asset Information Header */}
              <div
                style={{
                  padding: '0.65rem 1.25rem',
                  borderBottom: '1px solid var(--border-hairline)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  background: 'var(--bg-surface)',
                  flexShrink: 0,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <span style={{ fontWeight: 600, fontSize: '0.85rem', color: 'var(--text-primary)' }}>
                    ID: <code style={{ fontFamily: 'var(--font-mono)' }}>{currentRecord.external_key || currentRecord.id}</code>
                  </span>
                  <button
                    onClick={() => handleCopyId(currentRecord.id)}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: copied ? 'var(--emerald)' : 'var(--text-muted)',
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.25rem',
                      fontSize: '0.75rem',
                    }}
                    title="Copy full Record UUID"
                  >
                    {copied ? <Check size={13} /> : <Copy size={13} />}
                    <span>{copied ? 'Copied' : 'Copy'}</span>
                  </button>
                  <span className="badge badge-neutral">Split: {currentRecord.split}</span>
                </div>

                {activeAsset && (
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                    {activeAsset.original_filename && (
                      <span style={{ fontWeight: 500, color: 'var(--text-secondary)' }}>
                        {activeAsset.original_filename} •{' '}
                      </span>
                    )}
                    {activeAsset.dimensions?.width && activeAsset.dimensions?.height && (
                      <span>
                        {activeAsset.dimensions.width}×{activeAsset.dimensions.height}px •{' '}
                      </span>
                    )}
                    <span>{(activeAsset.byte_size / 1024).toFixed(1)} KB</span>
                  </div>
                )}
              </div>

              {/* Viewer Stage Area */}
              <div
                style={{
                  flex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '1.5rem',
                  overflow: 'auto',
                  background: 'var(--bg-canvas)',
                }}
              >
                {/* 1. Image Classification Media Presentation */}
                {dataset.task_type === 'image_classification' && activeAsset ? (
                  <div
                    style={{
                      maxWidth: '100%',
                      maxHeight: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <ProgressiveAssetImage
                      src={`/api/v1/assets/${activeAsset.id}/raw`}
                      alt={activeAsset.original_filename || 'Record Asset'}
                      width={activeAsset.dimensions?.width || 640}
                      height={activeAsset.dimensions?.height || 480}
                      style={{
                        maxWidth: '100%',
                        maxHeight: 'calc(100vh - 220px)',
                        objectFit: 'contain',
                        borderRadius: 'var(--radius-md)',
                        boxShadow: 'var(--shadow-md)',
                        border: '1px solid var(--border-hairline)',
                      }}
                    />
                  </div>
                ) : dataset.task_type === 'object_detection' && activeAsset ? (
                  /* 2. Object Detection Media Presentation */
                  <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}>
                    <ObjectDetectionCanvas
                      imageUrl={`/api/v1/assets/${activeAsset.id}/raw`}
                      boxes={boxes}
                      classes={allowedClasses}
                      selectedClass={selectedLabel || allowedClasses[0] || 'object'}
                      onChange={(newBoxes) => setBoxes(newBoxes)}
                    />
                  </div>
                ) : dataset.task_type === 'audio_transcription' && activeAsset ? (
                  /* 3. Audio Transcription Media Presentation */
                  <div
                    style={{
                      width: '100%',
                      maxWidth: '820px',
                      background: 'var(--bg-surface)',
                      padding: '1.75rem',
                      borderRadius: 'var(--radius-md)',
                      border: '1px solid var(--border-hairline)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '1.5rem',
                      boxShadow: 'var(--shadow-md)',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <div
                          style={{
                            width: '44px',
                            height: '44px',
                            borderRadius: 'var(--radius-sm)',
                            background: 'var(--bg-elevated)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: 'var(--accent-interactive)',
                          }}
                        >
                          <Volume2 size={24} />
                        </div>
                        <div>
                          <div style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--text-primary)' }}>
                            {activeAsset.original_filename || 'Audio Recording'}
                          </div>
                          <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                            {activeAsset.dimensions?.duration_seconds ? `${activeAsset.dimensions.duration_seconds}s • ` : ''}
                            {activeAsset.dimensions?.sample_rate_hz ? `${activeAsset.dimensions.sample_rate_hz} Hz • ` : ''}
                            {activeAsset.dimensions?.channels ? `${activeAsset.dimensions.channels} ch • ` : ''}
                            {(activeAsset.byte_size / 1024).toFixed(1)} KB
                          </div>
                        </div>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Speed:</span>
                        {[0.75, 1.0, 1.25, 1.5].map((rate) => (
                          <button
                            key={rate}
                            type="button"
                            className={`btn ${playbackRate === rate ? 'btn-primary' : 'btn-secondary'}`}
                            style={{ padding: '0.2rem 0.5rem', fontSize: '0.75rem' }}
                            onClick={() => {
                              setPlaybackRate(rate);
                              if (audioRef.current) audioRef.current.playbackRate = rate;
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
                      style={{ width: '100%' }}
                      onPlay={() => setIsPlaying(true)}
                      onPause={() => setIsPlaying(false)}
                      onEnded={() => setIsPlaying(false)}
                    />

                    {/* Interactive Segments Visual Timeline */}
                    {transcriptSegments.length > 0 && (
                      <div>
                        <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '0.5rem', textTransform: 'uppercase' }}>
                          Timeline Cues ({transcriptSegments.length})
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', maxHeight: '180px', overflowY: 'auto' }}>
                          {transcriptSegments.map((seg, idx) => (
                            <div
                              key={idx}
                              onClick={() => {
                                if (audioRef.current) {
                                  audioRef.current.currentTime = seg.start_time;
                                  audioRef.current.play();
                                }
                              }}
                              style={{
                                padding: '0.5rem 0.75rem',
                                background: 'var(--bg-elevated)',
                                border: '1px solid var(--border-hairline)',
                                borderRadius: 'var(--radius-sm)',
                                cursor: 'pointer',
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                fontSize: '0.825rem',
                              }}
                              title="Click to seek and play"
                            >
                              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                                <span className="badge badge-blue" style={{ fontSize: '0.7rem' }}>
                                  {seg.start_time.toFixed(2)}s - {seg.end_time.toFixed(2)}s
                                </span>
                                {seg.speaker && <strong style={{ color: 'var(--accent-interactive)' }}>{seg.speaker}:</strong>}
                                <span>{seg.text || <em style={{ color: 'var(--text-muted)' }}>No cue text</em>}</span>
                              </div>
                              <Play size={12} style={{ color: 'var(--text-muted)' }} />
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  /* 4. Text Classification Media Presentation */
                  <div
                    style={{
                      width: '100%',
                      maxWidth: '780px',
                      background: 'var(--bg-surface)',
                      padding: '2rem',
                      borderRadius: 'var(--radius-md)',
                      border: '1px solid var(--border-hairline)',
                      boxShadow: 'var(--shadow-md)',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                      <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                        Document Payload Content
                      </div>
                      <div style={{ display: 'flex', gap: '0.5rem', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        <span>Words: {((currentRecord.metadata?.text || currentRecord.metadata?.content || '').split(/\s+/).filter(Boolean).length)}</span>
                        <span>•</span>
                        <span>Chars: {((currentRecord.metadata?.text || currentRecord.metadata?.content || '').length)}</span>
                      </div>
                    </div>
                    <div
                      style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: '0.95rem',
                        lineHeight: 1.7,
                        color: 'var(--text-primary)',
                        whiteSpace: 'pre-wrap',
                        background: 'var(--bg-canvas)',
                        padding: '1.25rem',
                        borderRadius: 'var(--radius-sm)',
                        border: '1px solid var(--border-hairline)',
                        maxHeight: '400px',
                        overflowY: 'auto',
                      }}
                    >
                      {currentRecord.metadata?.text ||
                        currentRecord.metadata?.content ||
                        JSON.stringify(currentRecord.metadata, null, 2)}
                    </div>
                  </div>
                )}
              </div>

              {/* Bottom Sticky Hotkey Legend Bar */}
              <div className="workbench-hotkey-legend">
                <div><kbd>1-9</kbd>Select Class</div>
                <div><kbd>Enter</kbd>Save & Next</div>
                <div><kbd>A</kbd>Approve</div>
                <div><kbd>R</kbd>Reject</div>
                <div><kbd>C</kbd>Needs Fix</div>
                <div><kbd>N</kbd>Not Similar</div>
                <div><kbd>J / K</kbd>Next / Prev</div>
              </div>
            </div>
          )}
        </div>

        {/* ========================================================================= */}
        {/* Right Column: Inspector, Label Selection & Actions */}
        {/* ========================================================================= */}
        <div className="workbench-panel-right">
          {/* Section 1: Guidelines */}
          <div>
            <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '0.4rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Annotation Guidelines
            </div>
            <div style={{ fontSize: '0.825rem', color: 'var(--text-muted)', lineHeight: 1.5, background: 'var(--bg-elevated)', padding: '0.65rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-hairline)' }}>
              {dataset.annotation_instructions ||
                (dataset.task_type === 'audio_transcription'
                  ? 'Transcribe speech verbatim, verify speaker turns, and adjust timestamps.'
                  : 'Select the most accurate label. Use hotkeys 1-9 for quick classification.')}
            </div>
          </div>

          {/* Section 2: Task-Specific Label / Audio Inputs */}
          {dataset.task_type === 'audio_transcription' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '0.4rem', textTransform: 'uppercase' }}>
                  Full Transcript
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
                  <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
                    Timed Segments
                  </span>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    style={{ fontSize: '0.72rem', padding: '0.2rem 0.5rem' }}
                    onClick={() => {
                      const cur = audioRef.current?.currentTime || 0;
                      setTranscriptSegments([
                        ...transcriptSegments,
                        { start_time: Math.max(0, Math.floor(cur)), end_time: Math.ceil(cur + 2), text: '', speaker: 'Speaker 1' },
                      ]);
                    }}
                  >
                    <Plus size={12} style={{ marginRight: '2px' }} /> Add Segment
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
                      backgroundColor: 'var(--bg-elevated)',
                      borderRadius: 'var(--radius-sm)',
                      border: '1px solid var(--border-hairline)',
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
                        style={{ width: '65px', padding: '0.2rem 0.4rem', fontSize: '0.75rem' }}
                      />
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>to</span>
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
                        style={{ width: '65px', padding: '0.2rem 0.4rem', fontSize: '0.75rem' }}
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
                          padding: '2px',
                        }}
                        title="Delete segment"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                    <input
                      type="text"
                      className="input"
                      placeholder="Segment cue text..."
                      value={seg.text}
                      onChange={(e) => {
                        const next = [...transcriptSegments];
                        next[idx] = { ...seg, text: e.target.value };
                        setTranscriptSegments(next);
                      }}
                      style={{ fontSize: '0.78rem', padding: '0.25rem 0.45rem' }}
                    />
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div>
              <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Class Selection ({allowedClasses.length})
              </div>
              {allowedClasses.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
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
                          padding: '0.55rem 0.75rem',
                          borderRadius: 'var(--radius-sm)',
                          backgroundColor: isSelected ? 'var(--accent-primary)' : 'var(--bg-elevated)',
                          border: `1px solid ${isSelected ? 'var(--accent-primary)' : 'var(--border-hairline)'}`,
                          color: isSelected ? 'var(--accent-primary-fg)' : 'var(--text-primary)',
                          fontWeight: isSelected ? 600 : 500,
                          cursor: 'pointer',
                          textAlign: 'left',
                          transition: 'all 0.15s ease',
                        }}
                      >
                        <span style={{ fontSize: '0.85rem' }}>{lbl}</span>
                        {shortcutKey && (
                          <kbd
                            style={{
                              background: isSelected ? 'rgba(255, 255, 255, 0.2)' : 'var(--bg-surface)',
                              border: `1px solid ${isSelected ? 'rgba(255, 255, 255, 0.3)' : 'var(--border-hairline)'}`,
                              padding: '0.1rem 0.35rem',
                              borderRadius: '3px',
                              fontSize: '0.72rem',
                              color: isSelected ? '#fff' : 'var(--text-muted)',
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

          {/* Section 3: Confidence Slider */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '0.4rem', textTransform: 'uppercase' }}>
              <span>Confidence</span>
              <span className="badge badge-blue">{(confidence * 100).toFixed(0)}%</span>
            </div>
            <input
              type="range"
              min="0.1"
              max="1.0"
              step="0.05"
              value={confidence}
              onChange={(e) => setConfidence(parseFloat(e.target.value))}
              style={{ width: '100%', accentColor: 'var(--accent-interactive)' }}
            />
          </div>

          {/* Section 4: Notes / Rationale */}
          <div>
            <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '0.4rem', textTransform: 'uppercase' }}>
              Annotation Notes / Rationale
            </div>
            <textarea
              className="input"
              rows={2}
              placeholder="Optional notes or reason for label..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              style={{ width: '100%', resize: 'vertical', fontSize: '0.825rem' }}
            />
          </div>

          {/* Section 5: Save & Fast Navigation */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <SpringButton
              variant="primary"
              disabled={
                saving ||
                !currentRecord ||
                (dataset.task_type === 'audio_transcription'
                  ? !transcriptText.trim() && transcriptSegments.length === 0
                  : dataset.task_type !== 'object_detection' && !selectedLabel)
              }
              onClick={() => handleSaveAnnotation()}
              style={{ width: '100%', padding: '0.65rem' }}
              shortcut="Enter"
            >
              {saving ? 'Saving...' : 'Save & Next'}
            </SpringButton>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
              <SpringButton
                variant="secondary"
                disabled={currentIndex === 0 || saving}
                onClick={() => setCurrentIndex((prev) => Math.max(0, prev - 1))}
                style={{ padding: '0.45rem', fontSize: '0.825rem' }}
                shortcut="K"
                title="Previous Record (K or Up)"
              >
                Prev
              </SpringButton>
              <SpringButton
                variant="secondary"
                disabled={currentIndex >= queue.length - 1 || saving}
                onClick={() => setCurrentIndex((prev) => Math.min(queue.length - 1, prev + 1))}
                style={{ padding: '0.45rem', fontSize: '0.825rem' }}
                shortcut="J"
                title="Next Record / Skip (J or Down)"
              >
                Skip / Next
              </SpringButton>
            </div>
          </div>

          {/* Section 6: Review Status Transitions */}
          {currentRecord?.annotation && (
            <div style={{ borderTop: '1px solid var(--border-hairline)', paddingTop: '1rem' }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '0.5rem', textTransform: 'uppercase' }}>
                Review Transition
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginBottom: '0.5rem' }}>
                <SpringButton
                  variant="secondary"
                  onClick={() => handleReviewAction('approved')}
                  disabled={saving}
                  style={{
                    backgroundColor: 'rgba(16, 185, 129, 0.08)',
                    borderColor: 'rgba(16, 185, 129, 0.3)',
                    color: 'var(--status-approved)',
                    padding: '0.45rem',
                  }}
                  shortcut="A"
                  title="Approve (A)"
                >
                  <CheckCircle2 size={13} style={{ marginRight: '4px' }} /> Approve
                </SpringButton>
                <SpringButton
                  variant="danger"
                  onClick={() => handleReviewAction('rejected')}
                  disabled={saving}
                  style={{ padding: '0.45rem' }}
                  shortcut="R"
                  title="Reject (R)"
                >
                  <XCircle size={13} style={{ marginRight: '4px' }} /> Reject
                </SpringButton>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                <SpringButton
                  variant="secondary"
                  onClick={() => handleReviewAction('needs_correction')}
                  disabled={saving}
                  style={{
                    backgroundColor: 'rgba(245, 158, 11, 0.08)',
                    borderColor: 'rgba(245, 158, 11, 0.3)',
                    color: 'var(--status-pending)',
                    padding: '0.45rem',
                  }}
                  shortcut="C"
                  title="Needs Correction (C)"
                >
                  <AlertTriangle size={13} style={{ marginRight: '4px' }} /> Needs Fix
                </SpringButton>
                <SpringButton
                  variant="secondary"
                  onClick={() => handleNotSimilarAction()}
                  disabled={saving}
                  style={{
                    backgroundColor: 'rgba(37, 99, 235, 0.08)',
                    borderColor: 'rgba(37, 99, 235, 0.3)',
                    color: 'var(--accent-interactive)',
                    padding: '0.45rem',
                  }}
                  shortcut="N"
                  title="Mark as Not Similar / Disagreement (N)"
                >
                  ≠ Not Similar
                </SpringButton>
              </div>
            </div>
          )}

          {/* Section 7: Revisions & Audit History */}
          {currentRecord?.revisions && currentRecord.revisions.length > 0 && (
            <div style={{ borderTop: '1px solid var(--border-hairline)', paddingTop: '0.85rem' }}>
              <button
                onClick={() => setShowHistory(!showHistory)}
                style={{
                  width: '100%',
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--text-secondary)',
                  cursor: 'pointer',
                  fontSize: '0.825rem',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '0.25rem 0',
                }}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontWeight: 600 }}>
                  <History size={14} /> Revision History ({currentRecord.revisions.length})
                </span>
                <span>{showHistory ? '▲' : '▼'}</span>
              </button>

              {showHistory && (
                <div style={{ marginTop: '0.65rem', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                  {currentRecord.revisions.map((rev) => (
                    <div
                      key={rev.id}
                      style={{
                        padding: '0.5rem 0.65rem',
                        background: 'var(--bg-elevated)',
                        borderRadius: 'var(--radius-sm)',
                        border: '1px solid var(--border-hairline)',
                        fontSize: '0.78rem',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 600, marginBottom: '0.2rem' }}>
                        <span>Rev #{rev.revision_number} • {rev.payload?.label}</span>
                        <span className="badge badge-neutral" style={{ fontSize: '0.68rem' }}>{rev.origin}</span>
                      </div>
                      <div style={{ color: 'var(--text-muted)', fontSize: '0.72rem' }}>
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
