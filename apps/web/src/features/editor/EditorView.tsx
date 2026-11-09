import { useEffect, useRef, useState } from 'react';
import type { Beat, Project } from '@still/shared';
import { useMutation } from '@tanstack/react-query';
import { AlertTriangle, ArrowLeft, ChevronLeft, ChevronRight, Clapperboard, PanelRightClose, PanelRightOpen } from 'lucide-react';
import { Link, useLocation } from 'wouter';
import { Button, IconButton } from '../../components/ui/Button';
import { Spinner } from '../../components/ui/controls';
import { EmptyState } from '../../components/ui/feedback';
import { api } from '../../lib/api';
import { setProject, useExports, useProject } from '../../lib/queries';
import { isTyping, latestJobByBeat } from '../../lib/utils';
import { useDialogs, useUi } from '../../stores/ui';
import { useArtworkAssign } from '../audio/useImports';
import { ExportDialog } from '../exports/ExportDialog';
import { Inspector } from './Inspector';
import { PreviewStage } from './PreviewStage';
import { Transport } from './Transport';
import { useCropDraft } from './useCropDraft';

export function EditorView({ projectId, beatId }: { projectId: string; beatId: string }) {
  const { data: project, isLoading } = useProject(projectId);
  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Spinner size={18} />
      </div>
    );
  }
  const beat = project?.beats.find((b) => b.id === beatId);
  if (!project || !beat) {
    return (
      <EmptyState
        icon={AlertTriangle}
        title="Beat not found"
        action={
          <Link href={project ? `/projects/${projectId}` : '/projects'} className="text-sm text-accent hover:underline">
            Back to {project ? project.name : 'projects'}
          </Link>
        }
      >
        It may have been removed from the project.
      </EmptyState>
    );
  }
  return <Editor project={project} beat={beat} />;
}

function Editor({ project, beat }: { project: Project; beat: Beat }) {
  const [, navigate] = useLocation();
  const { inspectorOpen, setInspectorOpen } = useUi();
  const { crop, update, flush } = useCropDraft(project.id, beat);
  const { assign, busyFor } = useArtworkAssign(project.id);
  const [exporting, setExporting] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const { data: jobs } = useExports();
  const job = latestJobByBeat(jobs, project.id).get(beat.id);

  const index = project.beats.findIndex((b) => b.id === beat.id);
  const prev = project.beats[index - 1];
  const next = project.beats[index + 1];
  const artwork = beat.artworkId ? (project.artworks[beat.artworkId] ?? null) : null;
  const go = (b: Beat | undefined) => {
    if (!b) return;
    flush();
    navigate(`/projects/${project.id}/beats/${b.id}`, { replace: true });
  };

  const patchBeat = useMutation({
    mutationFn: (patch: { name?: string; artworkId?: string | null }) => api.updateBeat(project.id, beat.id, patch),
    onSuccess: setProject,
  });
  const setQuality = useMutation({
    mutationFn: (quality: Project['exportSettings']['quality']) => api.updateProject(project.id, { exportSettings: { quality } }),
    onSuccess: setProject,
  });

  // [ / ] switch beats, Ctrl+O choose artwork
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e) || useDialogs.getState().current || document.querySelector('[role="dialog"]')) return;
      if (e.key === '[') go(prev);
      else if (e.key === ']') go(next);
      else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'o') {
        e.preventDefault();
        fileInput.current?.click();
      } else if (e.key === 'Escape') {
        flush();
        navigate(`/projects/${project.id}`);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // Small windows: start with the inspector closed.
  useEffect(() => {
    if (window.innerWidth < 1100) setInspectorOpen(false);
  }, [setInspectorOpen]);

  const jobLabel =
    job && (job.state === 'rendering' || job.state === 'preparing')
      ? `Rendering ${Math.round(job.progress * 100)}%`
      : job?.state === 'queued'
        ? 'Queued'
        : job?.state === 'completed'
          ? 'Exported'
          : job?.state === 'failed'
            ? 'Export failed'
            : null;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex h-14 shrink-0 items-center gap-2 px-4 shadow-[inset_0_-1px_0_var(--color-line)]">
        <Button
          variant="ghost"
          icon={ArrowLeft}
          onClick={() => {
            flush();
            navigate(`/projects/${project.id}`);
          }}
          className="max-w-[220px] text-fg-2"
          title="Back to project (Esc)"
        >
          <span className="truncate">{project.name}</span>
        </Button>
        <span className="text-fg-3">/</span>
        <BeatName key={beat.id} name={beat.name} onRename={(name) => patchBeat.mutate({ name })} />

        <div className="ml-auto flex items-center gap-2">
          {jobLabel && (
            <Link href="/exports" className={`mr-1 text-xs ${job?.state === 'failed' ? 'text-danger' : 'text-fg-3'} hover:text-fg-2`}>
              {jobLabel}
            </Link>
          )}
          <div className="flex items-center gap-0.5 rounded-md bg-bg p-0.5 shadow-[inset_0_0_0_1px_var(--color-line)]">
            <IconButton icon={ChevronLeft} label="Previous beat ([)" size="sm" disabled={!prev} onClick={() => go(prev)} />
            <span className="tabular min-w-[52px] text-center text-xs text-fg-2">
              {index + 1} / {project.beats.length}
            </span>
            <IconButton icon={ChevronRight} label="Next beat (])" size="sm" disabled={!next} onClick={() => go(next)} />
          </div>
          <IconButton
            icon={inspectorOpen ? PanelRightClose : PanelRightOpen}
            label={inspectorOpen ? 'Hide inspector' : 'Show inspector'}
            onClick={() => setInspectorOpen(!inspectorOpen)}
            active={inspectorOpen}
          />
          <Button
            variant="primary"
            icon={Clapperboard}
            disabled={!artwork}
            title={artwork ? 'Export this beat' : 'Add artwork to export'}
            onClick={() => {
              flush();
              setExporting(true);
            }}
          >
            Export
          </Button>
        </div>
      </header>

      <input
        ref={fileInput}
        type="file"
        hidden
        accept=".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp"
        onChange={(e) => {
          void assign(e.target.files?.[0], [beat.id]);
          e.target.value = '';
        }}
      />

      <div className="flex min-h-0 flex-1">
        <section aria-label="Preview" className="flex min-w-0 flex-1 flex-col px-6 py-6">
          <PreviewStage
            projectId={project.id}
            artwork={artwork}
            crop={crop}
            onCrop={update}
            onDropImage={(f) => void assign(f, [beat.id])}
            onChooseImage={() => fileInput.current?.click()}
            busy={busyFor.includes(beat.id)}
            footer={<Transport key={beat.id} projectId={project.id} beatId={beat.id} duration={beat.audio.duration} />}
          />
        </section>
        {inspectorOpen && (
          <Inspector
            project={project}
            beat={beat}
            artwork={artwork}
            crop={crop}
            onCrop={update}
            onChooseImage={() => fileInput.current?.click()}
            onRemoveArtwork={() => patchBeat.mutate({ artworkId: null })}
            onQuality={(q) => setQuality.mutate(q)}
          />
        )}
      </div>

      {exporting && <ExportDialog project={project} beatIds={[beat.id]} open onOpenChange={setExporting} />}
    </div>
  );
}

function BeatName({ name, onRename }: { name: string; onRename: (name: string) => void }) {
  const [value, setValue] = useState(name);
  useEffect(() => setValue(name), [name]);
  const commit = () => {
    const v = value.trim();
    if (!v) setValue(name);
    else if (v !== name) onRename(v);
  };
  return (
    <input
      aria-label="Beat name"
      value={value}
      maxLength={200}
      spellCheck={false}
      onChange={(e) => setValue(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur();
        if (e.key === 'Escape') {
          setValue(name);
          e.currentTarget.blur();
          e.stopPropagation();
        }
      }}
      className="h-8 min-w-0 flex-1 truncate rounded-md bg-transparent px-2 text-[15px] font-semibold tracking-[-0.015em] outline-none hover:bg-white/[0.04] focus:bg-bg focus:shadow-[inset_0_0_0_1px_var(--color-line-2)]"
      style={{ maxWidth: 420 }}
      title="Rename — also used as the video filename"
    />
  );
}

