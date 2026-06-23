import { http, HttpResponse } from "msw";
import type { PermissionOut, PermissionRef, ResourceOut, RoleDetailOut, RoleOut } from "@/services/api/rbac";

const BASE = `${process.env.NEXT_PUBLIC_API_URL ?? ""}/api/v1`;

// ── Seed data (UUID strings matching shared RBAC DB format) ──────────────────

const ACTIONS = ["create", "read", "update", "delete"] as const;

const RESOURCE_NAMES = [
  "analytics", "document", "inspection", "lease", "ledger", "maintenance_request",
  "matching", "mobile_money", "notification", "organisation", "payment",
  "payment_allocation", "profile", "property", "settings", "tenant", "wallet",
] as const;

// Stable fake UUIDs for mock data — deterministic so refreshes don't scramble IDs
function mockUuid(prefix: string, idx: number): string {
  return `00000000-0000-0000-${String(idx).padStart(4, "0")}-${prefix.slice(0, 12).padEnd(12, "0")}`;
}

// Build resources with PermissionRef arrays (matching ResourceOut schema)
let _permIdx = 1;
const permRefByKey = new Map<string, PermissionRef>();
const permOutByKey = new Map<string, PermissionOut>();

const RESOURCES: ResourceOut[] = RESOURCE_NAMES.map((name, rIdx) => {
  const resId = mockUuid("res", rIdx + 1);
  const permissions: PermissionRef[] = ACTIONS.map((action) => {
    const permId = mockUuid("perm", _permIdx++);
    const key = `${name}:${action}`;
    const ref: PermissionRef = { id: permId, action };
    const out: PermissionOut = { id: permId, resource: name, action };
    permRefByKey.set(key, ref);
    permOutByKey.set(key, out);
    return ref;
  });
  return { id: resId, name, permissions };
});

function permsOut(keys: string[]): PermissionOut[] {
  return keys.flatMap((k) => (permOutByKey.has(k) ? [permOutByKey.get(k)!] : []));
}

const _READ = ["read"];
const _CRUD = [...ACTIONS];

function rolePerms(matrix: Record<string, string[]>): PermissionOut[] {
  return Object.entries(matrix).flatMap(([res, actions]) =>
    actions.map((a) => permOutByKey.get(`${res}:${a}`)!).filter(Boolean)
  );
}

const ROLES_SEED: RoleDetailOut[] = [
  {
    id: mockUuid("role", 1), name: "superadmin", display_name: "Super Admin",
    description: "Platform operator — cross-org, full system access",
    priority: 0, is_system: true,
    permissions: Array.from(permOutByKey.values()),
  },
  {
    id: mockUuid("role", 2), name: "owner", display_name: "Property Owner",
    description: "Organisation owner / landlord — full access to own properties",
    priority: 10, is_system: true,
    permissions: rolePerms({
      property: _CRUD, lease: _CRUD, tenant: _CRUD, payment: _CRUD,
      payment_allocation: _CRUD, ledger: _CRUD, wallet: _CRUD, mobile_money: _CRUD,
      inspection: _CRUD, maintenance_request: _CRUD, notification: _CRUD, document: _CRUD,
      organisation: _READ, profile: _READ, analytics: _READ, matching: _READ, settings: _READ,
    }),
  },
  {
    id: mockUuid("role", 3), name: "manager", display_name: "Manager",
    description: "Property manager — org-scoped admin",
    priority: 20, is_system: true,
    permissions: rolePerms({
      property: _CRUD, lease: _CRUD, tenant: _CRUD, inspection: _CRUD,
      maintenance_request: _CRUD, notification: _CRUD, document: _CRUD,
      payment: _READ, payment_allocation: _READ, ledger: _READ, wallet: _READ,
      mobile_money: _READ, organisation: _READ, profile: _READ, analytics: _READ, matching: _READ,
    }),
  },
  {
    id: mockUuid("role", 4), name: "tenant", display_name: "Tenant",
    description: "Tenant — restricted to their own data",
    priority: 40, is_system: true,
    permissions: rolePerms({
      property: _READ, lease: _READ, payment: _READ, payment_allocation: _READ,
      ledger: _READ, wallet: _READ, notification: _READ, maintenance_request: _READ, document: _READ,
    }),
  },
  {
    id: mockUuid("role", 5), name: "maintenance", display_name: "Maintenance",
    description: "Maintenance staff — read-only inspections",
    priority: 30, is_system: true,
    permissions: rolePerms({ inspection: _READ, maintenance_request: _READ }),
  },
];

// In-memory store keyed by UUID string
const rolesStore = new Map<string, RoleDetailOut>(
  ROLES_SEED.map((r) => [r.id, { ...r, permissions: [...r.permissions] }])
);
let nextRoleIdx = 6;

export const rbacHandlers = [
  // List roles
  http.get(`${BASE}/admin/rbac/roles`, () => {
    const roles: RoleOut[] = Array.from(rolesStore.values())
      .sort((a, b) => a.priority - b.priority)
      .map(({ permissions: _p, ...r }) => r);
    return HttpResponse.json(roles);
  }),

  // Get role detail
  http.get(`${BASE}/admin/rbac/roles/:id`, ({ params }) => {
    const role = rolesStore.get(params.id as string);
    if (!role) return HttpResponse.json({ detail: "Not found" }, { status: 404 });
    return HttpResponse.json(role);
  }),

  // Create role
  http.post(`${BASE}/admin/rbac/roles`, async ({ request }) => {
    const body = await request.json() as { name: string; display_name?: string; description?: string; priority?: number };
    const id = mockUuid("role", nextRoleIdx++);
    const role: RoleDetailOut = {
      id, name: body.name, display_name: body.display_name ?? null,
      description: body.description ?? null,
      priority: body.priority ?? 99, is_system: false, permissions: [],
    };
    rolesStore.set(id, role);
    const { permissions: _p, ...out } = role;
    return HttpResponse.json(out, { status: 201 });
  }),

  // Delete role
  http.delete(`${BASE}/admin/rbac/roles/:id`, ({ params }) => {
    const role = rolesStore.get(params.id as string);
    if (role?.is_system) return HttpResponse.json({ detail: "Cannot delete system role" }, { status: 400 });
    rolesStore.delete(params.id as string);
    return new HttpResponse(null, { status: 204 });
  }),

  // List role permissions
  http.get(`${BASE}/admin/rbac/roles/:id/permissions`, ({ params }) => {
    const role = rolesStore.get(params.id as string);
    if (!role) return HttpResponse.json({ detail: "Not found" }, { status: 404 });
    return HttpResponse.json(role.permissions);
  }),

  // Replace role permissions (bulk)
  http.put(`${BASE}/admin/rbac/roles/:id/permissions`, async ({ params, request }) => {
    const role = rolesStore.get(params.id as string);
    if (!role) return HttpResponse.json({ detail: "Not found" }, { status: 404 });
    const { permissions: permIds } = await request.json() as { permissions: string[] };
    const idSet = new Set(permIds);
    role.permissions = Array.from(permOutByKey.values()).filter((p) => idSet.has(p.id));
    return HttpResponse.json(role.permissions);
  }),

  // Grant single permission
  http.post(`${BASE}/admin/rbac/roles/:id/permissions`, async ({ params, request }) => {
    const role = rolesStore.get(params.id as string);
    if (!role) return HttpResponse.json({ detail: "Not found" }, { status: 404 });
    const { permission_id } = await request.json() as { permission_id: string };
    const perm = Array.from(permOutByKey.values()).find((p) => p.id === permission_id);
    if (!perm) return HttpResponse.json({ detail: "Permission not found" }, { status: 404 });
    if (!role.permissions.find((p) => p.id === permission_id)) {
      role.permissions.push(perm);
    }
    return HttpResponse.json(perm, { status: 201 });
  }),

  // Revoke single permission
  http.delete(`${BASE}/admin/rbac/roles/:roleId/permissions/:permId`, ({ params }) => {
    const role = rolesStore.get(params.roleId as string);
    if (role) {
      role.permissions = role.permissions.filter((p) => p.id !== params.permId);
    }
    return new HttpResponse(null, { status: 204 });
  }),

  // List resources
  http.get(`${BASE}/admin/rbac/resources`, () => HttpResponse.json(RESOURCES)),

  // Create resource
  http.post(`${BASE}/admin/rbac/resources`, async ({ request }) => {
    const { name } = await request.json() as { name: string };
    const resId = mockUuid("res", RESOURCES.length + 1);
    const permissions: PermissionRef[] = ACTIONS.map((action, i) => ({
      id: mockUuid("perm", _permIdx++ + i),
      action,
    }));
    const newRes: ResourceOut = { id: resId, name, permissions };
    RESOURCES.push(newRes);
    return HttpResponse.json(newRes, { status: 201 });
  }),
];
