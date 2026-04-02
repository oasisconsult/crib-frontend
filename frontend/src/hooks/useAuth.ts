"use client";

/**
 * useAuth — session bootstrap and lifecycle management.
 *
 * Flow after login:
 *  1. GET /api/auth/token  — reads the httpOnly logto_session cookie,
 *                            returns the JWT so we know its expiry.
 *                            The token is stored in memory (tokenStore)
 *                            only for expiry tracking — NOT for attaching
 *                            to API requests (the BFF proxy does that).
 *  2. GET /api/v1/me       — goes through the BFF proxy which reads the
 *                            cookie and injects Authorization: Bearer <token>.
 *                            Returns the user profile from the backend.
 *  3. resolveAuth(user)    — atomic store update, dashboard renders.
 *
 * Silent refresh:
 *  - Scheduled 60s before the token expires.
 *  - POST /api/auth/refresh rotates the refresh_token and sets a new
 *    logto_session cookie. The BFF proxy picks it up automatically.
 *  - On 401 from any API call, the axios interceptor triggers refresh
 *    and retries the original request.
 */

import { useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAppStore } from "@/store/useAppStore";
import { tokenStore, msUntilTimestamp } from "@/lib/auth";
import { emitAudit } from "@/lib/audit";
import { apiClient } from "@/services/api/client";
import type { User } from "@/types";

const REFRESH_BUFFER_MS = 60_000;
const IS_MOCK = process.env.NEXT_PUBLIC_MOCK_API === "true";

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
  const scheduleRefreshAt = useCallback((expiresAt: number) => {
    if (IS_MOCK) return;
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    const delay = Math.max(0, msUntilTimestamp(expiresAt) - REFRESH_BUFFER_MS);
    // eslint-disable-next-line @typescript-eslint/no-use-before-define
    refreshTimerRef.current = setTimeout(() => {
      silentRefresh();
    }, delay);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Logout ────────────────────────────────────────────────────────────────
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
          window.location.href = logoutUrl;
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

  // ── Silent refresh ────────────────────────────────────────────────────────
  const silentRefresh = useCallback(async (): Promise<string | null> => {
    if (IS_MOCK) return tokenStore.get();

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
        const { accessToken, role, orgId, expiresIn } = (await res.json()) as {
          accessToken: string;
          role: string;
          orgId?: string;
          expiresIn: number;
        };
        // Store only expiry — never the raw token in JS
        const expiresAt = Math.floor(Date.now() / 1000) + expiresIn;
        tokenStore.setExpiry(expiresAt);
        scheduleRefreshAt(expiresAt);
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
  }, [user, setUser, setActiveOrg, scheduleRefreshAt, logout]);

  // ── Bootstrap ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (isAuthInitialized) return;

    const bootstrap = async () => {
      // ── Step 1: Check session metadata ───────────────────────────────────
      // /api/auth/session returns { authenticated, expiresAt, sub, orgId }
      // — never the raw token. The token stays in the httpOnly cookie.
      const sessionRes = await fetch("/api/auth/session");

      if (!sessionRes.ok) {
        resolveAuth(null);
        return;
      }

      const session = (await sessionRes.json()) as {
        authenticated: boolean;
        expiresAt: number;
        sub: string;
        orgId: string | null;
      };

      if (!session.authenticated) {
        resolveAuth(null);
        return;
      }

      // ── Step 2: Mock mode setup ───────────────────────────────────────────
      if (IS_MOCK && session.sub?.startsWith("dev.")) {
        localStorage.setItem("crib:dev_user_id", session.sub.slice(4));
      }

      // ── Step 3: Token expiry check ────────────────────────────────────────
      const nowSec = Math.floor(Date.now() / 1000);
      const expiresIn = session.expiresAt - nowSec;

      console.debug("[auth] token expires in", expiresIn, "s");

      if (expiresIn <= 0) {
        // Expired — refresh before hitting the backend
        const refreshed = await silentRefresh();
        if (!refreshed) return;
      } else {
        // Valid — schedule background refresh before expiry
        // tokenStore holds expiry info only; the BFF reads the cookie for auth
        tokenStore.setExpiry(session.expiresAt);
        scheduleRefreshAt(session.expiresAt);
      }

      if (session.orgId) setActiveOrg(session.orgId);

      // ── Step 4: Fetch user profile from backend ───────────────────────────
      // BFF proxy reads logto_session cookie → injects Authorization header.
      // No token handling needed here.
      try {
        const { data: userData } = await apiClient.get<User>("/me");
        resolveAuth(userData);
        emitAudit({ action: "auth.login", userId: userData.id });
      } catch (err: unknown) {
        const status = (err as { response?: { status?: number } })?.response
          ?.status;

        if (status === 401) {
          const refreshed = await silentRefresh();
          if (!refreshed) return;
          try {
            const { data: userData } = await apiClient.get<User>("/me");
            resolveAuth(userData);
            emitAudit({ action: "auth.login", userId: userData.id });
          } catch {
            const status = (err as { response?: { status?: number } })?.response
              ?.status;

            console.error("[auth] /me failed:", status, err);
            // resolveAuth(null);
          }
          return;
        }
        // } else {
        //   console.error("[auth] /me failed:", status, err);
        //   resolveAuth(null);
        // }
      }
    };

    bootstrap().catch(() => resolveAuth(null));

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

        const { role, expiresIn } = (await res.json()) as {
          accessToken: string; // cookie is updated server-side; we don't use the value
          role: string;
          expiresIn: number;
        };
        const expiresAt = Math.floor(Date.now() / 1000) + expiresIn;
        tokenStore.setExpiry(expiresAt);
        scheduleRefreshAt(expiresAt);
        setActiveOrg(orgId);
        if (user) setUser({ ...user, role: role as User["role"] });
        emitAudit({ action: "auth.org_switch", userId: user?.id, orgId });

        const { data: userData } = await apiClient.get<User>("/me");
        setUser(userData);
        router.refresh();
        return true;
      } catch {
        return false;
      }
    },
    [user, setUser, setActiveOrg, scheduleRefreshAt, router],
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
