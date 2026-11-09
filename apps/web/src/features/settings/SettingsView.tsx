import { useEffect, useState, type ReactNode } from 'react';
import { APP_NAME, APP_SIGNATURE, APP_VERSION, formatBytes, QUALITY_PRESETS, type BinaryStatus, type Quality } from '@still/shared';
import { useMutation } from '@tanstack/react-query';
import { Check, FolderOpen, RefreshCw, X } from 'lucide-react';
import { PageHeader } from '../../components/shell/PageHeader';
import { Button } from '../../components/ui/Button';
import { Input, Segmented, Spinner } from '../../components/ui/controls';
import { api } from '../../lib/api';
import { keys, queryClient, useSettings, useSettingsMutation, useSystem } from '../../lib/queries';
import { cn } from '../../lib/utils';
import { notify, notifyError, useUi } from '../../stores/ui';

function Card({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <section className="rounded-lg bg-bg/50 shadow-[inset_0_0_0_1px_var(--color-line)]">
      <div className="px-5 pt-4 pb-1">
        <h2 className="text-sm font-semibold">{title}</h2>
        {description && <p className="mt-0.5 text-xs text-fg-3">{description}</p>}
      </div>
      <div className="divide-y divide-line px-5">{children}</div>
    </section>
  );
}

function SettingRow({ label, hint, children, stack }: { label: string; hint?: ReactNode; children: ReactNode; stack?: boolean }) {
  return (
    <div className={cn('flex gap-6 py-3.5', stack ? 'flex-col gap-2.5' : 'items-center justify-between')}>
      <div className="min-w-0">
        <p className="text-sm">{label}</p>
        {hint && <p className="mt-0.5 text-xs text-fg-3">{hint}</p>}
      </div>
      <div className={cn('flex items-center gap-2', stack ? 'w-full' : 'shrink-0')}>{children}</div>
    </div>
  );
}

function PathText({ children }: { children: string }) {
  return (
    <code className="min-w-0 flex-1 truncate rounded-md bg-black/40 px-2.5 py-1.5 font-mono text-2xs text-fg-2 select-text" title={children}>
      {children}
    </code>
  );
}

function BinaryRow({ name, status, configured, onSave }: { name: string; status: BinaryStatus | undefined; configured: string | null; onSave: (p: string | null) => void }) {
  const [value, setValue] = useState(configured ?? '');
  useEffect(() => setValue(configured ?? ''), [configured]);
  const source = { settings: 'custom path', env: 'environment variable', path: 'system PATH', bundled: 'bundled with still' } as const;
  return (
    <SettingRow
      stack
      label={name}
      hint={
        status?.available ? (
          <span className="flex items-center gap-1.5">
            <Check size={12} className="text-ok" /> Version {status.version} · {status.source && source[status.source]}
          </span>
        ) : (
          <span className="flex items-center gap-1.5 text-danger">
            <X size={12} /> Not found
          </span>
        )
      }
    >
      <Input
        placeholder={status?.path ?? `Path to ${name.toLowerCase()}.exe (optional)`}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        aria-label={`${name} path`}
        className="font-mono text-xs"
      />
      <Button size="sm" disabled={value === (configured ?? '')} onClick={() => onSave(value.trim() || null)}>
        Save
      </Button>
    </SettingRow>
  );
}

export function SettingsView() {
  const { data: settings } = useSettings();
  const { data: system, isFetching } = useSystem();
  const save = useSettingsMutation();
  const { sidebarCollapsed, setSidebarCollapsed } = useUi();
  const [outputDraft, setOutputDraft] = useState('');
  useEffect(() => setOutputDraft(settings?.outputDir ?? ''), [settings?.outputDir]);

  const refresh = () => api.system(true).then((s) => queryClient.setQueryData(keys.system, s), notifyError);
  const pick = useMutation({
    mutationFn: api.pickFolder,
    onSuccess: ({ path }) => path && save.mutate({ outputDir: path }),
  });
  const cleanup = useMutation({
    mutationFn: api.cleanupTemp,
    onSuccess: ({ freed }) => {
      notify(freed ? `Freed ${formatBytes(freed)}` : 'Nothing to clean up');
      void queryClient.invalidateQueries({ queryKey: keys.system });
    },
  });

  if (!settings || !system) {
    return (
      <>
        <PageHeader title="Settings" />
        <div className="flex flex-1 items-center justify-center">
          <Spinner size={18} />
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader title="Settings" />
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex max-w-[760px] flex-col gap-5 px-6 py-6">
          <Card title="Export">
            <SettingRow label="Default quality" hint="Used for new projects. Each project can override it.">
              <Segmented
                label="Default quality"
                size="sm"
                value={settings.defaultQuality}
                onChange={(defaultQuality) => save.mutate({ defaultQuality })}
                options={(Object.keys(QUALITY_PRESETS) as Quality[]).map((k) => ({ value: k, label: QUALITY_PRESETS[k].label, title: QUALITY_PRESETS[k].hint }))}
              />
            </SettingRow>
            <SettingRow
              stack
              label="Output folder"
              hint={
                <>
                  Videos are saved to <span className="text-fg-2">&lt;folder&gt;\&lt;project name&gt;\&lt;beat name&gt;.mp4</span>. Existing files are never overwritten.
                  {!settings.outputDir && ' Currently using the managed folder inside still’s data directory.'}
                </>
              }
            >
              <form
                className="flex w-full items-center gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  save.mutate({ outputDir: outputDraft.trim() || null });
                }}
              >
                <Input
                  aria-label="Output folder path"
                  className="font-mono text-xs"
                  placeholder={system.exportsDir}
                  value={outputDraft}
                  onChange={(e) => setOutputDraft(e.target.value)}
                />
                {outputDraft !== (settings.outputDir ?? '') ? (
                  <Button size="sm" type="submit" variant="primary">
                    Save
                  </Button>
                ) : (
                  system.platform === 'win32' && (
                    <Button size="sm" onClick={() => pick.mutate()} disabled={pick.isPending}>
                      {pick.isPending ? 'Choosing…' : 'Browse…'}
                    </Button>
                  )
                )}
                <Button size="sm" variant="ghost" icon={FolderOpen} onClick={() => api.openOutput().catch(notifyError)} title="Open in Explorer">
                  Open
                </Button>
                {settings.outputDir && (
                  <Button size="sm" variant="ghost" onClick={() => save.mutate({ outputDir: null })}>
                    Use default
                  </Button>
                )}
              </form>
            </SettingRow>
          </Card>

          <Card title="Interface">
            <SettingRow label="Project view" hint="How the Projects page lists your work.">
              <Segmented
                label="Project view"
                size="sm"
                value={settings.projectView}
                onChange={(projectView) => save.mutate({ projectView })}
                options={[
                  { value: 'list', label: 'List' },
                  { value: 'grid', label: 'Grid' },
                ]}
              />
            </SettingRow>
            <SettingRow label="Sidebar" hint="Collapse to an icon rail for more room. Small windows collapse it automatically.">
              <Segmented
                label="Sidebar"
                size="sm"
                value={sidebarCollapsed ? 'collapsed' : 'expanded'}
                onChange={(v) => setSidebarCollapsed(v === 'collapsed')}
                options={[
                  { value: 'expanded', label: 'Expanded' },
                  { value: 'collapsed', label: 'Icons only' },
                ]}
              />
            </SettingRow>
          </Card>

          <Card title="Processing" description="still renders with native FFmpeg on this computer. Nothing is uploaded anywhere.">
            <div className="flex items-center justify-between py-3.5">
              <p className="flex items-center gap-2 text-sm">
                <span className={cn('size-2 rounded-full', system.ready ? 'bg-ok' : 'bg-danger')} />
                {system.ready ? 'Ready to render' : 'Rendering unavailable'}
              </p>
              <Button size="sm" variant="ghost" icon={RefreshCw} onClick={refresh} disabled={isFetching}>
                Detect again
              </Button>
            </div>
            <BinaryRow name="FFmpeg" status={system.ffmpeg} configured={settings.ffmpegPath} onSave={(ffmpegPath) => save.mutate({ ffmpegPath })} />
            <BinaryRow name="FFprobe" status={system.ffprobe} configured={settings.ffprobePath} onSave={(ffprobePath) => save.mutate({ ffprobePath })} />
            {!system.ready && (
              <div className="py-3.5 text-xs text-fg-2">
                <p className="font-medium text-fg">Installing FFmpeg on Windows</p>
                <ol className="mt-1.5 list-decimal space-y-1 pl-4">
                  <li>
                    Run <code className="rounded bg-black/40 px-1 font-mono">winget install Gyan.FFmpeg</code> in a terminal, or download a build from ffmpeg.org.
                  </li>
                  <li>Restart still so it picks up the new PATH — or paste the full path to ffmpeg.exe and ffprobe.exe above.</li>
                  <li>
                    Alternatively run <code className="rounded bg-black/40 px-1 font-mono">npm install</code> again to restore the bundled binaries.
                  </li>
                </ol>
              </div>
            )}
          </Card>

          <Card title="Storage">
            <SettingRow stack label="Projects" hint="Imported audio, artwork and project files.">
              <PathText>{system.projectsDir}</PathText>
            </SettingRow>
            <SettingRow stack label="Managed exports" hint="Default output when no custom folder is set.">
              <PathText>{system.exportsDir}</PathText>
            </SettingRow>
            <SettingRow label="Temporary files" hint={<span className="tabular">{formatBytes(system.tempBytes)} in use · leftovers from interrupted imports or renders</span>}>
              <Button size="sm" onClick={() => cleanup.mutate()} disabled={cleanup.isPending || system.tempBytes === 0}>
                Clean up
              </Button>
            </SettingRow>
          </Card>

          <section className="flex items-end justify-between px-1 pt-2 pb-6 text-xs text-fg-3">
            <div>
              <p className="text-[15px] font-semibold tracking-[-0.04em] text-fg">{APP_NAME}</p>
              <p>{APP_SIGNATURE}</p>
            </div>
            <p className="tabular">Version {APP_VERSION}</p>
          </section>
        </div>
      </div>
    </>
  );
}
