"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { ShieldAlert, RefreshCw, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function AdminError({ error, reset }: Props) {
  useEffect(() => {
    console.error("[Admin Error]", error);
  }, [error]);

  const router = useRouter();

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6 text-center px-4">
      <div className="flex h-16 w-16 items-center justify-center rounded-[8px] bg-red-100 dark:bg-red-950/40">
        <ShieldAlert className="h-8 w-8 text-red-600" />
      </div>
      <div className="space-y-2">
        <h1 className="text-xl font-bold">Admin panel error</h1>
        <p className="text-sm text-muted-foreground max-w-sm">
          An error occurred in the admin panel. This has been logged.
        </p>
        {error.digest && (
          <p className="text-xs text-muted-foreground font-mono">
            Error ID: {error.digest}
          </p>
        )}
      </div>
      <div className="flex gap-3">
        <Button variant="outline" size="sm" onClick={reset}>
          <RefreshCw className="h-4 w-4" />
          Try again
        </Button>
        <Button size="sm" variant="outline" onClick={() => router.push("/")}>
          <ArrowLeft className="h-4 w-4" />
          Back to app
        </Button>
      </div>
    </div>
  );
}
