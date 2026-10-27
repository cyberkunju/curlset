export type TaskType = 
  | 'image_classification'
  | 'text_classification'
  | 'object_detection'
  | 'paired_image_text';

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
    dimensions?: { width: number; height: number };
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
    original_filename: string;
    dimensions?: { width: number; height: number };
    created_at: string;
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

