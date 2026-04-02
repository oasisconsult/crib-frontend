import { http, HttpResponse } from "msw";
import {
  mockPayments,
  mockLeases,
  mockDashboardStats,
  mockOccupancy,
  mockRevenue,
  mockCashFlow,
} from "../data";
import { paginate } from "./properties";

const BASE = `${process.env.NEXT_PUBLIC_API_URL ?? ""}/api/v1`;

// Derived mock rent schedules from leases – one entry per active lease
const mockRentSchedules = mockLeases
  .filter((l) => l.state === "active")
  .map((l, i) => ({
    id: `rs-${i + 1}`,
    state: "pending",
    leaseId: l.id,
    tenantId: l.tenantId,
    unitId: l.unitId,
    periodStart: "2026-03-01",
    periodEnd: "2026-03-31",
    dueDate: `2026-03-01`,
    amount: (l as any).terms?.monthlyRent ?? 0,
    currency: "UGX",
    generatedAt: "2026-02-20T00:00:00Z",
  }));

// Mock late fees
const mockLateFees = [
  {
    id: "lf-1",
    leaseId: "lease-2",
    tenantId: "tenant-2",
    amount: 50000,
    currency: "UGX",
    reason: "Late payment – March 2026",
    state: "outstanding",
    createdAt: "2026-03-06T00:00:00Z",
    updatedAt: "2026-03-06T00:00:00Z",
  },
];

export const paymentHandlers = [
  // ─── Payments ────────────────────────────────────────────────────────────────
  http.get(`${BASE}/payments`, ({ request }) => {
    const url = new URL(request.url);
    return HttpResponse.json(paginate(mockPayments, url.searchParams));
  }),

  http.get(`${BASE}/payments/:id`, ({ params }) => {
    const payment = mockPayments.find((p) => p.id === params.id);
    if (!payment) return HttpResponse.json({ code: "NOT_FOUND", message: "Payment not found" }, { status: 404 });
    return HttpResponse.json(payment);
  }),

  http.post(`${BASE}/payments`, async ({ request }) => {
    const body = await request.json() as Record<string, unknown>;
    const newPayment = {
      ...body,
      id: `pay-${Date.now()}`,
      state: "pending",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    return HttpResponse.json(newPayment, { status: 201 });
  }),

  http.patch(`${BASE}/payments/:id/reconcile`, ({ params }) => {
    const payment = mockPayments.find((p) => p.id === params.id);
    if (!payment) return HttpResponse.json({ code: "NOT_FOUND", message: "Payment not found" }, { status: 404 });
    return HttpResponse.json({ ...payment, state: "completed", updatedAt: new Date().toISOString() });
  }),
  http.patch(`${BASE}/payments/:id/confirm`, ({ params }) => {
    const payment = mockPayments.find((p) => p.id === params.id);
    if (!payment) return HttpResponse.json({ code: "NOT_FOUND", message: "Payment not found" }, { status: 404 });
    return HttpResponse.json({ ...payment, state: "confirmed", updatedAt: new Date().toISOString() });
  }),

  http.patch(`${BASE}/payments/:id/refund`, ({ params }) => {
    const payment = mockPayments.find((p) => p.id === params.id);
    if (!payment) return HttpResponse.json({ code: "NOT_FOUND", message: "Payment not found" }, { status: 404 });
    return HttpResponse.json({ ...payment, state: "refunded", updatedAt: new Date().toISOString() });
  }),

  // ─── Rent Schedules ───────────────────────────────────────────────────────
  http.get(`${BASE}/rent-schedules`, ({ request }) => {
    const url = new URL(request.url);
    const leaseId = url.searchParams.get("leaseId");
    const schedules = leaseId
      ? mockRentSchedules.filter((rs) => rs.leaseId === leaseId)
      : mockRentSchedules;
    return HttpResponse.json(schedules);
  }),

  // ─── Late Fees ────────────────────────────────────────────────────────────
  http.get(`${BASE}/late-fees`, ({ request }) => {
    const url = new URL(request.url);
    return HttpResponse.json(paginate(mockLateFees, url.searchParams));
  }),

  http.patch(`${BASE}/late-fees/:id/waive`, async ({ params, request }) => {
    const body = await request.json() as Record<string, unknown>;
    const fee = mockLateFees.find((f) => f.id === params.id);
    if (!fee) return HttpResponse.json({ code: "NOT_FOUND", message: "Late fee not found" }, { status: 404 });
    return HttpResponse.json({ ...fee, state: "waived", waiveReason: body.reason, updatedAt: new Date().toISOString() });
  }),

  // ─── Ledger ───────────────────────────────────────────────────────────────
  http.get(`${BASE}/leases/:id/ledger`, ({ params }) => {
    // Return ledger entries derived from payments for this lease
    const tenantPayments = mockPayments.filter((p) => p.leaseId === params.id);
    const entries = tenantPayments.map((p, i) => ({
      id: `led-${p.id}`,
      date: p.dueDate,
      description: `${p.type === "rent" ? "Rent" : p.type === "deposit" ? "Deposit" : "Late Fee"} – ${p.dueDate?.slice(0, 7)}`,
      category: p.type,
      debit: p.state === "completed" ? 0 : p.amount,
      credit: p.state === "completed" ? p.amount : 0,
      balance: p.state === "completed" ? 0 : p.amount,
      currency: "UGX",
      reference: p.reference,
    }));
    return HttpResponse.json(entries);
  }),

  // ─── Analytics ────────────────────────────────────────────────────────────
  http.get(`${BASE}/analytics/dashboard`, () => {
    return HttpResponse.json(mockDashboardStats);
  }),

  http.get(`${BASE}/analytics/occupancy`, () => {
    return HttpResponse.json(mockOccupancy);
  }),

  http.get(`${BASE}/analytics/revenue`, () => {
    return HttpResponse.json(mockRevenue);
  }),

  http.get(`${BASE}/analytics/cashflow`, () => {
    return HttpResponse.json(mockCashFlow);
  }),
];
