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


