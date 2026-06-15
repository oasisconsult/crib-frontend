"use client";

import { useState } from "react";
import {
  HardHat,
  Plus,
  Phone,
  Mail,
  Pencil,
  PowerOff,
  Search,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PageSkeleton } from "@/components/common/LoadingSkeleton";
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

const SPECIALTIES: { value: ContractorSpecialty; label: string }[] = [
  { value: "plumbing",   label: "Plumbing" },
  { value: "electrical", label: "Electrical" },
  { value: "structural", label: "Structural" },
  { value: "appliance",  label: "Appliance" },
  { value: "pest",       label: "Pest Control" },
  { value: "security",   label: "Security" },
  { value: "other",      label: "General / Other" },
];

const specialtyLabel = (s?: string) =>
  SPECIALTIES.find((x) => x.value === s)?.label ?? (s ? s : "All trades");

// ── Contractor form ────────────────────────────────────────────────────────────

interface ContractorFormState {
  name: string;
  phone: string;
  email: string;
  specialty: string;
  notes: string;
}

function emptyForm(c?: Contractor): ContractorFormState {
  return {
    name:      c?.name      ?? "",
    phone:     c?.phone     ?? "",
    email:     c?.email     ?? "",
    specialty: c?.specialty ?? "",
    notes:     c?.notes     ?? "",
  };
}

interface ContractorModalProps {
  open: boolean;
  onClose: () => void;
  editing?: Contractor;
}

function ContractorModal({ open, onClose, editing }: ContractorModalProps) {
  const [form, setForm] = useState<ContractorFormState>(() => emptyForm(editing));
  const { mutate: create, isPending: creating } = useCreateContractor();
  const { mutate: update, isPending: updating } = useUpdateContractor();
  const isPending = creating || updating;

  // Reset form when modal opens/closes
  const handleOpenChange = (isOpen: boolean) => {
    if (!isOpen) {
      setForm(emptyForm(editing));
      onClose();
    }
  };

  function set(field: keyof ContractorFormState, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const payload = {
      name:      form.name.trim(),
      phone:     form.phone.trim() || undefined,
      email:     form.email.trim() || undefined,
      specialty: (form.specialty || undefined) as ContractorSpecialty | undefined,
      notes:     form.notes.trim() || undefined,
    };
    if (editing) {
      update({ id: editing.id, data: payload }, { onSuccess: onClose });
    } else {
      create(payload, { onSuccess: onClose });
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit Contractor" : "Add Contractor"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
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
                <SelectItem value="">All trades / General</SelectItem>
                {SPECIALTIES.map((s) => (
                  <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
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

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={isPending}>
              Cancel
            </Button>
            <Button type="submit" loading={isPending}>
              {editing ? "Save Changes" : "Add Contractor"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function ContractorsPage() {
  const [search, setSearch]             = useState("");
  const [specialty, setSpecialty]       = useState<string>("");
  const [showInactive, setShowInactive] = useState(false);
  const [creating, setCreating]         = useState(false);
  const [editing, setEditing]           = useState<Contractor | undefined>();

  const { data, isLoading } = useContractors({
    search:    search.length > 1 ? search : undefined,
    specialty: specialty || undefined,
    isActive:  showInactive ? undefined : true,
  });

  const { mutate: deactivate } = useDeactivateContractor();
  const { can } = usePermissions();
  const canEdit = can("properties:write");

  const contractors = data?.data ?? [];

  return (
    <div className="space-y-6">
      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <HardHat className="h-6 w-6 text-primary" aria-hidden="true" />
            Contractors
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Trusted tradespeople and contractors for maintenance jobs
          </p>
        </div>
        {canEdit && (
          <Button onClick={() => setCreating(true)}>
            <Plus className="h-4 w-4" />
            Add Contractor
          </Button>
        )}
      </div>

      {/* ── Filters ─────────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-52 max-w-xs">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" aria-hidden="true" />
          <Input
            aria-label="Search contractors"
            placeholder="Search by name…"
            className="pl-8"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={specialty} onValueChange={setSpecialty}>
          <SelectTrigger className="w-44" aria-label="Filter by specialty">
            <SelectValue placeholder="All specialties" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">All specialties</SelectItem>
            {SPECIALTIES.map((s) => (
              <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          variant="outline"
          size="sm"
          aria-pressed={showInactive}
          onClick={() => setShowInactive((v) => !v)}
          className={cn(showInactive && "border-primary text-primary")}
        >
          {showInactive ? "Showing all" : "Active only"}
        </Button>
      </div>

      {/* ── Table ───────────────────────────────────────────────────────────── */}
      {isLoading ? (
        <PageSkeleton />
      ) : contractors.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 gap-3 text-muted-foreground">
          <HardHat className="h-10 w-10" aria-hidden="true" />
          <p className="text-sm font-medium">No contractors found</p>
          {canEdit && (
            <Button variant="outline" size="sm" onClick={() => setCreating(true)}>
              <Plus className="h-4 w-4" />
              Add your first contractor
            </Button>
          )}
        </div>
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Specialty</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead>Status</TableHead>
                {canEdit && <TableHead className="w-24 text-right">Actions</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {contractors.map((c) => (
                <TableRow key={c.id} className={cn(!c.isActive && "opacity-50")}>
                  <TableCell className="font-medium">
                    {c.name}
                    {c.notes && (
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{c.notes}</p>
                    )}
                  </TableCell>
                  <TableCell>
                    <span className="text-sm capitalize">{specialtyLabel(c.specialty)}</span>
                  </TableCell>
                  <TableCell>
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
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={cn(
                        "text-xs",
                        c.isActive
                          ? "border-green-300 text-green-700 bg-green-50 dark:border-green-800 dark:text-green-300 dark:bg-green-950/30"
                          : "border-slate-300 text-slate-500 bg-slate-50 dark:border-slate-700 dark:text-slate-400 dark:bg-slate-900"
                      )}
                    >
                      {c.isActive ? "Active" : "Inactive"}
                    </Badge>
                  </TableCell>
                  {canEdit && (
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Edit ${c.name}`}
                          onClick={() => setEditing(c)}
                        >
                          <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                        </Button>
                        {c.isActive && (
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            aria-label={`Deactivate ${c.name}`}
                            className="text-destructive hover:text-destructive"
                            onClick={() =>
                              deactivate(c.id)
                            }
                          >
                            <PowerOff className="h-3.5 w-3.5" aria-hidden="true" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* ── Modals ──────────────────────────────────────────────────────────── */}
      <ContractorModal
        open={creating}
        onClose={() => setCreating(false)}
      />
      {editing && (
        <ContractorModal
          open={!!editing}
          editing={editing}
          onClose={() => setEditing(undefined)}
        />
      )}
    </div>
  );
}
