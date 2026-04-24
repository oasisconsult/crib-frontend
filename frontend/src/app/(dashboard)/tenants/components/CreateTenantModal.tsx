"use client";

import { useState } from "react";
import { X, UserPlus } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/store/useUIStore";
import { apiClient } from "@/services/api/client";
import type { Tenant } from "@/types";

interface Props {
  onClose: () => void;
}

interface CreateTenantBody {
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  nationalId?: string;
  dateOfBirth?: string;
  nationality?: string;
  notes?: string;
}

function useCreateTenant() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: CreateTenantBody) => {
      const { data } = await apiClient.post<Tenant>("/tenants", body);
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tenants"] }),
  });
}

export function CreateTenantModal({ onClose }: Props) {
  const [form, setForm] = useState<CreateTenantBody>({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    nationalId: "",
    dateOfBirth: "",
    nationality: "",
    notes: "",
  });

  const { mutate: createTenant, isPending } = useCreateTenant();

  function update(field: keyof CreateTenantBody, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.firstName.trim() || !form.lastName.trim() || !form.email.trim()) {
      toast.error("Missing fields", "First name, last name, and email are required");
      return;
    }

    // Strip empty optional fields
    const payload: CreateTenantBody = {
      firstName: form.firstName.trim(),
      lastName: form.lastName.trim(),
      email: form.email.trim(),
    };
    if (form.phone?.trim())       payload.phone       = form.phone.trim();
    if (form.nationalId?.trim())  payload.nationalId  = form.nationalId.trim();
    if (form.dateOfBirth?.trim()) payload.dateOfBirth = form.dateOfBirth.trim();
    if (form.nationality?.trim()) payload.nationality = form.nationality.trim();
    if (form.notes?.trim())       payload.notes       = form.notes.trim();

    createTenant(payload, {
      onSuccess: () => {
        toast.success("Tenant created", `${form.firstName} ${form.lastName} has been added`);
        onClose();
      },
      onError: (err: any) => {
        const detail = err?.response?.data?.detail;
        toast.error("Failed to create tenant", typeof detail === "string" ? detail : "Please try again");
      },
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <Card className="w-full max-w-lg">
        <CardHeader className="flex-row items-start justify-between gap-4 pb-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <UserPlus className="h-5 w-5" />
              New Tenant
            </CardTitle>
            <CardDescription className="mt-1">
              Create a tenant profile. No invite email is sent — use
              the tenant detail page to send an onboarding link when ready.
            </CardDescription>
          </div>
          <Button variant="ghost" size="icon-sm" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </CardHeader>

        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Name row */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="ct-first">First name *</Label>
                <Input
                  id="ct-first"
                  value={form.firstName}
                  onChange={(e) => update("firstName", e.target.value)}
                  placeholder="Jane"
                  autoFocus
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ct-last">Last name *</Label>
                <Input
                  id="ct-last"
                  value={form.lastName}
                  onChange={(e) => update("lastName", e.target.value)}
                  placeholder="Doe"
                />
              </div>
            </div>

            {/* Email */}
            <div className="space-y-1.5">
              <Label htmlFor="ct-email">Email address *</Label>
              <Input
                id="ct-email"
                type="email"
                value={form.email}
                onChange={(e) => update("email", e.target.value)}
                placeholder="jane.doe@example.com"
              />
            </div>

            {/* Phone */}
            <div className="space-y-1.5">
              <Label htmlFor="ct-phone">Phone</Label>
              <Input
                id="ct-phone"
                type="tel"
                value={form.phone}
                onChange={(e) => update("phone", e.target.value)}
                placeholder="+256 700 000000"
              />
            </div>

            {/* National ID + DOB */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="ct-nin">National ID</Label>
                <Input
                  id="ct-nin"
                  value={form.nationalId}
                  onChange={(e) => update("nationalId", e.target.value)}
                  placeholder="CM1234567"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ct-dob">Date of birth</Label>
                <Input
                  id="ct-dob"
                  type="date"
                  value={form.dateOfBirth}
                  onChange={(e) => update("dateOfBirth", e.target.value)}
                />
              </div>
            </div>

            {/* Nationality */}
            <div className="space-y-1.5">
              <Label htmlFor="ct-nationality">Nationality</Label>
              <Input
                id="ct-nationality"
                value={form.nationality}
                onChange={(e) => update("nationality", e.target.value)}
                placeholder="e.g. Ugandan"
              />
            </div>

            {/* Notes */}
            <div className="space-y-1.5">
              <Label htmlFor="ct-notes">Notes</Label>
              <textarea
                id="ct-notes"
                value={form.notes}
                onChange={(e) => update("notes", e.target.value)}
                placeholder="Internal notes about this tenant…"
                rows={2}
                className="w-full rounded-[6px] border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none"
              />
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" loading={isPending}>
                Create tenant
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
