import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '../../lib/utils';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md';

const variants: Record<Variant, string> = {
  primary: 'bg-accent text-[#140a05] hover:bg-accent-hover font-medium disabled:bg-surface-2 disabled:text-fg-3',
  secondary: 'bg-surface-2 text-fg hover:bg-surface-3 shadow-[inset_0_0_0_1px_var(--color-line)] disabled:text-fg-3 disabled:hover:bg-surface-2',
  ghost: 'text-fg-2 hover:text-fg hover:bg-white/[0.06] disabled:text-fg-3 disabled:hover:bg-transparent',
  danger: 'bg-danger-soft text-danger hover:bg-danger/20 font-medium',
};

const sizes: Record<Size, string> = {
  sm: 'h-7 px-2.5 gap-1.5 text-xs rounded-sm',
  md: 'h-8 px-3 gap-2 text-sm rounded-md',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  icon?: LucideIcon;
  trailing?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', icon: Icon, trailing, className, children, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(
        'inline-flex shrink-0 items-center justify-center whitespace-nowrap transition-colors duration-100 select-none disabled:pointer-events-none',
        variants[variant],
        sizes[size],
        className,
      )}
      {...rest}
    >
      {Icon && <Icon size={size === 'sm' ? 14 : 15} strokeWidth={1.75} className="-ml-0.5 shrink-0" aria-hidden />}
      {children}
      {trailing}
    </button>
  );
});

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: LucideIcon;
  label: string;
  size?: 'sm' | 'md' | 'lg';
  active?: boolean;
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { icon: Icon, label, size = 'md', active, className, type = 'button', ...rest },
  ref,
) {
  const box = size === 'sm' ? 'size-6' : size === 'md' ? 'size-7' : 'size-9';
  const iconSize = size === 'sm' ? 14 : size === 'md' ? 16 : 18;
  return (
    <button
      ref={ref}
      type={type}
      aria-label={label}
      title={rest.title ?? label}
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-sm text-fg-2 transition-colors duration-100 hover:bg-white/[0.07] hover:text-fg disabled:pointer-events-none disabled:opacity-40',
        active && 'bg-white/[0.07] text-fg',
        box,
        className,
      )}
      {...rest}
    >
      <Icon size={iconSize} strokeWidth={1.75} aria-hidden />
    </button>
  );
});
