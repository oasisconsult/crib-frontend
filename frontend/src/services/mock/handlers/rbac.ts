import { http, HttpResponse } from "msw";
import type { PermissionOut, ResourceOut, RoleDetailOut, RoleOut } from "@/services/api/rbac";

const BASE = `${process.env.NEXT_PUBLIC_API_URL ?? ""}/api/v1`;

// ── Seed data ─────────────────────────────────────────────────────────────────

const ACTIONS = ["create", "read", "update", "delete"] as const;

const RESOURCES: ResourceOut[] = [
  "analytics", "document", "inspection", "lease", "ledger", "maintenance_request",
  "matching", "mobile_money", "notification", "organisation", "payment",
  "payment_allocation", "profile", "property", "settings", "tenant", "wallet",
].map((name, idx) => ({
  id: idx + 1,
  name,
  actions: [...ACTIONS],
}));

// Build permissions: resource_idx * 4 + action_idx, 1-based
let permId = 1;
const ALL_PERMS: PermissionOut[] = [];
for (const res of RESOURCES) {
  for (const action of ACTIONS) {
    ALL_PERMS.push({ id: permId++, resource: res.name, action });
  }
}

const permByKey = new Map<string, PermissionOut>(
  ALL_PERMS.map((p) => [`${p.resource}:${p.action}`, p])
);

function permsForKeys(keys: string[]): PermissionOut[] {
  return keys.flatMap((k) => (permByKey.get(k) ? [permByKey.get(k)!] : []));
}

const _ALL = ACTIONS.map((a) => a);
const _READ = ["read"];
const _CRUD = [...ACTIONS];

function rolePerms(matrix: Record<string, string[]>): PermissionOut[] {
  return Object.entries(matrix).flatMap(([res, actions]) =>
    actions.map((a) => permByKey.get(`${res}:${a}`)!).filter(Boolean)
  );
}

const ROLES_SEED: RoleDetailOut[] = [
  {
    id: 1, name: "superadmin", description: "Platform operator — cross-org, full system access", priority: 0,
    permissions: ALL_PERMS,
  },
  {
    id: 2, name: "owner", description: "Organisation owner / landlord — full access to own properties", priority: 10,
    permissions: rolePerms({
      property: _CRUD, lease: _CRUD, tenant: _CRUD, payment: _CRUD,
      payment_allocation: _CRUD, ledger: _CRUD, wallet: _CRUD, mobile_money: _CRUD,
      inspection: _CRUD, maintenance_request: _CRUD, notification: _CRUD, document: _CRUD,
      organisation: _READ, profile: _READ, analytics: _READ, matching: _READ, settings: _READ,
    }),
  },
  {
    id: 3, name: "manager", description: "Property manager — org-scoped admin", priority: 20,
    permissions: rolePerms({
      property: _CRUD, lease: _CRUD, tenant: _CRUD, inspection: _CRUD,
      maintenance_request: _CRUD, notification: _CRUD, document: _CRUD,
      payment: _READ, payment_allocation: _READ, ledger: _READ, wallet: _READ,
      mobile_money: _READ, organisation: _READ, profile: _READ, analytics: _READ, matching: _READ,
    }),
  },
  {
    id: 4, name: "tenant", description: "Tenant — restricted to their own data", priority: 40,
    permissions: rolePerms({
      property: _READ, lease: _READ, payment: _READ, payment_allocation: _READ,
      ledger: _READ, wallet: _READ, notification: _READ, maintenance_request: _READ, document: _READ,
    }),
  },
  {
    id: 5, name: "maintenance", description: "Maintenance staff — read-only inspections", priority: 30,
    permissions: rolePerms({
      inspection: _READ, maintenance_request: _READ,
    }),
  },
];

// In-memory store
const rolesStore = new Map<number, RoleDetailOut>(ROLES_SEED.map((r) => [r.id, { ...r, permissions: [...r.permissions] }]));
let nextRoleId = 6;

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
    const role = rolesStore.get(Number(params.id));
    if (!role) return HttpResponse.json({ detail: "Not found" }, { status: 404 });
    return HttpResponse.json(role);
  }),

  // Create role
  http.post(`${BASE}/admin/rbac/roles`, async ({ request }) => {
    const body = await request.json() as { name: string; description?: string; priority?: number };
    const id = nextRoleId++;
    const role: RoleDetailOut = {
      id, name: body.name, description: body.description ?? null,
      priority: body.priority ?? 99, permissions: [],
    };
    rolesStore.set(id, role);
    const { permissions: _p, ...out } = role;
    return HttpResponse.json(out, { status: 201 });
  }),

  // Delete role
  http.delete(`${BASE}/admin/rbac/roles/:id`, ({ params }) => {
    rolesStore.delete(Number(params.id));
    return new HttpResponse(null, { status: 204 });
  }),

  // List role permissions
  http.get(`${BASE}/admin/rbac/roles/:id/permissions`, ({ params }) => {
    const role = rolesStore.get(Number(params.id));
    if (!role) return HttpResponse.json({ detail: "Not found" }, { status: 404 });
    return HttpResponse.json(role.permissions);
  }),

  // Replace role permissions (bulk)
  http.put(`${BASE}/admin/rbac/roles/:id/permissions`, async ({ params, request }) => {
    const role = rolesStore.get(Number(params.id));
    if (!role) return HttpResponse.json({ detail: "Not found" }, { status: 404 });
    const { permissions: permIds } = await request.json() as { permissions: number[] };
    role.permissions = ALL_PERMS.filter((p) => permIds.includes(p.id));
    return HttpResponse.json(role.permissions);
  }),

  // Grant single permission
  http.post(`${BASE}/admin/rbac/roles/:id/permissions`, async ({ params, request }) => {
    const role = rolesStore.get(Number(params.id));
    if (!role) return HttpResponse.json({ detail: "Not found" }, { status: 404 });
    const { permission_id } = await request.json() as { permission_id: number };
    const perm = ALL_PERMS.find((p) => p.id === permission_id);
    if (!perm) return HttpResponse.json({ detail: "Permission not found" }, { status: 404 });
    if (!role.permissions.find((p) => p.id === permission_id)) {
      role.permissions.push(perm);
    }
    return HttpResponse.json(perm, { status: 201 });
  }),

  // Revoke single permission
  http.delete(`${BASE}/admin/rbac/roles/:roleId/permissions/:permId`, ({ params }) => {
    const role = rolesStore.get(Number(params.roleId));
    if (role) {
      role.permissions = role.permissions.filter((p) => p.id !== Number(params.permId));
    }
    return new HttpResponse(null, { status: 204 });
  }),

  // List resources
  http.get(`${BASE}/admin/rbac/resources`, () => HttpResponse.json(RESOURCES)),

  // Create resource
  http.post(`${BASE}/admin/rbac/resources`, async ({ request }) => {
    const { name } = await request.json() as { name: string };
    const newRes: ResourceOut = { id: RESOURCES.length + 1, name, actions: [...ACTIONS] };
    RESOURCES.push(newRes);
    return HttpResponse.json(newRes, { status: 201 });
  }),
];
