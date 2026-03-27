"use client";

import { use } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Mail, Phone, Shield, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { OnboardingProgress } from "@/components/tenants/OnboardingProgress";
import { PageSkeleton } from "@/components/common/LoadingSkeleton";
import { formatDate, getInitials } from "@/utils/formatters";
import { useTenant, useTenantDocuments } from "@/hooks/useTenants";

interface Props {
  params: Promise<{ id: string }>;
}

export default function TenantDetailPage({ params }: Props) {
  const { id } = use(params);
  const router = useRouter();
  const { data: tenant, isLoading } = useTenant(id);
  const { data: documents } = useTenantDocuments(id);

  if (isLoading) return <PageSkeleton />;
  if (!tenant) return null;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon-sm" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex items-center gap-3 flex-1">
          <Avatar className="h-10 w-10">
            <AvatarFallback className="bg-primary/10 text-primary font-medium">
              {getInitials(`${tenant.firstName} ${tenant.lastName}`)}
            </AvatarFallback>
          </Avatar>
          <div>
            <h1 className="text-xl font-bold tracking-tight">
              {tenant.firstName} {tenant.lastName}
            </h1>
            <p className="text-sm text-muted-foreground">{tenant.email}</p>
          </div>
        </div>
        <Badge
          variant={
            tenant.onboardingState === "completed"
              ? "success"
              : tenant.onboardingState === "rejected"
                ? "destructive"
                : "secondary"
          }
          className="capitalize"
        >
          {tenant.onboardingState.replace(/_/g, " ")}
        </Badge>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Contact Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center gap-2 text-sm">
                <Mail className="h-4 w-4 text-muted-foreground" />
                <a href={`mailto:${tenant.email}`} className="hover:underline">
                  {tenant.email}
                </a>
              </div>
              {tenant.phone && (
                <div className="flex items-center gap-2 text-sm">
                  <Phone className="h-4 w-4 text-muted-foreground" />
                  <a href={`tel:${tenant.phone}`} className="hover:underline">
                    {tenant.phone}
                  </a>
                </div>
              )}
              {tenant.nationality && (
                <>
                  <Separator />
                  <div className="flex items-center gap-2 text-sm">
                    <Shield className="h-4 w-4 text-muted-foreground" />
                    <span className="text-muted-foreground">Nationality:</span>
                    <span>{tenant.nationality}</span>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {tenant.emergencyContact && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Emergency Contact</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Name</span>
                  <span>{tenant.emergencyContact.name}</span>
                </div>
                <Separator />
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Relationship</span>
                  <span className="capitalize">{tenant.emergencyContact.relationship}</span>
                </div>
                <Separator />
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Phone</span>
                  <span>{tenant.emergencyContact.phone}</span>
                </div>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <FileText className="h-4 w-4" />
                Documents ({documents?.length ?? 0})
              </CardTitle>
            </CardHeader>
            <CardContent>
              {!documents || documents.length === 0 ? (
                <p className="text-sm text-muted-foreground">No documents uploaded yet.</p>
              ) : (
                <div className="space-y-2">
                  {documents.map((doc) => (
                    <div key={doc.id} className="flex items-center justify-between text-sm py-1.5">
                      <div className="flex items-center gap-2">
                        <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                        <span>{doc.name}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-xs capitalize">
                          {doc.type.replace(/_/g, " ")}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {formatDate(doc.uploadedAt)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Onboarding Progress</CardTitle>
            </CardHeader>
            <CardContent>
              <OnboardingProgress state={tenant.onboardingState} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Account</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Joined</span>
                <span>{formatDate(tenant.createdAt)}</span>
              </div>
              <Separator />
              <div className="flex justify-between">
                <span className="text-muted-foreground">Tenant ID</span>
                <span className="font-mono text-xs">{tenant.id.slice(-8)}</span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
