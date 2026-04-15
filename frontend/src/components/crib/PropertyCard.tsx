"use client";

import { motion } from "framer-motion";
import { Building2, MapPin, Home, TrendingUp } from "lucide-react";
import { Card } from "./Card";
import { cn } from "@/utils/cn";
import { useTheme } from "@/contexts/ThemeContext";

interface PropertyCardProps {
  name: string;
  location: string;
  units: number;
  occupied: number;
  revenue: string;
  trend?: string;
  className?: string;
}

export function PropertyCard({ 
  name, 
  location, 
  units, 
  occupied, 
  revenue, 
  trend = "+12%",
  className = "" 
}: PropertyCardProps) {
  const { resolved: theme } = useTheme();
  const occupancyRate = Math.round((occupied / units) * 100);

  return (
    <Card className={cn("p-4 space-y-2", className)}>
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <h3 className="text-lg font-medium text-text-dark">{name}</h3>
          <div className="flex items-center gap-2 mt-1">
            <MapPin className="w-4 h-4 text-muted" />
            <p className="text-sm text-muted">{location}</p>
          </div>
        </div>
        <div className="flex items-center text-success">
          <TrendingUp className="w-4 h-4 mr-1" />
          <span className="text-sm font-medium">{trend}</span>
        </div>
      </div>

      <div className="flex items-center gap-4 text-sm">
        <div className="flex items-center gap-2">
          <Home className="w-4 h-4 text-muted" />
          <span className="text-text-dark">{units} Units</span>
        </div>
        <div className="text-text-dark">
          <span className="font-medium">{occupied}</span>
          <span className="text-muted">/{units}</span>
        </div>
        <div className="text-text-dark">
          <span className="font-medium">{occupancyRate}%</span>
          <span className="text-muted"> occupied</span>
        </div>
      </div>

      <div className="pt-2 border-t border-border-dark">
        <p className="text-xs text-muted mb-1">Monthly Revenue</p>
        <p className="text-xl font-bold text-text-dark">{revenue}</p>
      </div>
    </Card>
  );
}
