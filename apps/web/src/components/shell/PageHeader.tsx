import type { ReactNode } from 'react';
import { cn } from '../../lib/utils';

/** Compact top bar shared by every view. */
export function PageHeader({ title, meta, actions, leading, className }: { title: ReactNode; meta?: ReactNode; actions?: ReactNode; leading?: ReactNode; className?: string }) {
  return (
    <header className={cn('flex h-14 shrink-0 items-center gap-3 px-6 shadow-[inset_0_-1px_0_var(--color-line)]', className)}>
      {leading}
      <div className="flex min-w-0 items-baseline gap-3">
        <h1 className="truncate text-[15px] font-semibold tracking-[-0.015em]">{title}</h1>
        {meta && <div className="tabular truncate text-xs text-fg-3">{meta}</div>}
      </div>
      <div className="ml-auto flex shrink-0 items-center gap-2">{actions}</div>
    </header>
  );
}
