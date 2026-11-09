import { useState } from 'react';
import { formatDuration, QUALITY_PRESETS, type ProjectSummary, type Quality } from '@still/shared';
import { useMutation } from '@tanstack/react-query';
import { Copy, FolderOpen, Music2, Pencil, Trash2 } from 'lucide-react';
import { useLocation } from 'wouter';
import { Button } from '../../components/ui/Button';
import { Field, Input, Segmented } from '../../components/ui/controls';
import { Dialog } from '../../components/ui/Dialog';
import { ContextMenu, DropdownMenu, type MenuItem } from '../../components/ui/Menu';
import { api, urls } from '../../lib/api';
import { keys, queryClient, setProject, useSettings } from '../../lib/queries';
import { cn, relativeTime } from '../../lib/utils';
import { confirmDialog, promptDialog } from '../../stores/ui';

export function NewProjectDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const [, navigate] = useLocation();
  const { data: settings } = useSettings();
  const [name, setName] = useState('');
  const [quality, setQuality] = useState<Quality | null>(null);
  const q = quality ?? settings?.defaultQuality ?? 'high';
  const create = useMutation({
    mutationFn: () => api.createProject(name.trim(), q),
    onSuccess: (p) => {
      setProject(p);
      onOpenChange(false);
      setName('');
      setQuality(null);
      navigate(`/projects/${p.id}`);
    },
  });
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="New project"
      description="A project holds a batch of beats that share export settings."
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" form="new-project" disabled={!name.trim() || create.isPending}>
            Create project
          </Button>
        </>
      }
    >
      <form
        id="new-project"
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim()) create.mutate();
        }}
      >
        <Field label="Name">{(id) => <Input id={id} autoFocus placeholder="e.g. YouTube Beats" value={name} maxLength={120} onChange={(e) => setName(e.target.value)} />}</Field>
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-fg-2">Export quality</span>
          <Segmented
            label="Export quality"
            value={q}
            onChange={setQuality}
            options={(Object.keys(QUALITY_PRESETS) as Quality[]).map((k) => ({ value: k, label: QUALITY_PRESETS[k].label }))}
          />
          <p className="text-xs text-fg-3">{QUALITY_PRESETS[q].hint}. You can change this any time.</p>
        </div>
      </form>
    </Dialog>
  );
}

export function useProjectMenu(p: ProjectSummary): MenuItem[] {
  const [, navigate] = useLocation();
  return [
    { label: 'Open', icon: FolderOpen, onSelect: () => navigate(`/projects/${p.id}`) },
    {
      label: 'Rename…',
      icon: Pencil,
      onSelect: async () => {
        const name = await promptDialog({ title: 'Rename project', label: 'Name', initial: p.name, confirmLabel: 'Rename' });
        if (name && name !== p.name) setProject(await api.updateProject(p.id, { name }));
      },
    },
    {
      label: 'Duplicate',
      icon: Copy,
      onSelect: async () => {
        setProject(await api.duplicateProject(p.id));
      },
    },
    { type: 'separator' },
    {
      label: 'Delete…',
      icon: Trash2,
      danger: true,
      onSelect: async () => {
        const ok = await confirmDialog({
          title: `Delete “${p.name}”?`,
          message: `This removes the project and its ${p.beatCount} imported beat${p.beatCount === 1 ? '' : 's'} and artwork from still. Exported videos are kept. This can't be undone.`,
          confirmLabel: 'Delete project',
          danger: true,
        });
        if (!ok) return;
        await api.deleteProject(p.id);
        queryClient.removeQueries({ queryKey: keys.project(p.id) });
        await queryClient.invalidateQueries({ queryKey: keys.projects });
      },
    },
  ];
}

export function ProjectMosaic({ p, size }: { p: ProjectSummary; size?: number }) {
  const ids = p.artworkThumbs;
  const box = size ? { width: size, height: size } : undefined;
  if (!ids.length) {
    return (
      <div className={cn('flex shrink-0 items-center justify-center bg-surface-2 text-fg-3', size ? 'rounded-md' : 'size-full')} style={box}>
        <Music2 size={size ? Math.round(size * 0.36) : 28} strokeWidth={1.5} aria-hidden />
      </div>
    );
  }
  const grid = ids.length >= 4;
  return (
    <div className={cn('grid shrink-0 overflow-hidden bg-black', size ? 'rounded-md' : 'size-full', grid && 'grid-cols-2 gap-px')} style={box}>
      {(grid ? ids.slice(0, 4) : ids.slice(0, 1)).map((id) => (
        <img key={id} src={urls.artwork(p.id, id, 'thumb')} alt="" loading="lazy" draggable={false} className="size-full object-cover" />
      ))}
    </div>
  );
}

export function ProjectRow({ p }: { p: ProjectSummary }) {
  const [, navigate] = useLocation();
  const items = useProjectMenu(p);
  return (
    <ContextMenu items={items}>
      <li>
        <div className="group flex h-14 items-center gap-3 rounded-md px-3 hover:bg-white/[0.035]">
          <button
            type="button"
            onClick={() => navigate(`/projects/${p.id}`)}
            className="flex min-w-0 flex-1 items-center gap-3 text-left outline-none focus-visible:outline-none"
          >
            <ProjectMosaic p={p} size={36} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium group-focus-within:underline-offset-2">{p.name}</p>
              <p className="tabular text-xs text-fg-3">
                {p.beatCount} beat{p.beatCount === 1 ? '' : 's'}
                {p.beatCount > 0 && <> · {formatDuration(p.totalDuration)}</>}
              </p>
            </div>
            <span className="tabular hidden text-xs text-fg-3 sm:block" title={new Date(p.updatedAt).toLocaleString()}>
              {relativeTime(p.updatedAt)}
            </span>
          </button>
          <div className="opacity-60 group-hover:opacity-100 focus-within:opacity-100">
            <DropdownMenu items={items} label={`Actions for ${p.name}`} />
          </div>
        </div>
      </li>
    </ContextMenu>
  );
}

export function ProjectTile({ p }: { p: ProjectSummary }) {
  const [, navigate] = useLocation();
  const items = useProjectMenu(p);
  return (
    <ContextMenu items={items}>
      <li className="group relative rounded-lg bg-surface/60 p-2.5 shadow-[inset_0_0_0_1px_var(--color-line)] transition-colors hover:bg-surface">
        <button type="button" onClick={() => navigate(`/projects/${p.id}`)} className="block w-full text-left">
          <div className="aspect-square w-full overflow-hidden rounded-md">
            <ProjectMosaic p={p} />
          </div>
          <p className="mt-2.5 truncate px-0.5 text-sm font-medium">{p.name}</p>
          <p className="tabular px-0.5 text-xs text-fg-3">
            {p.beatCount} beat{p.beatCount === 1 ? '' : 's'} · {relativeTime(p.updatedAt)}
          </p>
        </button>
        <div className="absolute top-4 right-4 rounded-sm bg-black/60 opacity-0 backdrop-blur group-hover:opacity-100 focus-within:opacity-100">
          <DropdownMenu items={items} label={`Actions for ${p.name}`} />
        </div>
      </li>
    </ContextMenu>
  );
}
