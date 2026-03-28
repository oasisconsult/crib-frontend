import { http, HttpResponse } from "msw";
import { mockTenants } from "../data";
import { paginate } from "./properties";
import type { TenantDocument } from "@/types";

const BASE = `${process.env.NEXT_PUBLIC_API_URL ?? ""}/api/v1`;

// ─── In-memory document store (keyed by tenantId) ──────────────────────────
const mockDocumentStore: Record<string, TenantDocument[]> = {
  "tenant-1": [
    {
      id: "doc-1",
      tenantId: "tenant-1",
      type: "national_id",
      name: "National ID Card",
      url: "https://example.com/docs/tenant-1/national-id.pdf",
      mimeType: "application/pdf",
      sizeBytes: 245760,
      verified: true,
      uploadedAt: "2024-09-28T10:00:00Z",
      expiresAt: "2029-09-27T00:00:00Z",
    },
    {
      id: "doc-2",
      tenantId: "tenant-1",
      type: "lease_agreement" as TenantDocument["type"],
      name: "Signed Lease Agreement – KOL-L0001",
      url: "https://example.com/docs/tenant-1/lease-kol-l0001.pdf",
      mimeType: "application/pdf",
      sizeBytes: 512000,
      verified: true,
      uploadedAt: "2024-09-29T09:15:00Z",
    },
    {
      id: "doc-3",
      tenantId: "tenant-1",
      type: "proof_of_income",
      name: "Employment Letter – Stanbic Bank",
      url: "https://example.com/docs/tenant-1/employment-letter.pdf",
      mimeType: "application/pdf",
      sizeBytes: 187392,
      verified: false,
      uploadedAt: "2024-09-28T10:30:00Z",
    },
  ],
  "tenant-2": [
    {
      id: "doc-4",
      tenantId: "tenant-2",
      type: "passport",
      name: "International Passport",
      url: "https://example.com/docs/tenant-2/passport.pdf",
      mimeType: "application/pdf",
      sizeBytes: 310000,
      verified: true,
      uploadedAt: "2025-04-01T10:00:00Z",
      expiresAt: "2030-03-31T00:00:00Z",
    },
    {
      id: "doc-5",
      tenantId: "tenant-2",
      type: "bank_statement",
      name: "Bank Statement – March 2025",
      url: "https://example.com/docs/tenant-2/bank-statement-mar25.pdf",
      mimeType: "application/pdf",
      sizeBytes: 98304,
      verified: false,
      uploadedAt: "2025-04-01T10:05:00Z",
    },
  ],
};

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

  http.patch(`${BASE}/tenants/:id`, async ({ params, request }) => {
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
  http.get(`${BASE}/tenants/:id/documents`, ({ params }) => {
    const docs = mockDocumentStore[params.id as string] ?? [];
    return HttpResponse.json(docs);
  }),

  http.post(`${BASE}/tenants/:id/documents`, async ({ params, request }) => {
    const body = await request.json() as Partial<TenantDocument>;
    const tenantId = params.id as string;
    const newDoc: TenantDocument = {
      id: `doc-${Date.now()}`,
      tenantId,
      type: body.type ?? "other",
      name: body.name ?? "Untitled document",
      url: body.url ?? `https://example.com/docs/${tenantId}/${Date.now()}.pdf`,
      mimeType: body.mimeType ?? "application/pdf",
      sizeBytes: body.sizeBytes ?? 0,
      verified: false,
      uploadedAt: new Date().toISOString(),
      expiresAt: body.expiresAt,
    };
    if (!mockDocumentStore[tenantId]) mockDocumentStore[tenantId] = [];
    mockDocumentStore[tenantId].push(newDoc);
    return HttpResponse.json(newDoc, { status: 201 });
  }),

  http.patch(`${BASE}/tenants/:id/documents/:docId/verify`, ({ params }) => {
    const tenantId = params.id as string;
    const docId = params.docId as string;
    const docs = mockDocumentStore[tenantId];
    if (!docs) return HttpResponse.json({ code: "NOT_FOUND" }, { status: 404 });
    const doc = docs.find((d) => d.id === docId);
    if (!doc) return HttpResponse.json({ code: "NOT_FOUND" }, { status: 404 });
    doc.verified = !doc.verified;
    return HttpResponse.json(doc);
  }),

  http.delete(`${BASE}/tenants/:id/documents/:docId`, ({ params }) => {
    const tenantId = params.id as string;
    const docId = params.docId as string;
    if (mockDocumentStore[tenantId]) {
      mockDocumentStore[tenantId] = mockDocumentStore[tenantId].filter((d) => d.id !== docId);
    }
    return new HttpResponse(null, { status: 204 });
  }),

  // ─── Anonymise (GDPR) ────────────────────────────────────────────────────
  http.post(`${BASE}/tenants/:id/anonymise`, () => new HttpResponse(null, { status: 204 })),
];
