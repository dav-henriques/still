import { useEffect, useState } from 'react';
import { QUALITY_PRESETS, sanitizeFilename, VIDEO, type Project, type Quality } from '@still/shared';
import { useMutation } from '@tanstack/react-query';
import { AlertTriangle, Folder } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Segmented } from '../../components/ui/controls';
import { Dialog } from '../../components/ui/Dialog';
import { api } from '../../lib/api';
import { setProject, upsertJobs, useSystem } from '../../lib/queries';
import { notify } from '../../stores/ui';

export function ExportDialog({ project, beatIds, open, onOpenChange }: { project: Project; beatIds: string[]; open: boolean; onOpenChange: (o: boolean) => void }) {
  const { data: system } = useSystem();
  const [quality, setQuality] = useState<Quality>(project.exportSettings.quality);
  useEffect(() => {
    if (open) setQuality(project.exportSettings.quality);
  }, [open, project.exportSettings.quality]);

  const beats = project.beats.filter((b) => beatIds.includes(b.id));
  const ready = beats.filter((b) => b.artworkId);
  const missing = beats.filter((b) => !b.artworkId);
  const sep = system?.platform === 'win32' ? '\\' : '/';
  const dest = system ? `${system.outputDir}${sep}${sanitizeFilename(project.name, 'still exports')}` : '…';

  const start = useMutation({
    mutationFn: async () => {
      if (quality !== project.exportSettings.quality) setProject(await api.updateProject(project.id, { exportSettings: { quality } }));
      return api.createExports(project.id, ready.map((b) => b.id), quality);
    },
    onSuccess: (jobs) => {
      upsertJobs(jobs);
      onOpenChange(false);
      const skipped = ready.length - jobs.length;
      notify(
        `${jobs.length} video${jobs.length === 1 ? '' : 's'} queued`,
        skipped > 0 ? `${skipped} already in the queue were skipped.` : 'Progress is shown in Exports.',
      );
    },
  });

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={ready.length === 1 ? `Export “${ready[0]!.name}”` : `Export ${ready.length} videos`}
      width={480}
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="primary" disabled={!ready.length || start.isPending || system?.ready === false} onClick={() => start.mutate()}>
            {start.isPending ? 'Queuing…' : ready.length === 1 ? 'Export video' : `Export ${ready.length} videos`}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        {system?.ready === false && (
          <p className="flex gap-2 rounded-md bg-danger-soft px-3 py-2.5 text-xs text-danger">
            <AlertTriangle size={14} className="mt-px shrink-0" />
            FFmpeg isn't available, so videos can't be rendered. See Settings → Processing.
          </p>
        )}
        {missing.length > 0 && (
          <div className="rounded-md bg-accent-soft px-3 py-2.5 text-xs">
            <p className="flex items-center gap-2 font-medium text-accent">
              <AlertTriangle size={14} />
              {missing.length} beat{missing.length === 1 ? ' has' : 's have'} no artwork and will be skipped
            </p>
            <p className="mt-1 truncate pl-[22px] text-fg-2" title={missing.map((b) => b.name).join(', ')}>
              {missing.map((b) => b.name).join(', ')}
            </p>
          </div>
        )}

        <div className="flex flex-col gap-2">
          <span className="text-xs font-medium text-fg-2">Quality</span>
          <Segmented
            label="Quality"
            value={quality}
            onChange={setQuality}
            options={(Object.keys(QUALITY_PRESETS) as Quality[]).map((k) => ({ value: k, label: QUALITY_PRESETS[k].label }))}
          />
          <p className="text-xs text-fg-3">{QUALITY_PRESETS[quality].hint}.</p>
        </div>

        <dl className="grid grid-cols-[88px_1fr] gap-x-3 gap-y-2 rounded-md bg-bg/60 px-3 py-3 text-xs shadow-[inset_0_0_0_1px_var(--color-line)]">
          <dt className="text-fg-3">Format</dt>
          <dd className="tabular text-fg-2">
            MP4 · H.264 / AAC · {VIDEO.width} × {VIDEO.height} · {VIDEO.fps} fps
          </dd>
          <dt className="text-fg-3">Save to</dt>
          <dd className="flex min-w-0 items-center gap-1.5 text-fg-2">
            <Folder size={12} className="shrink-0 text-fg-3" />
            <span className="truncate" title={dest}>
              {dest}
            </span>
          </dd>
        </dl>
      </div>
    </Dialog>
  );
}
