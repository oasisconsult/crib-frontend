/**
 * audit.ts — Client-side audit event emitter
 *
 * Sends structured audit events to /api/auth/audit (fire-and-forget).
 * The server route forwards them to the FastAPI backend for persistence.
 */

export type AuditAction =
  | "auth.login"
  | "auth.logout"
  | "auth.token_refresh"
  | "auth.token_refresh_failed"
  | "auth.org_switch"
  | "auth.session_expired"
  | "rbac.access_denied";

export interface AuditEvent {
  action: AuditAction;
  userId?: string;
  orgId?: string;
  meta?: Record<string, unknown>;
}

export function emitAudit(event: AuditEvent): void {
  // Fire-and-forget — never block the UI
  fetch("/api/auth/audit", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...event,
      timestamp: new Date().toISOString(),
      userAgent:
        typeof navigator !== "undefined" ? navigator.userAgent : undefined,
    }),
    // keepalive ensures the request completes even if the page is unloading (logout)
    keepalive: true,
  }).catch(() => {
    // Audit failures must never break the app
  });
}
