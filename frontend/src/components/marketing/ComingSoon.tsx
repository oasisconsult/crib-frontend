import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ComingSoon({
  icon: Icon,
  title,
  description,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
}) {
  return (
    <div className="mx-auto max-w-xl px-4 sm:px-6 pt-16 text-center">
      <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-[#f3fcfa] text-[#239487] mb-6">
        <Icon className="h-6 w-6" aria-hidden="true" />
      </div>
      <h2 className="text-xl font-semibold text-[hsl(var(--foreground))] mb-2">
        {title} is coming soon
      </h2>
      <p className="text-sm text-[hsl(var(--muted-foreground))] leading-relaxed mb-8">
        {description}
      </p>
      <Button asChild variant="outline" size="sm">
        <Link href="/"><ArrowLeft className="h-3.5 w-3.5" /> Back to home</Link>
      </Button>
    </div>
  );
}
