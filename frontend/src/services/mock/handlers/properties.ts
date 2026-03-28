import { http, HttpResponse } from "msw";
import { mockProperties, mockUnits } from "../data";

// Match whatever origin axios is configured to use so MSW intercepts correctly.
const BASE = `${process.env.NEXT_PUBLIC_API_URL ?? ""}/api/v1`;

function paginate<T>(items: T[], params: URLSearchParams) {
  const page = parseInt(params.get("page") ?? "1");
  const pageSize = parseInt(params.get("pageSize") ?? "20");
  const start = (page - 1) * pageSize;
  const data = items.slice(start, start + pageSize);
  return { data, total: items.length, page, pageSize, totalPages: Math.ceil(items.length / pageSize) };
}

export { paginate };

export const propertyHandlers = [
  // ─── Properties ─────────────────────────────────────────────────────────────
  http.get(`${BASE}/properties`, ({ request }) => {
    const url = new URL(request.url);
    return HttpResponse.json(paginate(mockProperties, url.searchParams));
  }),

  http.get(`${BASE}/properties/:id`, ({ params }) => {
    const prop = mockProperties.find((p) => p.id === params.id);
    if (!prop) return HttpResponse.json({ code: "NOT_FOUND", message: "Property not found" }, { status: 404 });
    return HttpResponse.json(prop);
  }),

  http.post(`${BASE}/properties`, async ({ request }) => {
    const body = await request.json() as Record<string, unknown>;
    const newProp = {
      ...body,
      id: `prop-${Date.now()}`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    return HttpResponse.json(newProp, { status: 201 });
  }),

  http.put(`${BASE}/properties/:id`, async ({ params, request }) => {
    const body = await request.json() as Record<string, unknown>;
    const prop = mockProperties.find((p) => p.id === params.id);
    if (!prop) return HttpResponse.json({ code: "NOT_FOUND", message: "Property not found" }, { status: 404 });
    return HttpResponse.json({ ...prop, ...body, updatedAt: new Date().toISOString() });
  }),

  http.patch(`${BASE}/properties/:id/rules`, async ({ params, request }) => {
    const body = await request.json() as Record<string, unknown>;
    const prop = mockProperties.find((p) => p.id === params.id);
    if (!prop) return HttpResponse.json({ code: "NOT_FOUND", message: "Property not found" }, { status: 404 });
    return HttpResponse.json({ ...prop, rules: { ...(prop as any).rules, ...body }, updatedAt: new Date().toISOString() });
  }),

  http.delete(`${BASE}/properties/:id`, () => new HttpResponse(null, { status: 204 })),

  // ─── Units ──────────────────────────────────────────────────────────────────
  http.get(`${BASE}/properties/:propertyId/units`, ({ params, request }) => {
    const url = new URL(request.url);
    const units = mockUnits.filter((u) => u.propertyId === params.propertyId);
    return HttpResponse.json(paginate(units, url.searchParams));
  }),

  http.get(`${BASE}/properties/:propertyId/units/:unitId`, ({ params }) => {
    const unit = mockUnits.find((u) => u.propertyId === params.propertyId && u.id === params.unitId);
    if (!unit) return HttpResponse.json({ code: "NOT_FOUND", message: "Unit not found" }, { status: 404 });
    return HttpResponse.json(unit);
  }),

  http.post(`${BASE}/properties/:propertyId/units`, async ({ params, request }) => {
    const body = await request.json() as Record<string, unknown>;
    const newUnit = {
      ...body,
      id: `unit-${Date.now()}`,
      propertyId: params.propertyId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    return HttpResponse.json(newUnit, { status: 201 });
  }),

  http.put(`${BASE}/properties/:propertyId/units/:unitId`, async ({ params, request }) => {
    const body = await request.json() as Record<string, unknown>;
    const unit = mockUnits.find((u) => u.propertyId === params.propertyId && u.id === params.unitId);
    if (!unit) return HttpResponse.json({ code: "NOT_FOUND", message: "Unit not found" }, { status: 404 });
    return HttpResponse.json({ ...unit, ...body, updatedAt: new Date().toISOString() });
  }),

  http.delete(`${BASE}/properties/:propertyId/units/:unitId`, () => new HttpResponse(null, { status: 204 })),

  // Per-unit rules override
  http.patch(`${BASE}/properties/:propertyId/units/:unitId/rules`, async ({ params, request }) => {
    const body = await request.json() as { rules: Record<string, unknown> | null };
    const unit = mockUnits.find((u) => u.propertyId === params.propertyId && u.id === params.unitId);
    if (!unit) return HttpResponse.json({ code: "NOT_FOUND", message: "Unit not found" }, { status: 404 });
    // rules: null means reset to property defaults (remove override)
    return HttpResponse.json({ ...unit, rules: body.rules ?? undefined, updatedAt: new Date().toISOString() });
  }),

  http.patch(`${BASE}/properties/:propertyId/units/bulk`, async ({ request }) => {
    const body = await request.json() as Record<string, unknown>;
    return HttpResponse.json([body]);
  }),
];
