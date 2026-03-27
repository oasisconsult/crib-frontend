import { http, HttpResponse } from "msw";
import { mockInspections, mockMaintenance } from "../data";
import { paginate } from "./properties";

const BASE = "/api/v1";

const INSPECTION_EVENT_STATE_MAP: Record<string, string> = {
  SCHEDULE: "scheduled",
  START: "in_progress",
  COMPLETE: "completed",
  CANCEL: "cancelled",
};

const MAINTENANCE_EVENT_STATE_MAP: Record<string, string> = {
  ASSIGN: "assigned",
  START: "in_progress",
  RESOLVE: "resolved",
  CLOSE: "closed",
  REOPEN: "open",
};

export const inspectionHandlers = [
  // ─── Inspections ─────────────────────────────────────────────────────────────
  http.get(`${BASE}/inspections`, ({ request }) => {
    const url = new URL(request.url);
    return HttpResponse.json(paginate(mockInspections, url.searchParams));
  }),

  http.get(`${BASE}/inspections/:id`, ({ params }) => {
    const insp = mockInspections.find((i) => i.id === params.id);
    if (!insp) return HttpResponse.json({ code: "NOT_FOUND", message: "Inspection not found" }, { status: 404 });
    return HttpResponse.json(insp);
  }),

  http.post(`${BASE}/inspections`, async ({ request }) => {
    const body = await request.json() as Record<string, unknown>;
    const newInsp = {
      ...body,
      id: `insp-${Date.now()}`,
      state: "scheduled",
      checklist: [],
      photoUrls: [],
      videoUrls: [],
      maintenanceIssueIds: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    return HttpResponse.json(newInsp, { status: 201 });
  }),

  http.put(`${BASE}/inspections/:id`, async ({ params, request }) => {
    const body = await request.json() as Record<string, unknown>;
    const insp = mockInspections.find((i) => i.id === params.id);
    if (!insp) return HttpResponse.json({ code: "NOT_FOUND", message: "Inspection not found" }, { status: 404 });
    return HttpResponse.json({ ...insp, ...body, updatedAt: new Date().toISOString() });
  }),

  http.post(`${BASE}/inspections/:id/transition`, async ({ params, request }) => {
    const body = await request.json() as { event: string };
    const insp = mockInspections.find((i) => i.id === params.id);
    if (!insp) return HttpResponse.json({ code: "NOT_FOUND", message: "Inspection not found" }, { status: 404 });
    const newState = INSPECTION_EVENT_STATE_MAP[body.event] ?? insp.state;
    return HttpResponse.json({ ...insp, state: newState, updatedAt: new Date().toISOString() });
  }),

  http.patch(`${BASE}/inspections/:id/photos`, async ({ params, request }) => {
    const body = await request.json() as { urls: string[] };
    const insp = mockInspections.find((i) => i.id === params.id);
    if (!insp) return HttpResponse.json({ code: "NOT_FOUND", message: "Inspection not found" }, { status: 404 });
    const existingPhotos = (insp as any).photoUrls ?? [];
    return HttpResponse.json({
      ...insp,
      photoUrls: [...existingPhotos, ...(body.urls ?? [])],
      updatedAt: new Date().toISOString(),
    });
  }),

  // ─── Maintenance ─────────────────────────────────────────────────────────────
  http.get(`${BASE}/maintenance`, ({ request }) => {
    const url = new URL(request.url);
    return HttpResponse.json(paginate(mockMaintenance, url.searchParams));
  }),

  http.get(`${BASE}/maintenance/:id`, ({ params }) => {
    const issue = mockMaintenance.find((m) => m.id === params.id);
    if (!issue) return HttpResponse.json({ code: "NOT_FOUND", message: "Maintenance issue not found" }, { status: 404 });
    return HttpResponse.json(issue);
  }),

  http.post(`${BASE}/maintenance`, async ({ request }) => {
    const body = await request.json() as Record<string, unknown>;
    const newIssue = {
      ...body,
      id: `maint-${Date.now()}`,
      state: "open",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    return HttpResponse.json(newIssue, { status: 201 });
  }),

  http.post(`${BASE}/maintenance/:id/transition`, async ({ params, request }) => {
    const body = await request.json() as { event: string };
    const issue = mockMaintenance.find((m) => m.id === params.id);
    if (!issue) return HttpResponse.json({ code: "NOT_FOUND", message: "Maintenance issue not found" }, { status: 404 });
    const newState = MAINTENANCE_EVENT_STATE_MAP[body.event] ?? issue.state;
    return HttpResponse.json({ ...issue, state: newState, updatedAt: new Date().toISOString() });
  }),
];
