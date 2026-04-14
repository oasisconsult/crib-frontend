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
import { usePresignAgreement } from "@/hooks/useLeases";

interface PresignAgreementModalProps {
  leaseId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function PresignAgreementModal({
  leaseId,
  open,
  onOpenChange,
}: PresignAgreementModalProps) {
  const [signatureDataUrl, setSignatureDataUrl] = useState<string | null>(null);
  const { mutate: presign, isPending } = usePresignAgreement();

  const handleConfirm = () => {
    if (!signatureDataUrl) return;
    presign(
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
            Pre-sign Agreement
          </DialogTitle>
          <DialogDescription>
            Sign the tenancy agreement before sending it to the tenant. Your
            signature will appear on the agreement the tenant reviews during
            onboarding. Once the tenant signs, the agreement is fully executed.
          </DialogDescription>
        </DialogHeader>

        <ESignatureCanvas
          onSave={setSignatureDataUrl}
          className="mt-2"
        />

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
            {isPending ? "Signing…" : "Confirm Pre-signature"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
