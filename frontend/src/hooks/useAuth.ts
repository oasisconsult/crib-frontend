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
import { apiGet } from "@/services/api/client";
import type { User } from "@/types";

const REFRESH_BUFFER_MS = 60_000;
const IS_MOCK = process.env.NEXT_PUBLIC_MOCK_API === "true";

/** Dev sessions are prefixed with "dev." — they are not real JWTs. */
function isDevToken(token: string) {
  return token.startsWith("dev.");
}

export function useAuth() {
  const router = useRouter();
  const user = useAppStore((s) => s.user);
  const setUser = useAppStore((s) => s.setUser);
  const setAuthInitialized = useAppStore((s) => s.setAuthInitialized);
  const isAuthInitialized = useAppStore((s) => s.isAuthInitialized);
  const setActiveOrg = useAppStore((s) => s.setActiveOrg);

  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Schedule next silent refresh ──────────────────────────────────────────
  const scheduleRefresh = useCallback(
    (token: string) => {
      // Never schedule refresh for dev/mock tokens
      if (IS_MOCK || isDevToken(token)) return;
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
      const delay = Math.max(0, msUntilExpiry(token) - REFRESH_BUFFER_MS);
      refreshTimerRef.current = setTimeout(() => {
        silentRefresh(); // eslint-disable-line @typescript-eslint/no-use-before-define
      }, delay);
    },
    [], // eslint-disable-line react-hooks/exhaustive-deps
  );

  // ── Secure logout ─────────────────────────────────────────────────────────
  const logout = useCallback(
    async (meta?: Record<string, unknown>) => {
      emitAudit({ action: "auth.logout", userId: user?.id, meta });
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
      tokenStore.clear();

      try {
        const res = await fetch("/api/auth/logout", { method: "POST" });
        if (res.ok) {
          const { logoutUrl } = await res.json();
          setUser(null);
          window.location.href = logoutUrl;
          return;
        }
      } catch {}

      setUser(null);
      window.location.href = "/login";
    },
    [user, setUser],
  );

  // ── Silent refresh ────────────────────────────────────────────────────────
  const silentRefresh = useCallback(async (): Promise<string | null> => {
    if (IS_MOCK) return tokenStore.get(); // no-op in mock mode

    const inflight = tokenStore.getRefreshPromise();
    if (inflight) return inflight;

    const promise = (async () => {
      try {
        const res = await fetch("/api/auth/refresh", { method: "POST" });
        if (!res.ok) {
          emitAudit({ action: "auth.token_refresh_failed", userId: user?.id });
          await logout({ reason: "refresh_expired" });
          return null;
        }
        const { accessToken, role, orgId } = await res.json();
        tokenStore.set(accessToken);
        scheduleRefresh(accessToken);

        if (user && user.role !== role) setUser({ ...user, role });
        if (orgId) setActiveOrg(orgId);

        emitAudit({ action: "auth.token_refresh", userId: user?.id, orgId });
        return accessToken as string;
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
        // 1. Fetch token from httpOnly cookie bridge
        const tokenRes = await fetch("/api/auth/token");
        if (!tokenRes.ok) {
          // No session at all — mark initialized so the UI can redirect
          setUser(null);
          setAuthInitialized(true);
          return;
        }

        const { token } = await tokenRes.json();
        tokenStore.set(token);

        // 2. For real tokens: check expiry and schedule refresh
        if (!isDevToken(token)) {
          if (isTokenExpiringSoon(token)) {
            const refreshed = await silentRefresh();
            if (!refreshed) return; // logout was triggered inside silentRefresh
          } else {
            scheduleRefresh(token);
          }

          // Extract org from token claims
          const claims = decodeJwt(tokenStore.get()!);
          if (claims?.organization_id) setActiveOrg(claims.organization_id);
        }

        // 3. Fetch user profile — token is now in tokenStore, axios will attach it
        const userData = await apiGet<User>("/users/me");
        setUser(userData);
        emitAudit({ action: "auth.login", userId: userData.id });
      } catch {
        setUser(null);
      } finally {
        setAuthInitialized(true);
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

        const { accessToken, role } = await res.json();
        tokenStore.set(accessToken);
        scheduleRefresh(accessToken);
        setActiveOrg(orgId);
        if (user) setUser({ ...user, role });

        emitAudit({ action: "auth.org_switch", userId: user?.id, orgId });

        const userData = await apiGet<User>("/users/me");
        setUser(userData);
        router.refresh();
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
