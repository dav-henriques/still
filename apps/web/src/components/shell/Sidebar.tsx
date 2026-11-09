import { APP_SIGNATURE } from '@still/shared';
import { Clapperboard, FolderClosed, LayoutGrid, PanelLeftClose, PanelLeftOpen, Settings } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useLocation } from 'wouter';
import { useExports, useHealth, useSystem } from '../../lib/queries';
import { cn } from '../../lib/utils';
import { useUi } from '../../stores/ui';

const NAV = [
  { href: '/', label: 'Workspace', icon: LayoutGrid, match: (p: string) => p === '/' },
  { href: '/projects', label: 'Projects', icon: FolderClosed, match: (p: string) => p.startsWith('/projects') },
  { href: '/exports', label: 'Exports', icon: Clapperboard, match: (p: string) => p.startsWith('/exports') },
  { href: '/settings', label: 'Settings', icon: Settings, match: (p: string) => p.startsWith('/settings') },
];

export function Sidebar() {
  const [path] = useLocation();
  const { sidebarCollapsed, setSidebarCollapsed } = useUi();
  // Narrow windows fold to the rail without changing the saved preference.
  const narrow = useNarrow();
  const [expandedWhileNarrow, setExpandedWhileNarrow] = useState(false);
  const collapsed = narrow ? !expandedWhileNarrow : sidebarCollapsed;
  const toggle = () => (narrow ? setExpandedWhileNarrow(!expandedWhileNarrow) : setSidebarCollapsed(!sidebarCollapsed));
  const { data: jobs } = useExports();
  const active = jobs?.filter((j) => j.state === 'queued' || j.state === 'preparing' || j.state === 'rendering') ?? [];
  const batchProgress = active.length ? active.reduce((s, j) => s + j.progress, 0) / active.length : 0;

  return (
    <aside
      className={cn(
        'flex shrink-0 flex-col bg-bg transition-[width] duration-200 ease-out',
        collapsed ? 'w-[56px]' : 'w-[228px]',
      )}
      aria-label="Main"
    >
      <div className={cn('flex h-14 items-center', collapsed ? 'justify-center' : 'px-5')}>
        {collapsed ? (
          <span className="text-[17px] font-semibold tracking-[-0.04em]" aria-label="still">
            s<span className="text-accent">.</span>
          </span>
        ) : (
          <div className="flex items-baseline gap-2">
            <span className="text-[19px] leading-none font-semibold tracking-[-0.045em]">still</span>
            <span className="text-2xs leading-none tracking-[0.02em] text-fg-3">{APP_SIGNATURE}</span>
          </div>
        )}
      </div>

      <nav className={cn('flex flex-col gap-0.5', collapsed ? 'px-2' : 'px-3')}>
        {NAV.map((item) => {
          const isActive = item.match(path);
          const showBadge = item.href === '/exports' && active.length > 0;
          return (
            <Link
              key={item.href}
              href={item.href}
              title={collapsed ? item.label : undefined}
              aria-current={isActive ? 'page' : undefined}
              className={cn(
                'group relative flex h-8 items-center gap-3 rounded-md text-sm transition-colors duration-100',
                collapsed ? 'justify-center' : 'px-2.5',
                isActive ? 'bg-white/[0.07] text-fg' : 'text-fg-2 hover:bg-white/[0.04] hover:text-fg',
              )}
            >
              <item.icon size={16} strokeWidth={1.75} className={isActive ? 'text-fg' : 'text-fg-2 group-hover:text-fg'} aria-hidden />
              {!collapsed && <span className="flex-1">{item.label}</span>}
              {showBadge &&
                (collapsed ? (
                  <span className="absolute top-1.5 right-1.5 size-1.5 rounded-full bg-accent" aria-label={`${active.length} exporting`} />
                ) : (
                  <span className="tabular rounded-full bg-accent-soft px-1.5 text-2xs leading-[18px] font-medium text-accent">{active.length}</span>
                ))}
            </Link>
          );
        })}
      </nav>

      {active.length > 0 && !collapsed && (
        <Link href="/exports" className="mx-3 mt-4 rounded-md bg-bg-2 px-3 py-2.5 shadow-[inset_0_0_0_1px_var(--color-line)] hover:bg-surface">
          <div className="flex items-center justify-between text-xs">
            <span className="text-fg-2">Rendering</span>
            <span className="tabular text-fg-2">{Math.round(batchProgress * 100)}%</span>
          </div>
          <div className="mt-2 h-[3px] overflow-hidden rounded-full bg-white/[0.08]">
            <div className="h-full bg-accent transition-[width] duration-200" style={{ width: `${batchProgress * 100}%` }} />
          </div>
        </Link>
      )}

      <div className="mt-auto flex flex-col gap-1 p-3">
        <EngineStatus collapsed={collapsed} />
        <button
          type="button"
          onClick={toggle}
          className={cn('flex h-8 items-center gap-3 rounded-md text-sm text-fg-3 hover:bg-white/[0.04] hover:text-fg-2', collapsed ? 'justify-center' : 'px-2.5')}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? <PanelLeftOpen size={16} strokeWidth={1.75} /> : <PanelLeftClose size={16} strokeWidth={1.75} />}
          {!collapsed && <span>Collapse</span>}
        </button>
      </div>
    </aside>
  );
}

function EngineStatus({ collapsed }: { collapsed: boolean }) {
  const health = useHealth();
  const system = useSystem();
  const offline = health.isError;
  const notReady = !offline && system.data && !system.data.ready;
  const label = offline ? 'Engine offline' : notReady ? 'FFmpeg missing' : 'Engine ready';
  return (
    <Link
      href="/settings"
      title={label}
      className={cn('flex h-8 items-center gap-3 rounded-md text-xs text-fg-3 hover:bg-white/[0.04] hover:text-fg-2', collapsed ? 'justify-center' : 'px-2.5')}
    >
      <span className="flex size-4 items-center justify-center">
        <span className={cn('size-1.5 rounded-full', offline || notReady ? 'bg-danger' : 'bg-ok/80')} />
      </span>
      {!collapsed && <span>{label}</span>}
    </Link>
  );
}

function useNarrow() {
  const query = '(max-width: 1100px)';
  const [narrow, setNarrow] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setNarrow(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return narrow;
}
