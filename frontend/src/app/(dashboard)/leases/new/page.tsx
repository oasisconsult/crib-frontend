"use client";

import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useCreateLease } from "@/hooks/useLeases";
import { useTenants } from "@/hooks/useTenants";
import { toast } from "@/store/useUIStore";

const schema = z.object({
  tenantId: z.string().min(1, "Select a tenant"),
  unitId: z.string().min(1, "Select a unit"),
  startDate: z.string().min(1, "Start date required"),
  endDate: z.string().min(1, "End date required"),
  monthlyRent: z.coerce.number().positive("Must be positive"),
  currency: z.string().default("UGX"),
  depositAmount: z.coerce.number().min(0),
});

type FormValues = z.infer<typeof schema>;

export default function NewLeasePage() {
  const router = useRouter();
  const { mutate: createLease, isPending } = useCreateLease();
  const { data: tenants } = useTenants();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const onSubmit = (values: FormValues) => {
    createLease(
      {
        tenantId: values.tenantId,
        unitId: values.unitId,
        terms: {
          startDate: values.startDate,
          endDate: values.endDate,
          monthlyRent: values.monthlyRent,
          currency: values.currency,
          depositAmount: values.depositAmount,
          paymentDueDay: 1,
        },
      },
      {
        onSuccess: (lease) => {
          toast.success("Lease created successfully");
          router.push(`/leases/${lease.id}`);
        },
        onError: () => {
          toast.error("Failed to create lease");
        },
      },
    );
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon-sm" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">New Lease</h1>
          <p className="text-sm text-muted-foreground">Create a lease agreement</p>
        </div>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Parties</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="tenantId">
                Tenant <span className="text-destructive">*</span>
              </Label>
              <select
                id="tenantId"
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
                {...register("tenantId")}
              >
                <option value="">Select a tenant...</option>
                {tenants?.data.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.firstName} {t.lastName} — {t.email}
                  </option>
                ))}
              </select>
              {errors.tenantId && (
                <p className="text-xs text-destructive">{errors.tenantId.message}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="unitId">
                Unit ID <span className="text-destructive">*</span>
              </Label>
              <Input
                id="unitId"
                placeholder="Enter unit ID..."
                error={!!errors.unitId}
                {...register("unitId")}
              />
              {errors.unitId && (
                <p className="text-xs text-destructive">{errors.unitId.message}</p>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Lease Terms</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="startDate">
                  Start Date <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="startDate"
                  type="date"
                  error={!!errors.startDate}
                  {...register("startDate")}
                />
                {errors.startDate && (
                  <p className="text-xs text-destructive">{errors.startDate.message}</p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="endDate">
                  End Date <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="endDate"
                  type="date"
                  error={!!errors.endDate}
                  {...register("endDate")}
                />
                {errors.endDate && (
                  <p className="text-xs text-destructive">{errors.endDate.message}</p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="monthlyRent">
                  Monthly Rent <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="monthlyRent"
                  type="number"
                  placeholder="0.00"
                  error={!!errors.monthlyRent}
                  {...register("monthlyRent")}
                />
                {errors.monthlyRent && (
                  <p className="text-xs text-destructive">{errors.monthlyRent.message}</p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="depositAmount">Security Deposit</Label>
                <Input
                  id="depositAmount"
                  type="number"
                  placeholder="0.00"
                  defaultValue={0}
                  {...register("depositAmount")}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="currency">Currency</Label>
              <select
                id="currency"
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
                defaultValue="UGX"
                {...register("currency")}
              >
                {["UGX", "USD", "EUR", "GBP"].map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end gap-3">
          <Button type="button" variant="outline" onClick={() => router.back()}>
            Cancel
          </Button>
          <Button type="submit" loading={isPending}>
            Create Lease
          </Button>
        </div>
      </form>
    </div>
  );
}
