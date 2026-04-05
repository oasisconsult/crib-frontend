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
  platform: SystemSetting[];
  features: SystemSetting[];
}

export interface ConnectionTestResult {
  success: boolean;
  provider?: string;
  channel?: string;
  message: string;
}

export const settingsApi = {
  getAll: () => apiGet<SettingsByCategory>("/admin/settings"),

  update: (key: string, value: string) =>
    apiPut<SystemSetting>(`/admin/settings/${key}`, { value }),

  testStorage: () =>
    apiPost<ConnectionTestResult>("/admin/settings/test/storage"),

  testEmail: (recipient: string) =>
    apiPost<ConnectionTestResult>("/admin/settings/test/email", { recipient }),

  testSms: (recipient: string) =>
    apiPost<ConnectionTestResult>("/admin/settings/test/sms", { recipient }),
};
