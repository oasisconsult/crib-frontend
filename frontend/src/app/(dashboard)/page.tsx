"use client";

import { Dashboard } from "@/components/crib/Dashboard";
import { LandlordDashboard } from "@/components/crib/LandlordDashboard";
import { usePermissions } from "@/hooks/usePermissions";

export default function DashboardPage() {
  const { isLandlord } = usePermissions();
  return isLandlord ? <LandlordDashboard /> : <Dashboard />;
}
