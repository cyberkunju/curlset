import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
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
import { AudioWaveformScrubber } from './ui/AudioWaveformScrubber';
import { ShortcutHelpModal } from './ui/ShortcutHelpModal';
import { SpringButton } from './ui/SpringButton';
import { CustomSelect } from './ui/CustomSelect';
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
  ChevronUp,
  ChevronDown,
  HelpCircle,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  Layers,
  Image as ImageIcon,
  Headphones,
  RotateCcw,
  X,
  Clock,
  Eye,
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

  // Active Record Selection by ID (eliminates index mismatch bugs)
  const [selectedRecordId, setSelectedRecordId] = useState<string | null>(null);
  const [currentRecord, setCurrentRecord] = useState<RecordDetail | null>(null);
  const [loadingRecord, setLoadingRecord] = useState(false);
  const [isTransitioningRecord, setIsTransitioningRecord] = useState(false);
  const recordCache = useRef<Map<string, RecordDetail>>(new Map());
  const currentRecordRef = useRef<RecordDetail | null>(null);
  currentRecordRef.current = currentRecord;
  const [copied, setCopied] = useState(false);

  // Annotation Editor Form State
  const [selectedLabel, setSelectedLabel] = useState<string>('');
  const [confidence, setConfidence] = useState<number>(1.0);
  const [boxes, setBoxes] = useState<BoundingBox[]>([]);
  const [canvasImageDims, setCanvasImageDims] = useState<{ width: number; height: number } | null>(null);
  const [activeCoordSystem, setActiveCoordSystem] = useState<string | null>(null);
  const [isLegacyRecord, setIsLegacyRecord] = useState<boolean>(false);
  const [isNewlyRecreated, setIsNewlyRecreated] = useState<boolean>(false);
  const [notes, setNotes] = useState<string>('');
  const [transcriptText, setTranscriptText] = useState<string>('');
  const [transcriptSegments, setTranscriptSegments] = useState<
    Array<{ start_time: number; end_time: number; speaker?: string; text: string }>
  >([]);

  // Audio Playback State
  const [audioCurrentTime, setAudioCurrentTime] = useState<number>(0);
  const [audioDuration, setAudioDuration] = useState<number>(0);
  const [playbackRate, setPlaybackRate] = useState<number>(1.0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // UI Panels & Modal Toggles
  const [isLeftPanelOpen, setIsLeftPanelOpen] = useState(true);
  const [isRightPanelOpen, setIsRightPanelOpen] = useState(true);
  const [isShortcutModalOpen, setIsShortcutModalOpen] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [classSearch, setClassSearch] = useState('');
  const [mobileActiveTab, setMobileActiveTab] = useState<'queue' | 'stage' | 'inspector'>('stage');

  // Operation Feedback & Safety State
  const [saving, setSaving] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [isDirty, setIsDirty] = useState(false);

  useEffect(() => {
    document.body.classList.add('workbench-active');
    return () => {
      document.body.classList.remove('workbench-active');
    };
  }, []);

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

  // Filtered Queue derived memo (accurately reflects filters + search)
  const filteredQueue = useMemo(() => {
    return queue.filter((item) => {
      const matchesSplit = !selectedSplit || (item.split || 'train') === selectedSplit;
      const matchesStatus = !selectedStatus || item.review_status === selectedStatus;
      if (!matchesSplit || !matchesStatus) return false;

      if (!queueSearch.trim()) return true;
      const q = queueSearch.toLowerCase().trim();
      const keyMatch = item.external_key ? item.external_key.toLowerCase().includes(q) : false;
      const idMatch = item.id.toLowerCase().includes(q);
      const labelMatch = item.annotation_payload?.label
        ? String(item.annotation_payload.label).toLowerCase().includes(q)
        : false;
      const textMatch = item.annotation_payload?.text
        ? String(item.annotation_payload.text).toLowerCase().includes(q)
        : false;
      const fileMatch = item.primary_asset?.original_filename
        ? item.primary_asset.original_filename.toLowerCase().includes(q)
        : false;

      return keyMatch || idMatch || labelMatch || textMatch || fileMatch;
    });
  }, [queue, selectedSplit, selectedStatus, queueSearch]);

  // Current position within filtered queue
  const currentFilteredIndex = useMemo(() => {
    if (!selectedRecordId) return -1;
    return filteredQueue.findIndex((item) => item.id === selectedRecordId);
  }, [filteredQueue, selectedRecordId]);

  // Load Record Queue from API
  const loadQueue = useCallback(async () => {
    setLoadingQueue(true);
    setQueueError(null);
    try {
      const res = await fetchDatasetQueue(
        dataset.id,
        selectedSplit || undefined,
        selectedStatus || undefined,
        150,
        0
      );
      setQueue(res.items);
      setTotalQueue(res.total);
    } catch (err: any) {
      setQueueError(err.message || 'Failed to load record queue');
    } finally {
      setLoadingQueue(false);
    }
  }, [dataset.id, selectedSplit, selectedStatus]);

  useEffect(() => {
    loadQueue();
  }, [loadQueue]);

  // Synchronize selectedRecordId with filteredQueue
  useEffect(() => {
    if (filteredQueue.length > 0) {
      if (!selectedRecordId || !filteredQueue.some((item) => item.id === selectedRecordId)) {
        setSelectedRecordId(filteredQueue[0].id);
      }
    } else {
      setSelectedRecordId(null);
      setCurrentRecord(null);
    }
  }, [filteredQueue, selectedRecordId]);

  // Helper: cleanly populate form state for a record detail
  const applyRecordDetail = useCallback(
    (detail: RecordDetail) => {
      setCurrentRecord(detail);

      // Populate or cleanly reset form fields
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
      setCanvasImageDims(null);

      const existingCoord = detail.annotation?.payload?.coordinate_system;
      const boxCount = Array.isArray(detail.annotation?.payload?.boxes)
        ? detail.annotation.payload.boxes.length
        : 0;
      const isLegacy =
        existingCoord === 'uncalibrated-legacy' ||
        (existingCoord !== 'pixel-intrinsic' && existingCoord !== 'normalized' && boxCount > 0);
      setIsLegacyRecord(isLegacy);
      setActiveCoordSystem(existingCoord || null);
      setIsNewlyRecreated(false);

      if (dataset.task_type === 'audio_transcription') {
        setTranscriptText(detail.annotation?.payload?.text || '');
        setTranscriptSegments(detail.annotation?.payload?.segments || []);
      }

      setIsDirty(false);
    },
    [allowedClasses, dataset.task_type]
  );

  // Background Prefetch for Adjacent Queue Items
  const prefetchAdjacent = useCallback(
    (activeId: string) => {
      const curIdx = filteredQueue.findIndex((item) => item.id === activeId);
      if (curIdx === -1) return;
      const targets = [curIdx + 1, curIdx + 2, curIdx - 1];
      targets.forEach((idx) => {
        if (idx >= 0 && idx < filteredQueue.length) {
          const targetId = filteredQueue[idx].id;
          if (!recordCache.current.has(targetId)) {
            fetchRecordDetail(targetId)
              .then((d) => {
                recordCache.current.set(targetId, d);
              })
              .catch(() => {});
          }
        }
      });
    },
    [filteredQueue]
  );

  // Load Active Record Details & Reset Form (With Cache & Smooth Non-destructive Transition)
  const loadActiveRecord = useCallback(
    async (recordId: string) => {
      // Pause any ongoing audio playback
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
        setIsPlaying(false);
      }

      // 1. Instant Cache Hit (0ms synchronous switch — zero DOM unmount / zero blink)
      if (recordCache.current.has(recordId)) {
        const cached = recordCache.current.get(recordId)!;
        applyRecordDetail(cached);
        setLoadingRecord(false);
        setIsTransitioningRecord(false);
        prefetchAdjacent(recordId);
        return;
      }

      // 2. Cache Miss: Keep existing record mounted to prevent visual jarring / glitching
      if (!currentRecordRef.current) {
        setLoadingRecord(true);
      } else {
        setIsTransitioningRecord(true);
      }

      try {
        const detail: RecordDetail = await fetchRecordDetail(recordId);
        recordCache.current.set(recordId, detail);
        applyRecordDetail(detail);
        prefetchAdjacent(recordId);
      } catch (err: any) {
        showToast(`Error loading record: ${err.message}`);
      } finally {
        setLoadingRecord(false);
        setIsTransitioningRecord(false);
      }
    },
    [applyRecordDetail, prefetchAdjacent]
  );

  // Recreate uncalibrated legacy annotation into verified intrinsic source pixels
  const handleRecreateCalibrated = () => {
    if (boxes.length > 0) {
      const confirmed = window.confirm(
        'Original box placement cannot be recovered reliably from missing historical calibration metadata. ' +
        'Clearing existing geometry will unlock the canvas for calibrated re-annotation in intrinsic image pixels. Proceed?'
      );
      if (!confirmed) return;
    }
    setBoxes([]);
    setIsLegacyRecord(false);
    setActiveCoordSystem('pixel-intrinsic');
    setIsNewlyRecreated(true);
    setIsDirty(true);
    showToast('Cleared uncalibrated boxes. Canvas is now active in calibrated source-image frame.');
  };

  const handleConvertNormalizedToIntrinsic = (convertedBoxes: BoundingBox[]) => {
    setBoxes(convertedBoxes);
    setIsLegacyRecord(false);
    setActiveCoordSystem('pixel-intrinsic');
    setIsNewlyRecreated(false);
    setIsDirty(true);
    showToast('Converted all boxes to intrinsic source pixels. Coordinate system is now pixel-intrinsic.');
  };

  useEffect(() => {
    if (selectedRecordId) {
      loadActiveRecord(selectedRecordId);
    }
  }, [selectedRecordId, loadActiveRecord]);

  // Navigation handlers through filteredQueue
  const handleNavigateNext = () => {
    if (currentFilteredIndex >= 0 && currentFilteredIndex < filteredQueue.length - 1) {
      setSelectedRecordId(filteredQueue[currentFilteredIndex + 1].id);
    }
  };

  const handleNavigatePrev = () => {
    if (currentFilteredIndex > 0) {
      setSelectedRecordId(filteredQueue[currentFilteredIndex - 1].id);
    }
  };

  // Save / Submit Annotation
  const handleSaveAnnotation = async (customLabel?: string) => {
    if (!currentRecord) return;
    const labelToSave = customLabel || selectedLabel;

    if (dataset.task_type === 'audio_transcription') {
      if (!transcriptText.trim() && transcriptSegments.length === 0) {
        showToast('Please enter transcript text or add speech segments.');
        return;
      }
    } else if (dataset.task_type !== 'object_detection' && !labelToSave) {
      showToast('Please select or specify a label first.');
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

        const existingCoordSys = currentRecord?.annotation?.payload?.coordinate_system;
        const dimsToSave =
          canvasImageDims ||
          activeAsset?.dimensions ||
          currentRecord?.annotation?.payload?.image_dimensions;
        const hasValidDims = Boolean(
          dimsToSave?.width && dimsToSave.width > 0 && dimsToSave?.height && dimsToSave.height > 0
        );

        if (isLegacyRecord) {
          // Uncalibrated legacy record: edits to non-geometric fields or empty boxes
          // must NEVER stamp uncertain geometry as calibrated
          if (existingCoordSys) {
            payload.coordinate_system = existingCoordSys;
          }
          if (currentRecord?.annotation?.payload?.image_dimensions) {
            payload.image_dimensions = currentRecord.annotation.payload.image_dimensions;
          }
        } else if (
          hasValidDims &&
          activeCoordSystem !== 'normalized' &&
          (activeCoordSystem === 'pixel-intrinsic' ||
            (existingCoordSys === 'pixel-intrinsic' && !isLegacyRecord) ||
            isNewlyRecreated ||
            (!existingCoordSys && !isLegacyRecord && !activeCoordSystem))
        ) {
          // Calibrated intrinsic: only when created in calibrated canvas and valid image dimensions are recorded
          payload.coordinate_system = 'pixel-intrinsic';
          payload.image_dimensions = {
            width: dimsToSave.width,
            height: dimsToSave.height,
          };
        } else if (
          (activeCoordSystem === 'normalized' || existingCoordSys === 'normalized') &&
          !isNewlyRecreated
        ) {
          payload.coordinate_system = 'normalized';
          if (hasValidDims) {
            payload.image_dimensions = {
              width: dimsToSave.width,
              height: dimsToSave.height,
            };
          } else if (currentRecord?.annotation?.payload?.image_dimensions) {
            payload.image_dimensions = currentRecord.annotation.payload.image_dimensions;
          }
        } else {
          // Fallback preservation of coordinate metadata
          if (existingCoordSys) {
            payload.coordinate_system = existingCoordSys;
          }
          if (currentRecord?.annotation?.payload?.image_dimensions) {
            payload.image_dimensions = currentRecord.annotation.payload.image_dimensions;
          }
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
        await updateAnnotation(
          currentRecord.annotation.id,
          payload,
          'Human manual update',
          confidence
        );
        showToast(`Updated '${labelToSave || 'annotation'}' (Revision added)`);
      } else {
        await createAnnotation(
          currentRecord.id,
          payload,
          'human',
          'pending_review',
          'default_user',
          confidence
        );
        showToast(`Created annotation '${labelToSave || 'annotation'}'`);
      }

      setIsDirty(false);
      // Refresh current record & queue
      recordCache.current.delete(currentRecord.id);
      await loadActiveRecord(currentRecord.id);
      loadQueue();

      // Automatically advance in filteredQueue
      if (currentFilteredIndex >= 0 && currentFilteredIndex < filteredQueue.length - 1) {
        setSelectedRecordId(filteredQueue[currentFilteredIndex + 1].id);
      }
    } catch (err: any) {
      showToast(`Failed to save: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  // Review Status Transitions
  const handleReviewAction = async (
    action: 'approved' | 'rejected' | 'needs_correction',
    comment?: string
  ) => {
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
      recordCache.current.delete(currentRecord.id);
      await loadActiveRecord(currentRecord.id);
      loadQueue();

      // Advance in filteredQueue
      if (currentFilteredIndex >= 0 && currentFilteredIndex < filteredQueue.length - 1) {
        setSelectedRecordId(filteredQueue[currentFilteredIndex + 1].id);
      }
    } catch (err: any) {
      showToast(`Transition failed: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  // "Not Similar / Disagree" Review Action
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
        recordCache.current.delete(currentRecord.id);
        await loadActiveRecord(currentRecord.id);
        loadQueue();
        if (currentFilteredIndex >= 0 && currentFilteredIndex < filteredQueue.length - 1) {
          setSelectedRecordId(filteredQueue[currentFilteredIndex + 1].id);
        }
      } catch (err: any) {
        showToast(`Failed: ${err.message}`);
      } finally {
        setSaving(false);
      }
    }
  };

  // Keyboard navigation & hotkeys (with strict focus safety)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Never intercept when user is typing in inputs, textareas, or modal is open
      const target = e.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable ||
        isShortcutModalOpen
      ) {
        return;
      }

      if (e.key === 'j' || e.key === 'ArrowDown') {
        e.preventDefault();
        handleNavigateNext();
      } else if (e.key === 'k' || e.key === 'ArrowUp') {
        e.preventDefault();
        handleNavigatePrev();
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
      } else if (e.key === '?') {
        e.preventDefault();
        setIsShortcutModalOpen((prev) => !prev);
      } else if (e.key === ' ' && dataset.task_type === 'audio_transcription' && audioRef.current) {
        e.preventDefault();
        if (isPlaying) {
          audioRef.current.pause();
        } else {
          audioRef.current.play();
        }
      } else if (e.key >= '1' && e.key <= '9') {
        const classIdx = parseInt(e.key, 10) - 1;
        if (classIdx < allowedClasses.length) {
          e.preventDefault();
          const chosen = allowedClasses[classIdx];
          setSelectedLabel(chosen);
          setIsDirty(true);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    currentFilteredIndex,
    filteredQueue,
    allowedClasses,
    currentRecord,
    isShortcutModalOpen,
    isPlaying,
    dataset.task_type,
  ]);

  const activeAsset = currentRecord?.assets?.[0];

  // Review progress calculation based on actual queue items
  const reviewedCount = queue.filter(
    (q) =>
      q.review_status === 'approved' ||
      q.review_status === 'rejected' ||
      q.review_status === 'needs_correction'
  ).length;
  const reviewPct = queue.length > 0 ? Math.round((reviewedCount / queue.length) * 100) : 0;

  // Filtered classes list
  const filteredClasses = useMemo(() => {
    if (!classSearch.trim()) return allowedClasses;
    return allowedClasses.filter((c) => c.toLowerCase().includes(classSearch.toLowerCase().trim()));
  }, [allowedClasses, classSearch]);

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

      {/* Top Workbench Navigation & Control Bar */}
      <div className="workbench-top-bar" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.45rem 1rem', gap: '0.75rem', flexWrap: 'wrap' }}>
        {/* Left Section: Back to Dataset, Left Queue Toggle & Dataset Details */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
          <button
            className="btn btn-secondary"
            onClick={onBack}
            style={{ padding: '0.35rem 0.65rem', fontSize: '0.825rem', display: 'flex', alignItems: 'center', gap: '4px' }}
            title="Return to Dataset Details"
          >
            <ArrowLeft size={14} />
            <span>Dataset</span>
          </button>

          {/* Record Queue Toggle Button - Anchored on the LEFT */}
          <button
            className="btn btn-secondary"
            onClick={() => setIsLeftPanelOpen(!isLeftPanelOpen)}
            title={isLeftPanelOpen ? 'Collapse Record Queue' : 'Expand Record Queue'}
            style={{
              padding: '0.35rem 0.65rem',
              fontSize: '0.825rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.45rem',
              backgroundColor: isLeftPanelOpen ? 'var(--bg-elevated)' : 'transparent',
              borderColor: isLeftPanelOpen ? 'var(--accent-interactive)' : 'var(--border-hairline)',
              color: isLeftPanelOpen ? 'var(--text-primary)' : 'var(--text-secondary)',
            }}
          >
            {isLeftPanelOpen ? (
              <PanelLeftClose size={15} style={{ color: 'var(--accent-interactive)' }} />
            ) : (
              <PanelLeftOpen size={15} />
            )}
            <span style={{ fontWeight: 600 }}>Queue</span>
            <span
              style={{
                fontSize: '0.7rem',
                padding: '0.08rem 0.4rem',
                borderRadius: 'var(--radius-xs)',
                backgroundColor: isLeftPanelOpen ? 'rgba(37, 99, 235, 0.12)' : 'var(--bg-elevated)',
                color: isLeftPanelOpen ? 'var(--accent-interactive)' : 'var(--text-muted)',
                fontFamily: 'var(--font-mono)',
                fontWeight: 600,
              }}
            >
              {filteredQueue.length}
            </span>
          </button>

          <div style={{ width: '1px', height: '18px', background: 'var(--border-hairline)' }} />

          {/* Dataset Title & Badges */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', flexWrap: 'wrap' }}>
            <span
              style={{
                fontWeight: 700,
                fontSize: '0.925rem',
                color: 'var(--text-primary)',
                letterSpacing: '-0.01em',
                maxWidth: '240px',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
              title={dataset.name}
            >
              {dataset.name}
            </span>
            <span className="badge badge-blue" style={{ fontSize: '0.72rem', textTransform: 'capitalize' }}>
              {dataset.task_type.replace(/_/g, ' ')}
            </span>
            <span className="badge badge-neutral" style={{ fontSize: '0.72rem' }}>
              v{dataset.schema_version}
            </span>
          </div>
        </div>

        {/* Center Section: Active Record Status, Filters & Reviewed Progress */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem', flexWrap: 'wrap' }}>
          {currentRecord && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.35rem',
                padding: '0.22rem 0.55rem',
                backgroundColor: 'var(--bg-elevated)',
                border: '1px solid var(--border-hairline)',
                borderRadius: 'var(--radius-sm)',
                fontSize: '0.74rem',
              }}
              title={`Active Record ID: ${currentRecord.id}`}
            >
              <span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>Active:</span>
              <span style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
                {currentRecord.external_key || currentRecord.id.slice(0, 8)}
              </span>
              <span className="badge badge-neutral" style={{ fontSize: '0.68rem', padding: '0.08rem 0.3rem' }}>
                {currentRecord.split}
              </span>
              {currentRecord.annotation?.status && (
                <span
                  style={{
                    fontSize: '0.68rem',
                    padding: '0.08rem 0.3rem',
                    borderRadius: 'var(--radius-xs)',
                    fontWeight: 600,
                    backgroundColor:
                      currentRecord.annotation.status === 'approved'
                        ? 'rgba(16, 185, 129, 0.12)'
                        : currentRecord.annotation.status === 'rejected'
                        ? 'rgba(239, 68, 68, 0.12)'
                        : 'rgba(245, 158, 11, 0.12)',
                    color:
                      currentRecord.annotation.status === 'approved'
                        ? 'var(--emerald)'
                        : currentRecord.annotation.status === 'rejected'
                        ? 'var(--rose)'
                        : 'var(--amber)',
                  }}
                >
                  {currentRecord.annotation.status.replace(/_/g, ' ')}
                </span>
              )}
            </div>
          )}

          <CustomSelect
            value={selectedSplit}
            onChange={(val) => setSelectedSplit(val)}
            options={[
              { value: '', label: 'All Splits' },
              { value: 'train', label: 'Train' },
              { value: 'val', label: 'Val' },
              { value: 'test', label: 'Test' },
            ]}
            size="sm"
            style={{ minWidth: '110px' }}
            ariaLabel="Filter queue by split"
          />

          <CustomSelect
            value={selectedStatus}
            onChange={(val) => setSelectedStatus(val)}
            options={[
              { value: '', label: 'All Statuses' },
              { value: 'unannotated', label: 'Unannotated' },
              { value: 'pending_review', label: 'Pending Review' },
              { value: 'approved', label: 'Approved' },
              { value: 'needs_correction', label: 'Needs Fix' },
              { value: 'rejected', label: 'Rejected' },
            ]}
            size="sm"
            style={{ minWidth: '130px' }}
            ariaLabel="Filter queue by review status"
          />

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.45rem',
              padding: '0.22rem 0.55rem',
              background: 'var(--bg-elevated)',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--border-hairline)',
              fontSize: '0.74rem',
            }}
          >
            <span style={{ color: 'var(--text-secondary)' }}>Reviewed:</span>
            <span style={{ fontWeight: 700, color: 'var(--accent-interactive)', fontFamily: 'var(--font-mono)' }}>
              {reviewedCount} / {queue.length}
            </span>
            <div
              style={{
                width: '42px',
                height: '6px',
                backgroundColor: 'var(--border-hairline)',
                borderRadius: '999px',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  width: `${reviewPct}%`,
                  height: '100%',
                  backgroundColor: 'var(--accent-interactive)',
                  borderRadius: '999px',
                  transition: 'width 0.3s ease',
                }}
              />
            </div>
            <span style={{ color: 'var(--text-muted)', fontSize: '0.7rem', fontFamily: 'var(--font-mono)' }}>
              {reviewPct}%
            </span>
          </div>
        </div>

        {/* Right Section: Navigation, Shortcuts & Right Inspector Toggle */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', flexWrap: 'wrap' }}>
          {/* Navigation Controls */}
          <button
            className="btn btn-secondary"
            disabled={currentFilteredIndex <= 0 || filteredQueue.length === 0}
            onClick={handleNavigatePrev}
            title="Previous Record (K or Up)"
            style={{ padding: '0.35rem 0.6rem', fontSize: '0.8rem' }}
          >
            Prev <kbd style={{ marginLeft: '4px', fontSize: '0.68rem' }}>K</kbd>
          </button>

          <span
            style={{
              fontSize: '0.8rem',
              fontFamily: 'var(--font-mono)',
              color: 'var(--text-secondary)',
              minWidth: '85px',
              textAlign: 'center',
            }}
          >
            {filteredQueue.length > 0 ? `${currentFilteredIndex + 1} of ${filteredQueue.length}` : '0 of 0'}
          </span>

          <button
            className="btn btn-secondary"
            disabled={currentFilteredIndex >= filteredQueue.length - 1 || filteredQueue.length === 0}
            onClick={handleNavigateNext}
            title="Next Record (J or Down)"
            style={{ padding: '0.35rem 0.6rem', fontSize: '0.8rem' }}
          >
            Next <kbd style={{ marginLeft: '4px', fontSize: '0.68rem' }}>J</kbd>
          </button>

          <div style={{ width: '1px', height: '18px', background: 'var(--border-hairline)', margin: '0 0.15rem' }} />

          {/* Shortcut Help Trigger */}
          <button
            className="btn btn-secondary"
            onClick={() => setIsShortcutModalOpen(true)}
            title="Keyboard Shortcuts (?)"
            style={{ padding: '0.35rem 0.55rem', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.78rem' }}
          >
            <HelpCircle size={14} />
            <span>Shortcuts</span>
          </button>

          <div style={{ width: '1px', height: '18px', background: 'var(--border-hairline)', margin: '0 0.15rem' }} />

          {/* Right Panel Toggle: Guidelines & Inspector - Anchored on the RIGHT */}
          <button
            className="btn btn-secondary"
            onClick={() => setIsRightPanelOpen(!isRightPanelOpen)}
            title={isRightPanelOpen ? 'Collapse Guidelines & Inspector' : 'Expand Guidelines & Inspector'}
            style={{
              padding: '0.35rem 0.65rem',
              fontSize: '0.825rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.45rem',
              backgroundColor: isRightPanelOpen ? 'var(--bg-elevated)' : 'transparent',
              borderColor: isRightPanelOpen ? 'var(--accent-interactive)' : 'var(--border-hairline)',
              color: isRightPanelOpen ? 'var(--text-primary)' : 'var(--text-secondary)',
            }}
          >
            <span style={{ fontWeight: 600 }}>Inspector</span>
            {isRightPanelOpen ? (
              <PanelRightClose size={15} style={{ color: 'var(--accent-interactive)' }} />
            ) : (
              <PanelRightOpen size={15} />
            )}
          </button>
        </div>
      </div>

      {/* Main 3-Panel Balanced Workspace Layout */}
      <div
        className="workbench-body"
        style={{
          gridTemplateColumns: `${isLeftPanelOpen ? '280px' : '36px'} minmax(0, 1fr) ${isRightPanelOpen ? '340px' : '36px'}`,
          transition: 'grid-template-columns 0.2s ease',
        }}
      >
        {/* ========================================================================= */}
        {/* Left Column: Record Queue Navigator (or Collapsed Strip) */}
        {/* ========================================================================= */}
        {!isLeftPanelOpen && (
          <div
            onClick={() => setIsLeftPanelOpen(true)}
            title="Expand Record Queue (Click to open)"
            className="workbench-collapsed-tab-left"
            style={{
              width: '36px',
              height: '100%',
              backgroundColor: 'var(--bg-surface)',
              borderRight: '1px solid var(--border-hairline)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              paddingTop: '0.75rem',
              gap: '0.75rem',
              cursor: 'pointer',
              userSelect: 'none',
            }}
          >
            <div
              style={{
                width: '24px',
                height: '24px',
                borderRadius: 'var(--radius-xs)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--text-secondary)',
                backgroundColor: 'var(--bg-elevated)',
              }}
            >
              <PanelLeftOpen size={14} />
            </div>
            <div
              style={{
                writingMode: 'vertical-rl',
                textOrientation: 'mixed',
                transform: 'rotate(180deg)',
                fontSize: '0.72rem',
                fontWeight: 700,
                letterSpacing: '0.06em',
                color: 'var(--text-muted)',
                textTransform: 'uppercase',
                display: 'flex',
                alignItems: 'center',
                gap: '0.4rem',
              }}
            >
              <span>Record Queue</span>
              <span
                style={{
                  fontSize: '0.68rem',
                  fontFamily: 'var(--font-mono)',
                  color: 'var(--accent-interactive)',
                  fontWeight: 700,
                }}
              >
                ({filteredQueue.length})
              </span>
            </div>
          </div>
        )}

        {isLeftPanelOpen && (
          <div className="workbench-panel-left">
            {/* Queue Header & Search */}
            <div style={{ padding: '0.75rem 0.85rem', borderBottom: '1px solid var(--border-hairline)' }}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '0.45rem',
                }}
              >
                <span
                  style={{
                    fontWeight: 700,
                    fontSize: '0.78rem',
                    color: 'var(--text-secondary)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                  }}
                >
                  Record Queue ({filteredQueue.length})
                </span>
                {totalQueue > filteredQueue.length && (
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                    Filtered from {totalQueue}
                  </span>
                )}
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
                  placeholder="Search key, label, ID..."
                  value={queueSearch}
                  onChange={(e) => setQueueSearch(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.3rem 1.6rem 0.3rem 26px',
                    fontSize: '0.8rem',
                    background: 'var(--bg-canvas)',
                    border: '1px solid var(--border-hairline)',
                    borderRadius: 'var(--radius-sm)',
                    color: 'var(--text-primary)',
                    boxSizing: 'border-box',
                  }}
                />
                {queueSearch && (
                  <button
                    onClick={() => setQueueSearch('')}
                    style={{
                      position: 'absolute',
                      right: '6px',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      background: 'none',
                      border: 'none',
                      color: 'var(--text-muted)',
                      cursor: 'pointer',
                      padding: 0,
                    }}
                  >
                    <X size={13} />
                  </button>
                )}
              </div>
            </div>

            {/* Queue Items List with Smooth Staggered Appearance */}
            <div className="no-scrollbar" style={{ flex: 1, overflowY: 'auto', padding: '0.4rem', position: 'relative' }}>
              {loadingQueue && (
                <div
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    height: '2px',
                    zIndex: 20,
                    overflow: 'hidden',
                    background: 'rgba(59, 130, 246, 0.15)',
                  }}
                >
                  <div
                    className="workbench-transition-bar"
                    style={{
                      height: '100%',
                      width: '40%',
                      background: 'var(--accent-interactive)',
                      borderRadius: '2px',
                    }}
                  />
                </div>
              )}

              {loadingQueue && queue.length === 0 ? (
                <div style={{ padding: '2rem 1rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                  <div className="spinner" style={{ margin: '0 auto 0.5rem auto' }}></div>
                  <div>Loading records...</div>
                </div>
              ) : queueError ? (
                <div style={{ padding: '1rem', color: 'var(--rose)', fontSize: '0.85rem' }}>{queueError}</div>
              ) : filteredQueue.length === 0 ? (
                <div style={{ padding: '2rem 1rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                  <p style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: '0.3rem' }}>No matching records</p>
                  <p style={{ fontSize: '0.78rem' }}>Adjust search or split/status filters.</p>
                </div>
              ) : (
                <div>
                  <AnimatePresence mode="wait">
                    <motion.div
                      key={`${selectedSplit}-${selectedStatus}-${queueSearch}`}
                      initial={{ opacity: 0.25, filter: 'blur(1px)' }}
                      animate={{ opacity: 1, filter: 'none' }}
                      exit={{ opacity: 0.25, filter: 'blur(1px)' }}
                      transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
                    >
                      {filteredQueue.map((item, idx) => {
                        const isActive = item.id === selectedRecordId;
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
                            onClick={() => setSelectedRecordId(item.id)}
                            className={`workbench-queue-item ${isActive ? 'active' : ''}`}
                            style={{ position: 'relative' }}
                          >
                            {isActive && (
                              <motion.div
                                layoutId="activeQueueItemIndicator"
                                transition={{ type: 'spring' as const, stiffness: 480, damping: 36 }}
                                style={{
                                  position: 'absolute',
                                  inset: 0,
                                  borderRadius: 'var(--radius-sm)',
                                  border: '1.5px solid var(--accent-interactive)',
                                  backgroundColor: 'rgba(59, 130, 246, 0.08)',
                                  boxShadow: '0 0 0 1px rgba(59, 130, 246, 0.2), var(--shadow-sm)',
                                  pointerEvents: 'none',
                                  zIndex: 0,
                                }}
                              />
                            )}
                            <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', gap: '0.25rem', width: '100%' }}>
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

                              <div
                                style={{
                                  display: 'flex',
                                  justifyContent: 'space-between',
                                  alignItems: 'center',
                                  fontSize: '0.72rem',
                                  color: 'var(--text-muted)',
                                }}
                              >
                                <span>Split: {item.split || 'train'}</span>
                                {item.annotation_payload?.label && (
                                  <span className="badge badge-blue" style={{ fontSize: '0.68rem', padding: '0.05rem 0.3rem' }}>
                                    {item.annotation_payload.label}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </motion.div>
                  </AnimatePresence>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* Center Column: Primary Annotation Surface */}
        {/* ========================================================================= */}
        <div className="workbench-panel-center" style={{ position: 'relative', overflow: 'hidden' }}>
          {isTransitioningRecord && (
            <div
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                height: '2px',
                zIndex: 60,
                background: 'rgba(59, 130, 246, 0.15)',
                overflow: 'hidden',
              }}
            >
              <div
                className="workbench-transition-bar"
                style={{
                  height: '100%',
                  width: '40%',
                  background: 'var(--accent-interactive)',
                  borderRadius: '2px',
                }}
              />
            </div>
          )}

          {loadingRecord && !currentRecord ? (
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
            <motion.div
              key={currentRecord.id}
              initial={{ opacity: 0.35, filter: 'blur(2px)' }}
              animate={{ opacity: 1, filter: 'none' }}
              transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
              style={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%' }}
            >
              {/* Contextual Asset Metadata Header */}
              <div
                style={{
                  padding: '0.55rem 1rem',
                  borderBottom: '1px solid var(--border-hairline)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  background: 'var(--bg-surface)',
                  flexShrink: 0,
                  flexWrap: 'wrap',
                  gap: '0.5rem',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
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
                      fontSize: '0.72rem',
                    }}
                    title="Copy full Record UUID"
                  >
                    {copied ? <Check size={12} /> : <Copy size={12} />}
                    <span>{copied ? 'Copied' : 'Copy'}</span>
                  </button>
                  <span className="badge badge-neutral">Split: {currentRecord.split}</span>
                </div>

                {activeAsset && (
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    {activeAsset.original_filename && (
                      <span style={{ fontWeight: 500, color: 'var(--text-secondary)' }}>
                        {activeAsset.original_filename} •
                      </span>
                    )}
                    {activeAsset.dimensions?.width && activeAsset.dimensions?.height && (
                      <span>{activeAsset.dimensions.width}×{activeAsset.dimensions.height}px •</span>
                    )}
                    {activeAsset.dimensions?.duration_seconds && (
                      <span>{activeAsset.dimensions.duration_seconds}s •</span>
                    )}
                    <span>{(activeAsset.byte_size / 1024).toFixed(1)} KB</span>
                  </div>
                )}
              </div>

              {/* Modality-Specific Viewer & Annotation Canvas */}
              <div
                style={{
                  flex: 1,
                  display: 'flex',
                  alignItems: dataset.task_type === 'object_detection' ? 'stretch' : 'center',
                  justifyContent: 'center',
                  padding: dataset.task_type === 'object_detection' ? '0.75rem' : '1.25rem',
                  overflow: dataset.task_type === 'object_detection' ? 'hidden' : 'auto',
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
                      flexDirection: 'column',
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
                        maxHeight: 'calc(100vh - 240px)',
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
                      assetDimensions={activeAsset.dimensions}
                      coordinateSystem={activeCoordSystem || currentRecord?.annotation?.payload?.coordinate_system}
                      isLegacyRecord={isLegacyRecord}
                      onDimensionsLoaded={(dims) => setCanvasImageDims(dims)}
                      onRecreateCalibrated={handleRecreateCalibrated}
                      onConvertNormalizedToIntrinsic={handleConvertNormalizedToIntrinsic}
                      onChange={(newBoxes) => {
                        setBoxes(newBoxes);
                        setIsDirty(true);
                      }}
                    />
                  </div>
                ) : dataset.task_type === 'audio_transcription' && activeAsset ? (
                  /* 3. Audio Transcription Media Presentation with Waveform Scrubber */
                  <div
                    style={{
                      width: '100%',
                      maxWidth: '820px',
                      background: 'var(--bg-surface)',
                      padding: '1.5rem',
                      borderRadius: 'var(--radius-md)',
                      border: '1px solid var(--border-hairline)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '1.25rem',
                      boxShadow: 'var(--shadow-md)',
                    }}
                  >
                    {/* Audio Header */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                        <div
                          style={{
                            width: '40px',
                            height: '40px',
                            borderRadius: 'var(--radius-sm)',
                            background: 'var(--bg-elevated)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: 'var(--accent-interactive)',
                          }}
                        >
                          <Volume2 size={22} />
                        </div>
                        <div>
                          <div style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-primary)' }}>
                            {activeAsset.original_filename || 'Audio Recording'}
                          </div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                            {activeAsset.dimensions?.sample_rate_hz ? `${activeAsset.dimensions.sample_rate_hz} Hz • ` : ''}
                            {activeAsset.dimensions?.channels ? `${activeAsset.dimensions.channels} ch • ` : ''}
                            {(activeAsset.byte_size / 1024).toFixed(1)} KB
                          </div>
                        </div>
                      </div>

                      {/* Playback Speed Controls */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Speed:</span>
                        {[0.75, 1.0, 1.25, 1.5].map((rate) => (
                          <button
                            key={rate}
                            type="button"
                            className={`btn ${playbackRate === rate ? 'btn-primary' : 'btn-secondary'}`}
                            style={{ padding: '0.2rem 0.45rem', fontSize: '0.72rem' }}
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

                    {/* Interactive Acoustic Waveform Scrubber */}
                    <AudioWaveformScrubber
                      currentTime={audioCurrentTime}
                      duration={audioDuration || activeAsset.dimensions?.duration_seconds || 10}
                      segments={transcriptSegments}
                      assetId={activeAsset.id}
                      audioSrc={`/api/v1/assets/${activeAsset.id}/raw`}
                      assetByteSize={activeAsset.byte_size}
                      assetDuration={activeAsset.dimensions?.duration_seconds}
                      mimeType={activeAsset.mime_type}
                      onSeek={(time) => {
                        if (audioRef.current) {
                          audioRef.current.currentTime = time;
                          setAudioCurrentTime(time);
                        }
                      }}
                    />

                    {/* HTML5 Audio Player */}
                    <audio
                      ref={audioRef}
                      controls
                      src={`/api/v1/assets/${activeAsset.id}/raw`}
                      style={{ width: '100%', height: '40px' }}
                      onTimeUpdate={() => {
                        if (audioRef.current) setAudioCurrentTime(audioRef.current.currentTime);
                      }}
                      onLoadedMetadata={() => {
                        if (audioRef.current) setAudioDuration(audioRef.current.duration);
                      }}
                      onPlay={() => setIsPlaying(true)}
                      onPause={() => setIsPlaying(false)}
                      onEnded={() => setIsPlaying(false)}
                    />

                    {/* Interactive Timed Segments Cue List */}
                    {transcriptSegments.length > 0 && (
                      <div>
                        <div
                          style={{
                            fontSize: '0.78rem',
                            fontWeight: 700,
                            color: 'var(--text-secondary)',
                            marginBottom: '0.4rem',
                            textTransform: 'uppercase',
                            letterSpacing: '0.04em',
                          }}
                        >
                          Timeline Speech Cues ({transcriptSegments.length})
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', maxHeight: '160px', overflowY: 'auto' }}>
                          {transcriptSegments.map((seg, idx) => {
                            const isCueActive =
                              audioCurrentTime >= seg.start_time && audioCurrentTime <= seg.end_time;

                            return (
                              <div
                                key={idx}
                                onClick={() => {
                                  if (audioRef.current) {
                                    audioRef.current.currentTime = seg.start_time;
                                    audioRef.current.play();
                                    setIsPlaying(true);
                                  }
                                }}
                                style={{
                                  padding: '0.45rem 0.7rem',
                                  background: isCueActive ? 'rgba(37, 99, 235, 0.12)' : 'var(--bg-elevated)',
                                  border: `1px solid ${isCueActive ? 'var(--accent-interactive)' : 'var(--border-hairline)'}`,
                                  borderRadius: 'var(--radius-sm)',
                                  cursor: 'pointer',
                                  display: 'flex',
                                  justifyContent: 'space-between',
                                  alignItems: 'center',
                                  fontSize: '0.8rem',
                                }}
                                title="Click to seek and play segment"
                              >
                                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                                  <span className="badge badge-blue" style={{ fontSize: '0.68rem' }}>
                                    {seg.start_time.toFixed(1)}s – {seg.end_time.toFixed(1)}s
                                  </span>
                                  {seg.speaker && <strong style={{ color: 'var(--accent-interactive)' }}>{seg.speaker}:</strong>}
                                  <span>{seg.text || <em style={{ color: 'var(--text-muted)' }}>No cue text</em>}</span>
                                </div>
                                <Play size={12} style={{ color: isCueActive ? 'var(--accent-interactive)' : 'var(--text-muted)' }} />
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                ) : dataset.task_type === 'document_ocr' && activeAsset ? (
                  /* 5. Document OCR Presentation */
                  <div
                    style={{
                      width: '100%',
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
                      gap: '1rem',
                      height: '100%',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <ProgressiveAssetImage
                        src={`/api/v1/assets/${activeAsset.id}/raw`}
                        alt="OCR Document"
                        style={{
                          maxWidth: '100%',
                          maxHeight: 'calc(100vh - 240px)',
                          objectFit: 'contain',
                          borderRadius: 'var(--radius-md)',
                          border: '1px solid var(--border-hairline)',
                        }}
                      />
                    </div>
                    <div
                      style={{
                        background: 'var(--bg-surface)',
                        padding: '1.25rem',
                        borderRadius: 'var(--radius-md)',
                        border: '1px solid var(--border-hairline)',
                        display: 'flex',
                        flexDirection: 'column',
                      }}
                    >
                      <div style={{ fontWeight: 600, fontSize: '0.85rem', marginBottom: '0.5rem' }}>
                        Extracted Document Text
                      </div>
                      <textarea
                        className="input"
                        value={currentRecord.metadata?.text || currentRecord.metadata?.content || ''}
                        readOnly
                        style={{ flex: 1, resize: 'none', fontFamily: 'var(--font-mono)', fontSize: '0.85rem' }}
                      />
                    </div>
                  </div>
                ) : dataset.task_type === 'paired_image_text' && activeAsset ? (
                  /* 6. Paired Image-Text Presentation */
                  <div
                    style={{
                      width: '100%',
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
                      gap: '1.25rem',
                      alignItems: 'center',
                    }}
                  >
                    <ProgressiveAssetImage
                      src={`/api/v1/assets/${activeAsset.id}/raw`}
                      alt="Paired Asset"
                      style={{
                        maxWidth: '100%',
                        maxHeight: 'calc(100vh - 240px)',
                        objectFit: 'contain',
                        borderRadius: 'var(--radius-md)',
                        border: '1px solid var(--border-hairline)',
                      }}
                    />
                    <div
                      style={{
                        background: 'var(--bg-surface)',
                        padding: '1.5rem',
                        borderRadius: 'var(--radius-md)',
                        border: '1px solid var(--border-hairline)',
                      }}
                    >
                      <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '0.5rem', textTransform: 'uppercase' }}>
                        Paired Text / Caption
                      </div>
                      <div style={{ fontSize: '0.95rem', lineHeight: 1.6, color: 'var(--text-primary)' }}>
                        {currentRecord.metadata?.text || currentRecord.metadata?.caption || currentRecord.metadata?.prompt || 'No paired text provided.'}
                      </div>
                    </div>
                  </div>
                ) : (
                  /* 4. Text Classification Document Reader */
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
                      <div
                        style={{
                          fontSize: '0.8rem',
                          fontWeight: 700,
                          color: 'var(--text-secondary)',
                          textTransform: 'uppercase',
                          letterSpacing: '0.04em',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.4rem',
                        }}
                      >
                        <FileText size={15} />
                        <span>Document Payload</span>
                      </div>
                      <div style={{ display: 'flex', gap: '0.5rem', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        <span>
                          Words: {((currentRecord.metadata?.text || currentRecord.metadata?.content || '').split(/\s+/).filter(Boolean).length)}
                        </span>
                        <span>•</span>
                        <span>Chars: {((currentRecord.metadata?.text || currentRecord.metadata?.content || '').length)}</span>
                      </div>
                    </div>
                    <div
                      style={{
                        fontFamily: 'var(--font-sans)',
                        fontSize: '1rem',
                        lineHeight: 1.75,
                        color: 'var(--text-primary)',
                        whiteSpace: 'pre-wrap',
                        background: 'var(--bg-canvas)',
                        padding: '1.5rem',
                        borderRadius: 'var(--radius-sm)',
                        border: '1px solid var(--border-hairline)',
                        maxHeight: '420px',
                        overflowY: 'auto',
                        maxWidth: '68ch',
                        margin: '0 auto',
                      }}
                    >
                      {currentRecord.metadata?.text ||
                        currentRecord.metadata?.content ||
                        JSON.stringify(currentRecord.metadata, null, 2)}
                    </div>
                  </div>
                )}
              </div>

              {/* Bottom Hotkey Legend Bar */}
              <div className="workbench-hotkey-legend">
                <div><kbd>1-9</kbd>Select Class</div>
                <div><kbd>Enter</kbd>Save & Next</div>
                <div><kbd>A</kbd>Approve</div>
                <div><kbd>R</kbd>Reject</div>
                <div><kbd>C</kbd>Needs Fix</div>
                <div><kbd>N</kbd>Not Similar</div>
                <div><kbd>J / K</kbd>Next / Prev</div>
                <div><kbd>?</kbd>All Shortcuts</div>
              </div>
            </motion.div>
          )}
        </div>

        {/* ========================================================================= */}
        {/* Right Column: Inspector, Label Selection & Actions */}
        {/* ========================================================================= */}
        {isRightPanelOpen && (
          <div className="workbench-panel-right no-scrollbar">
            {/* Section 1: Annotation Guidelines */}
            <div>
              <div
                style={{
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  color: 'var(--text-secondary)',
                  marginBottom: '0.35rem',
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                }}
              >
                Guidelines
              </div>
              <div
                style={{
                  fontSize: '0.8rem',
                  color: 'var(--text-muted)',
                  lineHeight: 1.5,
                  background: 'var(--bg-elevated)',
                  padding: '0.65rem',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--border-hairline)',
                }}
              >
                {dataset.annotation_instructions ||
                  (dataset.task_type === 'audio_transcription'
                    ? 'Transcribe speech verbatim, align temporal cue segments, and adjust boundaries.'
                    : 'Select the most accurate class label. Use hotkeys 1-9 for fast tagging.')}
              </div>
            </div>

            {/* Record-Specific Inspector Controls with Smooth Fade */}
            <motion.div
              key={currentRecord?.id || 'empty-inspector'}
              initial={{ opacity: 0.4 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
              style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}
            >
                {/* Section 2: Task-Specific Label / Audio Inputs */}
                {dataset.task_type === 'audio_transcription' ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                <div>
                  <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '0.35rem', textTransform: 'uppercase' }}>
                    Full Transcript
                  </div>
                  <textarea
                    rows={4}
                    placeholder="Enter verbatim audio transcription..."
                    value={transcriptText}
                    onChange={(e) => {
                      setTranscriptText(e.target.value);
                      setIsDirty(true);
                    }}
                    style={{
                      width: '100%',
                      padding: '0.5rem',
                      fontSize: '0.825rem',
                      background: 'var(--bg-canvas)',
                      border: '1px solid var(--border-hairline)',
                      borderRadius: 'var(--radius-sm)',
                      color: 'var(--text-primary)',
                      resize: 'vertical',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>

                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                    <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
                      Timed Cues ({transcriptSegments.length})
                    </span>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      style={{ fontSize: '0.72rem', padding: '0.2rem 0.45rem' }}
                      onClick={() => {
                        const cur = audioRef.current?.currentTime || 0;
                        setTranscriptSegments([
                          ...transcriptSegments,
                          {
                            start_time: Math.max(0, Math.floor(cur)),
                            end_time: Math.ceil(cur + 2),
                            text: '',
                            speaker: 'Speaker 1',
                          },
                        ]);
                        setIsDirty(true);
                      }}
                    >
                      <Plus size={12} style={{ marginRight: '2px' }} /> Add Cue
                    </button>
                  </div>
                  {transcriptSegments.map((seg, idx) => (
                    <div
                      key={idx}
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '0.3rem',
                        padding: '0.45rem',
                        marginBottom: '0.35rem',
                        backgroundColor: 'var(--bg-elevated)',
                        borderRadius: 'var(--radius-sm)',
                        border: '1px solid var(--border-hairline)',
                      }}
                    >
                      <div style={{ display: 'flex', gap: '0.35rem', alignItems: 'center' }}>
                        <input
                          type="number"
                          step="0.1"
                          placeholder="Start"
                          value={seg.start_time}
                          onChange={(e) => {
                            const val = parseFloat(e.target.value) || 0;
                            const next = [...transcriptSegments];
                            next[idx] = { ...seg, start_time: val };
                            setTranscriptSegments(next);
                            setIsDirty(true);
                          }}
                          style={{
                            width: '58px',
                            padding: '0.2rem 0.35rem',
                            fontSize: '0.75rem',
                            background: 'var(--bg-surface)',
                            border: '1px solid var(--border-hairline)',
                            borderRadius: '3px',
                            color: 'var(--text-primary)',
                          }}
                        />
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>–</span>
                        <input
                          type="number"
                          step="0.1"
                          placeholder="End"
                          value={seg.end_time}
                          onChange={(e) => {
                            const val = parseFloat(e.target.value) || 0;
                            const next = [...transcriptSegments];
                            next[idx] = { ...seg, end_time: val };
                            setTranscriptSegments(next);
                            setIsDirty(true);
                          }}
                          style={{
                            width: '58px',
                            padding: '0.2rem 0.35rem',
                            fontSize: '0.75rem',
                            background: 'var(--bg-surface)',
                            border: '1px solid var(--border-hairline)',
                            borderRadius: '3px',
                            color: 'var(--text-primary)',
                          }}
                        />
                        <button
                          type="button"
                          onClick={() => {
                            setTranscriptSegments(transcriptSegments.filter((_, i) => i !== idx));
                            setIsDirty(true);
                          }}
                          style={{
                            marginLeft: 'auto',
                            background: 'transparent',
                            border: 'none',
                            color: 'var(--rose)',
                            cursor: 'pointer',
                            padding: '2px',
                          }}
                          title="Delete cue"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                      <input
                        type="text"
                        placeholder="Cue text..."
                        value={seg.text}
                        onChange={(e) => {
                          const next = [...transcriptSegments];
                          next[idx] = { ...seg, text: e.target.value };
                          setTranscriptSegments(next);
                          setIsDirty(true);
                        }}
                        style={{
                          fontSize: '0.78rem',
                          padding: '0.25rem 0.45rem',
                          background: 'var(--bg-surface)',
                          border: '1px solid var(--border-hairline)',
                          borderRadius: '3px',
                          color: 'var(--text-primary)',
                        }}
                      />
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                  <span
                    style={{
                      fontSize: '0.75rem',
                      fontWeight: 700,
                      color: 'var(--text-secondary)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.04em',
                    }}
                  >
                    Class Selection ({allowedClasses.length})
                  </span>
                  {allowedClasses.length > 6 && (
                    <input
                      type="text"
                      placeholder="Filter classes..."
                      value={classSearch}
                      onChange={(e) => setClassSearch(e.target.value)}
                      style={{
                        padding: '0.15rem 0.4rem',
                        fontSize: '0.72rem',
                        width: '105px',
                        background: 'var(--bg-canvas)',
                        border: '1px solid var(--border-hairline)',
                        borderRadius: '3px',
                        color: 'var(--text-primary)',
                      }}
                    />
                  )}
                </div>

                {allowedClasses.length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', maxHeight: '200px', overflowY: 'auto' }}>
                    {filteredClasses.map((lbl, idx) => {
                      const isSelected = selectedLabel === lbl;
                      const globalIdx = allowedClasses.indexOf(lbl);
                      const shortcutKey = globalIdx >= 0 && globalIdx < 9 ? `${globalIdx + 1}` : null;

                      return (
                        <button
                          key={lbl}
                          onClick={() => {
                            setSelectedLabel(lbl);
                            setIsDirty(true);
                          }}
                          style={{
                            position: 'relative',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '0.5rem 0.75rem',
                            borderRadius: 'var(--radius-sm)',
                            backgroundColor: isSelected ? 'transparent' : 'var(--bg-elevated)',
                            border: `1px solid ${isSelected ? 'var(--accent-primary)' : 'var(--border-hairline)'}`,
                            color: isSelected ? 'var(--accent-primary-fg)' : 'var(--text-primary)',
                            fontWeight: isSelected ? 600 : 500,
                            cursor: 'pointer',
                            textAlign: 'left',
                            overflow: 'hidden',
                            transition: 'color 0.15s ease, border-color 0.15s ease',
                          }}
                        >
                          {isSelected && (
                            <motion.div
                              layoutId="activeClassSelectionPill"
                              transition={{ type: 'spring' as const, stiffness: 480, damping: 36 }}
                              style={{
                                position: 'absolute',
                                inset: 0,
                                backgroundColor: 'var(--accent-primary)',
                                borderRadius: 'inherit',
                                zIndex: 0,
                              }}
                            />
                          )}
                          <span style={{ position: 'relative', zIndex: 1, fontSize: '0.825rem' }}>{lbl}</span>
                          {shortcutKey && (
                            <kbd
                              style={{
                                position: 'relative',
                                zIndex: 1,
                                background: isSelected ? 'rgba(255, 255, 255, 0.2)' : 'var(--bg-surface)',
                                border: `1px solid ${isSelected ? 'rgba(255, 255, 255, 0.3)' : 'var(--border-hairline)'}`,
                                padding: '0.1rem 0.35rem',
                                borderRadius: '3px',
                                fontSize: '0.7rem',
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
                    placeholder="Enter label..."
                    value={selectedLabel}
                    onChange={(e) => {
                      setSelectedLabel(e.target.value);
                      setIsDirty(true);
                    }}
                    style={{
                      width: '100%',
                      padding: '0.4rem',
                      fontSize: '0.825rem',
                      background: 'var(--bg-canvas)',
                      border: '1px solid var(--border-hairline)',
                      borderRadius: 'var(--radius-sm)',
                      color: 'var(--text-primary)',
                      boxSizing: 'border-box',
                    }}
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
                onChange={(e) => {
                  setConfidence(parseFloat(e.target.value));
                  setIsDirty(true);
                }}
                style={{ width: '100%', accentColor: 'var(--accent-interactive)' }}
              />
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.25rem' }}>
                {[0.5, 0.75, 0.9, 1.0].map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => {
                      setConfidence(preset);
                      setIsDirty(true);
                    }}
                    style={{
                      background: 'none',
                      border: 'none',
                      fontSize: '0.68rem',
                      fontFamily: 'var(--font-mono)',
                      color: confidence === preset ? 'var(--accent-interactive)' : 'var(--text-muted)',
                      cursor: 'pointer',
                      padding: '0 2px',
                    }}
                  >
                    {Math.round(preset * 100)}%
                  </button>
                ))}
              </div>
            </div>

            {/* Section 4: Notes / Rationale */}
            <div>
              <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '0.35rem', textTransform: 'uppercase' }}>
                Annotation Notes / Rationale
              </div>
              <textarea
                rows={2}
                placeholder="Optional notes or reason for label..."
                value={notes}
                onChange={(e) => {
                  setNotes(e.target.value);
                  setIsDirty(true);
                }}
                style={{
                  width: '100%',
                  padding: '0.45rem',
                  fontSize: '0.8rem',
                  background: 'var(--bg-canvas)',
                  border: '1px solid var(--border-hairline)',
                  borderRadius: 'var(--radius-sm)',
                  color: 'var(--text-primary)',
                  resize: 'vertical',
                  boxSizing: 'border-box',
                }}
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
                  disabled={currentFilteredIndex <= 0 || saving}
                  onClick={handleNavigatePrev}
                  style={{ padding: '0.45rem', fontSize: '0.8rem' }}
                  shortcut="K"
                  title="Previous Record (K or Up)"
                >
                  Prev
                </SpringButton>
                <SpringButton
                  variant="secondary"
                  disabled={currentFilteredIndex >= filteredQueue.length - 1 || saving}
                  onClick={handleNavigateNext}
                  style={{ padding: '0.45rem', fontSize: '0.8rem' }}
                  shortcut="J"
                  title="Next Record / Skip (J or Down)"
                >
                  Next / Skip
                </SpringButton>
              </div>
            </div>

            {/* Section 6: Review Decisions */}
            {currentRecord?.annotation && (
              <div style={{ borderTop: '1px solid var(--border-hairline)', paddingTop: '0.85rem' }}>
                <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '0.45rem', textTransform: 'uppercase' }}>
                  Review Decisions
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.45rem', marginBottom: '0.45rem' }}>
                  <SpringButton
                    variant="secondary"
                    onClick={() => handleReviewAction('approved')}
                    disabled={saving}
                    style={{
                      backgroundColor: 'rgba(16, 185, 129, 0.08)',
                      borderColor: 'rgba(16, 185, 129, 0.3)',
                      color: 'var(--emerald)',
                      padding: '0.4rem',
                      fontSize: '0.78rem',
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
                    style={{ padding: '0.4rem', fontSize: '0.78rem' }}
                    shortcut="R"
                    title="Reject (R)"
                  >
                    <XCircle size={13} style={{ marginRight: '4px' }} /> Reject
                  </SpringButton>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.45rem' }}>
                  <SpringButton
                    variant="secondary"
                    onClick={() => handleReviewAction('needs_correction')}
                    disabled={saving}
                    style={{
                      backgroundColor: 'rgba(245, 158, 11, 0.08)',
                      borderColor: 'rgba(245, 158, 11, 0.3)',
                      color: 'var(--amber)',
                      padding: '0.4rem',
                      fontSize: '0.78rem',
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
                      padding: '0.4rem',
                      fontSize: '0.78rem',
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
              <div style={{ borderTop: '1px solid var(--border-hairline)', paddingTop: '0.75rem' }}>
                <button
                  onClick={() => setShowHistory(!showHistory)}
                  style={{
                    width: '100%',
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--text-secondary)',
                    cursor: 'pointer',
                    fontSize: '0.8rem',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '0.2rem 0',
                  }}
                >
                  <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontWeight: 600 }}>
                    <History size={14} /> Revision History ({currentRecord.revisions.length})
                  </span>
                  <motion.span
                    animate={{ rotate: showHistory ? 180 : 0 }}
                    transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
                    style={{ display: 'inline-flex', alignItems: 'center', color: 'var(--text-muted)' }}
                  >
                    <ChevronDown size={14} />
                  </motion.span>
                </button>

                <AnimatePresence initial={false}>
                  {showHistory && (
                    <motion.div
                      key="revision-history-drawer"
                      initial={{ height: 0, opacity: 0 }}
                      animate={{
                        height: 'auto',
                        opacity: 1,
                        transition: {
                          height: { duration: 0.28, ease: [0.16, 1, 0.3, 1] },
                          opacity: { duration: 0.18, delay: 0.04, ease: 'easeOut' },
                        },
                      }}
                      exit={{
                        height: 0,
                        opacity: 0,
                        transition: {
                          height: { duration: 0.24, ease: [0.16, 1, 0.3, 1] },
                          opacity: { duration: 0.14, ease: 'easeIn' },
                        },
                      }}
                      style={{ overflow: 'hidden' }}
                    >
                      <div style={{ marginTop: '0.5rem', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                        {currentRecord.revisions.map((rev) => (
                          <div
                            key={rev.id}
                            style={{
                              padding: '0.45rem 0.6rem',
                              background: 'var(--bg-elevated)',
                              borderRadius: 'var(--radius-sm)',
                              border: '1px solid var(--border-hairline)',
                              fontSize: '0.75rem',
                            }}
                          >
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 600, marginBottom: '0.2rem' }}>
                              <span>Rev #{rev.revision_number} • {rev.payload?.label || 'Revision'}</span>
                              <span className="badge badge-neutral" style={{ fontSize: '0.65rem' }}>{rev.origin}</span>
                            </div>
                            <div style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>
                              {rev.change_reason || 'Initial creation'} • {new Date(rev.created_at).toLocaleTimeString()}
                            </div>
                          </div>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}
            </motion.div>
          </div>
        )}

        {/* Right Column Collapsed Handle Strip */}
        {!isRightPanelOpen && (
          <div
            onClick={() => setIsRightPanelOpen(true)}
            title="Expand Guidelines & Inspector (Click to open)"
            className="workbench-collapsed-tab-right"
            style={{
              width: '36px',
              height: '100%',
              backgroundColor: 'var(--bg-surface)',
              borderLeft: '1px solid var(--border-hairline)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              paddingTop: '0.75rem',
              gap: '0.75rem',
              cursor: 'pointer',
              userSelect: 'none',
            }}
          >
            <div
              style={{
                width: '24px',
                height: '24px',
                borderRadius: 'var(--radius-xs)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--text-secondary)',
                backgroundColor: 'var(--bg-elevated)',
              }}
            >
              <PanelRightOpen size={14} />
            </div>
            <div
              style={{
                writingMode: 'vertical-rl',
                textOrientation: 'mixed',
                fontSize: '0.72rem',
                fontWeight: 700,
                letterSpacing: '0.06em',
                color: 'var(--text-muted)',
                textTransform: 'uppercase',
              }}
            >
              Guidelines & Inspector
            </div>
          </div>
        )}
      </div>

      {/* Accessible Shortcuts Reference Modal */}
      <ShortcutHelpModal
        isOpen={isShortcutModalOpen}
        onClose={() => setIsShortcutModalOpen(false)}
        taskType={dataset.task_type}
      />
    </div>
  );
};
