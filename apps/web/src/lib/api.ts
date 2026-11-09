import type { ApiErrorBody, Beat, ExportJob, Project, ProjectSummary, Quality, Settings, SystemStatus } from '@still/shared';

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: string,
  ) {
    super(message);
  }
}

const OFFLINE = () => new ApiError(0, 'offline', 'The still engine is not responding. Make sure it is running (npm start).');

async function request<T>(method: string, url: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw OFFLINE();
  }
  if (res.status === 204) return undefined as T;
  const data = (await res.json().catch(() => null)) as unknown;
  if (!res.ok) {
    if (res.status === 502 || res.status === 504) throw OFFLINE();
    const e = (data as ApiErrorBody | null)?.error;
    throw new ApiError(res.status, e?.code ?? 'error', e?.message ?? `Request failed (${res.status})`, e?.details);
  }
  return data as T;
}

/** Multipart upload with progress (fetch can't report upload progress). */
function upload<T>(url: string, form: FormData, onProgress?: (fraction: number) => void): Promise<T> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', url);
    xhr.responseType = 'json';
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress?.(e.loaded / e.total);
    xhr.onerror = () => reject(OFFLINE());
    xhr.onload = () => {
      const data = xhr.response as unknown;
      if (xhr.status >= 200 && xhr.status < 300) return resolve(data as T);
      if (xhr.status === 422 && data && typeof data === 'object' && 'failed' in data) return resolve(data as T);
      const e = (data as ApiErrorBody | null)?.error;
      reject(new ApiError(xhr.status, e?.code ?? 'error', e?.message ?? `Upload failed (${xhr.status})`, e?.details));
    };
    xhr.send(form);
  });
}

export interface ImportResult {
  imported: Beat[];
  failed: { filename: string; message: string; details?: string }[];
}

const P = (id: string) => `/api/projects/${id}`;

export const api = {
  health: () => request<{ ok: boolean; version: string }>('GET', '/api/health'),
  system: (refresh = false) => request<SystemStatus>('GET', `/api/system${refresh ? '?refresh=1' : ''}`),
  settings: () => request<Settings>('GET', '/api/settings'),
  updateSettings: (patch: Partial<Settings>) => request<Settings>('PATCH', '/api/settings', patch),
  pickFolder: () => request<{ path: string | null }>('POST', '/api/system/pick-folder'),
  openOutput: () => request<void>('POST', '/api/system/open-output'),
  cleanupTemp: () => request<{ freed: number }>('POST', '/api/system/cleanup-temp'),

  projects: () => request<ProjectSummary[]>('GET', '/api/projects'),
  project: (id: string) => request<Project>('GET', P(id)),
  createProject: (name: string, quality?: Quality) => request<Project>('POST', '/api/projects', { name, quality }),
  updateProject: (id: string, patch: { name?: string; exportSettings?: { quality: Quality } }) => request<Project>('PATCH', P(id), patch),
  deleteProject: (id: string) => request<void>('DELETE', P(id)),
  duplicateProject: (id: string) => request<Project>('POST', `${P(id)}/duplicate`),

  importAudio: (id: string, files: File[], onProgress?: (f: number) => void) => {
    const form = new FormData();
    for (const f of files) form.append('files', f, f.name);
    return upload<ImportResult>(`${P(id)}/audio`, form, onProgress);
  },
  updateBeat: (id: string, beatId: string, patch: { name?: string; crop?: Beat['crop']; artworkId?: string | null }) =>
    request<Project>('PATCH', `${P(id)}/beats/${beatId}`, patch),
  removeBeats: (id: string, beatIds: string[]) => request<Project>('POST', `${P(id)}/beats/remove`, { beatIds }),
  importArtwork: (id: string, file: File, beatIds: string[], onProgress?: (f: number) => void) => {
    const form = new FormData();
    form.append('beatIds', JSON.stringify(beatIds));
    form.append('file', file, file.name);
    return upload<Project>(`${P(id)}/artwork`, form, onProgress);
  },
  peaks: (id: string, beatId: string) => request<number[]>('GET', `${P(id)}/media/peaks/${beatId}`),

  exports: () => request<ExportJob[]>('GET', '/api/exports'),
  createExports: (id: string, beatIds: string[], quality: Quality) => request<ExportJob[]>('POST', `${P(id)}/exports`, { beatIds, quality }),
  cancelExport: (jobId: string) => request<ExportJob>('POST', `/api/exports/${jobId}/cancel`),
  retryExport: (jobId: string) => request<ExportJob>('POST', `/api/exports/${jobId}/retry`),
  removeExport: (jobId: string) => request<void>('DELETE', `/api/exports/${jobId}`),
  cancelQueued: () => request<{ cancelled: number }>('POST', '/api/exports/cancel-queued'),
  clearExports: (state: 'completed' | 'failed' | 'all') => request<{ removed: number }>('POST', '/api/exports/clear', { state }),
  revealExport: (jobId: string) => request<void>('POST', `/api/exports/${jobId}/reveal`),
};

export const urls = {
  audio: (pid: string, beatId: string) => `${P(pid)}/media/audio/${beatId}`,
  artwork: (pid: string, artworkId: string, variant: 'thumb' | 'display' | 'original') => `${P(pid)}/media/artwork/${artworkId}/${variant}`,
  exportFile: (jobId: string, inline = false) => `/api/exports/${jobId}/file${inline ? '?inline=1' : ''}`,
};
