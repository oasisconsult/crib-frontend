import { apiGet, apiPost, apiPut } from "./client";

export interface EmailTemplate {
  slug: string;
  name: string;
  description: string;
  subject: string;
  htmlBody: string;
  textBody: string;
  isActive: boolean;
  availableVariables: string[];
  updatedBy: string | null;
  updatedAt: string;
  createdAt: string;
}

export interface EmailTemplateUpdate {
  subject: string;
  htmlBody: string;
  textBody: string;
  isActive: boolean;
}

export interface EmailTemplatePreview {
  subject: string;
  htmlBody: string;
  textBody: string;
}

export interface EmailTemplateTestSendResult {
  success: boolean;
  message: string;
}

export const emailTemplatesApi = {
  list: () => apiGet<EmailTemplate[]>("/admin/email-templates"),

  get: (slug: string) => apiGet<EmailTemplate>(`/admin/email-templates/${slug}`),

  update: (slug: string, body: EmailTemplateUpdate) =>
    apiPut<EmailTemplate>(`/admin/email-templates/${slug}`, body),

  preview: (slug: string) =>
    apiPost<EmailTemplatePreview>(`/admin/email-templates/${slug}/preview`),

  testSend: (slug: string, recipient: string) =>
    apiPost<EmailTemplateTestSendResult>(`/admin/email-templates/${slug}/test-send`, { recipient }),
};
