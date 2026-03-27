"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Building2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirect = searchParams.get("redirect") ?? "/";
  const [loading, setLoading] = useState(false);

  const handleLogtoLogin = () => {
    setLoading(true);
    // Redirect to Logto OIDC authorize endpoint
    const logtoUrl = new URL(
      `${process.env.NEXT_PUBLIC_LOGTO_ENDPOINT}/oidc/auth`,
    );
    logtoUrl.searchParams.set("client_id", process.env.NEXT_PUBLIC_LOGTO_APP_ID ?? "");
    logtoUrl.searchParams.set("redirect_uri", `${window.location.origin}/api/auth/callback`);
    logtoUrl.searchParams.set("response_type", "code");
    logtoUrl.searchParams.set("scope", "openid profile email phone roles offline_access");
    logtoUrl.searchParams.set("state", btoa(JSON.stringify({ redirect })));
    window.location.href = logtoUrl.toString();
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted/30 p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="flex items-center justify-center gap-2.5 mb-8">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <Building2 className="h-5 w-5" />
          </div>
          <span className="text-2xl font-bold tracking-tight gradient-text">Crib</span>
        </div>

        <Card className="shadow-xl border-border/50">
          <CardHeader className="text-center pb-2">
            <CardTitle className="text-xl">Welcome back</CardTitle>
            <CardDescription>Sign in to your Crib account</CardDescription>
          </CardHeader>

          <CardContent className="pt-4 space-y-4">
            <Button
              className="w-full"
              size="lg"
              onClick={handleLogtoLogin}
              disabled={loading}
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Building2 className="h-4 w-4" />
              )}
              Continue with Logto
            </Button>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-border" />
              </div>
              <div className="relative flex justify-center text-xs">
                <span className="bg-card px-3 text-muted-foreground">
                  Secure authentication powered by Logto
                </span>
              </div>
            </div>
          </CardContent>

          <CardFooter className="flex-col gap-2 text-center pt-0">
            <p className="text-xs text-muted-foreground">
              By continuing, you agree to our{" "}
              <a href="#" className="underline underline-offset-2 hover:text-foreground">
                Terms of Service
              </a>{" "}
              and{" "}
              <a href="#" className="underline underline-offset-2 hover:text-foreground">
                Privacy Policy
              </a>
            </p>
          </CardFooter>
        </Card>

        <p className="text-center text-sm text-muted-foreground mt-6">
          Don&apos;t have an account?{" "}
          <a href="/signup" className="text-primary font-medium hover:underline">
            Sign up
          </a>
        </p>
      </div>
    </div>
  );
}
