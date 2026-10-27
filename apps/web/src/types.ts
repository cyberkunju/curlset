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
