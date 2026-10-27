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
