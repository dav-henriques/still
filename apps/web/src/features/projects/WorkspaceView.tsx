import { useState } from 'react';
import { isActiveState } from '@still/shared';
import { ArrowRight, FolderPlus, Plus } from 'lucide-react';
import { Link } from 'wouter';
import { PageHeader } from '../../components/shell/PageHeader';
import { Button } from '../../components/ui/Button';
import { Spinner } from '../../components/ui/controls';
import { EmptyState, SectionHeading } from '../../components/ui/feedback';
import { useExports, useProjects } from '../../lib/queries';
import { JobRow } from '../exports/JobRow';
import { NewProjectDialog, ProjectRow } from './projectBits';

export function WorkspaceView() {
  const [creating, setCreating] = useState(false);
  const { data: projects, isLoading } = useProjects();
  const { data: jobs } = useExports();
  const active = jobs?.filter((j) => isActiveState(j.state)) ?? [];
  const recent = projects?.slice(0, 8) ?? [];

  return (
    <>
      <PageHeader
        title="Workspace"
        actions={
          <Button variant="primary" icon={Plus} onClick={() => setCreating(true)}>
            New project
          </Button>
        }
      />
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[880px] px-6 py-6">
          {isLoading ? (
            <div className="flex justify-center py-20">
              <Spinner size={18} />
            </div>
          ) : !projects?.length ? (
            <div className="mt-[8vh] rounded-xl bg-bg/40 shadow-[inset_0_0_0_1px_var(--color-line)]">
              <EmptyState
                icon={FolderPlus}
                title="Start your first project"
                action={
                  <Button variant="primary" icon={Plus} onClick={() => setCreating(true)}>
                    Create project
                  </Button>
                }
              >
                Import a batch of beats, give each one its artwork, and export them all as 1080p videos ready for YouTube.
              </EmptyState>
            </div>
          ) : (
            <div className="flex flex-col gap-8">
              {active.length > 0 && (
                <section aria-label="Exporting">
                  <SectionHeading
                    action={
                      <Link href="/exports" className="flex items-center gap-1 text-xs text-fg-2 hover:text-fg">
                        View queue <ArrowRight size={12} />
                      </Link>
                    }
                  >
                    Exporting · {active.length}
                  </SectionHeading>
                  <ul className="flex flex-col rounded-lg bg-bg/50 p-1 shadow-[inset_0_0_0_1px_var(--color-line)]">
                    {active.slice(0, 4).map((j) => (
                      <JobRow key={j.id} job={j} compact />
                    ))}
                  </ul>
                </section>
              )}
              <section aria-label="Recent projects">
                <SectionHeading
                  action={
                    projects.length > recent.length && (
                      <Link href="/projects" className="flex items-center gap-1 text-xs text-fg-2 hover:text-fg">
                        All projects <ArrowRight size={12} />
                      </Link>
                    )
                  }
                >
                  Recent projects
                </SectionHeading>
                <ul className="-mx-3 flex flex-col">
                  {recent.map((p) => (
                    <ProjectRow key={p.id} p={p} />
                  ))}
                </ul>
              </section>
            </div>
          )}
        </div>
      </div>
      <NewProjectDialog open={creating} onOpenChange={setCreating} />
    </>
  );
}
