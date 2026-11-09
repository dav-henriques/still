import { useMemo, useState } from 'react';
import { FolderPlus, LayoutGrid, List, Plus, Search } from 'lucide-react';
import { PageHeader } from '../../components/shell/PageHeader';
import { Button, IconButton } from '../../components/ui/Button';
import { Input, Spinner } from '../../components/ui/controls';
import { EmptyState } from '../../components/ui/feedback';
import { useProjects, useSettings, useSettingsMutation } from '../../lib/queries';
import { NewProjectDialog, ProjectRow, ProjectTile } from './projectBits';

export function ProjectsView() {
  const [creating, setCreating] = useState(false);
  const [query, setQuery] = useState('');
  const { data: projects, isLoading } = useProjects();
  const { data: settings } = useSettings();
  const saveSettings = useSettingsMutation();
  const view = settings?.projectView ?? 'list';
  const filtered = useMemo(
    () => projects?.filter((p) => p.name.toLowerCase().includes(query.trim().toLowerCase())) ?? [],
    [projects, query],
  );

  return (
    <>
      <PageHeader
        title="Projects"
        meta={projects?.length ? `${projects.length}` : undefined}
        actions={
          <>
            {!!projects?.length && (
              <>
                <div className="relative w-[220px]">
                  <Search size={14} className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-fg-3" aria-hidden />
                  <Input placeholder="Filter projects" aria-label="Filter projects" value={query} onChange={(e) => setQuery(e.target.value)} className="pl-8" />
                </div>
                <div className="flex rounded-md bg-bg p-0.5 shadow-[inset_0_0_0_1px_var(--color-line)]">
                  <IconButton icon={List} label="List view" size="sm" active={view === 'list'} onClick={() => saveSettings.mutate({ projectView: 'list' })} />
                  <IconButton icon={LayoutGrid} label="Grid view" size="sm" active={view === 'grid'} onClick={() => saveSettings.mutate({ projectView: 'grid' })} />
                </div>
              </>
            )}
            <Button variant="primary" icon={Plus} onClick={() => setCreating(true)}>
              New project
            </Button>
          </>
        }
      />
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[1200px] px-6 py-5">
          {isLoading ? (
            <div className="flex justify-center py-20">
              <Spinner size={18} />
            </div>
          ) : !projects?.length ? (
            <EmptyState
              className="mt-[8vh]"
              icon={FolderPlus}
              title="No projects yet"
              action={
                <Button variant="primary" icon={Plus} onClick={() => setCreating(true)}>
                  Create project
                </Button>
              }
            >
              Projects group beats that you export together.
            </EmptyState>
          ) : !filtered.length ? (
            <p className="py-16 text-center text-sm text-fg-3">No projects match “{query}”.</p>
          ) : view === 'grid' ? (
            <ul className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-3">
              {filtered.map((p) => (
                <ProjectTile key={p.id} p={p} />
              ))}
            </ul>
          ) : (
            <ul className="-mx-3 flex flex-col">
              {filtered.map((p) => (
                <ProjectRow key={p.id} p={p} />
              ))}
            </ul>
          )}
        </div>
      </div>
      <NewProjectDialog open={creating} onOpenChange={setCreating} />
    </>
  );
}
