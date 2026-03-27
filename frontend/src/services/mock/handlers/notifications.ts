import { http, HttpResponse } from "msw";
import { mockNotifications, mockTemplates } from "../data";
import { paginate } from "./properties";

const BASE = "/api/v1";

export const notificationHandlers = [
  // ─── Notifications ───────────────────────────────────────────────────────────
  http.get(`${BASE}/notifications`, ({ request }) => {
    const url = new URL(request.url);
    return HttpResponse.json(paginate(mockNotifications, url.searchParams));
  }),

  http.post(`${BASE}/notifications/send`, async ({ request }) => {
    const body = await request.json() as Record<string, unknown>;
    const newNotif = {
      ...body,
      id: `notif-${Date.now()}`,
      state: "queued",
      queuedAt: new Date().toISOString(),
      retryCount: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    return HttpResponse.json(newNotif, { status: 201 });
  }),

  http.get(`${BASE}/notifications/stats`, () => {
    return HttpResponse.json({
      sent: 120,
      delivered: 115,
      failed: 3,
      read: 89,
      deliveryRate: 95.8,
      readRate: 74.2,
      byChannel: { sms: 95, email: 20, in_app: 5 },
    });
  }),

  // ─── Notification Templates ───────────────────────────────────────────────
  http.get(`${BASE}/notification-templates`, () => {
    return HttpResponse.json(mockTemplates);
  }),

  http.get(`${BASE}/notification-templates/:id`, ({ params }) => {
    const template = mockTemplates.find((t) => t.id === params.id);
    if (!template) return HttpResponse.json({ code: "NOT_FOUND", message: "Template not found" }, { status: 404 });
    return HttpResponse.json(template);
  }),

  http.post(`${BASE}/notification-templates`, async ({ request }) => {
    const body = await request.json() as Record<string, unknown>;
    const newTemplate = {
      ...body,
      id: `tmpl-${Date.now()}`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    return HttpResponse.json(newTemplate, { status: 201 });
  }),

  http.put(`${BASE}/notification-templates/:id`, async ({ params, request }) => {
    const body = await request.json() as Record<string, unknown>;
    const template = mockTemplates.find((t) => t.id === params.id);
    if (!template) return HttpResponse.json({ code: "NOT_FOUND", message: "Template not found" }, { status: 404 });
    return HttpResponse.json({ ...template, ...body, updatedAt: new Date().toISOString() });
  }),

  http.delete(`${BASE}/notification-templates/:id`, () => new HttpResponse(null, { status: 204 })),

  http.post(`${BASE}/notification-templates/:id/preview`, async ({ params, request }) => {
    const body = await request.json() as { variables?: Record<string, string> };
    const template = mockTemplates.find((t) => t.id === params.id);
    if (!template) return HttpResponse.json({ code: "NOT_FOUND", message: "Template not found" }, { status: 404 });

    // Replace {{variable}} placeholders with provided values or a fallback
    const vars = body.variables ?? {};
    const rendered = template.body.replace(/\{\{(\w+)\}\}/g, (_: string, key: string) => vars[key] ?? `[${key}]`);
    const renderedSubject = template.subject
      ? template.subject.replace(/\{\{(\w+)\}\}/g, (_: string, key: string) => vars[key] ?? `[${key}]`)
      : undefined;

    return HttpResponse.json({
      ...(renderedSubject ? { subject: renderedSubject } : {}),
      body: rendered,
    });
  }),
];
