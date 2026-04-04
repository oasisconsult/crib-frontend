import { http, HttpResponse } from "msw";

const BASE = `${process.env.NEXT_PUBLIC_API_URL ?? ""}/api/v1`;

// ── Dev user profiles (must match DEV_USERS in login page) ─────────────────

const DEV_USER_PROFILES: Record<string, object> = {
  "user-superadmin-1": {
    id: "user-superadmin-1",
    email: "admin@crib.ug",
    name: "Crib Admin",
    role: "superadmin",
    roles: ["superadmin"],
    status: "active",
    timezone: "Africa/Kampala",
    locale: "en-UG",
    createdAt: "2024-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  },
  "user-landlord-1": {
    id: "user-landlord-1",
    email: "robert@crib.ug",
    name: "Robert Mukasa",
    role: "owner",
    roles: ["owner"],
    status: "active",
    timezone: "Africa/Kampala",
    locale: "en-UG",
    createdAt: "2024-03-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  },
  "user-manager-1": {
    id: "user-manager-1",
    email: "sarah@crib.ug",
    name: "Sarah Nalwanga",
    role: "manager",
    roles: ["manager"],
    status: "active",
    timezone: "Africa/Kampala",
    locale: "en-UG",
    createdAt: "2024-06-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  },
  "tenant-1": {
    id: "tenant-1",
    email: "aisha.nakawunde@gmail.com",
    name: "Aisha Nakawunde",
    role: "tenant",
    roles: ["tenant"],
    status: "active",
    timezone: "Africa/Kampala",
    locale: "en-UG",
    createdAt: "2024-09-28T10:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  },
};

// Default when no dev user selected (keeps existing behaviour)
const DEFAULT_USER = DEV_USER_PROFILES["user-superadmin-1"];

export const userHandlers = [
  http.get(`${BASE}/me`, ({ request }) => {
    const devUserId = request.headers.get("x-dev-user-id");
    const profile = devUserId
      ? (DEV_USER_PROFILES[devUserId] ?? DEFAULT_USER)
      : DEFAULT_USER;
    return HttpResponse.json(profile);
  }),

  http.put(`${BASE}/me`, async ({ request }) => {
    const devUserId = request.headers.get("x-dev-user-id");
    const base = devUserId
      ? (DEV_USER_PROFILES[devUserId] ?? DEFAULT_USER)
      : DEFAULT_USER;
    const body = await request.json() as Record<string, unknown>;
    return HttpResponse.json({ ...base, ...body, updatedAt: new Date().toISOString() });
  }),
];
