import { Dataset, DatasetDetailResponse, Project } from './types';

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
  offset = 0
): Promise<{ items: any[]; total: number; limit: number; offset: number }> {
  const params = new URLSearchParams();
  if (split) params.set('split', split);
  if (reviewStatus) params.set('review_status', reviewStatus);
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

