"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Eye, Save, Tag } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useCreateTemplate, useUpdateTemplate } from "@/hooks/useNotifications";
import { notificationsApi } from "@/services/api/notifications";
import type { NotificationTemplate } from "@/types";

const schema = z.object({
  name: z.string().min(2, "Name required"),
  trigger: z.string().min(1, "Trigger required"),
  channel: z.enum(["whatsapp", "email", "sms", "in_app"]),
  subject: z.string().optional(),
  body: z.string().min(10, "Body required"),
  isActive: z.boolean(),
});

type FormValues = z.infer<typeof schema>;

const TEMPLATE_VARIABLES = [
  "tenant_name",
  "property_name",
  "unit_name",
  "amount",
  "due_date",
  "lease_start",
  "lease_end",
  "landlord_name",
];

interface TemplateEditorProps {
  template?: NotificationTemplate;
  onSaved?: () => void;
}

export function TemplateEditor({ template, onSaved }: TemplateEditorProps) {
  const [preview, setPreview] = useState<string | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);

  const { mutate: create, isPending: creating } = useCreateTemplate();
  const { mutate: update, isPending: updating } = useUpdateTemplate();
  const isPending = creating || updating;

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: template
      ? {
          name: template.name,
          trigger: template.trigger,
          channel: template.channel,
          subject: template.subject,
          body: template.body,
          isActive: template.isActive,
        }
      : { channel: "whatsapp", isActive: true },
  });

  const channel = watch("channel");
  const body = watch("body");

  const insertVariable = (variable: string) => {
    const textarea = document.getElementById("body") as HTMLTextAreaElement;
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const current = body ?? "";
    const next = `${current.slice(0, start)}{{${variable}}}${current.slice(end)}`;
    setValue("body", next, { shouldDirty: true });
  };

  const handlePreview = async () => {
    if (!template) return;
    setLoadingPreview(true);
    try {
      const sampleVars = Object.fromEntries(
        TEMPLATE_VARIABLES.map((v) => [v, `[${v.replace(/_/g, " ")}]`]),
      );
      const result = await notificationsApi.previewTemplate(
        template.id,
        sampleVars,
      );
      setPreview(result.body);
    } finally {
      setLoadingPreview(false);
    }
  };

  const onSubmit = (values: FormValues) => {
    const payload = {
      ...values,
      landlordId: "landlord-1",
      variables: TEMPLATE_VARIABLES,
    };
    if (template) {
      update(
        { id: template.id, data: payload as Partial<NotificationTemplate> },
        { onSuccess: onSaved },
      );
    } else {
      create(payload as Parameters<typeof create>[0], { onSuccess: onSaved });
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="name">
            Template Name <span className="text-destructive">*</span>
          </Label>
          <Input
            id="name"
            placeholder="Rent Due Reminder"
            error={!!errors.name}
            {...register("name")}
          />
          {errors.name && (
            <p className="text-xs text-destructive">{errors.name.message}</p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label>
            Channel <span className="text-destructive">*</span>
          </Label>
          <Select
            value={channel}
            onValueChange={(v) =>
              setValue("channel", v as FormValues["channel"])
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="whatsapp">WhatsApp</SelectItem>
              <SelectItem value="email">Email</SelectItem>
              <SelectItem value="sms">SMS</SelectItem>
              <SelectItem value="in_app">In-App</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label>
            Trigger <span className="text-destructive">*</span>
          </Label>
          <Select
            defaultValue={template?.trigger}
            onValueChange={(v) => setValue("trigger", v)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select trigger..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="rent_due">Rent Due</SelectItem>
              <SelectItem value="rent_overdue">Rent Overdue</SelectItem>
              <SelectItem value="lease_expiry">Lease Expiry</SelectItem>
              <SelectItem value="lease_activated">Lease Activated</SelectItem>
              <SelectItem value="onboarding_invite">
                Onboarding Invite
              </SelectItem>
              <SelectItem value="payment_confirmed">
                Payment Confirmed
              </SelectItem>
              <SelectItem value="payment_failed">Payment Failed</SelectItem>
              <SelectItem value="late_fee_applied">Late Fee Applied</SelectItem>
              <SelectItem value="inspection_scheduled">
                Inspection Scheduled
              </SelectItem>
              <SelectItem value="custom">Custom</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {channel === "email" && (
          <div className="space-y-1.5">
            <Label htmlFor="subject">Email Subject</Label>
            <Input
              id="subject"
              placeholder="Your rent for {{unit_name}} is due"
              {...register("subject")}
            />
          </div>
        )}
      </div>

      {/* Variables */}
      <div className="space-y-2">
        <Label className="flex items-center gap-1.5">
          <Tag className="h-3.5 w-3.5" />
          Insert Variable
        </Label>
        <div className="flex flex-wrap gap-1.5">
          {TEMPLATE_VARIABLES.map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => insertVariable(v)}
              className="text-xs px-2 py-0.5 rounded-[5px] bg-indigo-50 text-indigo-700 hover:bg-indigo-100 dark:bg-indigo-100/40 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-200 font-mono transition-colors"
            >
              {`{{${v}}}`}
            </button>
          ))}
        </div>
      </div>

      {/* Body */}
      <div className="space-y-1.5">
        <Label htmlFor="body">
          Message Body <span className="text-destructive">*</span>
        </Label>
        <Textarea
          id="body"
          rows={7}
          placeholder="Hi {{tenant_name}}, your rent of {{amount}} is due on {{due_date}}..."
          error={!!errors.body}
          {...register("body")}
        />
        {errors.body && (
          <p className="text-xs text-destructive">{errors.body.message}</p>
        )}
        {channel === "sms" && body && (
          <p className="text-xs text-muted-foreground">
            {body.length} chars / {Math.ceil(body.length / 160)} SMS segment
            {Math.ceil(body.length / 160) !== 1 ? "s" : ""}
          </p>
        )}
      </div>

      {/* Preview */}
      {preview && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Preview</CardTitle>
          </CardHeader>
          <CardContent>
            <Alert variant="info">
              <AlertDescription className="whitespace-pre-wrap text-sm">
                {preview}
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>
      )}

      {/* Active toggle */}
      <div className="flex items-center gap-3">
        <Switch
          id="isActive"
          checked={watch("isActive")}
          onCheckedChange={(v) => setValue("isActive", v)}
        />
        <Label htmlFor="isActive">Active — send automatically on trigger</Label>
      </div>

      <div className="flex gap-2">
        {template && (
          <Button
            type="button"
            variant="outline"
            loading={loadingPreview}
            onClick={handlePreview}
          >
            <Eye className="h-4 w-4" />
            Preview
          </Button>
        )}
        <Button type="submit" loading={isPending}>
          <Save className="h-4 w-4" />
          {template ? "Save Changes" : "Create Template"}
        </Button>
      </div>
    </form>
  );
}
