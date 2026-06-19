import { apiGet, apiPost, apiPut } from "./client";

export interface SystemSetting {
  key: string;
  value: string;
  category: string;
  label: string;
  description: string;
  valueType: "string" | "integer" | "boolean" | "json";
  isSecret: boolean;
  isRequired: boolean;
  updatedBy: string | null;
  updatedAt: string;
  createdAt: string;
}

export interface SettingsByCategory {
  storage: SystemSetting[];
  email: SystemSetting[];
  sms: SystemSetting[];
  whatsapp: SystemSetting[];
  geobox: SystemSetting[];
  platform: SystemSetting[];
  features: SystemSetting[];
  agency: SystemSetting[];
  payments: SystemSetting[];
}

export interface GeoBoxTestResult {
  success: boolean;
  environment: string;
  message: string;
}

export interface ConnectionTestResult {
  success: boolean;
  provider?: string;
  channel?: string;
  message: string;
}

export const settingsApi = {
  getAll: () => apiGet<SettingsByCategory>("/admin/settings"),

  getPublic: () => apiGet<Record<string, string>>("/settings/public"),

  // Anonymous — no auth required. Safe to call from marketing pages and public routes.
  getAnonymousFlags: () => apiGet<Record<string, string>>("/settings/platform-flags"),

  update: (key: string, value: string) =>
    apiPut<SystemSetting>(`/admin/settings/${key}`, { value }),

  testStorage: () =>
    apiPost<ConnectionTestResult>("/admin/settings/test/storage"),

  testEmail: (recipient: string) =>
    apiPost<ConnectionTestResult>("/admin/settings/test/email", { recipient }),

  testSms: (recipient: string) =>
    apiPost<ConnectionTestResult>("/admin/settings/test/sms", { recipient }),

  testWhatsApp: (recipient: string) =>
    apiPost<ConnectionTestResult>("/admin/settings/test/whatsapp", { recipient }),

  testGeobox: () =>
    apiPost<GeoBoxTestResult>("/admin/settings/test/geobox"),

  refreshExchangeRate: () =>
    apiPost<{ rate: number; updated_at: string; source: string }>("/admin/settings/refresh-exchange-rate"),
};
