"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  listCaretakers,
  listCaretakerInvites,
  createCaretakerInvite,
  revokeCaretakerInvite,
  resendCaretakerInvite,
  updateCaretaker,
  deactivateCaretaker,
  type CreateCaretakerInviteRequest,
} from "@/services/api/caretakers";

// ── Query keys ─────────────────────────────────────────────────────────────────

const QK = {
  caretakers: ["caretakers"] as const,
  invites:    ["caretaker-invites"] as const,
};

// ── Active caretakers ──────────────────────────────────────────────────────────

/** List all active caretakers managed by the current owner */
export function useCaretakers() {
  return useQuery({
    queryKey: QK.caretakers,
    queryFn:  listCaretakers,
  });
}

/** Update a caretaker's property scope or permission level */
export function useUpdateCaretaker() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Parameters<typeof updateCaretaker>[1] }) =>
      updateCaretaker(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: QK.caretakers }),
  });
}

/**
 * Deactivate a caretaker.
 * Their account is preserved for audit trail; login is blocked immediately.
 */
export function useDeactivateCaretaker() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deactivateCaretaker(id),
    onSuccess:  () => qc.invalidateQueries({ queryKey: QK.caretakers }),
  });
}

// ── Caretaker invites ─────────────────────────────────────────────────────────

/** List all caretaker invites sent by the current owner */
export function useCaretakerInvites() {
  return useQuery({
    queryKey: QK.invites,
    queryFn:  listCaretakerInvites,
  });
}

/** Send a new caretaker invitation */
export function useCreateCaretakerInvite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateCaretakerInviteRequest) => createCaretakerInvite(data),
    onSuccess:  () => qc.invalidateQueries({ queryKey: QK.invites }),
  });
}

/** Revoke a pending invite */
export function useRevokeCaretakerInvite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => revokeCaretakerInvite(id),
    onSuccess:  () => qc.invalidateQueries({ queryKey: QK.invites }),
  });
}

/** Resend the invite email */
export function useResendCaretakerInvite() {
  return useMutation({
    mutationFn: (id: string) => resendCaretakerInvite(id),
  });
}
