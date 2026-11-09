import { forwardRef, useId, type InputHTMLAttributes, type ReactNode } from 'react';
import { Check, Minus } from 'lucide-react';
import { cn } from '../../lib/utils';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...rest }, ref) {
  return (
    <input
      ref={ref}
      className={cn(
        'h-8 w-full rounded-md bg-bg-2 px-2.5 text-sm text-fg placeholder:text-fg-3 shadow-[inset_0_0_0_1px_var(--color-line-2)] transition-shadow duration-100 outline-none focus:shadow-[inset_0_0_0_1px_var(--color-accent),0_0_0_3px_var(--color-accent-soft)] disabled:text-fg-3',
        className,
      )}
      spellCheck={false}
      {...rest}
    />
  );
});

export function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: (id: string) => ReactNode }) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-xs font-medium text-fg-2">
        {label}
      </label>
      {children(id)}
      {hint && <p className="text-xs text-fg-3">{hint}</p>}
    </div>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
  size = 'md',
}: {
  value: T;
  options: { value: T; label: string; title?: string }[];
  onChange: (v: T) => void;
  label: string;
  size?: 'sm' | 'md';
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-md bg-bg-2 p-0.5 shadow-[inset_0_0_0_1px_var(--color-line)]">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            title={o.title}
            onClick={() => onChange(o.value)}
            onKeyDown={(e) => {
              const i = options.findIndex((x) => x.value === value);
              if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
                e.preventDefault();
                const next = options[(i + (e.key === 'ArrowRight' ? 1 : options.length - 1)) % options.length]!;
                onChange(next.value);
              }
            }}
            tabIndex={active ? 0 : -1}
            className={cn(
              'rounded-[5px] font-medium transition-colors duration-100',
              size === 'sm' ? 'h-6 px-2.5 text-xs' : 'h-7 px-3 text-xs',
              active ? 'bg-surface-3 text-fg shadow-[0_1px_2px_rgba(0,0,0,0.4)]' : 'text-fg-2 hover:text-fg',
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function Checkbox({
  checked,
  indeterminate,
  onChange,
  label,
  className,
}: {
  checked: boolean;
  indeterminate?: boolean;
  onChange: (checked: boolean, shift: boolean) => void;
  label: string;
  className?: string;
}) {
  const on = checked || indeterminate;
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={indeterminate ? 'mixed' : checked}
      aria-label={label}
      onClick={(e) => {
        e.stopPropagation();
        onChange(!checked, e.shiftKey);
      }}
      className={cn(
        'inline-flex size-4 shrink-0 items-center justify-center rounded-[4px] transition-colors duration-100',
        on ? 'bg-accent text-[#140a05]' : 'shadow-[inset_0_0_0_1.5px_rgba(255,255,255,0.22)] hover:shadow-[inset_0_0_0_1.5px_rgba(255,255,255,0.4)]',
        className,
      )}
    >
      {indeterminate ? <Minus size={11} strokeWidth={3} /> : checked ? <Check size={11} strokeWidth={3} /> : null}
    </button>
  );
}

export function Range({
  value,
  min,
  max,
  step,
  onChange,
  label,
  className,
  onCommit,
}: {
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  onCommit?: () => void;
  label: string;
  className?: string;
}) {
  const fill = ((value - min) / (max - min)) * 100;
  return (
    <input
      type="range"
      aria-label={label}
      className={cn('still-range w-full', className)}
      min={min}
      max={max}
      step={step}
      value={value}
      style={{ '--fill': `${fill}%` } as React.CSSProperties}
      onChange={(e) => onChange(Number(e.target.value))}
      onPointerUp={onCommit}
      onKeyUp={onCommit}
    />
  );
}

export function ProgressBar({ value, className, tone = 'accent' }: { value: number; className?: string; tone?: 'accent' | 'muted' | 'danger' }) {
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(value * 100)}
      className={cn('h-[3px] overflow-hidden rounded-full bg-white/[0.08]', className)}
    >
      <div
        className={cn(
          'h-full rounded-full transition-[width] duration-200 ease-out',
          tone === 'accent' ? 'bg-accent' : tone === 'danger' ? 'bg-danger' : 'bg-fg-3',
        )}
        style={{ width: `${Math.max(0, Math.min(1, value)) * 100}%` }}
      />
    </div>
  );
}

export function Spinner({ size = 14, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" className={cn('animate-spin text-fg-2', className)} aria-hidden>
      <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeOpacity="0.2" strokeWidth="2" />
      <path d="M14 8a6 6 0 0 0-6-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-[4px] bg-white/[0.06] px-1 font-sans text-2xs text-fg-2 shadow-[inset_0_-1px_0_rgba(255,255,255,0.06)]">
      {children}
    </kbd>
  );
}
