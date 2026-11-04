export type TaskType = 
  | 'image_classification'
  | 'text_classification'
  | 'object_detection'
  | 'paired_image_text'
  | 'audio_transcription'
  | 'document_ocr';

export type ReviewStatus = 
  | 'proposed'
  | 'pending_review'
  | 'approved'
  | 'rejected'
  | 'needs_correction'
  | 'invalid';

export interface Project {
  id: string;
  owner_id: string;
  name: string;
  description: string;
  is_archived: boolean;
  settings: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export interface Dataset {
  id: string;
  project_id: string;
  name: string;
  description: string;
  task_type: TaskType;
  schema_version: number;
  annotation_instructions: string;
  label_schema: {
    labels?: string[];
    [key: string]: any;
  };
  is_archived: boolean;
  created_at: string;
  updated_at: string;
}

export interface DatasetStats {
  total_records: number;
  pending_review: number;
  approved: number;
  rejected: number;
  needs_correction: number;
  invalid: number;
}

export interface DatasetDetailResponse {
  dataset: Dataset;
  stats: DatasetStats;
}

export interface RecordQueueItem {
  id: string;
  dataset_id: string;
  external_key?: string;
  split: string;
  metadata: Record<string, any>;
  created_at: string;
  review_status: string;
  annotation_id?: string;
  annotation_payload?: Record<string, any>;
  primary_asset?: {
    id: string;
    modality: string;
    mime_type: string;
    dimensions?: {
      width?: number;
      height?: number;
      duration_seconds?: number;
      sample_rate_hz?: number;
      channels?: number;
      [key: string]: any;
    };
    original_filename?: string;
  };
}

export interface RecordQueueResponse {
  items: RecordQueueItem[];
  total: number;
  limit: number;
  offset: number;
}

export interface AnnotationRevision {
  id: string;
  revision_number: number;
  payload: Record<string, any>;
  origin: string;
  actor_id: string;
  change_reason?: string;
  confidence?: number;
  created_at: string;
}

export interface ReviewEvent {
  id: string;
  actor_id: string;
  from_status: string;
  to_status: string;
  reason?: string;
  created_at: string;
}

export interface RecordDetail {
  id: string;
  dataset_id: string;
  schema_version: number;
  external_key?: string;
  split: string;
  metadata: Record<string, any>;
  created_at: string;
  updated_at: string;
  assets: Array<{
    id: string;
    role: string;
    position: number;
    storage_key: string;
    modality: string;
    mime_type: string;
    byte_size: number;
    original_filename?: string;
    dimensions?: {
      width?: number;
      height?: number;
      duration_seconds?: number;
      sample_rate_hz?: number;
      channels?: number;
      [key: string]: any;
    };
    created_at?: string;
  }>;
  annotation?: {
    id: string;
    task_type: string;
    schema_version: number;
    payload: Record<string, any>;
    origin: string;
    status: string;
    confidence?: number;
    consensus_score?: number;
    current_revision_id?: string;
    created_at: string;
    updated_at: string;
  };
  revisions: AnnotationRevision[];
  review_events: ReviewEvent[];
}

export interface ValidationFinding {
  rule_id: string;
  severity: 'blocking' | 'warning' | 'info';
  title: string;
  description: string;
  remediation: string;
  affected_record_ids: string[];
  count: number;
}

export interface QualityReport {
  dataset_id: string;
  schema_version: number;
  is_publishable: boolean;
  total_records: number;
  blocking_count: number;
  warning_count: number;
  info_count: number;
  findings: ValidationFinding[];
  class_distribution: Record<string, number>;
  split_distribution: Record<string, number>;
  origin_distribution: Record<string, number>;
  disclaimer: string;
}

export interface DatasetVersion {
  id: string;
  dataset_id: string;
  version_number: number;
  version_tag: string;
  manifest_hash: string;
  manifest_storage_key: string;
  parent_version_id?: string;
  record_count: number;
  schema_version: number;
  quality_summary: Record<string, any>;
  documentation_markdown?: string;
  is_published: boolean;
  created_by: string;
  created_at: string;
}

export interface VersionDiff {
  version_a: {
    id: string;
    tag: string;
    version_number: number;
    record_count: number;
    manifest_hash: string;
  };
  version_b: {
    id: string;
    tag: string;
    version_number: number;
    record_count: number;
    manifest_hash: string;
  };
  records_added: string[];
  records_removed: string[];
  annotations_updated: string[];
  net_record_change: number;
}

export type ExportFormatType =
  | 'csv'
  | 'jsonl'
  | 'coco'
  | 'yolo'
  | 'webvtt'
  | 'unsloth_sharegpt_vlm'
  | 'axolotl_alpaca_chatml'
  | 'llama_factory_bundle'
  | 'image_bundle'
  | 'ultralytics_yolo_v8_v11';

export interface TokenSimulationResponse {
  dataset_id: string;
  target_context_window: number;
  total_records_evaluated: number;
  avg_tokens_per_record: number;
  p95_tokens: number;
  max_tokens: number;
  records_truncated: number;
  truncation_percentage: number;
  records_at_risk: number;
  sample_breakdowns: Array<{
    record_id: string;
    text_tokens: number;
    image_tokens: number;
    system_tokens: number;
    total_tokens: number;
    fits_target: boolean;
    truncation_risk: boolean;
    utilization_pct: number;
  }>;
}

export interface ExportArtifact {
  id: string;
  version_id: string;
  format: string;
  exporter_version: string;
  storage_key: string;
  byte_size: number;
  sha256: string;
  record_count: number;
  quality_warnings: string[];
  created_at: string;
}

export type LicenseStatus = 
  | 'unknown'
  | 'review_required'
  | 'approved_for_intended_use'
  | 'restricted'
  | 'rejected';

export interface DiscoveredSource {
  source_id: string;
  url: string;
  title: string;
  publisher?: string;
  description: string;
  retrieval_timestamp: string;
  license_evidence?: string;
  attribution_required?: string;
  license_status: LicenseStatus;
  raw_content_preview?: string;
  content_sha256?: string;
  media_type: string;
  estimated_records: number;
  terms_notes?: string;
}

export interface SourceProvenanceSummary {
  record_id: string;
  source_id: string;
  source_uri?: string;
  source_type: string;
  license_status: LicenseStatus;
  creator_attribution?: string;
  retrieved_at?: string;
  terms_notes?: string;
}

export interface ActiveLearningItem {
  rank: number;
  record_id: string;
  external_key?: string;
  split: string;
  review_status: string;
  label?: string;
  confidence?: number;
  priority_metadata: Record<string, any>;
}

export interface ActiveLearningQueueResponse {
  strategy: string;
  total: number;
  limit: number;
  offset: number;
  items: ActiveLearningItem[];
}

export interface ClassMetric {
  precision: number;
  recall: number;
  f1_score: number;
  support: number;
}

export interface EvaluationReport {
  total_samples: number;
  accuracy: number;
  macro_precision: number;
  macro_recall: number;
  macro_f1: number;
  per_class_metrics: Record<string, ClassMetric>;
  confusion_matrix: Record<string, Record<string, number>>;
  classes: string[];
  warnings: string[];
  metadata: Record<string, any>;
  /**
   * Provenance of the two label sources that were compared. Optional because an
   * older API version may not report it; callers must render provenance only when
   * it is actually present (never assume "human gold").
   */
  gold_source?: string;
  candidate_source?: string;
  /** True when the API certifies the report compared distinct label sources. */
  comparable?: boolean;
}


export interface ClusterPoint {
  record_id: string;
  x: number;
  y: number;
  label?: string;
  density: number;
}

export interface CoverageGap {
  gap_id: string;
  grid_x: number;
  grid_y: number;
  center_x: number;
  center_y: number;
  density: number;
  nearest_record_ids: string[];
  suggested_focus: string;
}

export interface ClusterMapResponse {
  dataset_id: string;
  total_points: number;
  points: ClusterPoint[];
  coverage_gaps: CoverageGap[];
  grid_resolution: number;
}

export interface ProjectMember {
  id: string;
  project_id: string;
  user_id: string;
  role: 'owner' | 'editor' | 'viewer';
  created_at?: string;
}

export interface ProjectQuotaUsage {
  project_id: string;
  storage_bytes_used: number;
  storage_quota_bytes: number;
  storage_percentage: number;
  records_used: number;
  records_quota: number;
  records_percentage: number;
}

export interface AuditLogEntry {
  id: string;
  project_id?: string;
  user_id: string;
  action: string;
  resource_type: string;
  resource_id?: string;
  details: Record<string, any>;
  ip_address?: string;
  created_at?: string;
}

export interface ProviderCredential {
  id: string;
  user_id: string;
  provider: string;
  label: string;
  key_prefix: string;
  key_suffix: string;
  key_mask: string;
  base_url?: string | null;
  is_active: boolean;
  is_default: boolean;
  models: string[];
  status: 'configured' | 'operational' | 'failed';
  latency_ms?: number | null;
  last_tested_at?: string | null;
  error_message?: string | null;
  created_at: string;
  updated_at: string;
}





// ---------------------------------------------------------------- ensemble lab ---

export interface EnsembleAggregatorScore {
  accuracy: number;
  macro_f1: number;
  n: number;
}

export interface EnsembleCalibrationRow {
  model: string;
  temperature: number;
  ece_raw: number;
  ece_calibrated: number;
  ece_improvement: number;
  brier_raw: number;
  brier_calibrated: number;
  accuracy: number;
  n_samples: number;
}

export interface EnsembleThreshold {
  tau_hi: number;
  accepted: number;
  support: number;
  precision: number;
  wilson_low: number;
  wilson_high: number;
  met_target: boolean;
  yield_fraction: number;
}

export interface EnsembleLabelResponse {
  dataset_id: string;
  models: string[];
  records_aggregated: number;
  gold_pairs: number;
  optimistic: boolean;
  target_precision: number;
  fanout: {
    records: number;
    calls_made: number;
    calls_reused: number;
    failures: number;
    cost_usd: number;
    elapsed_s: number;
    aborted_reason: string | null;
  };
  aggregator_scores: Record<string, EnsembleAggregatorScore>;
  single_model_scores: Record<string, EnsembleAggregatorScore>;
  best_single_model: string | null;
  ensemble_macro_f1: number;
  lift_over_best_single: number;
  calibration: EnsembleCalibrationRow[];
  model_weights: Record<string, number>;
  weight_alpha: number;
  weight_beta: number;
  thresholds: Record<string, EnsembleThreshold>;
  band_counts: Record<string, number>;
  correlated_error: Record<string, number>;
  materialized_annotations: number;
  requested_models: Array<{ provider: string; model: string }>;
}

export interface EnsembleVotesResponse {
  dataset_id: string;
  models: Array<{ provider: string; model: string; votes: number; cost_usd: number; failures: number }>;
  total_votes: number;
  total_cost_usd: number;
  ensemble_candidates: number;
  ensemble_candidates_pending_review: number;
}

export interface EnsembleAuditSampleResponse {
  dataset_id: string;
  population: number;
  recommended_size: number;
  sample_record_ids: string[];
  target_precision: number;
  note: string;
}

// ------------------------------------------------------------ gated generation ---

export interface GatedGenerationResponse {
  dataset_id: string;
  generated: number;
  accepted: number;
  passed_filters: number;
  rejected: number;
  verdict: 'accept' | 'reject';
  rejection_reasons: string[];
  rejection_breakdown: Record<string, number>;
  label_preservation: number;
  batch_unique_trigram_ratio: number;
  collapsed: boolean;
  record_ids: string[];
  class_counts_after: Record<string, number>;
  policy: Record<string, unknown>;
}

// ------------------------------------------------------------ simple-mode generate ---

export interface GenerationPlanQuestion {
  id: string;
  question: string;
  kind: 'count' | 'classes' | 'difficulty' | string;
  default: unknown;
  options: unknown[];
  example: string;
  help: string;
}

export interface GenerationPlan {
  title: string;
  task_type: string;
  summary: string;
  classes: string[];
  suggested_total: number;
  per_class: number;
  difficulty: string;
  detected_from_sample: boolean;
  notes: string[];
  questions: GenerationPlanQuestion[];
  dataset_type?: string;
  dataset_type_label?: string;
  dataset_type_status?: string;
  dataset_type_confidence?: number;
  dataset_type_alternatives?: Array<{ id: string; label: string; status: string }>;
  needs_type_choice?: boolean;
}

export interface GenerationJob {
  id: string;
  status: 'pending' | 'running' | 'cancelling' | 'completed' | 'failed' | 'cancelled' | string;
  prompt: string;
  dataset_id: string;
  project_id: string;
  dataset_name: string;
  task_type: string;
  classes: string[];
  per_class: number;
  total_items: number;
  processed_items: number;
  progress: number;
  elapsed_seconds: number;
  eta_seconds: number | null;
  eta_confidence: string | null;
  kind?: string;
  cost_usd?: number | null;
  priced?: boolean | null;
  failed?: number;
  auto_approved?: number;
  needs_review?: number;
  phase?: string | null;
  updated_at?: string | null;
  stale?: boolean;
  passed_filters?: number;
  rejected?: number;
  rejection_breakdown?: Record<string, number>;
  accepted: number;
  verdict: 'accept' | 'reject' | null;
  rejection_reasons: string[];
  label_preservation: number | null;
  error: string | null;
  created_at: string | null;
  finished_at: string | null;
}


// ------------------------------------------------------------ dataset types ---

export interface DatasetTypeInfo {
  id: string;
  label: string;
  status: 'available' | 'beta' | 'planned' | string;
  task_type: string | null;
  can_generate: boolean;
  can_import: boolean;
  description: string;
  import_hint?: string;
}
