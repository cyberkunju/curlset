import { Dataset, DatasetDetailResponse, Project, TokenSimulationResponse } from './types';

const API_BASE = '/api/v1';

/**
 * Structured API failure. Keeps the HTTP status and the machine-readable error
 * payload available so callers can render honest, specific empty/error states
 * (e.g. HTTP 422 "not enough comparable pairs" from evaluation).
 */
export class ApiError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly details?: unknown;

  constructor(message: string, status: number, code?: string, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let errorDetail = `HTTP Error ${res.status}`;
    let errorCode: string | undefined;
    let errorDetails: unknown;
    try {
      const data = await res.json();
      if (data?.error?.message) {
        errorDetail = data.error.message;
      } else if (Array.isArray(data?.detail)) {
        // FastAPI request-validation errors arrive as [{loc, msg, ...}]; never show that raw JSON
        // to a user — turn it into one plain sentence naming the offending field.
        const first = data.detail[0] || {};
        const location = Array.isArray(first.loc) ? first.loc[first.loc.length - 1] : '';
        const message = String(first.msg || 'Invalid value');
        errorDetail = location
          ? `That value was rejected (${String(location)}): ${message}`
          : message;
      } else if (data?.detail) {
        errorDetail = typeof data.detail === 'string' ? data.detail : JSON.stringify(data.detail);
      }
      if (data?.error?.code) {
        errorCode = String(data.error.code);
      }
      errorDetails = data?.error?.details ?? (typeof data?.detail === 'object' ? data.detail : undefined);
    } catch {
      // Fallback to status text
    }
    throw new ApiError(errorDetail, res.status, errorCode, errorDetails);
  }
  return res.json();
}

export async function checkHealth() {
  const res = await fetch(`${API_BASE}/health`);
  return handleResponse<any>(res);
}

export async function fetchProjects(includeArchived = false): Promise<Project[]> {
  const res = await fetch(`${API_BASE}/projects?include_archived=${includeArchived}`);
  return handleResponse<Project[]>(res);
}

export async function fetchProject(id: string): Promise<Project> {
  const res = await fetch(`${API_BASE}/projects/${id}`);
  return handleResponse<Project>(res);
}

export async function createProject(data: { name: string; description?: string }): Promise<Project> {
  const res = await fetch(`${API_BASE}/projects`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return handleResponse<Project>(res);
}

export async function updateProject(id: string, data: { name?: string; description?: string }): Promise<Project> {
  const res = await fetch(`${API_BASE}/projects/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return handleResponse<Project>(res);
}

export async function archiveProject(id: string): Promise<Project> {
  const res = await fetch(`${API_BASE}/projects/${id}/archive`, {
    method: 'POST',
  });
  return handleResponse<Project>(res);
}

export async function fetchDatasets(projectId: string, includeArchived = false): Promise<Dataset[]> {
  const res = await fetch(`${API_BASE}/projects/${projectId}/datasets?include_archived=${includeArchived}`);
  return handleResponse<Dataset[]>(res);
}

export async function createDataset(projectId: string, data: {
  name: string;
  task_type: string;
  description?: string;
  annotation_instructions?: string;
  label_schema?: Record<string, any>;
}): Promise<Dataset> {
  const res = await fetch(`${API_BASE}/projects/${projectId}/datasets`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return handleResponse<Dataset>(res);
}

export async function fetchDatasetDetail(datasetId: string): Promise<DatasetDetailResponse> {
  const res = await fetch(`${API_BASE}/datasets/${datasetId}`);
  return handleResponse<DatasetDetailResponse>(res);
}

export async function updateDataset(datasetId: string, data: {
  name?: string;
  description?: string;
  annotation_instructions?: string;
  label_schema?: Record<string, any>;
}): Promise<Dataset> {
  const res = await fetch(`${API_BASE}/datasets/${datasetId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return handleResponse<Dataset>(res);
}

export async function fetchDatasetQueue(
  datasetId: string,
  split?: string,
  reviewStatus?: string,
  limit = 50,
  offset = 0,
  search?: string,
  recordId?: string
): Promise<{ items: any[]; total: number; limit: number; offset: number }> {
  const params = new URLSearchParams();
  if (split) params.set('split', split);
  if (reviewStatus) params.set('review_status', reviewStatus);
  if (search) params.set('search', search);
  if (recordId) params.set('record_id', recordId);
  params.set('limit', limit.toString());
  params.set('offset', offset.toString());

  const res = await fetch(`${API_BASE}/datasets/${datasetId}/queue?${params.toString()}`);
  return handleResponse(res);
}

export async function fetchRecordDetail(recordId: string): Promise<any> {
  const res = await fetch(`${API_BASE}/records/${recordId}`);
  return handleResponse(res);
}

/**
 * Creates an annotation revision.
 *
 * `origin` and `status` are deliberately NOT sent: the API derives them from the
 * authenticated actor and the action performed (human/manual -> origin=human,
 * status=pending_review). See docs/TEXT_MVP.md §0 rule 3.
 */
export async function createAnnotation(
  recordId: string,
  payload: Record<string, any>,
  confidence?: number
): Promise<any> {
  const res = await fetch(`${API_BASE}/records/${recordId}/annotations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ payload, confidence }),
  });
  return handleResponse(res);
}

/**
 * Appends a new revision to an existing annotation. Server-derived `origin`/`status`
 * are intentionally omitted from the request body.
 */
export async function updateAnnotation(
  annotationId: string,
  payload: Record<string, any>,
  changeReason?: string,
  confidence?: number
): Promise<any> {
  const res = await fetch(`${API_BASE}/annotations/${annotationId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ payload, change_reason: changeReason, confidence }),
  });
  return handleResponse(res);
}

/**
 * Review state transition (approve / reject / needs_correction). The actor is
 * derived server-side; only the requested next state and an optional reason are sent.
 */
export async function transitionReviewStatus(
  annotationId: string,
  nextStatus: string,
  reason?: string
): Promise<any> {
  const res = await fetch(`${API_BASE}/annotations/${annotationId}/transition`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ next_status: nextStatus, reason }),
  });
  return handleResponse(res);
}

export type BulkReviewAction = 'approved' | 'rejected' | 'needs_correction';

export interface BulkReviewItemIssue {
  record_id?: string;
  id?: string;
  reason?: string;
  message?: string;
  status?: string;
  [key: string]: any;
}

export interface BulkReviewResponse {
  /** Count of records whose review state was updated (live contract). */
  updated?: number | string[];
  /** Count of skipped records (live contract) or per-record detail (legacy). */
  skipped?: number | BulkReviewItemIssue[];
  errors?: BulkReviewItemIssue[];
  updated_ids?: string[];
  skipped_ids?: string[];
  updated_count?: number;
  skipped_count?: number;
  error_count?: number;
  [key: string]: any;
}

/**
 * Bulk review of many records in one audited call.
 * Requires the dataset queue contract `POST /datasets/{id}/review/bulk`
 * `{ record_ids, action, reason }`.
 */
export async function bulkReviewRecords(
  datasetId: string,
  recordIds: string[],
  action: BulkReviewAction,
  reason?: string
): Promise<BulkReviewResponse> {
  const res = await fetch(`${API_BASE}/datasets/${datasetId}/review/bulk`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ record_ids: recordIds, action, reason }),
  });
  return handleResponse<BulkReviewResponse>(res);
}

export async function fetchProviders(): Promise<any[]> {
  const res = await fetch(`${API_BASE}/providers`);
  return handleResponse<any[]>(res);
}

export async function triggerAIAnnotation(
  datasetId: string,
  params: {
    provider?: string;
    model?: string;
    target_split?: string;
    only_unannotated?: boolean;
    limit?: number;
    enable_consensus?: boolean;
  }
): Promise<any> {
  const res = await fetch(`${API_BASE}/datasets/${datasetId}/ai-annotate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  return handleResponse(res);
}

export async function runDatasetValidation(datasetId: string): Promise<any> {
  const res = await fetch(`${API_BASE}/datasets/${datasetId}/validate`, {
    method: 'POST',
  });
  return handleResponse(res);
}

export async function fetchValidationSummary(datasetId: string): Promise<any> {
  const res = await fetch(`${API_BASE}/datasets/${datasetId}/validation-summary`);
  return handleResponse(res);
}

export async function fetchDatasetVersions(datasetId: string): Promise<any[]> {
  const res = await fetch(`${API_BASE}/datasets/${datasetId}/versions`);
  return handleResponse<any[]>(res);
}

export async function createDatasetVersion(
  datasetId: string,
  versionTag?: string,
  force = false
): Promise<any> {
  const res = await fetch(`${API_BASE}/datasets/${datasetId}/versions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ version_tag: versionTag, force }),
  });
  return handleResponse(res);
}

export async function fetchVersionDetail(versionId: string): Promise<any> {
  const res = await fetch(`${API_BASE}/versions/${versionId}`);
  return handleResponse(res);
}

export async function fetchVersionManifest(versionId: string): Promise<any> {
  const res = await fetch(`${API_BASE}/versions/${versionId}/manifest`);
  return handleResponse(res);
}

export async function fetchVersionCard(versionId: string): Promise<string> {
  const res = await fetch(`${API_BASE}/versions/${versionId}/card`);
  if (!res.ok) throw new Error(`HTTP Error ${res.status}`);
  return res.text();
}

export async function compareVersions(versionAId: string, versionBId: string): Promise<any> {
  const res = await fetch(`${API_BASE}/versions/compare?version_a_id=${versionAId}&version_b_id=${versionBId}`);
  return handleResponse(res);
}

export async function triggerVersionExport(versionId: string, format: string): Promise<any> {
  const res = await fetch(`${API_BASE}/versions/${versionId}/exports`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ format }),
  });
  return handleResponse(res);
}

export async function fetchVersionExports(versionId: string): Promise<any[]> {
  const res = await fetch(`${API_BASE}/versions/${versionId}/exports`);
  return handleResponse<any[]>(res);
}

export function getExportDownloadUrl(artifactId: string): string {
  return `${API_BASE}/exports/${artifactId}/download`;
}

export async function simulateDatasetTokens(
  datasetId: string,
  params: { target_context_window?: number; system_prompt?: string } = {},
  signal?: AbortSignal
): Promise<TokenSimulationResponse> {
  const res = await fetch(`${API_BASE}/datasets/${datasetId}/token-simulation`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
    signal,
  });
  return handleResponse<TokenSimulationResponse>(res);
}

export async function searchCandidateSources(query = '', maxResults = 10): Promise<any[]> {
  const params = new URLSearchParams();
  if (query) params.append('query', query);
  params.append('max_results', String(maxResults));
  const res = await fetch(`${API_BASE}/sources/candidates?${params.toString()}`);
  return handleResponse<any[]>(res);
}

export async function inspectSourceUrl(url: string): Promise<any> {
  const res = await fetch(`${API_BASE}/sources/inspect-url`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
  });
  return handleResponse(res);
}

export async function importCandidateSource(
  datasetId: string,
  sourceId: string,
  split = 'train'
): Promise<any> {
  const res = await fetch(`${API_BASE}/sources/import`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ dataset_id: datasetId, source_id: sourceId, split }),
  });
  return handleResponse(res);
}

export async function recordRightsReview(
  recordId: string,
  payload: {
    license_status: string;
    evidence_text: string;
    terms_notes?: string;
    attribution_text?: string;
  }
): Promise<any> {
  const res = await fetch(`${API_BASE}/records/${recordId}/rights-review`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return handleResponse(res);
}

export async function fetchDatasetSources(datasetId: string): Promise<any[]> {
  const res = await fetch(`${API_BASE}/datasets/${datasetId}/sources`);
  return handleResponse<any[]>(res);
}

export async function triggerSyntheticGeneration(
  datasetId: string,
  params: {
    target_class: string;
    count: number;
    prompt_template?: string;
    template_version?: string;
    provider_name?: string;
    model_name?: string;
    seed?: number;
    split?: string;
  }
): Promise<any> {
  const res = await fetch(`${API_BASE}/datasets/${datasetId}/synthesize`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  return handleResponse(res);
}

export async function fetchSyntheticLineage(datasetId: string): Promise<any> {
  const res = await fetch(`${API_BASE}/datasets/${datasetId}/synthetic-lineage`);
  return handleResponse(res);
}

export async function fetchActiveLearningQueue(
  datasetId: string,
  strategy = 'least_confidence',
  split?: string,
  limit = 50,
  offset = 0
): Promise<any> {
  const params = new URLSearchParams({ strategy, limit: String(limit), offset: String(offset) });
  if (split) params.append('split', split);
  const res = await fetch(`${API_BASE}/datasets/${datasetId}/active-learning/queue?${params.toString()}`);
  return handleResponse(res);
}

export async function runEvaluation(
  datasetId: string,
  split = 'test',
  candidateOrigin = 'model',
  referenceOrigin = 'human'
): Promise<any> {
  const res = await fetch(`${API_BASE}/datasets/${datasetId}/evaluation/run`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ split, candidate_origin: candidateOrigin, reference_origin: referenceOrigin }),
  });
  return handleResponse(res);
}

export async function fetchClusterMap(datasetId: string): Promise<any> {
  const res = await fetch(`${API_BASE}/datasets/${datasetId}/clusters`);
  return handleResponse(res);
}

export async function fetchProjectMembers(projectId: string) {
  const res = await fetch(`${API_BASE}/projects/${projectId}/members`);
  return handleResponse<any[]>(res);
}

export async function addProjectMember(projectId: string, userId: string, role: string) {
  const res = await fetch(`${API_BASE}/projects/${projectId}/members`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ user_id: userId, role }),
  });
  return handleResponse<any>(res);
}

export async function removeProjectMember(projectId: string, targetUserId: string) {
  const res = await fetch(`${API_BASE}/projects/${projectId}/members/${targetUserId}`, {
    method: 'DELETE',
  });
  if (!res.ok && res.status !== 204) {
    throw new Error(`Failed to remove member (${res.status})`);
  }
}

export async function fetchProjectQuotaUsage(projectId: string) {
  const res = await fetch(`${API_BASE}/projects/${projectId}/usage`);
  return handleResponse<any>(res);
}

export async function fetchProjectAuditLogs(projectId: string, limit = 50) {
  const res = await fetch(`${API_BASE}/projects/${projectId}/audit-logs?limit=${limit}`);
  return handleResponse<any[]>(res);
}

// --- Model Provider Credentials & API Keys ---

export async function fetchProviderCredentials() {
  const res = await fetch(`${API_BASE}/provider-credentials`);
  return handleResponse<any[]>(res);
}

export async function createProviderCredential(payload: {
  provider?: string;
  label?: string;
  api_key?: string;
  base_url?: string;
  models?: string[];
  is_default?: boolean;
}) {
  const res = await fetch(`${API_BASE}/provider-credentials`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return handleResponse<any>(res);
}

export async function testProviderCredential(credId: string) {
  const res = await fetch(`${API_BASE}/provider-credentials/${credId}/test`, {
    method: 'POST',
  });
  return handleResponse<any>(res);
}

export async function deleteProviderCredential(credId: string) {
  const res = await fetch(`${API_BASE}/provider-credentials/${credId}`, {
    method: 'DELETE',
  });
  if (!res.ok && res.status !== 204) {
    throw new Error(`Failed to remove provider credential (${res.status})`);
  }
}

export async function detectProviderMetadata(input: {
  api_key?: string;
  base_url?: string;
  input_text?: string;
}) {
  const res = await fetch(`${API_BASE}/provider-credentials/detect`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  return handleResponse<any>(res);
}







// ---------------------------------------------------------------- ensemble lab ---

export interface EnsembleModelSpec {
  provider: string;
  model: string;
}

export interface EnsembleLabelRequest {
  models: EnsembleModelSpec[];
  split?: string | null;
  limit?: number;
  concurrency?: number;
  budget_cap_usd?: number;
  target_precision?: number;
  min_support?: number;
  weight_alpha?: number;
  weight_beta?: number;
  prompt_version?: string;
  only_missing?: boolean;
  materialize?: boolean;
}

export async function runEnsembleLabel(datasetId: string, payload: EnsembleLabelRequest) {
  const res = await fetch(`${API_BASE}/datasets/${datasetId}/ensemble/label`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return handleResponse<any>(res);
}

export async function fetchEnsembleVotes(datasetId: string) {
  const res = await fetch(`${API_BASE}/datasets/${datasetId}/ensemble/votes`);
  return handleResponse<any>(res);
}

export async function fetchEnsembleAuditSample(
  datasetId: string,
  params: { size?: number; target_precision?: number; seed?: number } = {},
) {
  const query = new URLSearchParams();
  if (params.size !== undefined) query.set('size', String(params.size));
  if (params.target_precision !== undefined) query.set('target_precision', String(params.target_precision));
  if (params.seed !== undefined) query.set('seed', String(params.seed));
  const res = await fetch(`${API_BASE}/datasets/${datasetId}/ensemble/audit-sample?${query.toString()}`);
  return handleResponse<any>(res);
}

// ------------------------------------------------------------ gated generation ---

export interface GatedGenerationRequest {
  provider: string;
  model: string;
  verifier_providers: Array<{ provider: string; model: string }>;
  per_class?: number;
  target_split?: string;
  prompt_version?: string;
  max_class_share?: number;
  min_label_preservation?: number;
}

export async function runGatedGeneration(datasetId: string, payload: GatedGenerationRequest) {
  const res = await fetch(`${API_BASE}/datasets/${datasetId}/generate-gated`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return handleResponse<any>(res);
}

// ------------------------------------------------------------ simple-mode generate ---

export async function draftGenerationPlan(prompt: string) {
  const res = await fetch(`${API_BASE}/generate/plan`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt }),
  });
  return handleResponse<any>(res);
}

export async function createGenerationJob(payload: {
  prompt: string;
  classes: string[];
  per_class: number;
  provider: string;
  model: string;
  verifier_providers?: Array<{ provider: string; model: string }>;
  project_id?: string | null;
  dataset_name?: string | null;
  difficulty?: string;
  style_hint?: string;
  seed_examples?: string[];
  description?: string;
  min_label_preservation?: number;
  max_class_share?: number;
  target_split?: string;
}) {
  const res = await fetch(`${API_BASE}/generate/jobs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return handleResponse<any>(res);
}

export async function fetchGenerationJob(jobId: string) {
  const res = await fetch(`${API_BASE}/generate/jobs/${jobId}`);
  return handleResponse<any>(res);
}

export async function cancelGenerationJob(jobId: string) {
  const res = await fetch(`${API_BASE}/generate/jobs/${jobId}/cancel`, { method: 'POST' });
  return handleResponse<any>(res);
}

export async function fetchGenerationJobs(limit = 20) {
  const res = await fetch(`${API_BASE}/generate/jobs?limit=${limit}`);
  return handleResponse<any[]>(res);
}


export async function analyzeGenerationSample(file: File) {
  const form = new FormData();
  form.append('file', file);
  const res = await fetch(`${API_BASE}/generate/analyze-sample`, { method: 'POST', body: form });
  return handleResponse<any>(res);
}

// ------------------------------------------------------------ guided labeling ---

export async function importDatasetFile(datasetId: string, file: File) {
  const form = new FormData();
  form.append('file', file);
  const res = await fetch(`${API_BASE}/datasets/${datasetId}/import/file`, {
    method: 'POST',
    body: form,
  });
  return handleResponse<any>(res);
}

// ------------------------------------------------------------ natural-language edits ---

export async function previewDatasetEdit(datasetId: string, instruction: string) {
  const res = await fetch(`${API_BASE}/datasets/${datasetId}/edits/preview`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ instruction }),
  });
  return handleResponse<any>(res);
}

export async function applyDatasetEdit(
  datasetId: string,
  payload: {
    instruction: string;
    confirm: boolean;
    provider?: string;
    model?: string;
    verifier_providers?: Array<{ provider: string; model: string }>;
  },
) {
  const res = await fetch(`${API_BASE}/datasets/${datasetId}/edits/apply`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return handleResponse<any>(res);
}

export async function fetchDatasetEdits(datasetId: string) {
  const res = await fetch(`${API_BASE}/datasets/${datasetId}/edits`);
  return handleResponse<any[]>(res);
}

export async function undoDatasetEdit(datasetId: string, changeSetId: string) {
  const res = await fetch(`${API_BASE}/datasets/${datasetId}/edits/${changeSetId}/undo`, {
    method: 'POST',
  });
  return handleResponse<any>(res);
}


// ------------------------------------------------------------ autonomous labelling ---

export async function startAutoLabel(
  datasetId: string,
  payload: {
    providers: Array<{ provider: string; model: string }>;
    auto_accept_confidence?: number;
    limit?: number;
    require_unanimous?: boolean;
  },
) {
  const res = await fetch(`${API_BASE}/datasets/${datasetId}/auto-label`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return handleResponse<any>(res);
}


// ------------------------------------------------------------ image generation ---

export async function generateImages(
  datasetId: string,
  payload: {
    prompt: string;
    count: number;
    provider: string;
    model: string;
    quality?: string;
    style?: string;
    max_cost_usd?: number;
  },
) {
  const res = await fetch(`${API_BASE}/datasets/${datasetId}/generate-images`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return handleResponse<any>(res);
}


// ------------------------------------------------------------ dataset types ---

export async function fetchDatasetTypes() {
  const res = await fetch(`${API_BASE}/dataset-types`);
  return handleResponse<any[]>(res);
}


// ------------------------------------------------------------ detection proposals ---

export async function startBoxProposals(
  datasetId: string,
  payload: { concepts?: string[]; provider: string; model: string; limit?: number },
) {
  const res = await fetch(`${API_BASE}/datasets/${datasetId}/proposals/detect`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return handleResponse<any>(res);
}
