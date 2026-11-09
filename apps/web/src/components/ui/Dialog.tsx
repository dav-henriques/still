import * as RD from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '../../lib/utils';
import { IconButton } from './Button';

export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  width = 440,
  className,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  width?: number;
  className?: string;
}) {
  return (
    <RD.Root open={open} onOpenChange={onOpenChange}>
      <RD.Portal>
        <RD.Overlay className="fixed inset-0 z-40 bg-black/55 data-[state=open]:animate-fade-in" />
        <RD.Content
          className={cn(
            'glass fixed top-1/2 left-1/2 z-50 flex max-h-[85vh] -translate-x-1/2 -translate-y-1/2 flex-col rounded-xl outline-none data-[state=open]:animate-dialog-in',
            className,
          )}
          style={{ width: `min(${width}px, calc(100vw - 32px))` }}
        >
          <div className="flex items-start justify-between gap-4 px-5 pt-4 pb-1">
            <div className="min-w-0">
              <RD.Title className="text-base font-semibold tracking-[-0.01em]">{title}</RD.Title>
              {description ? (
                <RD.Description className="mt-1 text-sm text-fg-2">{description}</RD.Description>
              ) : (
                <RD.Description className="sr-only">{title}</RD.Description>
              )}
            </div>
            <RD.Close asChild>
              <IconButton icon={X} label="Close" size="sm" className="-mt-0.5 -mr-1.5" />
            </RD.Close>
          </div>
          {children && <div className="min-h-0 overflow-y-auto px-5 pt-3 pb-1">{children}</div>}
          {footer && <div className="flex items-center justify-end gap-2 px-5 pt-4 pb-4">{footer}</div>}
        </RD.Content>
      </RD.Portal>
    </RD.Root>
  );
}
