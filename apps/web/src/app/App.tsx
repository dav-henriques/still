import { WifiOff } from 'lucide-react';
import { Route, Switch } from 'wouter';
import { Sidebar } from '../components/shell/Sidebar';
import { DialogHost, Toaster } from '../components/ui/feedback';
import { EditorView } from '../features/editor/EditorView';
import { ExportsView } from '../features/exports/ExportsView';
import { ProjectView } from '../features/audio/ProjectView';
import { ProjectsView } from '../features/projects/ProjectsView';
import { WorkspaceView } from '../features/projects/WorkspaceView';
import { SettingsView } from '../features/settings/SettingsView';
import { useHealth, useServerEvents } from '../lib/queries';

export function App() {
  useServerEvents();
  const health = useHealth();

  return (
    <div className="flex h-full">
      <Sidebar />
      <main className="relative flex min-w-0 flex-1 flex-col bg-bg-2 shadow-[inset_1px_0_0_var(--color-line)]">
        {health.isError && (
          <div role="alert" className="flex h-9 shrink-0 items-center gap-2 bg-danger-soft px-4 text-xs text-danger">
            <WifiOff size={14} strokeWidth={1.75} />
            The still engine isn't responding. Start it with <code className="rounded bg-black/30 px-1">npm start</code> — reconnecting automatically.
          </div>
        )}
        <Switch>
          <Route path="/" component={WorkspaceView} />
          <Route path="/projects" component={ProjectsView} />
          <Route path="/projects/:projectId/beats/:beatId">{(p) => <EditorView key={p.projectId} projectId={p.projectId} beatId={p.beatId} />}</Route>
          <Route path="/projects/:projectId">{(p) => <ProjectView key={p.projectId} projectId={p.projectId} />}</Route>
          <Route path="/exports" component={ExportsView} />
          <Route path="/settings" component={SettingsView} />
          <Route>
            <div className="p-10 text-fg-2">Page not found.</div>
          </Route>
        </Switch>
      </main>
      <Toaster />
      <DialogHost />
    </div>
  );
}
