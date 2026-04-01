"use client";

import { useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAppStore } from "@/store/useAppStore";
import {
  tokenStore,
  isTokenExpiringSoon,
  msUntilExpiry,
  decodeJwt,
} from "@/lib/auth";
import { emitAudit } from "@/lib/audit";
import { apiClient } from "@/services/api/client";
import type { User } from "@/types";

const REFRESH_BUFFER_MS = 60_000; // refresh 60s before expiry
const IS_MOCK = process.env.NEXT_PUBLIC_MOCK_API === "true";

/** Dev tokens are plain strings prefixed with "dev." — not JWTs. */
const isDevToken = (t: string) => t.startsWith("dev.");
const devTokenUserId = (t: string) => t.slice(4);

export function useAuth() {
  const router = useRouter();
  const user = useAppStore((s) => s.user);
  const setUser = useAppStore((s) => s.setUser);
  const resolveAuth = useAppStore((s) => s.resolveAuth);
  const isAuthInitialized = useAppStore((s) => s.isAuthInitialized);
  const setActiveOrg = useAppStore((s) => s.setActiveOrg);

  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Schedule proactive silent refresh ────────────────────────────────────
  const scheduleRefresh = useCallback((token: string) => {
    if (IS_MOCK || isDevToken(token)) return;
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    const delay = Math.max(0, msUntilExpiry(token) - REFRESH_BUFFER_MS);
    // eslint-disable-next-line @typescript-eslint/no-use-before-define
    refreshTimerRef.current = setTimeout(() => {
      silentRefresh();
    }, delay);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Secure logout ─────────────────────────────────────────────────────────
  const logout = useCallback(
    async (meta?: Record<string, unknown>) => {
      emitAudit({ action: "auth.logout", userId: user?.id, meta });
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
      tokenStore.clear();

      try {
        const res = await fetch("/api/auth/logout", { method: "POST" });
        if (res.ok) {
          const { logoutUrl } = (await res.json()) as { logoutUrl: string };
          resolveAuth(null);
          window.location.href = logoutUrl; // full navigation to IdP end_session
          return;
        }
      } catch {
        /* fall through */
      }

      resolveAuth(null);
      window.location.replace("/login");
    },
    [user, resolveAuth],
  );

  // ── Silent token refresh ──────────────────────────────────────────────────
  const silentRefresh = useCallback(async (): Promise<string | null> => {
    if (IS_MOCK) return tokenStore.get(); // no-op in mock mode

    // Deduplicate: concurrent callers share one in-flight request
    const inflight = tokenStore.getRefreshPromise();
    if (inflight) return inflight;

    const promise = (async () => {
      try {
        const res = await fetch("/api/auth/refresh", { method: "POST" });
        if (!res.ok) {
          emitAudit({ action: "auth.token_refresh_failed", userId: user?.id });
          await logout({ reason: "refresh_token_expired" });
          return null;
        }
        const { accessToken, role, orgId } = (await res.json()) as {
          accessToken: string;
          role: string;
          orgId?: string;
        };
        tokenStore.set(accessToken);
        scheduleRefresh(accessToken);
        if (user && user.role !== role)
          setUser({ ...user, role: role as User["role"] });
        if (orgId) setActiveOrg(orgId);
        emitAudit({ action: "auth.token_refresh", userId: user?.id, orgId });
        return accessToken;
      } catch {
        emitAudit({ action: "auth.token_refresh_failed", userId: user?.id });
        return null;
      } finally {
        tokenStore.setRefreshPromise(null);
      }
    })();

    tokenStore.setRefreshPromise(promise);
    return promise;
  }, [user, setUser, setActiveOrg, scheduleRefresh, logout]);

  // ── Bootstrap on mount ────────────────────────────────────────────────────
  useEffect(() => {
    if (isAuthInitialized) return;

    const bootstrap = async () => {
      try {
        // 1. Retrieve token from httpOnly cookie via server bridge
        const res = await fetch("/api/auth/token");
        if (!res.ok) {
          resolveAuth(null);
          return;
        }

        const { token } = (await res.json()) as { token: string };
        tokenStore.set(token);

        // 2. Mock mode: sync localStorage so MSW returns the right user profile
        if (IS_MOCK && isDevToken(token)) {
          localStorage.setItem("crib:dev_user_id", devTokenUserId(token));
        }

        // 3. Real tokens: handle expiry proactively
        if (!isDevToken(token)) {
          if (isTokenExpiringSoon(token)) {
            const refreshed = await silentRefresh();
            if (!refreshed) return; // logout was triggered inside silentRefresh
          } else {
            scheduleRefresh(token);
          }
          const claims = decodeJwt(tokenStore.get()!);
          if (claims?.organization_id) setActiveOrg(claims.organization_id);
        }

        // 4. Fetch user profile — token is in tokenStore, axios attaches it
        const { data: userData } = await apiClient.get<User>("/users/me");

        // 5. Atomic state update — prevents AuthGate flash redirect
        resolveAuth(userData);
        emitAudit({ action: "auth.login", userId: userData.id });
      } catch {
        resolveAuth(null);
      }
    };

    bootstrap();

    return () => {
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Org switching ─────────────────────────────────────────────────────────
  const switchOrg = useCallback(
    async (orgId: string): Promise<boolean> => {
      try {
        const res = await fetch("/api/auth/switch-org", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ orgId }),
        });
        if (!res.ok) return false;

        const { accessToken, role } = (await res.json()) as {
          accessToken: string;
          role: string;
        };
        tokenStore.set(accessToken);
        scheduleRefresh(accessToken);
        setActiveOrg(orgId);
        if (user) setUser({ ...user, role: role as User["role"] });

        emitAudit({ action: "auth.org_switch", userId: user?.id, orgId });

        const { data: userData } = await apiClient.get<User>("/users/me");
        setUser(userData);
        router.refresh(); // re-run server components with new org context
        return true;
      } catch {
        return false;
      }
    },
    [user, setUser, setActiveOrg, scheduleRefresh, router],
  );

  return {
    user,
    isAuthenticated: !!user,
    isAuthInitialized,
    silentRefresh,
    switchOrg,
    logout,
  };
}
