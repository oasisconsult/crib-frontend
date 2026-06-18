"use client";

import { useState } from "react";
import { FileDown, Download } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import type { Lease } from "@/types";

interface StatementDialogProps {
  lease: Lease;
  open: boolean;
  onClose: () => void;
}

function toIso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function StatementDialog({ lease, open, onClose }: StatementDialogProps) {
  const leaseStart = lease.startDate
    ? lease.startDate.slice(0, 10)
    : toIso(new Date(new Date().getFullYear(), 0, 1));

  const today = toIso(new Date());

  const [dateFrom, setDateFrom] = useState(leaseStart);
  const [dateTo, setDateTo]     = useState(today);

  function buildUrl(format: "pdf" | "csv") {
    const base =
      format === "pdf"
        ? `/api/v1/leases/${lease.id}/statement/pdf`
        : `/api/v1/leases/${lease.id}/statement`;
    const params = new URLSearchParams();
    if (dateFrom) params.set("dateFrom", dateFrom);
    if (dateTo)   params.set("dateTo",   dateTo);
    return `${base}?${params.toString()}`;
  }

  function download(format: "pdf" | "csv") {
    const a = document.createElement("a");
    a.href = buildUrl(format);
    a.download = `statement-${lease.id.slice(0, 8)}.${format}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader className="pb-1">
          <DialogTitle>Download Statement</DialogTitle>
          <DialogDescription>
            Only months whose period starts within this range will appear.
          </DialogDescription>
        </DialogHeader>

        <Separator />

        <div className="px-1 py-3 space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="stmt-from">From</Label>
              <Input
                id="stmt-from"
                type="date"
                value={dateFrom}
                max={dateTo || today}
                onChange={(e) => setDateFrom(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="stmt-to">To</Label>
              <Input
                id="stmt-to"
                type="date"
                value={dateTo}
                min={dateFrom}
                max={today}
                onChange={(e) => setDateTo(e.target.value)}
              />
            </div>
          </div>

          <div className="flex gap-3">
            <Button
              className="flex-1"
              onClick={() => download("pdf")}
              disabled={!dateFrom || !dateTo}
            >
              <FileDown className="h-4 w-4" />
              Download PDF
            </Button>
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => download("csv")}
              disabled={!dateFrom || !dateTo}
            >
              <Download className="h-4 w-4" />
              Download CSV
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
