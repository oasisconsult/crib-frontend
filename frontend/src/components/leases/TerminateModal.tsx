"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
  DialogBody, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertTriangle } from "lucide-react";
import { useTransitionLease } from "@/hooks/useLeases";

const schema = z.object({
  reason: z.string().min(10, "Please provide a reason (min 10 characters)"),
});

type FormValues = z.infer<typeof schema>;

interface TerminateModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  leaseId: string;
}

export function TerminateModal({ open, onOpenChange, leaseId }: TerminateModalProps) {
  const { mutate: transition, isPending } = useTransitionLease();
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const onSubmit = (values: FormValues) => {
    transition(
      { id: leaseId, event: "LEASE_TERMINATED", payload: { terminationReason: values.reason } },
      {
        onSuccess: () => {
          reset();
          onOpenChange(false);
        },
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-100 text-red-600">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div>
              <DialogTitle>Terminate Lease</DialogTitle>
              <DialogDescription className="mt-1">
                This action is irreversible. The lease will be marked as terminated and the unit will become available.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)}>
          <DialogBody className="space-y-4">
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                Terminating a lease may have legal and financial implications. Ensure proper notice has been served.
              </AlertDescription>
            </Alert>

            <div className="space-y-1.5">
              <Label htmlFor="reason">
                Reason for termination <span className="text-destructive">*</span>
              </Label>
              <Textarea
                id="reason"
                placeholder="Describe the reason for termination..."
                rows={4}
                error={!!errors.reason}
                {...register("reason")}
              />
              {errors.reason && (
                <p className="text-xs text-destructive">{errors.reason.message}</p>
              )}
            </div>
          </DialogBody>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button type="submit" variant="destructive" loading={isPending}>
              Terminate Lease
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
