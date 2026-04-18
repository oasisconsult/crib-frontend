"use client";

import { useEffect } from "react";
import { X, CheckCircle2, AlertTriangle, XCircle, Info } from "lucide-react";
import { useUIStore } from "@/store/useUIStore";
import { cn } from "@/utils/cn";

const ICONS = {
  success: <CheckCircle2 className="h-4 w-4 text-emerald-500" />,
  error: <XCircle className="h-4 w-4 text-red-500" />,
  warning: <AlertTriangle className="h-4 w-4 text-amber-500" />,
  info: <Info className="h-4 w-4 text-blue-500" />,
};

const BORDER_COLORS = {
  success: "border-l-emerald-500",
  error: "border-l-red-500",
  warning: "border-l-amber-500",
  info: "border-l-blue-500",
};

export function ToastProvider() {
  const { toasts, removeToast: dismissToast } = useUIStore();

  useEffect(() => {
    if (toasts.length === 0) return;
    const latest = toasts[toasts.length - 1];
    const timer = setTimeout(
      () => dismissToast(latest.id),
      latest.duration ?? 4000,
    );
    return () => clearTimeout(timer);
  }, [toasts, dismissToast]);

  if (toasts.length === 0) return null;

  return (
    <div
      aria-live="polite"
      aria-atomic="false"
      className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 w-80"
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          className={cn(
            "flex items-start gap-3 rounded-[6px] border border-border border-l-4 bg-card p-3.5 shadow-lg",
            "animate-in slide-in-from-right-5 fade-in duration-200",
            BORDER_COLORS[t.type],
          )}
          role="alert"
        >
          <div className="mt-0.5 shrink-0">{ICONS[t.type]}</div>
          <div className="flex-1 min-w-0">
            {t.title && (
              <p className="text-sm font-medium leading-tight">{t.title}</p>
            )}
            {t.description && (
              <p className="text-xs text-muted-foreground mt-0.5">{t.description}</p>
            )}
          </div>
          <button
            onClick={() => dismissToast(t.id)}
            className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Dismiss"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
}
