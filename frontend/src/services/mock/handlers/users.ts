import { http, HttpResponse } from "msw";

const BASE = `${process.env.NEXT_PUBLIC_API_URL ?? ""}/api/v1`;

const mockCurrentUser = {
  id: "user-superadmin-1",
  email: "admin@crib.ug",
  name: "Crib Admin",
  role: "superadmin" as const,
  status: "active" as const,
  timezone: "Africa/Kampala",
  locale: "en-UG",
  createdAt: "2024-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
};

export const userHandlers = [
  http.get(`${BASE}/users/me`, () => {
    return HttpResponse.json(mockCurrentUser);
  }),

  http.put(`${BASE}/users/me`, async ({ request }) => {
    const body = await request.json() as Record<string, unknown>;
    return HttpResponse.json({ ...mockCurrentUser, ...body, updatedAt: new Date().toISOString() });
  }),
];
