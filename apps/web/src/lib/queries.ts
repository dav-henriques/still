import { useEffect } from 'react';
import { QueryClient, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ExportJob, Project, ServerEvent } from '@still/shared';
import { api } from './api';
import { notifyError } from '../stores/ui';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 10_000, refetchOnWindowFocus: false, retry: 1 },
    mutations: { onError: (err) => notifyError(err) },
  },
});

export const keys = {
  projects: ['projects'] as const,
  project: (id: string) => ['project', id] as const,
  exports: ['exports'] as const,
  settings: ['settings'] as const,
  system: ['system'] as const,
  peaks: (pid: string, bid: string) => ['peaks', pid, bid] as const,
};

export const useHealth = () =>
  useQuery({ queryKey: ['health'], queryFn: api.health, refetchInterval: (q) => (q.state.status === 'error' ? 3000 : 15000), retry: 0 });
export const useProjects = () => useQuery({ queryKey: keys.projects, queryFn: api.projects });
export const useProject = (id: string) => useQuery({ queryKey: keys.project(id), queryFn: () => api.project(id) });
export const useExports = () => useQuery({ queryKey: keys.exports, queryFn: api.exports, staleTime: Infinity });
export const useSettings = () => useQuery({ queryKey: keys.settings, queryFn: api.settings, staleTime: Infinity });
export const useSystem = () => useQuery({ queryKey: keys.system, queryFn: () => api.system(), staleTime: 30_000 });
export const usePeaks = (pid: string, bid: string) =>
  useQuery({ queryKey: keys.peaks(pid, bid), queryFn: () => api.peaks(pid, bid), staleTime: Infinity, gcTime: 5 * 60_000 });

/** Write a fresh project into the cache and refresh the summary list. */
export function setProject(project: Project) {
  queryClient.setQueryData(keys.project(project.id), project);
  void queryClient.invalidateQueries({ queryKey: keys.projects });
}

export function useProjectMutation<TArgs>(fn: (args: TArgs) => Promise<Project>) {
  return useMutation({ mutationFn: fn, onSuccess: setProject });
}

export function useSettingsMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.updateSettings,
    onSuccess: (s) => {
      qc.setQueryData(keys.settings, s);
      void qc.invalidateQueries({ queryKey: keys.system });
    },
  });
}

function upsertJob(job: ExportJob) {
  queryClient.setQueryData<ExportJob[]>(keys.exports, (prev) => {
    if (!prev) return [job];
    const i = prev.findIndex((j) => j.id === job.id);
    if (i < 0) return [...prev, job];
    const next = prev.slice();
    next[i] = job;
    return next;
  });
}
export const upsertJobs = (jobs: ExportJob[]) => jobs.forEach(upsertJob);

/** One SSE connection for the app: export progress and project changes from the engine. */
export function useServerEvents() {
  useEffect(() => {
    const es = new EventSource('/api/events');
    es.onmessage = (msg) => {
      let ev: ServerEvent;
      try {
        ev = JSON.parse(msg.data as string) as ServerEvent;
      } catch {
        return;
      }
      if (ev.type === 'job') upsertJob(ev.job);
      else if (ev.type === 'job-removed') queryClient.setQueryData<ExportJob[]>(keys.exports, (p) => p?.filter((j) => j.id !== ev.jobId));
      else if (ev.type === 'project') void queryClient.invalidateQueries({ queryKey: keys.projects });
    };
    // After a reconnect (engine restart), resync everything that may have changed.
    es.onopen = () => void queryClient.invalidateQueries({ queryKey: keys.exports });
    return () => es.close();
  }, []);
}
