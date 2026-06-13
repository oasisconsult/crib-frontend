"use client";

import { useState, useEffect } from "react";
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

  // Delay canvas mount by one rAF so the Dialog portal is fully painted before
  // ESignatureCanvas measures offsetWidth (same fix as PresignAgreementModal).
  const [canvasReady, setCanvasReady] = useState(false);
  useEffect(() => {
    if (!open) { setCanvasReady(false); return; }
    const id = requestAnimationFrame(() => setCanvasReady(true));
    return () => cancelAnimationFrame(id);
  }, [open]);

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
    if (!next) setSignatureDataUrl(null);
    onOpenChange(next);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg">
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

        {canvasReady && (
          <div className="px-6 pt-4 pb-2">
            <ESignatureCanvas onSave={setSignatureDataUrl} />
          </div>
        )}

        <DialogFooter className="mt-4">
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
