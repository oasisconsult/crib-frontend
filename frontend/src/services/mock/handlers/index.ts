import { http, HttpResponse, delay } from "msw";
import {
  MOCK_PROPERTIES,
  MOCK_UNITS,
  MOCK_TENANTS,
  MOCK_LEASES,
  MOCK_PAYMENTS,
  MOCK_INSPECTIONS,
  MOCK_NOTIFICATIONS,
  MOCK_DASHBOARD_STATS,
  MOCK_OCCUPANCY,
  MOCK_REVENUE,
  MOCK_RENT_SCHEDULES,
} from "../data/seed";

const BASE = `${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"}/api/v1`;
const D = () => delay(300); // simulate network

export const handlers = [
  // ─── Analytics ─────────────────────────────────────────────────────────────
  http.get(`${BASE}/analytics/dashboard`, async () => {
    await D();
    return HttpResponse.json(MOCK_DASHBOARD_STATS);
  }),
  http.get(`${BASE}/analytics/occupancy`, async () => {
    await D();
    return HttpResponse.json(MOCK_OCCUPANCY);
  }),
  http.get(`${BASE}/analytics/revenue`, async () => {
    await D();
    return HttpResponse.json(MOCK_REVENUE);
  }),
  http.get(`${BASE}/analytics/cashflow`, async () => {
    await D();
    return HttpResponse.json(
      MOCK_REVENUE.map((r) => ({
        month: r.month,
        inflow: r.collected,
        outflow: r.expected * 0.3,
        net: r.collected - r.expected * 0.3,
      })),
    );
  }),

  // ─── Properties ────────────────────────────────────────────────────────────
  http.get(`${BASE}/properties`, async () => {
    await D();
    return HttpResponse.json({
      data: MOCK_PROPERTIES,
      total: MOCK_PROPERTIES.length,
      page: 1,
      pageSize: 20,
      totalPages: 1,
    });
  }),
  http.get(`${BASE}/properties/:id`, async ({ params }) => {
    await D();
    const prop = MOCK_PROPERTIES.find((p) => p.id === params.id);
    if (!prop) return new HttpResponse(null, { status: 404 });
    return HttpResponse.json(prop);
  }),
  http.post(`${BASE}/properties`, async ({ request }) => {
    await D();
    const body = await request.json() as Record<string, unknown>;
    const created = {
      ...body,
      id: `prop-${Date.now()}`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    return HttpResponse.json(created, { status: 201 });
  }),
  http.put(`${BASE}/properties/:id`, async ({ params, request }) => {
    await D();
    const body = await request.json() as Record<string, unknown>;
    const prop = MOCK_PROPERTIES.find((p) => p.id === params.id);
    if (!prop) return new HttpResponse(null, { status: 404 });
    return HttpResponse.json({ ...prop, ...body, updatedAt: new Date().toISOString() });
  }),

  // Units
  http.get(`${BASE}/properties/:propertyId/units`, async ({ params }) => {
    await D();
    const units = MOCK_UNITS.filter((u) => u.propertyId === params.propertyId);
    return HttpResponse.json({ data: units, total: units.length, page: 1, pageSize: 20, totalPages: 1 });
  }),

  // ─── Tenants ───────────────────────────────────────────────────────────────
  http.get(`${BASE}/tenants`, async () => {
    await D();
    return HttpResponse.json({
      data: MOCK_TENANTS,
      total: MOCK_TENANTS.length,
      page: 1,
      pageSize: 20,
      totalPages: 1,
    });
  }),
  http.get(`${BASE}/tenants/:id`, async ({ params }) => {
    await D();
    const tenant = MOCK_TENANTS.find((t) => t.id === params.id);
    if (!tenant) return new HttpResponse(null, { status: 404 });
    return HttpResponse.json(tenant);
  }),
  http.post(`${BASE}/tenants/invite`, async ({ request }) => {
    await D();
    const body = await request.json() as Record<string, unknown>;
    return HttpResponse.json({
      id: `invite-${Date.now()}`,
      ...body,
      token: `tok_${Math.random().toString(36).slice(2)}`,
      expiresAt: new Date(Date.now() + 72 * 3600000).toISOString(),
      sentAt: new Date().toISOString(),
      status: "pending",
    }, { status: 201 });
  }),
  http.get(`${BASE}/tenants/onboarding/:token`, async ({ params }) => {
    await D();
    return HttpResponse.json({
      tenant: MOCK_TENANTS[2],
      invite: {
        id: "invite-1",
        token: params.token,
        email: "priya.sharma@example.com",
        name: "Priya Sharma",
        propertyId: "prop-2",
        status: "pending",
        expiresAt: new Date(Date.now() + 48 * 3600000).toISOString(),
        sentAt: new Date().toISOString(),
      },
    });
  }),

  // ─── Leases ────────────────────────────────────────────────────────────────
  http.get(`${BASE}/leases`, async () => {
    await D();
    return HttpResponse.json({
      data: MOCK_LEASES,
      total: MOCK_LEASES.length,
      page: 1,
      pageSize: 20,
      totalPages: 1,
    });
  }),
  http.get(`${BASE}/leases/:id`, async ({ params }) => {
    await D();
    const lease = MOCK_LEASES.find((l) => l.id === params.id);
    if (!lease) return new HttpResponse(null, { status: 404 });
    return HttpResponse.json(lease);
  }),
  http.post(`${BASE}/leases/:id/transition`, async ({ params, request }) => {
    await D();
    const body = await request.json() as { event: string };
    const lease = MOCK_LEASES.find((l) => l.id === params.id);
    if (!lease) return new HttpResponse(null, { status: 404 });
    // Simple mock: map events to states
    const eventStateMap: Record<string, string> = {
      LEASE_SENT: "pending",
      LEASE_ACTIVATED: "active",
      NOTICE_GIVEN: "notice",
      LEASE_TERMINATED: "terminated",
      LEASE_CLOSED: "closed",
    };
    const newState = eventStateMap[body.event] ?? lease.state;
    return HttpResponse.json({ ...lease, state: newState });
  }),

  // ─── Payments ──────────────────────────────────────────────────────────────
  http.get(`${BASE}/payments`, async () => {
    await D();
    return HttpResponse.json({
      data: MOCK_PAYMENTS,
      total: MOCK_PAYMENTS.length,
      page: 1,
      pageSize: 20,
      totalPages: 1,
    });
  }),
  http.get(`${BASE}/rent-schedules`, async () => {
    await D();
    return HttpResponse.json(MOCK_RENT_SCHEDULES);
  }),
  http.get(`${BASE}/tenants/:tenantId/ledger`, async () => {
    await D();
    return HttpResponse.json([
      { id: "l1", date: "2025-02-01", description: "Rent – Feb 2025", category: "rent", debit: 0, credit: 1500, balance: 0, currency: "GBP", reference: "PAY-2025-02-T1" },
      { id: "l2", date: "2025-03-01", description: "Rent – Mar 2025", category: "rent", debit: 1500, credit: 0, balance: 1500, currency: "GBP", reference: "PAY-2025-03-T1" },
    ]);
  }),

  // ─── Inspections ───────────────────────────────────────────────────────────
  http.get(`${BASE}/inspections`, async () => {
    await D();
    return HttpResponse.json({
      data: MOCK_INSPECTIONS,
      total: MOCK_INSPECTIONS.length,
      page: 1,
      pageSize: 20,
      totalPages: 1,
    });
  }),
  http.get(`${BASE}/inspections/:id`, async ({ params }) => {
    await D();
    const insp = MOCK_INSPECTIONS.find((i) => i.id === params.id);
    if (!insp) return new HttpResponse(null, { status: 404 });
    return HttpResponse.json(insp);
  }),

  // ─── Notifications ─────────────────────────────────────────────────────────
  http.get(`${BASE}/notifications`, async () => {
    await D();
    return HttpResponse.json({
      data: MOCK_NOTIFICATIONS,
      total: MOCK_NOTIFICATIONS.length,
      page: 1,
      pageSize: 20,
      totalPages: 1,
    });
  }),
  http.get(`${BASE}/notifications/stats`, async () => {
    await D();
    return HttpResponse.json({
      total: 45,
      sent: 42,
      delivered: 38,
      read: 30,
      failed: 3,
      deliveryRate: 90.5,
      readRate: 71.4,
      byChannel: { whatsapp: 20, email: 18, sms: 4, in_app: 3 },
    });
  }),
  http.get(`${BASE}/notification-templates`, async () => {
    await D();
    return HttpResponse.json([
      {
        id: "tmpl-1",
        name: "Rent Due Reminder",
        trigger: "rent_due",
        channel: "whatsapp",
        body: "Hi {{tenant_name}}, your rent of {{amount}} for {{unit_name}} is due on {{due_date}}. Please arrange payment to avoid late fees.",
        variables: ["tenant_name", "amount", "unit_name", "due_date"],
        isActive: true,
        landlordId: "landlord-1",
        createdAt: "2024-01-01T00:00:00Z",
        updatedAt: "2024-01-01T00:00:00Z",
      },
      {
        id: "tmpl-2",
        name: "Lease Activation",
        trigger: "lease_activated",
        channel: "email",
        subject: "Your lease for {{unit_name}} is now active",
        body: "Dear {{tenant_name}},\n\nYour lease for {{unit_name}} at {{property_name}} has been activated. Your first rent payment of {{amount}} is due on {{first_due_date}}.\n\nWelcome home!",
        variables: ["tenant_name", "unit_name", "property_name", "amount", "first_due_date"],
        isActive: true,
        landlordId: "landlord-1",
        createdAt: "2024-01-01T00:00:00Z",
        updatedAt: "2024-01-01T00:00:00Z",
      },
    ]);
  }),

  // ─── File Upload ───────────────────────────────────────────────────────────
  http.post(`${BASE}/upload/presign`, async () => {
    await D();
    return HttpResponse.json({
      uploadUrl: "https://mock-minio.example.com/upload",
      publicUrl: `https://mock-minio.example.com/crib-local/doc-${Date.now()}.pdf`,
      key: `doc-${Date.now()}`,
      expiresIn: 3600,
    });
  }),
];
