'use client';

import { Loader2, Search, X, type LucideIcon } from 'lucide-react';
import { forwardRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode } from 'react';

/** Soft continuous-corner card — Apple Settings group feel. */
export const adminSurface =
  'overflow-hidden rounded-3xl border-0 bg-card shadow-[0_1px_2px_rgba(15,23,42,0.04),0_0_0_1px_rgba(15,23,42,0.08)]';

export const adminSurfacePad = 'px-5 py-5 sm:px-6 sm:py-6';

export const adminPageStack = 'mx-auto flex w-full min-w-0 max-w-7xl flex-col gap-5 sm:gap-6';

export const adminSectionTitle =
  'text-xl font-semibold tracking-tight text-foreground sm:text-2xl';

export const adminMuted = 'text-sm leading-relaxed text-muted-foreground';

export const adminTh =
  'whitespace-nowrap border-b border-border/80 bg-transparent px-4 py-3.5 text-left text-[11px] font-semibold uppercase tracking-[0.07em] text-muted-foreground sm:px-5';

export const adminTd =
  'border-b border-border/50 px-4 py-3.5 text-sm text-foreground sm:px-5';

export const adminField =
  'h-10 w-full rounded-[10px] border border-black/10 bg-white/90 px-3 text-sm text-foreground outline-none placeholder:text-muted-foreground/80 transition-[border-color,box-shadow,background-color] hover:border-black/18 focus-visible:border-primary focus-visible:ring-[4px] focus-visible:ring-primary/20 disabled:opacity-60';

export const adminSelect = `${adminField} dark:scheme-dark`;

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  icon?: LucideIcon;
};

/** Outline primary. */
export const AdminOutlineButton = forwardRef<HTMLButtonElement, BtnProps>(
  function AdminOutlineButton({ icon: Icon, className = '', children, type = 'button', ...props }, ref) {
    return (
      <button
        ref={ref}
        type={type}
        className={`inline-flex h-9 items-center justify-center gap-2 rounded-full border border-primary/30 bg-card px-4 text-sm font-medium text-primary transition-colors hover:bg-primary/6 disabled:opacity-50 ${className}`}
        {...props}
      >
        {Icon ? <Icon size={15} strokeWidth={1.75} /> : null}
        {children}
      </button>
    );
  }
);

/** Filled primary for rare strong CTAs. */
export const AdminPrimaryButton = forwardRef<HTMLButtonElement, BtnProps>(
  function AdminPrimaryButton({ icon: Icon, className = '', children, type = 'button', ...props }, ref) {
    return (
      <button
        ref={ref}
        type={type}
        className={`inline-flex h-9 items-center justify-center gap-2 rounded-full bg-primary px-4 text-sm font-medium text-primary-foreground shadow-[0_1px_2px_rgba(21,128,61,0.25)] transition-colors hover:bg-primary/90 disabled:opacity-50 ${className}`}
        {...props}
      >
        {Icon ? <Icon size={15} strokeWidth={1.75} /> : null}
        {children}
      </button>
    );
  }
);

/** Quiet secondary / ghost. */
export const AdminGhostButton = forwardRef<HTMLButtonElement, BtnProps>(
  function AdminGhostButton({ icon: Icon, className = '', children, type = 'button', ...props }, ref) {
    return (
      <button
        ref={ref}
        type={type}
        className={`inline-flex h-9 items-center justify-center gap-2 rounded-full border border-black/8 bg-card/80 px-3.5 text-sm font-medium text-foreground transition-colors hover:bg-muted/70 disabled:opacity-50 ${className}`}
        {...props}
      >
        {Icon ? <Icon size={15} strokeWidth={1.75} className="text-muted-foreground" /> : null}
        {children}
      </button>
    );
  }
);

/** Small square row action (edit / delete). */
export const AdminIconButton = forwardRef<
  HTMLButtonElement,
  Omit<BtnProps, 'children'> & { icon: LucideIcon; tone?: 'default' | 'danger' }
>(function AdminIconButton({ icon: Icon, className = '', tone = 'default', type = 'button', ...props }, ref) {
  const toneCls =
    tone === 'danger'
      ? 'border-destructive/20 text-destructive hover:bg-destructive/8'
      : 'border-black/8 text-muted-foreground hover:bg-muted/70 hover:text-foreground';
  return (
    <button
      ref={ref}
      type={type}
      className={`inline-flex size-8 items-center justify-center rounded-full border transition-colors disabled:opacity-50 ${toneCls} ${className}`}
      {...props}
    >
      <Icon size={14} strokeWidth={1.75} />
    </button>
  );
});

export function AdminSearchInput({
  className = '',
  busy = false,
  hint,
  onClear,
  value,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & {
  busy?: boolean;
  hint?: string | null;
  onClear?: () => void;
}) {
  const hasValue = String(value ?? '').length > 0;
  return (
    <div className={`min-w-0 flex-1 ${className}`}>
      <div className="relative h-10">
        <span className="pointer-events-none absolute top-0 bottom-0 left-3.5 flex w-4 items-center justify-center">
          {busy ? (
            <Loader2 size={15} strokeWidth={1.75} className="animate-spin text-primary" aria-hidden />
          ) : (
            <Search size={15} strokeWidth={1.75} className="text-muted-foreground" aria-hidden />
          )}
        </span>
        <input
          {...props}
          value={value}
          type={props.type ?? 'text'}
          className={`${adminField} h-10 rounded-full bg-muted/40 pl-10 ${hasValue ? 'pr-10' : 'pr-3'}`}
        />
        {hasValue && onClear ? (
          <button
            type="button"
            onClick={onClear}
            className="absolute top-0 bottom-0 right-2.5 my-auto inline-flex size-6 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            aria-label="Clear search"
          >
            <X size={14} strokeWidth={1.75} />
          </button>
        ) : null}
      </div>
      <p className="mt-1.5 h-4 text-xs leading-4 text-muted-foreground" aria-live="polite">
        {hint && !busy ? hint : ''}
      </p>
    </div>
  );
}

export function AdminPageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h2 className={adminSectionTitle}>{title}</h2>
        {description ? <p className={`mt-1 max-w-2xl ${adminMuted}`}>{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function AdminKpi({
  label,
  value,
  hint,
}: {
  label: string;
  value: string | number;
  hint?: string;
}) {
  return (
    <div className={`${adminSurface} px-5 py-5 sm:px-6 sm:py-6`}>
      <div className="text-[11px] font-semibold uppercase tracking-[0.07em] text-muted-foreground">
        {label}
      </div>
      <div className="mt-2 text-[1.75rem] font-semibold tracking-tight text-foreground tabular-nums sm:text-[2rem]">
        {value}
      </div>
      {hint ? <div className="mt-1.5 text-xs text-muted-foreground/90">{hint}</div> : null}
    </div>
  );
}

export function AdminAlert({
  tone = 'error',
  children,
  onDismiss,
}: {
  tone?: 'error' | 'success' | 'info';
  children: ReactNode;
  onDismiss?: () => void;
}) {
  const toneCls =
    tone === 'success'
      ? 'border-primary/20 bg-primary/6 text-foreground'
      : tone === 'info'
        ? 'border-black/8 bg-card text-muted-foreground'
        : 'border-destructive/20 bg-destructive/8 text-destructive';
  return (
    <div className={`flex items-start justify-between gap-3 rounded-[14px] border px-4 py-3 text-sm ${toneCls}`}>
      <div className="min-w-0">{children}</div>
      {onDismiss ? (
        <button
          type="button"
          onClick={onDismiss}
          className="shrink-0 text-xs font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
        >
          Dismiss
        </button>
      ) : null}
    </div>
  );
}
