export function LegalContent({
  lastUpdated,
  children,
}: {
  lastUpdated: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto max-w-3xl px-4 sm:px-6 pt-12">
      <p className="text-xs text-[hsl(var(--muted-foreground))] mb-8">
        Last updated: {lastUpdated}
      </p>
      <div
        className="prose prose-sm sm:prose-base max-w-none
          prose-headings:font-semibold prose-headings:tracking-tight prose-headings:text-[hsl(var(--foreground))]
          prose-p:text-[hsl(var(--muted-foreground))] prose-li:text-[hsl(var(--muted-foreground))]
          prose-a:text-[#239487] prose-a:no-underline hover:prose-a:underline
          prose-strong:text-[hsl(var(--foreground))]"
      >
        {children}
      </div>
    </div>
  );
}
