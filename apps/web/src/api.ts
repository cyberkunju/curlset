import { Dataset, DatasetDetailResponse, Project, TokenSimulationResponse } from './types';

const API_BASE = '/api/v1';

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let errorDetail = `HTTP Error ${res.status}`;
    try {
      const data = await res.json();
      if (data?.error?.message) {
        errorDetail = data.error.message;
      } else if (data?.detail) {
        errorDetail = typeof data.detail === 'string' ? data.detail : JSON.stringify(data.detail);
      }
    } catch {
      // Fallback to status text
    }
    throw new Error(errorDetail);
  }
  return res.json();
}

export async function checkHealth() {
  const res = await fetch('/health');
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

export async function createAnnotation(
  recordId: string,
  payload: Record<string, any>,
  origin = 'human',
  status = 'pending_review',
  actorId = 'default_user',
  confidence?: number
): Promise<any> {
  const res = await fetch(`${API_BASE}/records/${recordId}/annotations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ payload, origin, status, actor_id: actorId, confidence }),
  });
  return handleResponse(res);
}

export async function updateAnnotation(
  annotationId: string,
  payload: Record<string, any>,
  changeReason?: string,
  confidence?: number,
  actorId = 'default_user'
): Promise<any> {
  const res = await fetch(`${API_BASE}/annotations/${annotationId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ payload, change_reason: changeReason, confidence, actor_id: actorId }),
  });
  return handleResponse(res);
}

export async function transitionReviewStatus(
  annotationId: string,
  nextStatus: string,
  reason?: string,
  actorId = 'default_user'
): Promise<any> {
  const res = await fetch(`${API_BASE}/annotations/${annotationId}/transition`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ next_status: nextStatus, reason, actor_id: actorId }),
  });
  return handleResponse(res);
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





