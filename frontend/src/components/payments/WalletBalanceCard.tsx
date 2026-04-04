"use client";

/**
 * WalletBalanceCard — shows tenant's overpayment credit balance.
 *
 * Displayed in the tenant portal when the tenant has a non-zero wallet.
 * Returns null (renders nothing) when the wallet doesn't exist or has zero balance.
 */

import { Wallet } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { formatCurrency } from "@/utils/formatters";
import { useTenantWallet } from "@/hooks/usePayments";

interface WalletBalanceCardProps {
  tenantId: string;
}

export function WalletBalanceCard({ tenantId }: WalletBalanceCardProps) {
  const { data: wallet, isLoading, isError } = useTenantWallet(tenantId);

  // Don't show anything while loading or if there's no wallet / zero balance
  if (isLoading || isError || !wallet || wallet.balance <= 0) {
    return null;
  }

  return (
    <Card className="border-emerald-200 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/30">
      <CardContent className="p-4 flex items-center gap-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/60">
          <Wallet className="h-5 w-5 text-emerald-600" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-emerald-800 dark:text-emerald-300 uppercase tracking-wide">
            Wallet Credit
          </p>
          <p className="text-xl font-bold text-emerald-700 dark:text-emerald-200 mt-0.5">
            {formatCurrency(wallet.balance, wallet.currency)}
          </p>
          <p className="text-xs text-emerald-600/80 dark:text-emerald-400/80 mt-0.5">
            Overpayment credit — will be applied to your next rent automatically.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
