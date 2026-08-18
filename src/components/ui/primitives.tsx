import {
  useEffect,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
} from "react";
import { Loader2, X } from "lucide-react";
import { cn } from "../../lib/utils";

/* ---------------------------------------------------------------- Spinner */
export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn("h-4 w-4 animate-spin", className)} aria-hidden="true" />;
}

/* ---------------------------------------------------------------- Button */
type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "dangerGhost";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: "sm" | "md" | "lg";
  loading?: boolean;
}

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    "bg-brand-600 text-[#f4f6ff] hover:bg-brand-500 active:bg-brand-700 shadow-sm shadow-brand-600/20",
  secondary:
    "border border-ink-200 bg-white/70 text-ink-800 hover:bg-ink-100 dark:border-ink-700 dark:bg-ink-850 dark:text-ink-100 dark:hover:bg-ink-800",
  ghost:
    "text-ink-600 hover:bg-ink-150/70 hover:text-ink-900 dark:text-ink-300 dark:hover:bg-ink-800 dark:hover:text-ink-100",
  danger: "bg-danger-500 text-[#fdf6f6] hover:bg-danger-600 shadow-sm shadow-danger-500/20",
  dangerGhost:
    "text-danger-500 hover:bg-danger-500/10 dark:text-[#f3a7a7] dark:hover:bg-danger-500/15",
};

const sizeClasses = {
  sm: "h-8 px-2.5 text-xs gap-1.5 rounded-md",
  md: "h-9.5 px-3.5 text-sm gap-2 rounded-lg",
  lg: "h-11 px-5 text-sm gap-2 rounded-lg",
};

export function Button({
  variant = "secondary",
  size = "md",
  loading = false,
  className,
  children,
  disabled,
  ...rest
}: ButtonProps) {
  return (
    <button
      type="button"
      disabled={disabled || loading}
      className={cn(
        "inline-flex select-none items-center justify-center font-semibold transition-all duration-150 disabled:cursor-not-allowed disabled:opacity-55",
        variantClasses[variant],
        sizeClasses[size],
        className
      )}
      {...rest}
    >
      {loading && <Spinner className="h-3.5 w-3.5" />}
      {children}
    </button>
  );
}

/* ---------------------------------------------------------------- Input */
interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean;
}

export function Input({ invalid, className, ...rest }: InputProps) {
  return (
    <input
      className={cn(
        "h-10 w-full rounded-lg border bg-white/80 px-3 text-sm text-ink-900 placeholder:text-ink-400 transition-colors",
        "focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/25",
        "dark:bg-ink-850 dark:text-ink-100 dark:placeholder:text-ink-500",
        invalid
          ? "border-danger-500/70 focus:border-danger-500 focus:ring-danger-500/20"
          : "border-ink-200 dark:border-ink-700",
        className
      )}
      {...rest}
    />
  );
}

export function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string | null;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-ink-500 dark:text-ink-400">
        {label}
      </span>
      {children}
      {error ? <span className="mt-1.5 block text-xs text-danger-500">{error}</span> : null}
    </label>
  );
}

/* ---------------------------------------------------------------- Dialog */
interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}

export function Dialog({ open, onClose, title, description, children, footer, wide }: DialogProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="anim-fade fixed inset-0 z-[70] flex items-end justify-center bg-ink-950/55 p-0 backdrop-blur-[2px] sm:items-center sm:p-6"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cn(
          "anim-pop flex max-h-[88dvh] w-full flex-col overflow-hidden rounded-t-2xl border border-ink-200 bg-ink-50 shadow-pop sm:rounded-2xl dark:border-ink-700 dark:bg-ink-900",
          wide ? "sm:max-w-2xl" : "sm:max-w-md"
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-ink-200/80 px-5 py-4 dark:border-ink-800">
          <div>
            <h2 className="font-display text-lg font-bold text-ink-900 dark:text-ink-50">{title}</h2>
            {description ? (
              <p className="mt-0.5 text-[13px] text-ink-500 dark:text-ink-400">{description}</p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="rounded-md p-1.5 text-ink-400 transition-colors hover:bg-ink-150 hover:text-ink-700 dark:hover:bg-ink-800 dark:hover:text-ink-200"
          >
            <X className="h-4.5 w-4.5" />
          </button>
        </div>
        <div className="scroll-slim flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer ? (
          <div className="flex justify-end gap-2 border-t border-ink-200/80 bg-ink-100/60 px-5 py-3.5 dark:border-ink-800 dark:bg-ink-850/60">
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- Dropdown menu */
interface MenuProps {
  trigger: ReactNode;
  triggerLabel: string;
  align?: "left" | "right";
  children: ReactNode;
}

export function Menu({ trigger, triggerLabel, align = "right", children }: MenuProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent | TouchEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("touchstart", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        aria-label={triggerLabel}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className={cn(
          "rounded-md p-1.5 text-ink-400 transition-colors hover:bg-ink-150 hover:text-ink-700 dark:hover:bg-ink-800 dark:hover:text-ink-200",
          open && "bg-ink-150 text-ink-700 dark:bg-ink-800 dark:text-ink-200"
        )}
      >
        {trigger}
      </button>
      {open ? (
        <div
          role="menu"
          className={cn(
            "anim-pop absolute z-40 mt-1 min-w-44 overflow-hidden rounded-lg border border-ink-200 bg-white/98 py-1 shadow-pop backdrop-blur-sm dark:border-ink-700 dark:bg-ink-850/98",
            align === "right" ? "right-0" : "left-0"
          )}
          onClick={() => setOpen(false)}
        >
          {children}
        </div>
      ) : null}
    </div>
  );
}

export function MenuItem({
  icon,
  label,
  danger,
  onClick,
}: {
  icon?: ReactNode;
  label: string;
  danger?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={cn(
        "flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-[13px] font-medium transition-colors",
        danger
          ? "text-danger-500 hover:bg-danger-500/10 dark:text-[#f3a7a7]"
          : "text-ink-700 hover:bg-ink-100 dark:text-ink-200 dark:hover:bg-ink-800"
      )}
    >
      {icon ? <span className="shrink-0 [&>svg]:h-4 [&>svg]:w-4">{icon}</span> : null}
      {label}
    </button>
  );
}

/* ---------------------------------------------------------------- EmptyState */
export function EmptyState({
  icon,
  title,
  body,
  actions,
  compact,
}: {
  icon: ReactNode;
  title: string;
  body?: string;
  actions?: ReactNode;
  compact?: boolean;
}) {
  return (
    <div
      className={cn(
        "anim-fade-up flex flex-col items-center justify-center rounded-xl border border-dashed border-ink-300/80 text-center dark:border-ink-700",
        compact ? "px-4 py-8" : "px-6 py-14"
      )}
    >
      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand-50 text-brand-600 dark:bg-brand-900/30 dark:text-brand-300 [&>svg]:h-6 [&>svg]:w-6">
        {icon}
      </div>
      <h3 className="font-display mt-4 text-base font-bold text-ink-800 dark:text-ink-100">{title}</h3>
      {body ? (
        <p className="mt-1 max-w-sm text-[13px] leading-relaxed text-ink-500 dark:text-ink-400">{body}</p>
      ) : null}
      {actions ? <div className="mt-5 flex flex-wrap justify-center gap-2">{actions}</div> : null}
    </div>
  );
}

/* ---------------------------------------------------------------- Avatar */
const AVATAR_HUES = [
  "bg-brand-600",
  "bg-[#0e9f8a]",
  "bg-[#d97706]",
  "bg-[#c2410c]",
  "bg-[#7c3aed]",
  "bg-[#0369a1]",
];

export function Avatar({
  name,
  src,
  size = "md",
}: {
  name: string;
  src?: string | null;
  size?: "xs" | "sm" | "md" | "lg";
}) {
  const initials =
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase())
      .join("") || "?";
  const hue = AVATAR_HUES[(name.charCodeAt(0) || 0) % AVATAR_HUES.length];
  const dims = {
    xs: "h-5.5 w-5.5 text-[9px]",
    sm: "h-7 w-7 text-[10px]",
    md: "h-9 w-9 text-xs",
    lg: "h-14 w-14 text-lg",
  }[size];

  if (src) {
    return (
      <img
        src={src}
        alt={name}
        className={cn(dims, "shrink-0 rounded-full object-cover ring-2 ring-white/60 dark:ring-ink-700")}
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      className={cn(
        dims,
        "flex shrink-0 items-center justify-center rounded-full font-bold text-[#f6f7fb] ring-2 ring-white/60 dark:ring-ink-700",
        hue
      )}
    >
      {initials}
    </span>
  );
}

/* ---------------------------------------------------------------- Skeletons */
export function SkeletonRows({ count = 5 }: { count?: number }) {
  return (
    <div className="space-y-2" aria-hidden="true">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="skeleton h-12 rounded-lg" style={{ opacity: 1 - i * 0.12 }} />
      ))}
    </div>
  );
}
