import { useState } from 'react';
import { isActiveState, type ExportJob } from '@still/shared';
import { Clapperboard, FolderOpen } from 'lucide-react';
import { PageHeader } from '../../components/shell/PageHeader';
import { Button } from '../../components/ui/Button';
import { ProgressBar, Spinner } from '../../components/ui/controls';
import { Dialog } from '../../components/ui/Dialog';
import { EmptyState, SectionHeading } from '../../components/ui/feedback';
import { api, urls } from '../../lib/api';
import { useExports } from '../../lib/queries';
import { notifyError } from '../../stores/ui';
import { JobRow } from './JobRow';

const byNewest = (a: ExportJob, b: ExportJob) => (b.finishedAt ?? b.createdAt).localeCompare(a.finishedAt ?? a.createdAt);

export function ExportsView() {
  const { data: jobs, isLoading } = useExports();
  const [playing, setPlaying] = useState<ExportJob | null>(null);
  const all = jobs ?? [];
  const active = all.filter((j) => isActiveState(j.state)); // queue order
  const failed = all.filter((j) => j.state === 'failed' || j.state === 'cancelled').sort(byNewest);
  const done = all.filter((j) => j.state === 'completed').sort(byNewest);
  const queued = active.filter((j) => j.state === 'queued').length;
  // The current batch: everything created since the oldest job still in the queue.
  const batchStart = active[0]?.createdAt;
  const batchDone = batchStart ? all.filter((j) => !isActiveState(j.state) && j.createdAt >= batchStart).length : 0;
  const batchTotal = active.length + batchDone;
  const progress = batchTotal ? (batchDone + active.reduce((s, j) => s + j.progress, 0)) / batchTotal : 0;
  const run = (fn: () => Promise<unknown>) => fn().catch(notifyError);

  return (
    <>
      <PageHeader
        title="Exports"
        meta={active.length ? `${active.length} in queue` : undefined}
        actions={
          <Button icon={FolderOpen} onClick={() => run(api.openOutput)}>
            Open output folder
          </Button>
        }
      />
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex max-w-[960px] flex-col gap-8 px-6 py-6">
          {isLoading ? (
            <div className="flex justify-center py-20">
              <Spinner size={18} />
            </div>
          ) : !all.length ? (
            <EmptyState className="mt-[8vh]" icon={Clapperboard} title="Nothing exported yet">
              Select beats in a project and choose Export. Videos render here one at a time while you keep working.
            </EmptyState>
          ) : null}

          {active.length > 0 && (
            <section aria-label="In progress">
              <SectionHeading
                action={
                  queued > 0 && (
                    <Button size="sm" variant="ghost" onClick={() => run(api.cancelQueued)}>
                      Cancel {queued} queued
                    </Button>
                  )
                }
              >
                In progress
              </SectionHeading>
              <div className="rounded-lg bg-bg/50 p-1 shadow-[inset_0_0_0_1px_var(--color-line)]">
                {active.length > 1 && (
                  <div className="flex items-center gap-3 px-2.5 pt-2 pb-2.5 text-xs text-fg-2">
                    <span className="tabular">
                      {batchDone} of {batchTotal} done
                    </span>
                    <ProgressBar value={progress} className="flex-1" tone="muted" />
                    <span className="tabular">{Math.round(progress * 100)}%</span>
                  </div>
                )}
                <ul aria-live="polite">
                  {active.map((j) => (
                    <JobRow key={j.id} job={j} />
                  ))}
                </ul>
              </div>
            </section>
          )}

          {failed.length > 0 && (
            <section aria-label="Failed and cancelled">
              <SectionHeading
                action={
                  <Button size="sm" variant="ghost" onClick={() => run(() => api.clearExports('failed'))}>
                    Clear
                  </Button>
                }
              >
                Needs attention
              </SectionHeading>
              <ul className="flex flex-col">
                {failed.map((j) => (
                  <JobRow key={j.id} job={j} />
                ))}
              </ul>
            </section>
          )}

          {done.length > 0 && (
            <section aria-label="Completed">
              <SectionHeading
                action={
                  <Button size="sm" variant="ghost" onClick={() => run(() => api.clearExports('completed'))}>
                    Clear list
                  </Button>
                }
              >
                Completed · {done.length}
              </SectionHeading>
              <ul className="flex flex-col">
                {done.map((j) => (
                  <JobRow key={j.id} job={j} onPlay={setPlaying} />
                ))}
              </ul>
              <p className="mt-3 px-2.5 text-xs text-fg-3">Clearing the list keeps the video files on disk.</p>
            </section>
          )}
        </div>
      </div>

      <Dialog open={!!playing} onOpenChange={(o) => !o && setPlaying(null)} title={playing?.output?.filename ?? ''} width={960}>
        {playing && (
          <video
            key={playing.id}
            src={urls.exportFile(playing.id, true)}
            controls
            autoPlay
            className="mb-4 aspect-video w-full rounded-md bg-black"
          />
        )}
      </Dialog>
    </>
  );
}
