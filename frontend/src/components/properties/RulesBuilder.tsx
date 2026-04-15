"use client";

import { useEffect } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { AlertTriangle, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import {
  getVisibleFields,
  schemaToDefaultValues,
  detectRuleConflicts,
} from "@/utils/dynamicForm";
import { DEFAULT_RULE_SCHEMA } from "@/types/rule";
import { useUpdatePropertyRules } from "@/hooks/useProperties";
import type { PropertyRules } from "@/types";

const rulesSchema = z.object({
  gracePeriodDays: z.number().min(0).max(30),
  lateFeeType: z.enum(["flat", "percentage"]),
  lateFeeValue: z.number().min(0),
  lateFeeCapAmount: z.number().optional(),
  depositMonths: z.number().min(0).max(6),
  noticePeriodDays: z.number().min(7).max(180),
  allowSubletting: z.boolean(),
  allowPets: z.boolean(),
  allowSmoking: z.boolean(),
  rentDayOfMonth: z.number().min(1).max(28),
  billingCurrency: z.string(),
  maintenanceWindowHours: z.number().min(0),
});

interface RulesBuilderProps {
  propertyId: string;
  initialRules: PropertyRules;
  /** Override the default save action (e.g. for per-unit rules). */
  onSave?: (rules: PropertyRules) => void;
  isSaving?: boolean;
}

export function RulesBuilder({ propertyId, initialRules, onSave, isSaving }: RulesBuilderProps) {
  const { mutate: saveRules, isPending: savingProperty } = useUpdatePropertyRules();
  const isPending = isSaving ?? savingProperty;

  const defaultValues = schemaToDefaultValues(DEFAULT_RULE_SCHEMA, initialRules) as unknown as PropertyRules;

  const { register, handleSubmit, watch, control, formState: { errors, isDirty } } = useForm<PropertyRules>({
    resolver: zodResolver(rulesSchema),
    defaultValues,
  });

  const values = watch();
  const visibleFields = getVisibleFields(DEFAULT_RULE_SCHEMA.fields, values as unknown as Record<string, unknown>);
  const conflicts = detectRuleConflicts(values as unknown as Record<string, unknown>);

  const onSubmit = (data: PropertyRules) => {
    if (onSave) {
      onSave(data);
    } else {
      saveRules({ id: propertyId, rules: data });
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      {conflicts.length > 0 && (
        <Alert variant="warning">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            <ul className="list-disc pl-4 space-y-0.5">
              {conflicts.map((c, i) => <li key={i} className="text-sm">{c}</li>)}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-5 md:grid-cols-2">
        {visibleFields.map((field) => {
          const hasError = !!errors[field.key as keyof PropertyRules];

          if (field.type === "boolean") {
            return (
              <div key={field.key} className="flex items-center justify-between rounded-lg border p-4">
                <div>
                  <Label htmlFor={field.key} className="text-sm font-medium">{field.label}</Label>
                  {field.description && (
                    <p className="text-xs text-muted-foreground mt-0.5">{field.description}</p>
                  )}
                </div>
                <Controller
                  name={field.key as keyof PropertyRules}
                  control={control}
                  render={({ field: f }) => (
                    <Switch
                      id={field.key}
                      checked={!!f.value}
                      onCheckedChange={f.onChange}
                    />
                  )}
                />
              </div>
            );
          }

          if (field.type === "select" && field.options) {
            return (
              <div key={field.key} className="space-y-1.5">
                <Label htmlFor={field.key}>
                  {field.label}
                  {field.required && <span className="text-destructive ml-1">*</span>}
                </Label>
                {field.description && (
                  <p className="text-xs text-muted-foreground">{field.description}</p>
                )}
                <Controller
                  name={field.key as keyof PropertyRules}
                  control={control}
                  render={({ field: f }) => (
                    <Select value={String(f.value)} onValueChange={f.onChange}>
                      <SelectTrigger id={field.key}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {field.options!.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>
            );
          }

          // number, currency, percentage, days
          return (
            <div key={field.key} className="space-y-1.5">
              <Label htmlFor={field.key}>
                {field.label}
                {field.required && <span className="text-destructive ml-1">*</span>}
                {field.type === "days" && (
                  <span className="ml-1 text-xs text-muted-foreground">(days)</span>
                )}
                {field.type === "percentage" && (
                  <span className="ml-1 text-xs text-muted-foreground">(%)</span>
                )}
              </Label>
              {field.description && (
                <p className="text-xs text-muted-foreground">{field.description}</p>
              )}
              <Input
                id={field.key}
                type="number"
                min={field.min}
                max={field.max}
                step="0.01"
                error={hasError}
                {...register(field.key as keyof PropertyRules, { valueAsNumber: true })}
              />
              {hasError && (
                <p className="text-xs text-destructive">
                  {(errors[field.key as keyof PropertyRules] as { message?: string })?.message}
                </p>
              )}
            </div>
          );
        })}
      </div>

      <Separator />

      <div className="flex items-center justify-between">
        {isDirty && (
          <p className="text-xs text-amber-600 flex items-center gap-1">
            <AlertTriangle className="h-3.5 w-3.5" />
            Unsaved changes
          </p>
        )}
        <Button type="submit" loading={isPending} className="ml-auto" disabled={!isDirty || conflicts.length > 0}>
          <Save className="h-4 w-4" />
          Save Rules
        </Button>
      </div>
    </form>
  );
}
