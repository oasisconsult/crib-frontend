"use client";

import { useState } from "react";
import { Plus, HardHat, Phone, Mail, Pencil, PowerOff, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { DataTable, type Column } from "@/components/common/DataTable";
import { FilterBar } from "@/components/common/FilterBar";
import {
  useContractors,
  useCreateContractor,
  useUpdateContractor,
  useDeactivateContractor,
} from "@/hooks/useInspections";
import { usePermissions } from "@/hooks/usePermissions";
import type { Contractor, ContractorSpecialty } from "@/types";
import { cn } from "@/utils/cn";

// ── Constants ──────────────────────────────────────────────────────────────────

const PAGE_SIZE = 20;

const SPECIALTIES: { value: ContractorSpecialty; label: string }[] = [
  { value: "plumbing",   label: "Plumbing" },
  { value: "electrical", label: "Electrical" },
  { value: "structural", label: "Structural" },
  { value: "appliance",  label: "Appliance" },
  { value: "pest",       label: "Pest Control" },
  { value: "security",   label: "Security" },
  { value: "other",      label: "General / Other" },
];

function specialtyLabel(s?: string) {
  return SPECIALTIES.find((x) => x.value === s)?.label ?? (s ? s : "—");
}

// ── Column definitions ─────────────────────────────────────────────────────────
// Actions column is built at runtime (needs callbacks), so only static cols here.

function buildColumns(
  canWrite: boolean,
  onEdit: (c: Contractor) => void,
  onDeactivate: (id: string) => void,
): Column<Contractor>[] {
  return [
    {
      key: "name",
      header: "Contractor",
      render: (c) => (
        <div>
          <div className="flex items-center gap-2">
            <p className="font-medium">{c.name}</p>
            {c.isInspector && (
              <Badge
                variant="outline"
                className="text-xs border-blue-300 text-blue-700 bg-blue-50 dark:border-blue-800 dark:text-blue-300 dark:bg-blue-950/30"
              >
                <ShieldCheck className="h-3 w-3 mr-1" aria-hidden="true" />
                Inspector
              </Badge>
            )}
          </div>
          {c.notes && (
            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
              {c.notes}
            </p>
          )}
        </div>
      ),
    },
    {
      key: "specialty",
      header: "Specialty",
      render: (c) => (
        <span className="text-sm capitalize">{specialtyLabel(c.specialty)}</span>
      ),
    },
    {
      key: "phone",
      header: "Contact",
      render: (c) => (
        <div className="flex flex-col gap-1 text-sm text-muted-foreground">
          {c.phone && (
            <a
              href={`tel:${c.phone}`}
              className="flex items-center gap-1 hover:text-foreground transition-colors"
              aria-label={`Call ${c.name}`}
            >
              <Phone className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              {c.phone}
            </a>
          )}
          {c.email && (
            <a
              href={`mailto:${c.email}`}
              className="flex items-center gap-1 hover:text-foreground transition-colors"
              aria-label={`Email ${c.name}`}
            >
              <Mail className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              {c.email}
            </a>
          )}
          {!c.phone && !c.email && <span>—</span>}
        </div>
      ),
    },
    {
      key: "isActive",
      header: "Status",
      render: (c) => (
        <Badge
          variant="outline"
          className={cn(
            "text-xs",
            c.isActive
              ? "border-green-300 text-green-700 bg-green-50 dark:border-green-800 dark:text-green-300 dark:bg-green-950/30"
              : "border-slate-300 text-slate-500 bg-slate-50 dark:border-slate-700 dark:text-slate-400 dark:bg-slate-900",
          )}
        >
          {c.isActive ? "Active" : "Inactive"}
        </Badge>
      ),
    },
    ...(canWrite
      ? [
          {
            key: "_actions" as keyof Contractor,
            header: "",
            render: (c: Contractor) => (
              <div className="flex justify-end gap-1">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Edit ${c.name}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onEdit(c);
                  }}
                >
                  <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                </Button>
                {c.isActive && (
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Deactivate ${c.name}`}
                    className="text-destructive hover:text-destructive"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeactivate(c.id);
                    }}
                  >
                    <PowerOff className="h-3.5 w-3.5" aria-hidden="true" />
                  </Button>
                )}
              </div>
            ),
          },
        ]
      : []),
  ];
}

// ── Contractor form ────────────────────────────────────────────────────────────

interface FormState {
  name: string;
  phone: string;
  email: string;
  specialty: string;
  notes: string;
  isInspector: boolean;
}

function emptyForm(c?: Contractor): FormState {
  return {
    name:        c?.name        ?? "",
    phone:       c?.phone       ?? "",
    email:       c?.email       ?? "",
    specialty:   c?.specialty   ?? "all",
    notes:       c?.notes       ?? "",
    isInspector: c?.isInspector ?? false,
  };
}

function ContractorForm({
  editing,
  onClose,
}: {
  editing?: Contractor;
  onClose: () => void;
}) {
  const [form, setForm] = useState<FormState>(() => emptyForm(editing));
  const { mutate: create, isPending: creating } = useCreateContractor();
  const { mutate: update, isPending: updating } = useUpdateContractor();
  const isPending = creating || updating;

  function set(field: keyof FormState, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function setBool(field: keyof FormState, value: boolean) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const payload = {
      name:        form.name.trim(),
      phone:       form.phone.trim() || undefined,
      email:       form.email.trim() || undefined,
      specialty:   (form.specialty === "all" ? undefined : form.specialty || undefined) as ContractorSpecialty | undefined,
      notes:       form.notes.trim() || undefined,
      isInspector: form.isInspector,
    };
    if (editing) {
      update({ id: editing.id, data: payload }, { onSuccess: onClose });
    } else {
      create(payload, { onSuccess: onClose });
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 px-6 pb-6 pt-4">
      <div className="space-y-1.5">
        <Label htmlFor="c-name">Name *</Label>
        <Input
          id="c-name"
          value={form.name}
          onChange={(e) => set("name", e.target.value)}
          placeholder="Contractor or company name"
          required
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="c-specialty">Specialty</Label>
        <Select value={form.specialty} onValueChange={(v) => set("specialty", v)}>
          <SelectTrigger id="c-specialty">
            <SelectValue placeholder="Select specialty…" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All trades / General</SelectItem>
            {SPECIALTIES.map((s) => (
              <SelectItem key={s.value} value={s.value}>
                {s.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="c-phone">Phone</Label>
          <Input
            id="c-phone"
            type="tel"
            value={form.phone}
            onChange={(e) => set("phone", e.target.value)}
            placeholder="+256 700 000000"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="c-email">Email</Label>
          <Input
            id="c-email"
            type="email"
            value={form.email}
            onChange={(e) => set("email", e.target.value)}
            placeholder="contractor@example.com"
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="c-notes">Notes</Label>
        <Textarea
          id="c-notes"
          value={form.notes}
          onChange={(e) => set("notes", e.target.value)}
          placeholder="Availability, rates, preferred contact method…"
          rows={3}
        />
      </div>

      <div className="flex items-center justify-between rounded-lg border p-3">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          <div>
            <Label htmlFor="c-inspector" className="text-sm font-medium cursor-pointer">
              Certified Inspector
            </Label>
            <p className="text-xs text-muted-foreground mt-0.5">
              Allow assignment to inspection jobs via the inspector portal
            </p>
          </div>
        </div>
        <Switch
          id="c-inspector"
          checked={form.isInspector}
          onCheckedChange={(v) => setBool("isInspector", v)}
          disabled={isPending}
        />
      </div>

      <Separator />
      <div className="flex justify-end gap-3">
        <Button type="button" variant="outline" onClick={onClose} disabled={isPending}>
          Cancel
        </Button>
        <Button type="submit" disabled={isPending}>
          {isPending
            ? editing ? "Saving…" : "Adding…"
            : editing ? "Save Changes" : "Add Contractor"}
        </Button>
      </div>
    </form>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function ContractorsPage() {
  const { canWrite } = usePermissions();

  const [search, setSearch]       = useState("");
  const [specialty, setSpecialty] = useState("all");
  const [activeOnly, setActiveOnly] = useState("true");
  const [page, setPage]           = useState(1);

  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing]       = useState<Contractor | undefined>();

  const { data, isLoading } = useContractors({
    search:    search || undefined,
    specialty: specialty === "all" ? undefined : specialty || undefined,
    isActive:  activeOnly === "true" ? true : activeOnly === "false" ? false : undefined, // "all" → undefined
  });

  const { mutate: deactivate } = useDeactivateContractor();

  const handleSearchChange = (value: string) => {
    setSearch(value);
    setPage(1);
  };

  const columns = buildColumns(
    canWrite,
    (c) => setEditing(c),
    (id) => deactivate(id),
  );

  return (
    <div className="space-y-6">
      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <HardHat className="h-6 w-6 text-primary" aria-hidden="true" />
            Contractors
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Trusted tradespeople and contractors for maintenance jobs
          </p>
        </div>
        {canWrite && (
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4" />
                Add Contractor
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-lg">
              <DialogHeader>
                <DialogTitle>Add Contractor</DialogTitle>
              </DialogHeader>
              <ContractorForm onClose={() => setCreateOpen(false)} />
            </DialogContent>
          </Dialog>
        )}
      </div>

      {/* ── Filters ─────────────────────────────────────────────────────────── */}
      <FilterBar
        search={search}
        onSearchChange={handleSearchChange}
        placeholder="Search by name…"
        className="max-w-sm"
      >
        <Select value={specialty} onValueChange={(v) => { setSpecialty(v); setPage(1); }}>
          <SelectTrigger className="w-44" aria-label="Filter by specialty">
            <SelectValue placeholder="All specialties" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All specialties</SelectItem>
            {SPECIALTIES.map((s) => (
              <SelectItem key={s.value} value={s.value}>
                {s.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={activeOnly} onValueChange={(v) => { setActiveOnly(v); setPage(1); }}>
          <SelectTrigger className="w-36" aria-label="Filter by status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="true">Active only</SelectItem>
            <SelectItem value="false">Inactive only</SelectItem>
            <SelectItem value="all">All</SelectItem>
          </SelectContent>
        </Select>
      </FilterBar>

      {/* ── Table ───────────────────────────────────────────────────────────── */}
      <DataTable
        data={data?.data ?? []}
        columns={columns}
        loading={isLoading}
        rowKey={(c) => c.id}
        pageSize={PAGE_SIZE}
        totalItems={data?.total}
        currentPage={page}
        onPageChange={setPage}
        emptyTitle="No contractors found"
        emptyDescription={
          canWrite
            ? "Add your first contractor to build a trusted directory."
            : "No contractors have been added yet."
        }
      />

      {/* ── Edit modal ──────────────────────────────────────────────────────── */}
      {editing && (
        <Dialog open onOpenChange={(v) => { if (!v) setEditing(undefined); }}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Edit Contractor</DialogTitle>
            </DialogHeader>
            <ContractorForm editing={editing} onClose={() => setEditing(undefined)} />
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
