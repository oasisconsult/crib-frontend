import { http, HttpResponse } from "msw";
import { mockTenants } from "../data";
import { paginate } from "./properties";

const BASE = `${process.env.NEXT_PUBLIC_API_URL ?? ""}/api/v1`;

export const tenantHandlers = [
  // ─── List ────────────────────────────────────────────────────────────────────
  http.get(`${BASE}/tenants`, ({ request }) => {
    const url = new URL(request.url);
    return HttpResponse.json(paginate(mockTenants, url.searchParams));
  }),

  // ─── Onboarding (must come before :id to avoid route collision) ────────────
  http.get(`${BASE}/tenants/onboarding/:token`, ({ params }) => {
    return HttpResponse.json({
      tenant: mockTenants[2],
      invite: {
        id: "invite-1",
        token: params.token,
        email: mockTenants[2].email,
        name: `${mockTenants[2].firstName} ${mockTenants[2].lastName}`,
        propertyId: mockTenants[2].currentPropertyId,
        status: "pending",
        expiresAt: new Date(Date.now() + 48 * 3600000).toISOString(),
        sentAt: new Date().toISOString(),
      },
    });
  }),

  http.post(`${BASE}/tenants/onboarding/:token/submit`, async () => {
    return HttpResponse.json({
      ...mockTenants[2],
      onboardingState: "submitted",
      updatedAt: new Date().toISOString(),
    });
  }),

  // ─── Invite ───────────────────────────────────────────────────────────────
  http.post(`${BASE}/tenants/invite`, async ({ request }) => {
    const body = await request.json() as Record<string, unknown>;
    return HttpResponse.json(
      {
        id: `invite-${Date.now()}`,
        ...body,
        token: `tok_${Math.random().toString(36).slice(2)}`,
        expiresAt: new Date(Date.now() + 72 * 3600000).toISOString(),
        sentAt: new Date().toISOString(),
        status: "pending",
      },
      { status: 201 },
    );
  }),

  // ─── Get / Update / Delete ────────────────────────────────────────────────
  http.get(`${BASE}/tenants/:id`, ({ params }) => {
    const tenant = mockTenants.find((t) => t.id === params.id);
    if (!tenant) return HttpResponse.json({ code: "NOT_FOUND", message: "Tenant not found" }, { status: 404 });
    return HttpResponse.json(tenant);
  }),

  http.put(`${BASE}/tenants/:id`, async ({ params, request }) => {
    const body = await request.json() as Record<string, unknown>;
    const tenant = mockTenants.find((t) => t.id === params.id);
    if (!tenant) return HttpResponse.json({ code: "NOT_FOUND", message: "Tenant not found" }, { status: 404 });
    return HttpResponse.json({ ...tenant, ...body, updatedAt: new Date().toISOString() });
  }),

  http.delete(`${BASE}/tenants/:id`, () => new HttpResponse(null, { status: 204 })),

  // ─── Approve / Reject ────────────────────────────────────────────────────
  http.patch(`${BASE}/tenants/:id/approve`, ({ params }) => {
    const tenant = mockTenants.find((t) => t.id === params.id);
    if (!tenant) return HttpResponse.json({ code: "NOT_FOUND", message: "Tenant not found" }, { status: 404 });
    return HttpResponse.json({
      ...tenant,
      onboardingState: "activated",
      status: "active",
      onboardingCompletedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  }),

  http.patch(`${BASE}/tenants/:id/reject`, async ({ params, request }) => {
    const body = await request.json() as Record<string, unknown>;
    const tenant = mockTenants.find((t) => t.id === params.id);
    if (!tenant) return HttpResponse.json({ code: "NOT_FOUND", message: "Tenant not found" }, { status: 404 });
    return HttpResponse.json({
      ...tenant,
      onboardingState: "rejected",
      rejectionReason: body.reason ?? "Application did not meet requirements.",
      updatedAt: new Date().toISOString(),
    });
  }),

  // ─── Documents ────────────────────────────────────────────────────────────
  http.get(`${BASE}/tenants/:id/documents`, () => {
    return HttpResponse.json([]);
  }),

  http.delete(`${BASE}/tenants/:id/documents/:docId`, () => new HttpResponse(null, { status: 204 })),

  // ─── Anonymise (GDPR) ────────────────────────────────────────────────────
  http.post(`${BASE}/tenants/:id/anonymise`, () => new HttpResponse(null, { status: 204 })),
];
