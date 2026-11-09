import { useState } from 'react';
import { formatBytes, formatDuration, QUALITY_PRESETS, type ExportJob } from '@still/shared';
import { ChevronDown, Download, FolderOpen, ImageOff, Play, RotateCcw, Trash2, X } from 'lucide-react';
import { Link } from 'wouter';
import { IconButton } from '../../components/ui/Button';
import { ProgressBar, Spinner } from '../../components/ui/controls';
import { api, urls } from '../../lib/api';
import { upsertJobs } from '../../lib/queries';
import { cn, formatDate } from '../../lib/utils';
import { notifyError } from '../../stores/ui';

function JobThumb({ job, size }: { job: ExportJob; size: number }) {
  const [broken, setBroken] = useState(false);
  if (!job.artworkId || broken) {
    return (
      <div className="flex shrink-0 items-center justify-center rounded-[5px] bg-surface-2 text-fg-3" style={{ width: size, height: size }}>
        <ImageOff size={size * 0.4} strokeWidth={1.5} />
      </div>
    );
  }
  return (
    <img
      src={urls.artwork(job.projectId, job.artworkId, 'thumb')}
      alt=""
      onError={() => setBroken(true)}
      className="shrink-0 rounded-[5px] bg-black object-cover"
      style={{ width: size, height: size }}
      draggable={false}
    />
  );
}

const elapsed = (from: string | null, to?: string | null) => {
  if (!from) return '';
  const s = Math.max(0, ((to ? new Date(to).getTime() : Date.now()) - new Date(from).getTime()) / 1000);
  return formatDuration(s);
};

async function act(fn: () => Promise<unknown>) {
  try {
    const r = await fn();
    if (r && typeof r === 'object' && 'id' in r) upsertJobs([r as ExportJob]);
  } catch (err) {
    notifyError(err);
  }
}

export function JobRow({ job, compact, onPlay }: { job: ExportJob; compact?: boolean; onPlay?: (job: ExportJob) => void }) {
  const [showDetails, setShowDetails] = useState(false);
  const running = job.state === 'rendering' || job.state === 'preparing';
  const failed = job.state === 'failed';

  let status: React.ReactNode;
  if (job.state === 'queued') status = <span className="text-fg-3">Queued</span>;
  else if (job.state === 'preparing') status = <span className="text-fg-2">Preparing artwork…</span>;
  else if (job.state === 'rendering')
    status = (
      <span className="text-fg-2">
        Rendering <span className="tabular text-fg">{Math.round(job.progress * 100)}%</span>
        {!compact && <span className="tabular text-fg-3"> · {elapsed(job.startedAt)}</span>}
      </span>
    );
  else if (job.state === 'completed' && job.output)
    status = (
      <span className="tabular text-fg-3">
        {formatBytes(job.output.size)} · {formatDuration(job.output.duration)} · {job.finishedAt && formatDate(job.finishedAt)}
      </span>
    );
  else if (job.state === 'cancelled') status = <span className="text-fg-3">Cancelled</span>;
  else if (failed) status = <span className="text-danger">{job.error?.message ?? 'Failed'}</span>;

  return (
    <li className="rounded-md hover:bg-white/[0.03]">
      <div className={cn('flex items-center gap-3 px-2.5', compact ? 'h-12' : 'h-14')}>
        <JobThumb job={job} size={compact ? 30 : 36} />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <p className="truncate text-sm font-medium">{job.output?.filename ?? job.beatName}</p>
            {!compact && (
              <Link href={`/projects/${job.projectId}`} className="truncate text-xs text-fg-3 hover:text-fg-2">
                {job.projectName}
              </Link>
            )}
          </div>
          <div className="mt-0.5 flex items-center gap-3 text-xs">
            <span className="min-w-0 truncate">{status}</span>
            {!compact && job.state !== 'completed' && <span className="shrink-0 text-fg-3">{QUALITY_PRESETS[job.quality].label}</span>}
          </div>
        </div>

        {running && (
          <div className="flex w-[22%] max-w-[220px] min-w-[90px] items-center gap-2">
            {job.state === 'preparing' ? <Spinner size={12} /> : null}
            <ProgressBar value={job.progress} className="flex-1" />
          </div>
        )}

        <div className="flex shrink-0 items-center gap-0.5">
          {(running || job.state === 'queued') && <IconButton icon={X} label="Cancel export" size="sm" onClick={() => act(() => api.cancelExport(job.id))} />}
          {job.state === 'completed' && !compact && (
            <>
              {onPlay && <IconButton icon={Play} label="Watch" size="sm" onClick={() => onPlay(job)} />}
              <IconButton icon={FolderOpen} label="Show in folder" size="sm" onClick={() => act(() => api.revealExport(job.id))} />
              <IconButton icon={Download} label="Download" size="sm" onClick={() => (window.location.href = urls.exportFile(job.id))} />
            </>
          )}
          {(failed || job.state === 'cancelled') && <IconButton icon={RotateCcw} label="Retry" size="sm" onClick={() => act(() => api.retryExport(job.id))} />}
          {failed && job.error?.details && !compact && (
            <IconButton
              icon={ChevronDown}
              label={showDetails ? 'Hide details' : 'Show details'}
              size="sm"
              aria-expanded={showDetails}
              className={cn('transition-transform', showDetails && 'rotate-180')}
              onClick={() => setShowDetails(!showDetails)}
            />
          )}
          {!compact && !running && job.state !== 'queued' && (
            <IconButton icon={Trash2} label="Remove from list" size="sm" onClick={() => act(() => api.removeExport(job.id))} />
          )}
        </div>
      </div>
      {showDetails && job.error?.details && (
        <pre className="mx-2.5 mb-2.5 max-h-48 overflow-auto rounded-md bg-black/50 p-3 font-mono text-2xs whitespace-pre-wrap text-fg-2 select-text">
          {job.error.details}
        </pre>
      )}
    </li>
  );
}
