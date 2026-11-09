import { useCallback, useState } from 'react';
import { api, type ImportResult } from '../../lib/api';
import { setProject, keys, queryClient } from '../../lib/queries';
import { filesOfKind } from '../../lib/utils';
import { notifyError } from '../../stores/ui';
import type { Project } from '@still/shared';

export interface ImportState {
  count: number;
  progress: number; // upload fraction; 1 = engine is analysing
}

/** Upload audio, then report per-file failures without blocking the successful ones. */
export function useAudioImport(projectId: string) {
  const [state, setState] = useState<ImportState | null>(null);
  const [failures, setFailures] = useState<ImportResult['failed']>([]);

  const importFiles = useCallback(
    async (input: FileList | File[]) => {
      const all = Array.from(input);
      const files = filesOfKind(all, 'audio');
      const rejected = all.filter((f) => !files.includes(f)).map((f) => ({ filename: f.name, message: 'Not a supported audio format.' }));
      if (!files.length) {
        setFailures(rejected);
        return;
      }
      setState({ count: files.length, progress: 0 });
      try {
        const result = await api.importAudio(projectId, files, (progress) => setState({ count: files.length, progress }));
        setFailures([...rejected, ...result.failed]);
        await queryClient.invalidateQueries({ queryKey: keys.project(projectId) });
        void queryClient.invalidateQueries({ queryKey: keys.projects });
        return result;
      } catch (err) {
        notifyError(err, 'Import failed');
      } finally {
        setState(null);
      }
    },
    [projectId],
  );

  return { importing: state, failures, clearFailures: () => setFailures([]), importFiles };
}

/** Upload one image and assign it to one or more beats. */
export function useArtworkAssign(projectId: string) {
  const [busyFor, setBusyFor] = useState<string[]>([]);
  const assign = useCallback(
    async (file: File | undefined, beatIds: string[]): Promise<Project | undefined> => {
      if (!file || !beatIds.length) return;
      if (!filesOfKind([file], 'image').length) {
        notifyError(new Error('Use a PNG, JPEG or WebP image.'), `“${file.name}” isn't a supported image`);
        return;
      }
      setBusyFor(beatIds);
      try {
        const project = await api.importArtwork(projectId, file, beatIds);
        setProject(project);
        return project;
      } catch (err) {
        notifyError(err, 'Artwork could not be added');
      } finally {
        setBusyFor([]);
      }
    },
    [projectId],
  );
  return { assign, busyFor };
}
