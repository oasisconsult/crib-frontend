"use client";

import { Building2, ChevronsUpDown, Check } from "lucide-react";
import { useAppStore } from "@/store/useAppStore";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";

export function PropertySwitcher() {
  const { properties, activeProperty, setActiveProperty } = useAppStore();

  if (properties.length === 0) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2 max-w-48">
          <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="truncate text-sm">
            {activeProperty?.name ?? "All Properties"}
          </span>
          <ChevronsUpDown className="ml-auto h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuLabel>Switch Property</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => setActiveProperty(null)}>
          <Building2 className="mr-2 h-4 w-4" />
          All Properties
          {!activeProperty && <Check className="ml-auto h-4 w-4" />}
        </DropdownMenuItem>
        {properties.map((prop) => (
          <DropdownMenuItem key={prop.id} onClick={() => setActiveProperty(prop)}>
            <Building2 className="mr-2 h-4 w-4" />
            <span className="truncate">{prop.name}</span>
            {activeProperty?.id === prop.id && <Check className="ml-auto h-4 w-4" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
