import axios, {
  type AxiosInstance,
  type AxiosError,
  type InternalAxiosRequestConfig,
} from "axios";
import { tokenStore } from "@/lib/auth";

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

// Track whether a 401-triggered refresh is already in flight to avoid loops
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
  });

  // ─── Request interceptor: attach in-memory access token ─────────────────
  client.interceptors.request.use(
    (config) => {
      if (typeof window !== "undefined") {
        const token = tokenStore.get();
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }
        if (process.env.NEXT_PUBLIC_MOCK_API === "true") {
          const devUserId = localStorage.getItem("crib:dev_user_id");
          if (devUserId) config.headers["X-Dev-User-Id"] = devUserId;
        }
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

        if (_isRefreshing) {
          // Queue this request until the in-flight refresh completes
          return new Promise((resolve) => {
            subscribeTokenRefresh((newToken) => {
              originalRequest.headers.Authorization = `Bearer ${newToken}`;
              resolve(client(originalRequest));
            });
          });
        }

        _isRefreshing = true;
        try {
          const res = await fetch("/api/auth/refresh", { method: "POST" });
          if (!res.ok) throw new Error("refresh_failed");

          const { accessToken } = await res.json();
          tokenStore.set(accessToken);
          notifyRefreshSubscribers(accessToken);

          originalRequest.headers.Authorization = `Bearer ${accessToken}`;
          return client(originalRequest);
        } catch {
          // Refresh failed — redirect to login
          tokenStore.clear();
          notifyRefreshSubscribers("");
          window.location.href = "/login";
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

// Typed helper wrappers
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
