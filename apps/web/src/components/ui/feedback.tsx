import { useEffect, useState, type ReactNode } from 'react';
import { AlertCircle, Info, X, type LucideIcon } from 'lucide-react';
import { useDialogs, useToasts } from '../../stores/ui';
import { cn } from '../../lib/utils';
import { Button, IconButton } from './Button';
import { Input } from './controls';
import { Dialog } from './Dialog';

export function Toaster() {
  const { toasts, dismiss } = useToasts();
  return (
    <div aria-live="polite" role="status" className="pointer-events-none fixed right-4 bottom-4 z-[60] flex w-[360px] max-w-[calc(100vw-32px)] flex-col gap-2">
      {toasts.map((t) => (
        <div key={t.id} className="glass pointer-events-auto flex items-start gap-3 rounded-lg px-3.5 py-3 animate-toast-in">
          {t.kind === 'error' ? (
            <AlertCircle size={16} className="mt-px shrink-0 text-danger" strokeWidth={1.75} />
          ) : (
            <Info size={16} className="mt-px shrink-0 text-fg-2" strokeWidth={1.75} />
          )}
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">{t.title}</p>
            {t.detail && <p className="mt-0.5 text-xs break-words text-fg-2">{t.detail}</p>}
          </div>
          <IconButton icon={X} label="Dismiss" size="sm" className="-mt-0.5 -mr-1" onClick={() => dismiss(t.id)} />
        </div>
      ))}
    </div>
  );
}

/** Renders the imperative confirm()/prompt() requests from the ui store. */
export function DialogHost() {
  const { current, close } = useDialogs();
  const [value, setValue] = useState('');
  useEffect(() => {
    if (current?.kind === 'prompt') setValue(current.initial);
  }, [current]);
  if (!current) return null;

  const finish = (result: boolean) => {
    if (current.kind === 'confirm') current.resolve(result);
    else current.resolve(result && value.trim() ? value.trim() : null);
    close();
  };

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && finish(false)}
      title={current.title}
      description={current.kind === 'confirm' ? current.message : undefined}
      width={420}
      footer={
        <>
          <Button variant="ghost" onClick={() => finish(false)}>
            Cancel
          </Button>
          <Button
            variant={current.kind === 'confirm' && current.danger ? 'danger' : 'primary'}
            disabled={current.kind === 'prompt' && !value.trim()}
            onClick={() => finish(true)}
            autoFocus={current.kind === 'confirm'}
          >
            {current.confirmLabel ?? (current.kind === 'confirm' ? 'Confirm' : 'Save')}
          </Button>
        </>
      }
    >
      {current.kind === 'prompt' && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (value.trim()) finish(true);
          }}
        >
          <label className="mb-1.5 block text-xs font-medium text-fg-2" htmlFor="still-prompt">
            {current.label}
          </label>
          <Input id="still-prompt" autoFocus value={value} onChange={(e) => setValue(e.target.value)} onFocus={(e) => e.target.select()} maxLength={200} />
        </form>
      )}
    </Dialog>
  );
}

export function EmptyState({ icon: Icon, title, children, action, className }: { icon: LucideIcon; title: string; children?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cn('flex flex-col items-center justify-center px-6 py-16 text-center', className)}>
      <div className="mb-4 flex size-11 items-center justify-center rounded-lg bg-surface shadow-[inset_0_0_0_1px_var(--color-line)]">
        <Icon size={20} strokeWidth={1.5} className="text-fg-2" aria-hidden />
      </div>
      <h2 className="text-base font-medium">{title}</h2>
      {children && <div className="mt-1.5 max-w-[340px] text-sm text-fg-2">{children}</div>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function SectionHeading({ children, action, className }: { children: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cn('mb-2 flex h-7 items-center justify-between', className)}>
      <h2 className="text-xs font-medium tracking-[0.02em] text-fg-2">{children}</h2>
      {action}
    </div>
  );
}
