"use client";

import { useState } from "react";
import { Building2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function SignupPage() {
  const [loading, setLoading] = useState(false);

  const handleLogtoRegister = () => {
    setLoading(true);
    const logtoUrl = new URL(
      `${process.env.NEXT_PUBLIC_LOGTO_ENDPOINT}/oidc/auth`,
    );
    logtoUrl.searchParams.set(
      "client_id",
      process.env.NEXT_PUBLIC_LOGTO_APP_ID ?? "",
    );
    logtoUrl.searchParams.set(
      "redirect_uri",
      `${window.location.origin}/api/logto/sign-in-callback`,
    );
    logtoUrl.searchParams.set("response_type", "code");
    logtoUrl.searchParams.set(
      "scope",
      "openid profile email phone roles offline_access",
    );
    logtoUrl.searchParams.set("prompt", "create");
    logtoUrl.searchParams.set("state", btoa(JSON.stringify({ redirect: "/" })));
    window.location.href = logtoUrl.toString();
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted/30 p-4">
      <div className="w-full max-w-md">
        <div className="flex items-center justify-center gap-2.5 mb-8">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <Building2 className="h-5 w-5" />
          </div>
          <span className="text-2xl font-bold tracking-tight gradient-text">
            Crib
          </span>
        </div>

        <Card className="shadow-xl border-border/50">
          <CardHeader className="text-center pb-2">
            <CardTitle className="text-xl">Create your account</CardTitle>
            <CardDescription>
              Start managing your properties with Crib
            </CardDescription>
          </CardHeader>

          <CardContent className="pt-4 space-y-4">
            <div className="grid grid-cols-1 gap-3">
              {[
                {
                  icon: "🏠",
                  title: "Property Management",
                  desc: "Manage unlimited properties and units",
                },
                {
                  icon: "📋",
                  title: "Lease Workflows",
                  desc: "End-to-end lease lifecycle management",
                },
                {
                  icon: "💳",
                  title: "Payment Tracking",
                  desc: "Automated rent collection and ledgers",
                },
              ].map((f) => (
                <div
                  key={f.title}
                  className="flex items-center gap-3 rounded-lg border border-border/50 p-3 bg-muted/30"
                >
                  <span className="text-xl">{f.icon}</span>
                  <div>
                    <p className="text-sm font-medium">{f.title}</p>
                    <p className="text-xs text-muted-foreground">{f.desc}</p>
                  </div>
                </div>
              ))}
            </div>

            <Button
              className="w-full"
              size="lg"
              onClick={handleLogtoRegister}
              disabled={loading}
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Building2 className="h-4 w-4" />
              )}
              Create Account with Logto
            </Button>
          </CardContent>

          <CardFooter className="pt-0">
            <p className="text-xs text-muted-foreground text-center w-full">
              By creating an account you agree to our Terms of Service and
              Privacy Policy
            </p>
          </CardFooter>
        </Card>

        <p className="text-center text-sm text-muted-foreground mt-6">
          Already have an account?{" "}
          <a href="/login" className="text-primary font-medium hover:underline">
            Sign in
          </a>
        </p>
      </div>
    </div>
  );
}
