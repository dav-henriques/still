import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { formatDuration, type Beat, type ExportJob, type Project } from '@still/shared';
import { useIsMutating } from '@tanstack/react-query';
import {
  AlertTriangle,
  ArrowLeft,
  AudioLines,
  Check,
  Clapperboard,
  ImagePlus,
  ImageOff,
  Pencil,
  Plus,
  SquarePen,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { Link, useLocation } from 'wouter';
import { PageHeader } from '../../components/shell/PageHeader';
import { Button, IconButton } from '../../components/ui/Button';
import { Checkbox, Kbd, ProgressBar, Spinner } from '../../components/ui/controls';
import { EmptyState } from '../../components/ui/feedback';
import { ContextMenu, DropdownMenu, type MenuItem } from '../../components/ui/Menu';
import { api } from '../../lib/api';
import { setProject, useExports, useProject } from '../../lib/queries';
import { cn, isTyping, latestJobByBeat } from '../../lib/utils';
import { confirmDialog, notifyError, promptDialog, useDialogs } from '../../stores/ui';
import { CroppedArt } from '../artwork/CroppedArt';
import { ExportDialog } from '../exports/ExportDialog';
import { useArtworkAssign, useAudioImport } from './useImports';

export function ProjectView({ projectId }: { projectId: string }) {
  const { data: project, isLoading, error } = useProject(projectId);
  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Spinner size={18} />
      </div>
    );
  }
  if (!project) {
    return (
      <EmptyState icon={AlertTriangle} title="Project unavailable" action={<Link href="/projects" className="text-sm text-accent hover:underline">Back to projects</Link>}>
        {(error as Error | null)?.message ?? 'This project could not be loaded.'}
      </EmptyState>
    );
  }
  return <Library project={project} />;
}

const formatLabel = (b: Beat) => {
  const a = b.audio;
  const parts = [a.format.toUpperCase()];
  if (a.bitDepth) parts.push(`${a.bitDepth}-bit`);
  if (a.sampleRate) parts.push(`${(a.sampleRate / 1000).toFixed(a.sampleRate % 1000 ? 1 : 0)} kHz`);
  return parts.join(' · ');
};

function Library({ project }: { project: Project }) {
  const [, navigate] = useLocation();
  const { data: jobs } = useExports();
  const jobByBeat = useMemo(() => latestJobByBeat(jobs, project.id), [jobs, project.id]);
  const { importing, failures, clearFailures, importFiles } = useAudioImport(project.id);
  const { assign, busyFor } = useArtworkAssign(project.id);
  const saving = useIsMutating() > 0;

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const anchor = useRef<number | null>(null);
  const [exportIds, setExportIds] = useState<string[] | null>(null);
  const audioInput = useRef<HTMLInputElement>(null);
  const artInput = useRef<HTMLInputElement>(null);
  const artTargets = useRef<string[]>([]);
  const listRef = useRef<HTMLUListElement>(null);

  const beats = project.beats;
  // Drop selections for beats that no longer exist.
  useEffect(() => {
    setSelected((s) => {
      const ids = new Set(beats.map((b) => b.id));
      const next = new Set([...s].filter((id) => ids.has(id)));
      return next.size === s.size ? s : next;
    });
  }, [beats]);

  const selectedBeats = beats.filter((b) => selected.has(b.id));
  const needArt = beats.filter((b) => !b.artworkId).length;
  const totalDuration = beats.reduce((s, b) => s + b.audio.duration, 0);

  const toggle = (index: number, value: boolean, range: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (range && anchor.current != null) {
        const [a, b] = [anchor.current, index].sort((x, y) => x - y) as [number, number];
        for (let i = a; i <= b; i++) next.add(beats[i]!.id);
      } else if (value) next.add(beats[index]!.id);
      else next.delete(beats[index]!.id);
      return next;
    });
    if (!range) anchor.current = index;
  };

  const chooseArtwork = useCallback((beatIds: string[]) => {
    artTargets.current = beatIds;
    artInput.current?.click();
  }, []);

  const removeBeats = useCallback(
    async (ids: string[]) => {
      const names = beats.filter((b) => ids.includes(b.id)).map((b) => b.name);
      const ok = await confirmDialog({
        title: ids.length === 1 ? `Remove “${names[0]}”?` : `Remove ${ids.length} beats?`,
        message: 'The imported audio and its framing are removed from this project. Original files on your computer and exported videos are not touched.',
        confirmLabel: 'Remove',
        danger: true,
      });
      if (!ok) return;
      try {
        setProject(await api.removeBeats(project.id, ids));
      } catch (err) {
        notifyError(err);
      }
    },
    [beats, project.id],
  );

  const rename = async (b: Beat) => {
    const name = await promptDialog({ title: 'Rename beat', label: 'Display name (also used as the video filename)', initial: b.name, confirmLabel: 'Rename' });
    if (name && name !== b.name) setProject(await api.updateBeat(project.id, b.id, { name }).catch((e) => (notifyError(e), project)));
  };

  // Keyboard: Ctrl+A, Delete, Ctrl+O, Escape (when no dialog or input has focus)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e) || useDialogs.getState().current || document.querySelector('[role="dialog"]')) return;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === 'o') {
        e.preventDefault();
        audioInput.current?.click();
      } else if (mod && e.key.toLowerCase() === 'a' && beats.length) {
        e.preventDefault();
        setSelected(new Set(beats.map((b) => b.id)));
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && selected.size) {
        e.preventDefault();
        void removeBeats([...selected]);
      } else if (e.key === 'Escape' && selected.size) {
        setSelected(new Set());
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [beats, selected, removeBeats]);

  // ── Drag and drop ──
  const [drag, setDrag] = useState<null | 'audio' | 'image'>(null);
  const [dropRow, setDropRow] = useState<string | null>(null);
  const dragDepth = useRef(0);
  const dragKind = (e: React.DragEvent) => {
    if (!e.dataTransfer.types.includes('Files')) return null;
    const items = Array.from(e.dataTransfer.items);
    return items.length && items.every((i) => i.type.startsWith('image/')) ? 'image' : 'audio';
  };

  const onDrop = (e: React.DragEvent, rowId?: string) => {
    e.preventDefault();
    e.stopPropagation();
    dragDepth.current = 0;
    setDrag(null);
    setDropRow(null);
    const files = Array.from(e.dataTransfer.files);
    const image = files.find((f) => /\.(png|jpe?g|webp)$/i.test(f.name));
    if (image && files.every((f) => /\.(png|jpe?g|webp)$/i.test(f.name))) {
      const targets = rowId ? (selected.has(rowId) ? [...selected] : [rowId]) : [...selected];
      if (targets.length) void assign(image, targets);
      else notifyError(new Error('Drop the image onto a beat, or select beats first.'), 'Which beat is this artwork for?');
      return;
    }
    void importFiles(files);
  };

  const ready = beats.filter((b) => b.artworkId).map((b) => b.id);
  const exportTargets = selected.size ? selectedBeats.map((b) => b.id) : ready;

  const rowMenu = (b: Beat): MenuItem[] => [
    { label: 'Open editor', icon: SquarePen, onSelect: () => navigate(`/projects/${project.id}/beats/${b.id}`) },
    { label: 'Rename…', icon: Pencil, onSelect: () => void rename(b) },
    { type: 'separator' },
    { label: b.artworkId ? 'Replace artwork…' : 'Add artwork…', icon: ImagePlus, onSelect: () => chooseArtwork(selected.has(b.id) ? [...selected] : [b.id]) },
    ...(b.artworkId
      ? [{ label: 'Remove artwork', icon: ImageOff, onSelect: () => void api.updateBeat(project.id, b.id, { artworkId: null }).then(setProject, notifyError) } as MenuItem]
      : []),
    { label: 'Export…', icon: Clapperboard, disabled: !b.artworkId, onSelect: () => setExportIds(selected.has(b.id) ? [...selected] : [b.id]) },
    { type: 'separator' },
    { label: selected.has(b.id) && selected.size > 1 ? `Remove ${selected.size} beats` : 'Remove from project', icon: Trash2, danger: true, shortcut: 'Del', onSelect: () => void removeBeats(selected.has(b.id) ? [...selected] : [b.id]) },
  ];

  return (
    <div
      className="relative flex min-h-0 flex-1 flex-col"
      onDragEnter={(e) => {
        const k = dragKind(e);
        if (!k) return;
        dragDepth.current++;
        setDrag(k);
      }}
      onDragOver={(e) => {
        if (dragKind(e)) e.preventDefault();
      }}
      onDragLeave={() => {
        dragDepth.current = Math.max(0, dragDepth.current - 1);
        if (!dragDepth.current) {
          setDrag(null);
          setDropRow(null);
        }
      }}
      onDrop={(e) => onDrop(e)}
    >
      <PageHeader
        leading={<IconButton icon={ArrowLeft} label="All projects" onClick={() => navigate('/projects')} className="-ml-2" />}
        title={
          <button
            type="button"
            className="rounded-sm hover:text-fg-2"
            title="Rename project"
            onClick={async () => {
              const name = await promptDialog({ title: 'Rename project', label: 'Name', initial: project.name, confirmLabel: 'Rename' });
              if (name && name !== project.name) api.updateProject(project.id, { name }).then(setProject, notifyError);
            }}
          >
            {project.name}
          </button>
        }
        meta={
          beats.length ? (
            <span className="flex items-center gap-3">
              <span>
                {beats.length} beat{beats.length === 1 ? '' : 's'} · {formatDuration(totalDuration)}
              </span>
              <span className="flex items-center gap-1.5 text-fg-3" aria-live="polite">
                {saving ? <Spinner size={10} /> : <Check size={11} />}
                {saving ? 'Saving' : 'Saved'}
              </span>
            </span>
          ) : undefined
        }
        actions={
          beats.length > 0 && (
            <>
              <Button icon={Plus} onClick={() => audioInput.current?.click()} title="Add beats (Ctrl+O)">
                Add beats
              </Button>
              <Button variant="primary" icon={Clapperboard} disabled={!exportTargets.length} onClick={() => setExportIds(exportTargets)}>
                {selected.size ? `Export ${selectedBeats.length}` : ready.length === beats.length ? 'Export all' : ready.length ? `Export ${ready.length} ready` : 'Export'}
              </Button>
            </>
          )
        }
      />

      <input
        ref={audioInput}
        type="file"
        multiple
        hidden
        accept=".wav,.mp3,.flac,.m4a,.aac,.ogg,.aif,.aiff,audio/*"
        onChange={(e) => {
          if (e.target.files?.length) void importFiles(e.target.files);
          e.target.value = '';
        }}
      />
      <input
        ref={artInput}
        type="file"
        hidden
        accept=".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp"
        onChange={(e) => {
          void assign(e.target.files?.[0], artTargets.current);
          e.target.value = '';
        }}
      />

      {(importing || failures.length > 0) && (
        <div className="shrink-0 px-6 pt-3">
          {importing && (
            <div className="flex items-center gap-3 rounded-md bg-bg/60 px-3 py-2.5 text-xs shadow-[inset_0_0_0_1px_var(--color-line)]">
              <Spinner size={12} />
              <span className="text-fg-2">
                {importing.progress < 1
                  ? `Importing ${importing.count} file${importing.count === 1 ? '' : 's'}…`
                  : `Analysing ${importing.count} file${importing.count === 1 ? '' : 's'}…`}
              </span>
              <ProgressBar value={importing.progress} className="flex-1" tone="muted" />
              <span className="tabular w-9 text-right text-fg-3">{Math.round(importing.progress * 100)}%</span>
            </div>
          )}
          {failures.length > 0 && (
            <div role="alert" className="mt-2 rounded-md bg-danger-soft px-3 py-2.5 text-xs">
              <div className="flex items-center justify-between">
                <p className="flex items-center gap-2 font-medium text-danger">
                  <AlertTriangle size={14} />
                  {failures.length} file{failures.length === 1 ? " couldn't" : "s couldn't"} be imported
                </p>
                <IconButton icon={X} label="Dismiss" size="sm" onClick={clearFailures} />
              </div>
              <ul className="mt-1 flex flex-col gap-0.5 pl-[22px]">
                {failures.map((f, i) => (
                  <li key={i} className="text-fg-2" title={f.details}>
                    <span className="text-fg">{f.filename}</span> — {f.message}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {!beats.length ? (
        <div className="flex flex-1 items-center justify-center p-6">
          <div className="w-full max-w-[560px] rounded-xl bg-bg/40 shadow-[inset_0_0_0_1px_var(--color-line)]">
            <EmptyState
              icon={AudioLines}
              title="Drop beats here"
              action={
                <Button variant="primary" icon={Upload} onClick={() => audioInput.current?.click()} disabled={!!importing}>
                  Choose audio files
                </Button>
              }
            >
              WAV, MP3, FLAC, M4A, AAC, OGG or AIFF. Import as many as you like — originals are kept untouched.
            </EmptyState>
          </div>
        </div>
      ) : (
        <>
          {/* Selection bar */}
          <div className="flex h-11 shrink-0 items-center gap-3 px-6">
            <Checkbox
              label="Select all beats"
              checked={selected.size === beats.length}
              indeterminate={selected.size > 0 && selected.size < beats.length}
              onChange={(v) => setSelected(v ? new Set(beats.map((b) => b.id)) : new Set())}
              className="ml-[9px]"
            />
            {selected.size ? (
              <div className="flex items-center gap-1 animate-fade-in">
                <span className="tabular mr-2 text-xs text-fg-2">{selected.size} selected</span>
                <Button size="sm" variant="ghost" icon={ImagePlus} onClick={() => chooseArtwork([...selected])}>
                  Set artwork
                </Button>
                <Button size="sm" variant="ghost" icon={Trash2} onClick={() => void removeBeats([...selected])}>
                  Remove
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
                  Clear
                </Button>
              </div>
            ) : (
              <span className="text-xs text-fg-3">
                {needArt ? (
                  <>
                    <span className="text-accent">{needArt}</span> need artwork · drop an image on a beat to set it
                  </>
                ) : (
                  'All beats have artwork'
                )}
              </span>
            )}
          </div>

          <div className="grid shrink-0 grid-cols-[34px_44px_minmax(0,1fr)_70px_150px_130px_150px_36px] items-center gap-x-2 px-6 pb-1.5 text-2xs font-medium tracking-[0.04em] text-fg-3 uppercase shadow-[inset_0_-1px_0_var(--color-line)] max-[1200px]:grid-cols-[34px_44px_minmax(0,1fr)_70px_130px_150px_36px]">
            <span />
            <span />
            <span>Beat</span>
            <span className="text-right">Length</span>
            <span className="max-[1200px]:hidden">Format</span>
            <span>Artwork</span>
            <span>Export</span>
            <span />
          </div>

          <ul
            ref={listRef}
            aria-label="Beats"
            className="min-h-0 flex-1 overflow-y-auto px-4 py-1.5"
            onKeyDown={(e) => {
              if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
              const rows = [...(listRef.current?.querySelectorAll<HTMLElement>('[data-row-main]') ?? [])];
              const i = rows.indexOf(document.activeElement as HTMLElement);
              const next = rows[Math.max(0, Math.min(rows.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)))];
              if (next) {
                e.preventDefault();
                next.focus();
              }
            }}
          >
            {beats.map((b, i) => (
              <BeatRow
                key={b.id}
                project={project}
                beat={b}
                selected={selected.has(b.id)}
                job={jobByBeat.get(b.id)}
                busy={busyFor.includes(b.id)}
                dropTarget={drag === 'image' && dropRow === b.id}
                menu={rowMenu(b)}
                onToggle={(v, shift) => toggle(i, v, shift)}
                onOpen={(e) => {
                  if (e.ctrlKey || e.metaKey) toggle(i, !selected.has(b.id), false);
                  else if (e.shiftKey) toggle(i, true, true);
                  else navigate(`/projects/${project.id}/beats/${b.id}`);
                }}
                onAddArtwork={() => chooseArtwork([b.id])}
                onDragOverRow={() => setDropRow(b.id)}
                onDropRow={(e) => onDrop(e, b.id)}
              />
            ))}
            <li className="flex items-center gap-4 px-2 pt-4 pb-6 text-xs text-fg-3">
              <span>
                <Kbd>Ctrl</Kbd> <Kbd>A</Kbd> select all
              </span>
              <span>
                <Kbd>Shift</Kbd> click range
              </span>
              <span>
                <Kbd>Del</Kbd> remove
              </span>
              <span>
                <Kbd>Ctrl</Kbd> <Kbd>O</Kbd> add beats
              </span>
            </li>
          </ul>
        </>
      )}

      {drag === 'audio' && (
        <div className="pointer-events-none absolute inset-3 z-20 flex items-center justify-center rounded-xl bg-bg/80 shadow-[inset_0_0_0_1.5px_var(--color-accent)] animate-fade-in">
          <div className="flex flex-col items-center gap-2 text-center">
            <Upload size={22} strokeWidth={1.5} className="text-accent" />
            <p className="text-sm font-medium">Drop to add beats to {project.name}</p>
            <p className="text-xs text-fg-3">Audio files only · originals stay untouched</p>
          </div>
        </div>
      )}
      {drag === 'image' && !dropRow && (
        <div className="pointer-events-none absolute inset-x-0 bottom-6 z-20 flex justify-center animate-fade-in">
          <p className="glass rounded-md px-3 py-2 text-xs text-fg-2">
            {selected.size ? `Drop to set artwork for ${selected.size} selected beat${selected.size === 1 ? '' : 's'}` : 'Drop the image onto a beat'}
          </p>
        </div>
      )}

      {exportIds && <ExportDialog project={project} beatIds={exportIds} open onOpenChange={(o) => !o && setExportIds(null)} />}
    </div>
  );
}

function ExportStatus({ job }: { job: ExportJob | undefined }) {
  if (!job) return <span className="text-fg-3">—</span>;
  switch (job.state) {
    case 'queued':
      return <span className="text-fg-2">Queued</span>;
    case 'preparing':
    case 'rendering':
      return (
        <span className="flex items-center gap-2">
          <ProgressBar value={job.progress} className="w-14" />
          <span className="tabular text-fg-2">{Math.round(job.progress * 100)}%</span>
        </span>
      );
    case 'completed':
      return (
        <span className="flex items-center gap-1.5 text-fg-2">
          <Check size={13} className="text-ok" /> Exported
        </span>
      );
    case 'failed':
      return (
        <span className="text-danger" title={job.error?.message}>
          Failed
        </span>
      );
    case 'cancelled':
      return <span className="text-fg-3">Cancelled</span>;
  }
}

function BeatRow({
  project,
  beat,
  selected,
  job,
  busy,
  dropTarget,
  menu,
  onToggle,
  onOpen,
  onAddArtwork,
  onDragOverRow,
  onDropRow,
}: {
  project: Project;
  beat: Beat;
  selected: boolean;
  job: ExportJob | undefined;
  busy: boolean;
  dropTarget: boolean;
  menu: MenuItem[];
  onToggle: (v: boolean, shift: boolean) => void;
  onOpen: (e: React.MouseEvent) => void;
  onAddArtwork: () => void;
  onDragOverRow: () => void;
  onDropRow: (e: React.DragEvent) => void;
}) {
  const art = beat.artworkId ? project.artworks[beat.artworkId] : null;
  return (
    <ContextMenu items={menu}>
      <li
        onDragOver={(e) => {
          if (!e.dataTransfer.types.includes('Files')) return;
          e.preventDefault();
          onDragOverRow();
        }}
        onDrop={onDropRow}
        aria-selected={selected}
        className={cn(
          'group grid h-12 grid-cols-[34px_44px_minmax(0,1fr)_70px_150px_130px_150px_36px] items-center gap-x-2 rounded-md px-2 transition-colors duration-100 max-[1200px]:grid-cols-[34px_44px_minmax(0,1fr)_70px_130px_150px_36px]',
          selected ? 'bg-accent-soft/70' : 'hover:bg-white/[0.035]',
          dropTarget && 'bg-accent-soft shadow-[inset_0_0_0_1.5px_var(--color-accent)]',
        )}
      >
        <span className="flex justify-center">
          <Checkbox label={`Select ${beat.name}`} checked={selected} onChange={onToggle} />
        </span>
        <span className="relative">
          <CroppedArt projectId={project.id} artwork={art} crop={beat.crop} size={36} />
          {busy && (
            <span className="absolute inset-0 flex items-center justify-center rounded-[5px] bg-black/60">
              <Spinner size={12} />
            </span>
          )}
        </span>
        <button
          type="button"
          data-row-main
          onClick={onOpen}
          onKeyDown={(e) => {
            if (e.key === ' ') {
              e.preventDefault();
              onToggle(!selected, e.shiftKey);
            }
          }}
          className="flex h-full min-w-0 items-center text-left outline-none focus-visible:rounded-sm focus-visible:shadow-[inset_0_0_0_1.5px_var(--color-accent)]"
          title={`Open ${beat.name} (Enter) · Space to select`}
        >
          <span className="truncate px-1 text-sm font-medium">{beat.name}</span>
        </button>
        <span className="tabular text-right text-xs text-fg-2">{formatDuration(beat.audio.duration)}</span>
        <span className="tabular truncate text-xs text-fg-3 max-[1200px]:hidden" title={beat.audio.originalFilename}>
          {formatLabel(beat)}
        </span>
        <span className="text-xs">
          {art ? (
            <span className="tabular text-fg-3" title={art.originalFilename}>
              {art.width} × {art.height}
            </span>
          ) : (
            <button type="button" onClick={onAddArtwork} className="flex items-center gap-1.5 rounded-sm text-accent hover:underline">
              <ImagePlus size={13} /> Add artwork
            </button>
          )}
        </span>
        <span className="text-xs">
          <ExportStatus job={job} />
        </span>
        <span className="opacity-0 group-hover:opacity-100 focus-within:opacity-100">
          <DropdownMenu items={menu} label={`Actions for ${beat.name}`} />
        </span>
      </li>
    </ContextMenu>
  );
}
