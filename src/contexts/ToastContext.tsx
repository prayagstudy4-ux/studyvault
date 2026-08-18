import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Info, X } from "lucide-react";
import { cn } from "../lib/utils";

type ToastKind = "success" | "error" | "info";

interface Toast {
  id: number;
  kind: ToastKind;
  message: string;
}

interface ToastContextValue {
  toast: (message: string, kind?: ToastKind) => void;
}

const ToastContext = createContext<ToastContextValue>({ toast: () => undefined });

export function useToast() {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const counter = useRef(0);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback(
    (message: string, kind: ToastKind = "success") => {
      counter.current += 1;
      const id = counter.current;
      setToasts((prev) => [...prev.slice(-3), { id, kind, message }]);
      window.setTimeout(() => dismiss(id), kind === "error" ? 6000 : 4000);
    },
    [dismiss]
  );

  const value = useMemo(() => ({ toast }), [toast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-20 z-[90] flex flex-col items-center gap-2 px-4 sm:inset-x-auto sm:bottom-5 sm:right-5 sm:items-end"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            className={cn(
              "anim-toast pointer-events-auto flex w-full max-w-sm items-start gap-2.5 rounded-lg border px-3.5 py-3 text-sm shadow-pop backdrop-blur-sm",
              t.kind === "success" &&
                "border-ok-500/30 bg-[#f2fbf6]/95 text-[#1d5c3f] dark:border-ok-500/40 dark:bg-[#12271c]/95 dark:text-[#8fdcb4]",
              t.kind === "error" &&
                "border-danger-500/30 bg-[#fdf3f3]/95 text-[#8c2f2f] dark:border-danger-500/40 dark:bg-[#2b1517]/95 dark:text-[#f3a7a7]",
              t.kind === "info" &&
                "border-brand-500/30 bg-[#f2f4ff]/95 text-[#333aa0] dark:border-brand-500/40 dark:bg-[#171b33]/95 dark:text-[#aeb6f8]"
            )}
          >
            <span className="mt-0.5 shrink-0">
              {t.kind === "success" ? (
                <CheckCircle2 className="h-4.5 w-4.5" />
              ) : t.kind === "error" ? (
                <AlertTriangle className="h-4.5 w-4.5" />
              ) : (
                <Info className="h-4.5 w-4.5" />
              )}
            </span>
            <span className="flex-1 leading-snug">{t.message}</span>
            <button
              type="button"
              onClick={() => dismiss(t.id)}
              aria-label="Dismiss notification"
              className="shrink-0 rounded p-0.5 opacity-60 transition-opacity hover:opacity-100"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
