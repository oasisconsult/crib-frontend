import { http, HttpResponse } from "msw";
import { paginate } from "./properties";
import type { AuditLogEntry } from "@/services/api/auditLogs";

const BASE = `${process.env.NEXT_PUBLIC_API_URL ?? ""}/api/v1`;

const MOCK_ORG_ID = "11111111-1111-1111-1111-111111111111";

const FIXTURE_LOGS: AuditLogEntry[] = [
  {
    id: "a1b2c3d4-0001-0001-0001-000000000001",
    organisationId: MOCK_ORG_ID,
    actorId: "user-001",
    actorRole: "owner",
    actorName: "Alice Nakato",
    resourceType: "property",
    resourceId: "prop-001",
    resourceLabel: "Kololo Heights",
    action: "property.created",
    changes: {},
    eventData: {},
    ipAddress: "197.239.4.1",
    requestId: "req-001",
    createdAt: new Date(Date.now() - 1000 * 60 * 5).toISOString(),
  },
  {
    id: "a1b2c3d4-0001-0001-0001-000000000002",
    organisationId: MOCK_ORG_ID,
    actorId: "user-002",
    actorRole: "manager",
    actorName: "Bob Oryem",
    resourceType: "tenant",
    resourceId: "tenant-001",
    resourceLabel: "Jane Auma",
    action: "tenant.approved",
    changes: {},
    eventData: {},
    ipAddress: "197.239.4.2",
    requestId: "req-002",
    createdAt: new Date(Date.now() - 1000 * 60 * 20).toISOString(),
  },
  {
    id: "a1b2c3d4-0001-0001-0001-000000000003",
    organisationId: MOCK_ORG_ID,
    actorId: "user-001",
    actorRole: "owner",
    actorName: "Alice Nakato",
    resourceType: "lease",
    resourceId: "lease-001",
    resourceLabel: "Lease lease-001",
    action: "lease.activated",
    changes: {},
    eventData: { unit_id: "unit-001" },
    ipAddress: "197.239.4.1",
    requestId: "req-003",
    createdAt: new Date(Date.now() - 1000 * 60 * 60).toISOString(),
  },
  {
    id: "a1b2c3d4-0001-0001-0001-000000000004",
    organisationId: MOCK_ORG_ID,
    actorId: "user-002",
    actorRole: "manager",
    actorName: "Bob Oryem",
    resourceType: "property",
    resourceId: "prop-001",
    resourceLabel: "Kololo Heights",
    action: "property.updated",
    changes: {
      name: { before: "Kololo Flats", after: "Kololo Heights" },
    },
    eventData: {},
    ipAddress: "197.239.4.2",
    requestId: "req-004",
    createdAt: new Date(Date.now() - 1000 * 60 * 90).toISOString(),
  },
  {
    id: "a1b2c3d4-0001-0001-0001-000000000005",
    organisationId: MOCK_ORG_ID,
    actorId: "user-001",
    actorRole: "owner",
    actorName: "Alice Nakato",
    resourceType: "payment",
    resourceId: "pay-001",
    resourceLabel: "Payment pay-001",
    action: "payment.confirmed",
    changes: {},
    eventData: { lease_id: "lease-001" },
    ipAddress: "197.239.4.1",
    requestId: "req-005",
    createdAt: new Date(Date.now() - 1000 * 60 * 120).toISOString(),
  },
  {
    id: "a1b2c3d4-0001-0001-0001-000000000006",
    organisationId: MOCK_ORG_ID,
    actorId: "user-002",
    actorRole: "manager",
    actorName: "Bob Oryem",
    resourceType: "tenant",
    resourceId: "tenant-002",
    resourceLabel: "Peter Otim",
    action: "tenant.rejected",
    changes: {},
    eventData: { reason: "Incomplete documents submitted." },
    ipAddress: "197.239.4.2",
    requestId: "req-006",
    createdAt: new Date(Date.now() - 1000 * 60 * 180).toISOString(),
  },
];

function filterLogs(logs: AuditLogEntry[], params: Record<string, string>) {
  let result = [...logs];
  if (params.search) {
    const q = params.search.toLowerCase();
    result = result.filter(
      (l) => l.resourceLabel?.toLowerCase().includes(q) || l.actorName?.toLowerCase().includes(q),
    );
  }
  if (params.resourceType) {
    result = result.filter((l) => l.resourceType === params.resourceType);
  }
  if (params.action) {
    result = result.filter((l) => l.action.includes(params.action));
  }
  return result;
}

export const auditLogHandlers = [
  http.get(`${BASE}/audit-logs`, ({ request }) => {
    const url = new URL(request.url);
    const params = Object.fromEntries(url.searchParams.entries());
    const filtered = filterLogs(FIXTURE_LOGS, params);
    return HttpResponse.json(paginate(filtered, url.searchParams));
  }),

  http.get(`${BASE}/audit-logs/:id`, ({ params }) => {
    const entry = FIXTURE_LOGS.find((l) => l.id === params.id);
    if (!entry) return new HttpResponse(null, { status: 404 });
    return HttpResponse.json(entry);
  }),

  http.get(`${BASE}/admin/audit-logs`, ({ request }) => {
    const url = new URL(request.url);
    const params = Object.fromEntries(url.searchParams.entries());
    const filtered = filterLogs(FIXTURE_LOGS, params);
    return HttpResponse.json(paginate(filtered, url.searchParams));
  }),
];
