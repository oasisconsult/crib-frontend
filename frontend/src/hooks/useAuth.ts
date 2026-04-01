"use client";

/**
 * useAuth — Production auth hook
 *
 * Responsibilities:
 *  - Bootstrap: fetch token from httpOnly cookie → store in memory
 *  - Silent refresh: schedule proactive token refresh 60s before expiry
 *  - Org switching: exchange token for org-scoped access token
 *  - Secure logout: revoke refresh token + clear cookies + Logto end_session
 *  - Audit logging: emit structured events for all auth actions
 */

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

const REFRESH_BUFFER_MS = 60_000; // refresh 60s before expiry

export function useAuth() {
  const router = useRouter();
  const { user, setUser, setAuthInitialized, isAuthInitialized, setActiveOrg } =
    useAppStore((s) => ({
      user: s.user,
      setUser: s.setUser,
      setAuthInitialized: s.setAuthInitialized,
      isAuthInitialized: s.isAuthInitialized,
      setActiveOrg: s.setActiveOrg,
    }));

  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Schedule next silent refresh ──────────────────────────────────────────
  const scheduleRefresh = useCallback((token: string) => {
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);

    const delay = Math.max(0, msUntilExpiry(token) - REFRESH_BUFFER_MS);
    refreshTimerRef.current = setTimeout(() => {
      silentRefresh();
    }, delay);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Silent refresh ────────────────────────────────────────────────────────
  const silentRefresh = useCallback(async (): Promise<string | null> => {
    // Deduplicate concurrent refresh calls
    const inflight = tokenStore.getRefreshPromise();
    if (inflight) return inflight;

    const promise = (async () => {
      try {
        const res = await fetch("/api/auth/refresh", { method: "POST" });
        if (!res.ok) {
          emitAudit({ action: "auth.token_refresh_failed", userId: user?.id });
          // Refresh token expired — force re-login
          await logout({ reason: "refresh_expired" });
          return null;
        }
        const { accessToken, expiresIn, role, orgId } = await res.json();
        tokenStore.set(accessToken);
        scheduleRefresh(accessToken);

        // Update role/org in store if changed
        if (user && user.role !== role) {
          setUser({ ...user, role });
        }
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
  }, [user, setUser, setActiveOrg, scheduleRefresh]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Bootstrap on mount ────────────────────────────────────────────────────
  useEffect(() => {
    if (isAuthInitialized) return;

    const bootstrap = async () => {
      try {
        // 1. Get token from httpOnly cookie bridge
        const tokenRes = await fetch("/api/auth/token");
        if (!tokenRes.ok) throw new Error("no_session");

        const { token } = await tokenRes.json();
        tokenStore.set(token);

        // 2. If token is expiring soon, refresh immediately
        if (isTokenExpiringSoon(token)) {
          const refreshed = await silentRefresh();
          if (!refreshed) return; // logout was triggered
        } else {
          scheduleRefresh(token);
        }

        // 3. Extract org from token claims
        const claims = decodeJwt(tokenStore.get()!);
        if (claims?.organization_id) setActiveOrg(claims.organization_id);

        // 4. Fetch user profile
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

        // Reload user profile for new org context
        const userData = await apiGet<User>("/users/me");
        setUser(userData);

        router.refresh(); // re-run server components with new org context
        return true;
      } catch {
        return false;
      }
    },
    [user, setUser, setActiveOrg, scheduleRefresh, router],
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
          window.location.href = logoutUrl; // full navigation to Logto end_session
          return;
        }
      } catch {}

      // Fallback
      setUser(null);
      window.location.href = "/login";
    },
    [user, setUser],
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
