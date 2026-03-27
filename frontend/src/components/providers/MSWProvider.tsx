"use client";

import { useEffect, useState } from "react";

export function MSWProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(
    process.env.NEXT_PUBLIC_MOCK_API !== "true",
  );

  useEffect(() => {
    if (process.env.NEXT_PUBLIC_MOCK_API !== "true") return;

    import("@/services/mock/browser").then(({ worker }) => {
      worker
        .start({
          onUnhandledRequest: "bypass",
          serviceWorker: { url: "/mockServiceWorker.js" },
        })
        .then(() => setReady(true));
    });
  }, []);

  if (!ready) return null;

  return <>{children}</>;
}
