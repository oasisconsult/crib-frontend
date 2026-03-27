import axios, { type AxiosInstance, type AxiosError } from "axios";

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

function createApiClient(): AxiosInstance {
  const client = axios.create({
    baseURL: `${BASE_URL}/api/v1`,
    timeout: 30_000,
    headers: {
      "Content-Type": "application/json",
    },
  });

  // ─── Request interceptor: attach access token ────────────────────────────
  client.interceptors.request.use(
    (config) => {
      if (typeof window !== "undefined") {
        const token = sessionStorage.getItem("crib:access_token");
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }
      }
      return config;
    },
    (error) => Promise.reject(error),
  );

  // ─── Response interceptor: handle 401 / normalise errors ────────────────
  client.interceptors.response.use(
    (response) => response,
    async (error: AxiosError) => {
      if (error.response?.status === 401) {
        // Clear stale token and redirect to login
        sessionStorage.removeItem("crib:access_token");
        window.location.href = "/login";
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
