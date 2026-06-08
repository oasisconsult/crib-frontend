import { MarketingNav } from "@/components/marketing/MarketingNav";
import { MarketingFooter } from "@/components/marketing/MarketingFooter";

export function MarketingPageShell({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <>
      <MarketingNav />
      <main>
        <header className="bg-white pt-32 pb-12 lg:pt-40 lg:pb-16 border-b border-[hsl(var(--border))]">
          <div className="mx-auto max-w-3xl px-4 sm:px-6 text-center">
            {eyebrow && (
              <p className="text-sm font-semibold uppercase tracking-widest text-[#239487] mb-3">
                {eyebrow}
              </p>
            )}
            <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-[hsl(var(--foreground))]">
              {title}
            </h1>
            {description && (
              <p className="mt-4 text-base text-[hsl(var(--muted-foreground))] leading-relaxed">
                {description}
              </p>
            )}
          </div>
        </header>
        <div className="bg-white pb-20 lg:pb-28">{children}</div>
      </main>
      <MarketingFooter />
    </>
  );
}
