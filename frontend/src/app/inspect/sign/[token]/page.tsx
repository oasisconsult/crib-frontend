"use client";

import { use, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { CheckCircle2, Clock, ClipboardList, AlertTriangle, Loader2, PenLine, Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { inspectionsApi } from "@/services/api/inspections";
import type { InspectionPublicOut } from "@/services/api/inspections";

interface Props {
  params: Promise<{ token: string }>;
}

function StatusChip({ signed, label }: { signed: boolean; label: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${
      signed
        ? "bg-emerald-100 text-emerald-800"
        : "bg-amber-100 text-amber-800"
    }`}>
      {signed ? <CheckCircle2 className="h-3 w-3" /> : <Clock className="h-3 w-3" />}
      {label}
    </span>
  );
}

// This page is intentionally public — the sign token is the security mechanism.
// It must work without a Crib login so tenants who only have an email link can sign.
export default function TenantSignPage({ params }: Props) {
  const { token } = use(params);
  const [fullName, setFullName] = useState("");
  const [signed, setSigned] = useState(false);
  const [signedData, setSignedData] = useState<InspectionPublicOut | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ["inspection-sign", token],
    queryFn: () => inspectionsApi.getPublicByToken(token),
    retry: false,
  });

  const { mutate: doSign, isPending } = useMutation({
    mutationFn: () => inspectionsApi.tenantSign(token, fullName.trim()),
    onSuccess: (result) => {
      setSignedData(result);
      setSigned(true);
    },
  });

  const inspection = signedData ?? data;

  // ── Loading ──────────────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted/30">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // ── Error / expired ──────────────────────────────────────────────────────────
  if (error || !data) {
    const isExpired = (error as any)?.status === 410 || (error as any)?.response?.status === 410;
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted/30 p-6">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <AlertTriangle className="h-10 w-10 text-amber-500 mx-auto mb-2" />
            <CardTitle>{isExpired ? "Link Expired" : "Link Not Found"}</CardTitle>
            <CardDescription>
              {isExpired
                ? "This sign link has expired (14-day limit). Please contact your property manager to request a new one."
                : "This sign link is invalid or has already been used. Please contact your property manager."}
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  // ── Already signed by tenant ─────────────────────────────────────────────────
  if (signed && signedData) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted/30 p-6">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <CheckCircle2 className="h-12 w-12 text-emerald-500 mx-auto mb-3" />
            <CardTitle>Report Signed</CardTitle>
            <CardDescription>
              Thank you — your signature has been recorded. The inspection report is now
              fully executed by both parties.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {signedData.reportPdfUrl && (
              <a
                href={signedData.reportPdfUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full inline-flex items-center justify-center gap-2 rounded-md border border-input bg-background px-4 py-2 text-sm font-medium shadow-sm hover:bg-accent transition-colors"
              >
                Download Signed Report
              </a>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  // ── Tenant already signed (arrived via re-visit) ─────────────────────────────
  if (inspection?.tenantSignedAt) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted/30 p-6">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <CheckCircle2 className="h-12 w-12 text-emerald-500 mx-auto mb-3" />
            <CardTitle>Already Signed</CardTitle>
            <CardDescription>You have already signed this inspection report.</CardDescription>
          </CardHeader>
          <CardContent>
            {inspection.reportPdfUrl && (
              <a
                href={inspection.reportPdfUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full inline-flex items-center justify-center gap-2 rounded-md border border-input bg-background px-4 py-2 text-sm font-medium shadow-sm hover:bg-accent transition-colors"
              >
                Download Report
              </a>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  // ── Main sign view ───────────────────────────────────────────────────────────
  const typeLabel = inspection!.type.replace(/_/g, " ");

  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-muted/30 px-4 py-10">
      <div className="max-w-lg mx-auto space-y-6">
        {/* Crib branding */}
        <div className="text-center space-y-1">
          <div className="inline-flex items-center justify-center h-12 w-12 rounded-xl bg-primary text-white mx-auto mb-2">
            <ClipboardList className="h-6 w-6" />
          </div>
          <h1 className="text-xl font-bold tracking-tight">Move-in Inspection Report</h1>
          <p className="text-sm text-muted-foreground">Review and sign to confirm the property condition</p>
        </div>

        {/* Inspection summary */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Building2 className="h-4 w-4" />
              Inspection Summary
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Property</span>
              <span className="font-medium">{inspection!.propertyName ?? "—"}</span>
            </div>
            {inspection!.unitName && (
              <>
                <Separator />
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Unit</span>
                  <span className="font-medium">{inspection!.unitName}</span>
                </div>
              </>
            )}
            <Separator />
            <div className="flex justify-between">
              <span className="text-muted-foreground">Type</span>
              <span className="capitalize">{typeLabel}</span>
            </div>
            <Separator />
            <div className="flex justify-between">
              <span className="text-muted-foreground">Inspection date</span>
              <span>{inspection!.scheduledDate}</span>
            </div>
            {inspection!.overallCondition && (
              <>
                <Separator />
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Overall condition</span>
                  <span className="capitalize font-medium">{inspection!.overallCondition}</span>
                </div>
              </>
            )}
            <Separator />
            <div className="flex justify-between">
              <span className="text-muted-foreground">Checklist items</span>
              <span>{inspection!.checklistCount}</span>
            </div>
            <Separator />
            <div className="flex justify-between">
              <span className="text-muted-foreground">Photos</span>
              <span>{inspection!.photoCount}</span>
            </div>
          </CardContent>
        </Card>

        {/* Signature status */}
        <div className="flex flex-wrap gap-2">
          <StatusChip signed={!!inspection!.landlordSignedAt} label={
            inspection!.landlordSignedAt
              ? `Landlord signed · ${inspection!.landlordSignedBy ?? ""}`
              : "Landlord: awaiting signature"
          } />
          <StatusChip signed={false} label="Tenant: your signature needed" />
        </div>

        {/* Summary block */}
        {inspection!.summary && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Inspector Notes</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground whitespace-pre-wrap">{inspection!.summary}</p>
            </CardContent>
          </Card>
        )}

        {/* Sign form */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <PenLine className="h-4 w-4" />
              Add Your Signature
            </CardTitle>
            <CardDescription>
              By signing you confirm that the above report accurately reflects the condition
              of the property at move-in.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="fullName">Your full name *</Label>
              <Input
                id="fullName"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Enter your full name to sign"
              />
            </div>

            <p className="text-xs text-muted-foreground">
              By clicking <strong>Sign Report</strong>, you are providing a digital
              signature confirming that you have read and agree with the contents of
              this inspection report. This link expires{" "}
              {inspection!.signTokenExpiresAt
                ? `on ${new Date(inspection!.signTokenExpiresAt).toLocaleDateString()}`
                : "in 14 days"}.
            </p>

            <Button
              className="w-full"
              disabled={!fullName.trim() || isPending}
              loading={isPending}
              onClick={() => doSign()}
            >
              <PenLine className="h-4 w-4" />
              Sign Report
            </Button>
          </CardContent>
        </Card>

        <p className="text-center text-xs text-muted-foreground">
          Powered by Crib Property Management
        </p>
      </div>
    </div>
  );
}
