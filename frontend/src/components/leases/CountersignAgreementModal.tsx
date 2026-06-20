"use client";

import { useState } from "react";
import { Edit } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ESignatureCanvas } from "@/components/onboarding/ESignatureCanvas";
import { useCountersignAgreement } from "@/hooks/useLeases";

interface CountersignAgreementModalProps {
  leaseId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CountersignAgreementModal({
  leaseId,
  open,
  onOpenChange,
}: CountersignAgreementModalProps) {
  const [signatureDataUrl, setSignatureDataUrl] = useState<string | null>(null);
  const { mutate: countersign, isPending } = useCountersignAgreement();

  // Mount the canvas only after the Dialog's enter animation finishes via
  // onOpenAutoFocus. A single rAF fired too early (mid-animation), causing
  // ResizeObserver to clear the canvas while the user was drawing.
  const [canvasReady, setCanvasReady] = useState(false);

  const handleConfirm = () => {
    if (!signatureDataUrl) return;
    countersign(
      { id: leaseId, signatureDataUrl },
      {
        onSuccess: () => {
          setSignatureDataUrl(null);
          onOpenChange(false);
        },
      },
    );
  };

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      setSignatureDataUrl(null);
      setCanvasReady(false);
    }
    onOpenChange(next);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className="max-w-lg"
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          setCanvasReady(true);
        }}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Edit className="h-4 w-4" />
            Counter-sign Agreement
          </DialogTitle>
          <DialogDescription>
            The tenant has signed the tenancy agreement. Add your counter-signature
            to fully execute the agreement and activate the lease.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2 py-2">
          <p className="text-sm font-medium">Your signature</p>
          {canvasReady ? (
            <ESignatureCanvas onSave={setSignatureDataUrl} />
          ) : (
            <div className="rounded-[6px] border-2 border-dashed border-border bg-muted/20 h-[190px] animate-pulse" />
          )}
        </div>

        <DialogFooter className="mt-2">
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={!signatureDataUrl || isPending}
            loading={isPending}
          >
            <Edit className="h-3.5 w-3.5" />
            {isPending ? "Signing…" : "Confirm Counter-signature"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
