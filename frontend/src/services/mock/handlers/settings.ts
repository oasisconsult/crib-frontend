import { http, HttpResponse } from "msw";
import type { SettingsByCategory, SystemSetting } from "@/services/api/settings";

const BASE = `${process.env.NEXT_PUBLIC_API_URL ?? ""}/api/v1`;

const MASKED = "••••••";

// Mirrors SYSTEM_SETTING_DEFAULTS from backend/app/models/system_setting.py
const DEFAULTS: SystemSetting[] = [
  // Storage
  { key: "storage.provider",           value: "local",    category: "storage",  label: "Storage Provider",        description: "File upload backend: 'local' (dev), 's3' (AWS), 'r2' (Cloudflare R2), or 'minio'.", valueType: "string",  isSecret: false, isRequired: true,  updatedBy: null, updatedAt: "2026-01-01T00:00:00Z", createdAt: "2026-01-01T00:00:00Z" },
  { key: "storage.s3.bucket",           value: "",         category: "storage",  label: "S3 Bucket Name",          description: "Bucket name — used for S3, R2, and MinIO.",                                          valueType: "string",  isSecret: false, isRequired: false, updatedBy: null, updatedAt: "2026-01-01T00:00:00Z", createdAt: "2026-01-01T00:00:00Z" },
  { key: "storage.s3.region",           value: "us-east-1",category: "storage", label: "S3 Region",               description: "AWS region (e.g. 'eu-west-1'). Not used for R2 or MinIO.",                           valueType: "string",  isSecret: false, isRequired: false, updatedBy: null, updatedAt: "2026-01-01T00:00:00Z", createdAt: "2026-01-01T00:00:00Z" },
  { key: "storage.s3.endpoint_url",     value: "",         category: "storage",  label: "S3 Endpoint URL",         description: "Override endpoint for R2 or MinIO. Leave empty for AWS.",                             valueType: "string",  isSecret: false, isRequired: false, updatedBy: null, updatedAt: "2026-01-01T00:00:00Z", createdAt: "2026-01-01T00:00:00Z" },
  { key: "storage.s3.public_base_url",  value: "",         category: "storage",  label: "Public Base URL",         description: "CDN or public URL prefix for uploaded files.",                                       valueType: "string",  isSecret: false, isRequired: false, updatedBy: null, updatedAt: "2026-01-01T00:00:00Z", createdAt: "2026-01-01T00:00:00Z" },
  { key: "storage.s3.access_key_id",    value: MASKED,     category: "storage",  label: "S3 Access Key ID",        description: "AWS/R2/MinIO access key ID.",                                                        valueType: "string",  isSecret: true,  isRequired: false, updatedBy: null, updatedAt: "2026-01-01T00:00:00Z", createdAt: "2026-01-01T00:00:00Z" },
  { key: "storage.s3.secret_access_key",value: MASKED,     category: "storage",  label: "S3 Secret Access Key",    description: "AWS/R2/MinIO secret access key.",                                                    valueType: "string",  isSecret: true,  isRequired: false, updatedBy: null, updatedAt: "2026-01-01T00:00:00Z", createdAt: "2026-01-01T00:00:00Z" },
  // Email
  { key: "email.provider",              value: "sendgrid", category: "email",    label: "Email Provider",          description: "Transactional email backend: 'sendgrid' or 'smtp'.",                                 valueType: "string",  isSecret: false, isRequired: true,  updatedBy: null, updatedAt: "2026-01-01T00:00:00Z", createdAt: "2026-01-01T00:00:00Z" },
  { key: "email.from_address",          value: "noreply@crib.app", category: "email", label: "From Address",       description: "Sender email address for all outgoing email.",                                      valueType: "string",  isSecret: false, isRequired: true,  updatedBy: null, updatedAt: "2026-01-01T00:00:00Z", createdAt: "2026-01-01T00:00:00Z" },
  { key: "email.from_name",             value: "Crib",     category: "email",    label: "From Name",               description: "Sender display name.",                                                               valueType: "string",  isSecret: false, isRequired: true,  updatedBy: null, updatedAt: "2026-01-01T00:00:00Z", createdAt: "2026-01-01T00:00:00Z" },
  { key: "email.sendgrid.api_key",      value: MASKED,     category: "email",    label: "SendGrid API Key",        description: "SendGrid API key (starts with SG.).",                                                valueType: "string",  isSecret: true,  isRequired: false, updatedBy: null, updatedAt: "2026-01-01T00:00:00Z", createdAt: "2026-01-01T00:00:00Z" },
  { key: "email.smtp.host",             value: "localhost",category: "email",    label: "SMTP Host",               description: "SMTP server hostname.",                                                              valueType: "string",  isSecret: false, isRequired: false, updatedBy: null, updatedAt: "2026-01-01T00:00:00Z", createdAt: "2026-01-01T00:00:00Z" },
  { key: "email.smtp.port",             value: "587",      category: "email",    label: "SMTP Port",               description: "SMTP port (587 for STARTTLS, 465 for SSL).",                                         valueType: "integer", isSecret: false, isRequired: false, updatedBy: null, updatedAt: "2026-01-01T00:00:00Z", createdAt: "2026-01-01T00:00:00Z" },
  { key: "email.smtp.username",         value: "",         category: "email",    label: "SMTP Username",           description: "SMTP authentication username.",                                                      valueType: "string",  isSecret: false, isRequired: false, updatedBy: null, updatedAt: "2026-01-01T00:00:00Z", createdAt: "2026-01-01T00:00:00Z" },
  { key: "email.smtp.password",         value: MASKED,     category: "email",    label: "SMTP Password",           description: "SMTP authentication password.",                                                      valueType: "string",  isSecret: true,  isRequired: false, updatedBy: null, updatedAt: "2026-01-01T00:00:00Z", createdAt: "2026-01-01T00:00:00Z" },
  { key: "email.smtp.use_tls",          value: "true",     category: "email",    label: "SMTP Use TLS",            description: "Use STARTTLS when connecting to the SMTP server.",                                   valueType: "boolean", isSecret: false, isRequired: false, updatedBy: null, updatedAt: "2026-01-01T00:00:00Z", createdAt: "2026-01-01T00:00:00Z" },
  // SMS
  { key: "sms.provider",                value: "twilio",   category: "sms",      label: "SMS Provider",            description: "SMS backend: 'twilio' or 'africastalking'.",                                        valueType: "string",  isSecret: false, isRequired: true,  updatedBy: null, updatedAt: "2026-01-01T00:00:00Z", createdAt: "2026-01-01T00:00:00Z" },
  { key: "sms.twilio.account_sid",      value: "",         category: "sms",      label: "Twilio Account SID",      description: "Twilio account SID (starts with AC).",                                              valueType: "string",  isSecret: false, isRequired: false, updatedBy: null, updatedAt: "2026-01-01T00:00:00Z", createdAt: "2026-01-01T00:00:00Z" },
  { key: "sms.twilio.auth_token",       value: MASKED,     category: "sms",      label: "Twilio Auth Token",       description: "Twilio auth token.",                                                                 valueType: "string",  isSecret: true,  isRequired: false, updatedBy: null, updatedAt: "2026-01-01T00:00:00Z", createdAt: "2026-01-01T00:00:00Z" },
  { key: "sms.twilio.from_number",      value: "",         category: "sms",      label: "Twilio From Number",      description: "Twilio phone number in E.164 format.",                                              valueType: "string",  isSecret: false, isRequired: false, updatedBy: null, updatedAt: "2026-01-01T00:00:00Z", createdAt: "2026-01-01T00:00:00Z" },
  { key: "sms.africastalking.api_key",  value: MASKED,     category: "sms",      label: "Africa's Talking API Key",description: "Africa's Talking API key.",                                                          valueType: "string",  isSecret: true,  isRequired: false, updatedBy: null, updatedAt: "2026-01-01T00:00:00Z", createdAt: "2026-01-01T00:00:00Z" },
  { key: "sms.africastalking.username", value: "",         category: "sms",      label: "AT Username",             description: "Africa's Talking application username.",                                             valueType: "string",  isSecret: false, isRequired: false, updatedBy: null, updatedAt: "2026-01-01T00:00:00Z", createdAt: "2026-01-01T00:00:00Z" },
  { key: "sms.africastalking.sender_id",value: "",         category: "sms",      label: "AT Sender ID",            description: "Registered sender ID for branded SMS.",                                             valueType: "string",  isSecret: false, isRequired: false, updatedBy: null, updatedAt: "2026-01-01T00:00:00Z", createdAt: "2026-01-01T00:00:00Z" },
  // Platform
  { key: "platform.default_currency",   value: "UGX",     category: "platform", label: "Default Currency",        description: "ISO 4217 currency code.",                                                            valueType: "string",  isSecret: false, isRequired: true,  updatedBy: null, updatedAt: "2026-01-01T00:00:00Z", createdAt: "2026-01-01T00:00:00Z" },
  { key: "platform.default_timezone",   value: "Africa/Kampala", category: "platform", label: "Default Timezone", description: "IANA timezone identifier.",                                                          valueType: "string",  isSecret: false, isRequired: true,  updatedBy: null, updatedAt: "2026-01-01T00:00:00Z", createdAt: "2026-01-01T00:00:00Z" },
  { key: "platform.support_email",      value: "support@crib.app", category: "platform", label: "Support Email",  description: "Contact email shown to users.",                                                     valueType: "string",  isSecret: false, isRequired: false, updatedBy: null, updatedAt: "2026-01-01T00:00:00Z", createdAt: "2026-01-01T00:00:00Z" },
  { key: "platform.max_upload_mb",      value: "10",      category: "platform", label: "Max Upload Size (MB)",     description: "Maximum file upload size in megabytes.",                                             valueType: "integer", isSecret: false, isRequired: true,  updatedBy: null, updatedAt: "2026-01-01T00:00:00Z", createdAt: "2026-01-01T00:00:00Z" },
  // Features
  { key: "features.esignature_enabled",  value: "true",  category: "features", label: "E-Signature Enabled",       description: "Enable the e-signature flow for lease signing.",                    valueType: "boolean", isSecret: false, isRequired: true,  updatedBy: null, updatedAt: "2026-01-01T00:00:00Z", createdAt: "2026-01-01T00:00:00Z" },
  { key: "features.efris_enabled",       value: "false", category: "features", label: "EFRIS Integration",         description: "Enable URA EFRIS tax receipt integration.",                        valueType: "boolean", isSecret: false, isRequired: true,  updatedBy: null, updatedAt: "2026-01-01T00:00:00Z", createdAt: "2026-01-01T00:00:00Z" },
  { key: "features.maintenance_portal",  value: "true",  category: "features", label: "Tenant Maintenance Portal", description: "Allow tenants to submit maintenance requests.",                    valueType: "boolean", isSecret: false, isRequired: true,  updatedBy: null, updatedAt: "2026-01-01T00:00:00Z", createdAt: "2026-01-01T00:00:00Z" },
  { key: "features.onboarding_enabled",  value: "true",  category: "features", label: "Tenant Onboarding",         description: "Enable the self-service onboarding wizard for new tenants.",      valueType: "boolean", isSecret: false, isRequired: true,  updatedBy: null, updatedAt: "2026-01-01T00:00:00Z", createdAt: "2026-01-01T00:00:00Z" },
  { key: "features.listings_page",       value: "true",  category: "features", label: "Public Listings Page",      description: "Show the public rental listings page (/listings).",              valueType: "boolean", isSecret: false, isRequired: true,  updatedBy: null, updatedAt: "2026-01-01T00:00:00Z", createdAt: "2026-01-01T00:00:00Z" },
  { key: "features.inspection_reports",  value: "true",  category: "features", label: "Inspection Reports",        description: "Enable the property inspection report flow.",                    valueType: "boolean", isSecret: false, isRequired: true,  updatedBy: null, updatedAt: "2026-01-01T00:00:00Z", createdAt: "2026-01-01T00:00:00Z" },
  { key: "features.screenings",          value: "false", category: "features", label: "Tenant Screening",          description: "Enable the tenant screening / background-check workflow.",      valueType: "boolean", isSecret: false, isRequired: true,  updatedBy: null, updatedAt: "2026-01-01T00:00:00Z", createdAt: "2026-01-01T00:00:00Z" },
];

// In-memory store for mock updates
const store = new Map<string, SystemSetting>(DEFAULTS.map((s) => [s.key, { ...s }]));

function grouped(): SettingsByCategory {
  const g: SettingsByCategory = { storage: [], email: [], sms: [], whatsapp: [], geobox: [], platform: [], features: [], agency: [], payments: [] };
  store.forEach((s) => {
    const cat = s.category as keyof SettingsByCategory;
    if (cat in g) g[cat].push(s);
  });
  return g;
}

export const settingsHandlers = [
  http.get(`${BASE}/admin/settings`, () => HttpResponse.json(grouped())),

  http.put(`${BASE}/admin/settings/:key`, async ({ request, params }) => {
    const key = decodeURIComponent(params.key as string);
    const { value } = await request.json() as { value: string };
    const existing = store.get(key);
    if (!existing) return HttpResponse.json({ detail: "Not found" }, { status: 404 });
    const updated: SystemSetting = {
      ...existing,
      value: existing.isSecret && value ? "••••••" : value,
      updatedAt: new Date().toISOString(),
    };
    store.set(key, updated);
    return HttpResponse.json(updated);
  }),

  http.post(`${BASE}/admin/settings/test/storage`, () =>
    HttpResponse.json({ success: true, provider: store.get("storage.provider")?.value ?? "local", message: "Connection successful (mock)" }),
  ),

  http.post(`${BASE}/admin/settings/test/email`, () =>
    HttpResponse.json({ success: true, channel: "email", message: "Test email sent (mock)" }),
  ),

  http.post(`${BASE}/admin/settings/test/sms`, () =>
    HttpResponse.json({ success: true, channel: "sms", message: "Test SMS sent (mock)" }),
  ),
];
