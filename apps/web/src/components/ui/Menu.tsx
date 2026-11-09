import * as CM from '@radix-ui/react-context-menu';
import * as DM from '@radix-ui/react-dropdown-menu';
import { MoreHorizontal, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '../../lib/utils';
import { IconButton } from './Button';

export type MenuItem =
  | { type?: 'item'; label: string; icon?: LucideIcon; onSelect: () => void; danger?: boolean; disabled?: boolean; shortcut?: string }
  | { type: 'separator' };

const contentCls = 'glass z-50 min-w-[200px] rounded-lg p-1 outline-none data-[state=open]:animate-pop-in';
const itemCls =
  'flex h-7 cursor-default items-center gap-2.5 rounded-[5px] px-2 text-sm text-fg outline-none select-none data-[disabled]:text-fg-3 data-[highlighted]:bg-white/[0.08]';

function Items({ items, kind }: { items: MenuItem[]; kind: 'dropdown' | 'context' }) {
  const Item = kind === 'dropdown' ? DM.Item : CM.Item;
  const Sep = kind === 'dropdown' ? DM.Separator : CM.Separator;
  return (
    <>
      {items.map((it, i) =>
        it.type === 'separator' ? (
          <Sep key={i} className="mx-1 my-1 h-px bg-line" />
        ) : (
          <Item key={i} disabled={it.disabled} onSelect={it.onSelect} className={cn(itemCls, it.danger && 'text-danger data-[highlighted]:bg-danger-soft')}>
            {it.icon && <it.icon size={14} strokeWidth={1.75} className={it.danger ? '' : 'text-fg-2'} aria-hidden />}
            <span className="flex-1">{it.label}</span>
            {it.shortcut && <span className="text-xs text-fg-3">{it.shortcut}</span>}
          </Item>
        ),
      )}
    </>
  );
}

export function DropdownMenu({ items, label = 'More actions', trigger, align = 'end' }: { items: MenuItem[]; label?: string; trigger?: ReactNode; align?: 'start' | 'end' }) {
  return (
    <DM.Root modal={false}>
      <DM.Trigger asChild>{trigger ?? <IconButton icon={MoreHorizontal} label={label} size="sm" onClick={(e) => e.stopPropagation()} />}</DM.Trigger>
      <DM.Portal>
        <DM.Content align={align} sideOffset={4} className={contentCls} onClick={(e) => e.stopPropagation()}>
          <Items items={items} kind="dropdown" />
        </DM.Content>
      </DM.Portal>
    </DM.Root>
  );
}

export function ContextMenu({ items, children }: { items: MenuItem[]; children: ReactNode }) {
  return (
    <CM.Root modal={false}>
      <CM.Trigger asChild>{children}</CM.Trigger>
      <CM.Portal>
        <CM.Content className={contentCls}>
          <Items items={items} kind="context" />
        </CM.Content>
      </CM.Portal>
    </CM.Root>
  );
}
