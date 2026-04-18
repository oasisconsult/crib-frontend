"use client";

import { useEffect, useState } from "react";
import { WifiOff, Save } from "lucide-react";
import { useDraftStore } from "@/store/useDraftStore";
import { cn } from "@/utils/cn";

export function OfflineBanner() {
  const [isOnline, setIsOnline] = useState(true);
  const draftCount = useDraftStore((s) => s.draftCount());

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    setIsOnline(navigator.onLine);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  if (isOnline && draftCount === 0) return null;

  return (
    <div
      role="alert"
      className={cn(
        "fixed bottom-4 left-1/2 z-50 -translate-x-1/2 flex items-center gap-2 rounded-[6px] px-4 py-2.5 text-sm font-medium shadow-lg",
        !isOnline
          ? "bg-destructive text-destructive-foreground"
          : "bg-amber-500 text-white",
      )}
    >
      {!isOnline ? (
        <>
          <WifiOff className="h-4 w-4" aria-hidden="true" />
          <span>You&apos;re offline — changes are saved locally</span>
        </>
      ) : (
        <>
          <Save className="h-4 w-4" aria-hidden="true" />
          <span>{draftCount} unsaved draft{draftCount > 1 ? "s" : ""}</span>
        </>
      )}
    </div>
  );
}
