import { useCallback, useEffect, useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import type { Beat, Crop } from '@still/shared';
import { api } from '../../lib/api';
import { setProject } from '../../lib/queries';

/**
 * Local, immediately-rendered crop for one beat, autosaved after a short pause.
 * Saves for a beat run serially (mutation scope) so the newest value always lands last,
 * and any pending save is flushed when switching beats or leaving the editor.
 */
export function useCropDraft(projectId: string, beat: Beat) {
  const [crop, setCrop] = useState<Crop>(beat.crop);
  const pending = useRef<Crop | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const save = useMutation({
    mutationFn: (c: Crop) => api.updateBeat(projectId, beat.id, { crop: c }),
    onSuccess: setProject,
    scope: { id: `crop-${beat.id}` },
  });
  const mutate = save.mutate;

  // A different beat, or new artwork (the server resets framing), replaces the draft.
  useEffect(() => {
    setCrop(beat.crop);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [beat.id, beat.artworkId]);

  const flush = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    if (pending.current) {
      mutate(pending.current);
      pending.current = null;
    }
  }, [mutate]);

  useEffect(() => flush, [beat.id, flush]);

  const update = useCallback(
    (next: Crop) => {
      setCrop(next);
      pending.current = next;
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(flush, 350);
    },
    [flush],
  );

  return { crop, update, flush, saving: save.isPending || pending.current !== null };
}
