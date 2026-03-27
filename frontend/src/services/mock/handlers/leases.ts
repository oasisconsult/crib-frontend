import { http, HttpResponse } from "msw";
import { mockLeases } from "../data";
import { paginate } from "./properties";

const BASE = "/api/v1";

const EVENT_STATE_MAP: Record<string, string> = {
  LEASE_SENT: "pending",
  LEASE_ACTIVATED: "active",
  NOTICE_GIVEN: "notice",
  LEASE_TERMINATED: "terminated",
  LEASE_CLOSED: "closed",
};

export const leaseHandlers = [
  // ─── List ────────────────────────────────────────────────────────────────────
  http.get(`${BASE}/leases`, ({ request }) => {
    const url = new URL(request.url);
    return HttpResponse.json(paginate(mockLeases, url.searchParams));
  }),

  // ─── Get ──────────────────────────────────────────────────────────────────
  http.get(`${BASE}/leases/:id`, ({ params }) => {
    const lease = mockLeases.find((l) => l.id === params.id);
    if (!lease) return HttpResponse.json({ code: "NOT_FOUND", message: "Lease not found" }, { status: 404 });
    return HttpResponse.json(lease);
  }),

  // ─── Create ───────────────────────────────────────────────────────────────
  http.post(`${BASE}/leases`, async ({ request }) => {
    const body = await request.json() as Record<string, unknown>;
    const newLease = {
      ...body,
      id: `lease-${Date.now()}`,
      state: "draft",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    return HttpResponse.json(newLease, { status: 201 });
  }),

  // ─── Update ───────────────────────────────────────────────────────────────
  http.put(`${BASE}/leases/:id`, async ({ params, request }) => {
    const body = await request.json() as Record<string, unknown>;
    const lease = mockLeases.find((l) => l.id === params.id);
    if (!lease) return HttpResponse.json({ code: "NOT_FOUND", message: "Lease not found" }, { status: 404 });
    return HttpResponse.json({ ...lease, ...body, updatedAt: new Date().toISOString() });
  }),

  // ─── Delete ───────────────────────────────────────────────────────────────
  http.delete(`${BASE}/leases/:id`, () => new HttpResponse(null, { status: 204 })),

  // ─── State transition ────────────────────────────────────────────────────
  http.post(`${BASE}/leases/:id/transition`, async ({ params, request }) => {
    const body = await request.json() as { event: string };
    const lease = mockLeases.find((l) => l.id === params.id);
    if (!lease) return HttpResponse.json({ code: "NOT_FOUND", message: "Lease not found" }, { status: 404 });
    const newState = EVENT_STATE_MAP[body.event] ?? lease.state;
    return HttpResponse.json({ ...lease, state: newState, updatedAt: new Date().toISOString() });
  }),

  // ─── Signatures ──────────────────────────────────────────────────────────
  http.post(`${BASE}/leases/:id/sign`, async ({ params, request }) => {
    const body = await request.json() as Record<string, unknown>;
    const lease = mockLeases.find((l) => l.id === params.id);
    if (!lease) return HttpResponse.json({ code: "NOT_FOUND", message: "Lease not found" }, { status: 404 });
    const updatedSignatures = (lease as any).signatures?.map((sig: any) =>
      sig.party === body.party ? { ...sig, status: "signed", signedAt: new Date().toISOString() } : sig,
    );
    return HttpResponse.json({ ...lease, signatures: updatedSignatures, updatedAt: new Date().toISOString() });
  }),

  // ─── Generate PDF document ───────────────────────────────────────────────
  http.post(`${BASE}/leases/:id/document`, ({ params }) => {
    return HttpResponse.json({ url: `https://example.com/leases/${params.id}/lease.pdf` });
  }),

  // ─── Audit log ───────────────────────────────────────────────────────────
  http.get(`${BASE}/leases/:id/audit`, () => {
    return HttpResponse.json([]);
  }),

  // ─── Renew ───────────────────────────────────────────────────────────────
  http.post(`${BASE}/leases/:id/renew`, async ({ params, request }) => {
    const body = await request.json() as Record<string, unknown>;
    const lease = mockLeases.find((l) => l.id === params.id);
    if (!lease) return HttpResponse.json({ code: "NOT_FOUND", message: "Lease not found" }, { status: 404 });
    const renewed = {
      ...lease,
      ...body,
      id: `lease-${Date.now()}`,
      state: "draft",
      reference: `${(lease as any).reference}-R`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    return HttpResponse.json(renewed, { status: 201 });
  }),

  // ─── Deposit (called via paymentsApi) ────────────────────────────────────
  http.get(`${BASE}/leases/:leaseId/deposit`, ({ params }) => {
    const lease = mockLeases.find((l) => l.id === params.leaseId);
    return HttpResponse.json({
      id: `dep-${params.leaseId}`,
      leaseId: params.leaseId,
      amount: (lease as any)?.depositAmount ?? 0,
      currency: "UGX",
      state: "held",
      createdAt: (lease as any)?.createdAt ?? new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  }),

  http.put(`${BASE}/leases/:leaseId/deposit`, async ({ params, request }) => {
    const body = await request.json() as Record<string, unknown>;
    const lease = mockLeases.find((l) => l.id === params.leaseId);
    return HttpResponse.json({
      id: `dep-${params.leaseId}`,
      leaseId: params.leaseId,
      amount: (lease as any)?.depositAmount ?? 0,
      currency: "UGX",
      state: "held",
      ...body,
      updatedAt: new Date().toISOString(),
    });
  }),
];
