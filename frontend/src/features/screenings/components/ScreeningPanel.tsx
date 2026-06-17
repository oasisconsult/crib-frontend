"use client";

import { useState } from "react";
import { ClipboardCheck, Plus, CheckCircle2, XCircle, Clock, ChevronDown, ChevronUp } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/store/useUIStore";
import { screeningsApi } from "../api";
import type { TenantScreening, ChecklistItem } from "../types";

interface Props {
  unitId: string;
  canManage: boolean;
}

const STATUS_CONFIG = {
  pending:  { label: "Pending",  variant: "secondary" as const, icon: Clock },
  approved: { label: "Approved", variant: "success"   as const, icon: CheckCircle2 },
  rejected: { label: "Rejected", variant: "destructive" as const, icon: XCircle },
};

function fmtDate(s: string) {
  return new Date(s).toLocaleDateString("en-UG", { day: "numeric", month: "short", year: "numeric" });
}

// ── New Screening Modal ────────────────────────────────────────────────────────

function NewScreeningModal({ unitId, onClose }: { unitId: string; onClose: () => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [notes, setNotes] = useState("");

  const { mutate, isPending } = useMutation({
    mutationFn: () => screeningsApi.create({ applicantName: name, applicantPhone: phone || undefined, applicantEmail: email || undefined, unitId, notes: notes || undefined }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["screenings", unitId] });
      toast.success("Screening created");
      onClose();
    },
    onError: () => toast.error("Failed to create screening"),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <Card className="w-full max-w-sm shadow-xl">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <ClipboardCheck className="h-4 w-4" />
            New Screening
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={(e) => { e.preventDefault(); if (name.trim()) mutate(); }} className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="sc-name">Applicant name *</Label>
              <Input id="sc-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name" required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sc-phone">Phone</Label>
              <Input id="sc-phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+256 7xx xxx xxx" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sc-email">Email</Label>
              <Input id="sc-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="applicant@email.com" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sc-notes">Notes</Label>
              <Input id="sc-notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional intake notes" />
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" variant="outline" onClick={onClose} disabled={isPending}>Cancel</Button>
              <Button type="submit" disabled={isPending || !name.trim()}>{isPending ? "Creating…" : "Create"}</Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

// ── Screening Card ─────────────────────────────────────────────────────────────

function ScreeningCard({ screening, unitId, canManage }: { screening: TenantScreening; unitId: string; canManage: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const [decisionNotes, setDecisionNotes] = useState("");
  const qc = useQueryClient();

  const { mutate: toggleItem } = useMutation({
    mutationFn: (item: ChecklistItem) =>
      screeningsApi.update(screening.id, {
        checklist: [{ key: item.key, checked: !item.checked, notes: item.notes ?? undefined }],
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["screenings", unitId] }),
  });

  const { mutate: decide, isPending: deciding } = useMutation({
    mutationFn: (decision: "approved" | "rejected") =>
      screeningsApi.decide(screening.id, { decision, notes: decisionNotes || undefined }),
    onSuccess: (_, decision) => {
      qc.invalidateQueries({ queryKey: ["screenings", unitId] });
      toast.success(decision === "approved" ? "Approved" : "Rejected");
    },
    onError: () => toast.error("Decision failed"),
  });

  const cfg = STATUS_CONFIG[screening.status];
  const StatusIcon = cfg.icon;
  const checked = screening.checklist.filter((c) => c.checked).length;
  const total = screening.checklist.length;

  return (
    <div className="rounded-lg border bg-card text-sm">
      {/* Header row */}
      <button
        type="button"
        className="w-full flex items-center justify-between gap-3 p-3 text-left hover:bg-muted/50 rounded-lg"
        onClick={() => setExpanded((v) => !v)}
      >
        <div className="min-w-0 flex-1">
          <p className="font-medium truncate">{screening.applicantName}</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {fmtDate(screening.createdAt)} · {checked}/{total} checks
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Badge variant={cfg.variant} className="text-[10px] px-1.5 py-0 flex items-center gap-0.5">
            <StatusIcon className="h-3 w-3" />
            {cfg.label}
          </Badge>
          {expanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
        </div>
      </button>

      {/* Expanded body */}
      {expanded && (
        <div className="px-3 pb-3 border-t space-y-3">
          {/* Contact */}
          {(screening.applicantPhone || screening.applicantEmail) && (
            <div className="pt-2 text-xs text-muted-foreground space-y-0.5">
              {screening.applicantPhone && <p>{screening.applicantPhone}</p>}
              {screening.applicantEmail && <p>{screening.applicantEmail}</p>}
            </div>
          )}

          {/* Checklist */}
          <div className="space-y-1.5 pt-1">
            {screening.checklist.map((item) => (
              <label key={item.key} className={`flex items-center gap-2.5 rounded p-1.5 cursor-pointer ${canManage && screening.status === "pending" ? "hover:bg-muted" : ""}`}>
                <input
                  type="checkbox"
                  checked={item.checked}
                  disabled={!canManage || screening.status !== "pending"}
                  onChange={() => canManage && toggleItem(item)}
                  className="h-4 w-4 rounded border-input accent-primary"
                />
                <span className={item.checked ? "line-through text-muted-foreground" : ""}>{item.label}</span>
              </label>
            ))}
          </div>

          {/* Notes */}
          {screening.notes && (
            <p className="text-xs text-muted-foreground italic border-l-2 pl-2">{screening.notes}</p>
          )}
          {screening.decisionNotes && (
            <p className="text-xs text-muted-foreground italic border-l-2 pl-2">Decision: {screening.decisionNotes}</p>
          )}

          {/* Decision buttons — only for pending screenings and managers */}
          {canManage && screening.status === "pending" && (
            <div className="pt-1 space-y-2">
              <Input
                placeholder="Decision notes (optional)"
                value={decisionNotes}
                onChange={(e) => setDecisionNotes(e.target.value)}
                className="h-8 text-xs"
              />
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="default"
                  className="h-7 px-3 text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
                  disabled={deciding}
                  onClick={() => decide("approved")}
                >
                  <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                  Approve
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 px-3 text-xs text-destructive hover:bg-destructive/10"
                  disabled={deciding}
                  onClick={() => decide("rejected")}
                >
                  <XCircle className="h-3.5 w-3.5 mr-1" />
                  Reject
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main Panel ────────────────────────────────────────────────────────────────

export function ScreeningPanel({ unitId, canManage }: Props) {
  const [showModal, setShowModal] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["screenings", unitId],
    queryFn: () => screeningsApi.list(unitId),
  });

  const screenings: TenantScreening[] = data?.data ?? [];

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm flex items-center gap-2">
              <ClipboardCheck className="h-4 w-4 text-muted-foreground" />
              Tenant Screenings
            </CardTitle>
            {canManage && (
              <Button size="sm" variant="outline" className="h-7 px-2.5 text-xs" onClick={() => setShowModal(true)}>
                <Plus className="h-3.5 w-3.5" />
                New
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : screenings.length === 0 ? (
            <p className="text-sm text-muted-foreground">No screening applications yet.</p>
          ) : (
            screenings.map((s) => (
              <ScreeningCard key={s.id} screening={s} unitId={unitId} canManage={canManage} />
            ))
          )}
        </CardContent>
      </Card>

      {showModal && (
        <NewScreeningModal unitId={unitId} onClose={() => setShowModal(false)} />
      )}
    </>
  );
}
