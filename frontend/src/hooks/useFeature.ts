"use client";

import { useCurrentSubscription } from "@/hooks/useSubscription";

/**
 * Returns whether a plan feature is enabled and whether the subscription is still loading.
 *
 * `loading=true` means the plan is not yet known — callers must NOT fire gated API
 * requests until loading is false.
 *
 * React Query: `enabled: !loading && enabled`
 * useEffect:   `if (loading || !enabled) return;`
 */
export function useFeature(key: string): { enabled: boolean; loading: boolean } {
  const { data: sub, isLoading } = useCurrentSubscription();
  const features = sub?.plan?.features as Record<string, unknown> | undefined;
  return {
    enabled: features?.[key] === true,
    loading: isLoading,
  };
}
