/**
 * API client — axios instance configured for the BFF proxy pattern.
 *
 * All requests go to /api/v1/* (same origin, relative URL).
 * The Next.js BFF proxy at src/app/api/v1/[...path]/route.ts reads the
 * httpOnly logto_session cookie and injects Authorization: Bearer <token>
 * before forwarding to the FastAPI backend.
 *
 * The client still maintains an in-memory tokenStore for:
 *  - 401 detection and silent refresh triggering
 *  - Knowing when to proactively refresh before expiry
 *
 * The browser never directly calls the backend — all traffic goes through
 * the BFF, which owns the token injection.
 */

import axios, {
  type AxiosInstance,
  type AxiosError,
  type InternalAxiosRequestConfig,
} from "axios";
import { tokenStore } from "@/lib/auth";
import type { ApiErrorResponse } from "@/types/api";
import { isAuthenticationError } from "@/types/api";

// Always relative — hits the BFF proxy at /api/v1/*
const BASE_URL = "";

let _isRefreshing = false;
let _refreshSubscribers: Array<(token: string) => void> = [];

function subscribeTokenRefresh(cb: (token: string) => void) {
  _refreshSubscribers.push(cb);
}
function notifyRefreshSubscribers(token: string) {
  _refreshSubscribers.forEach((cb) => cb(token));
  _refreshSubscribers = [];
}

function createApiClient(): AxiosInstance {
  const client = axios.create({
    baseURL: `${BASE_URL}/api/v1`,
    timeout: 30_000,
    headers: { "Content-Type": "application/json" },
    // Credentials must be included so the browser sends the httpOnly cookie
    // to the BFF proxy (same-origin, so this is always true — but explicit is better)
    withCredentials: true,
  });

  // ─── Request interceptor ─────────────────────────────────────────────────
  // The BFF proxy injects the Authorization header from the cookie.
  // We don't set it here — that would expose the token to the browser's
  // request headers, defeating the httpOnly cookie security model.
  //
  // In mock mode only: attach X-Dev-User-Id so MSW returns the right fixture.
  client.interceptors.request.use(
    (config) => {
      if (
        typeof window !== "undefined" &&
        process.env.NEXT_PUBLIC_MOCK_API === "true"
      ) {
        const devUserId = localStorage.getItem("crib:dev_user_id");
        if (devUserId) config.headers["X-Dev-User-Id"] = devUserId;
      }
      return config;
    },
    (error) => Promise.reject(error),
  );

  // ─── Response interceptor: silent refresh on 401 ────────────────────────
  client.interceptors.response.use(
    (response) => response,
    async (error: AxiosError) => {
      const originalRequest = error.config as InternalAxiosRequestConfig & {
        _retry?: boolean;
      };

      if (error.response?.status === 401 && !originalRequest._retry) {
        originalRequest._retry = true;

        // Mock mode has no real tokens — just reject
        if (process.env.NEXT_PUBLIC_MOCK_API === "true") {
          return Promise.reject(error);
        }

        // Deduplicate concurrent 401s
        if (_isRefreshing) {
          return new Promise((resolve, reject) => {
            subscribeTokenRefresh((token) => {
              if (!token) {
                reject(error);
                return;
              }
              resolve(client(originalRequest));
            });
          });
        }

        _isRefreshing = true;
        try {
          const res = await fetch("/api/auth/refresh", { method: "POST" });
          if (!res.ok) {
            let errBody: ApiErrorResponse | null = null;
            try {
              errBody = await res.json();
            } catch {
              // ignore
            }

            const errCode = errBody && isAuthenticationError(errBody) 
              ? errBody.error.code 
              : (typeof errBody?.error === 'string' ? errBody.error : errBody?.code);

            // If the session has no refresh token (common until Logto is configured
            // to issue refresh tokens), treat as non-fatal: don't redirect to /login.
            if (res.status === 401 && errCode === "no_refresh_token") {
              notifyRefreshSubscribers("");
              return Promise.reject(error);
            }

            throw new Error("refresh_failed");
          }

          // Retry — the BFF will pick up the refreshed cookie automatically
          notifyRefreshSubscribers("ok");
          return client(originalRequest);
        } catch {
          notifyRefreshSubscribers("");
          window.location.replace("/login");
          return Promise.reject(error);
        } finally {
          _isRefreshing = false;
        }
      }

      return Promise.reject(error);
    },
  );

  return client;
}

export const apiClient = createApiClient();

export async function apiGet<T>(url: string, params?: object): Promise<T> {
  const { data } = await apiClient.get<T>(url, { params });
  return data;
}

export async function apiPost<T>(url: string, body?: unknown): Promise<T> {
  const { data } = await apiClient.post<T>(url, body);
  return data;
}

export async function apiPut<T>(url: string, body?: unknown): Promise<T> {
  const { data } = await apiClient.put<T>(url, body);
  return data;
}

export async function apiPatch<T>(url: string, body?: unknown): Promise<T> {
  const { data } = await apiClient.patch<T>(url, body);
  return data;
}

export async function apiDelete<T>(url: string): Promise<T> {
  const { data } = await apiClient.delete<T>(url);
  return data;
}
