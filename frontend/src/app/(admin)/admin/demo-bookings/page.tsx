"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Loader2, Mail, Phone, Search } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DataTable, type Column } from "@/components/common/DataTable";
import { PageHeader } from "@/components/common/PageHeader";
import { PermissionGate } from "@/components/common/PermissionGate";
import { formatDate } from "@/utils/formatters";
import { useDebounce } from "@/hooks/useDebounce";
import { demoBookingsApi, type DemoBooking, type DemoBookingStatus } from "@/services/api/demoBookings";
import { toast } from "@/store/useUIStore";

const PAGE_SIZE = 20;

const STATUS_OPTIONS: { value: DemoBookingStatus | "all"; label: string }[] = [
  { value: "all",       label: "All statuses" },
  { value: "pending",   label: "Pending" },
  { value: "confirmed", label: "Confirmed" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
];

const STATUS_BADGE_VARIANT: Record<DemoBookingStatus, "warning" | "success" | "secondary" | "destructive"> = {
  pending:   "warning",
  confirmed: "success",
  completed: "secondary",
  cancelled: "destructive",
};

function formatSlotTime(time: string) {
  const [h, m] = time.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
}

export default function AdminDemoBookingsPage() {
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 350);
  const [statusFilter, setStatusFilter] = useState<DemoBookingStatus | "all">("all");
  const [page, setPage] = useState(1);

  const [bookings, setBookings] = useState<DemoBooking[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<string | null>(null);

  useEffect(() => { setPage(1); }, [debouncedSearch, statusFilter]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    demoBookingsApi
      .list({
        status: statusFilter === "all" ? undefined : statusFilter,
        search: debouncedSearch || undefined,
        page,
        pageSize: PAGE_SIZE,
      })
      .then((res) => {
        if (cancelled) return;
        setBookings(res.data);
        setTotal(res.total);
      })
      .catch(() => { if (!cancelled) toast.error("Failed to load demo bookings"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [statusFilter, debouncedSearch, page]);

  async function handleStatusChange(booking: DemoBooking, status: DemoBookingStatus) {
    if (status === booking.status) return;
    setUpdating(booking.id);
    try {
      const updated = await demoBookingsApi.updateStatus(booking.id, status);
      setBookings((prev) => prev.map((b) => (b.id === booking.id ? updated : b)));
      toast.success(`Marked as ${status}`);
    } catch {
      toast.error("Failed to update booking status");
    } finally {
      setUpdating(null);
    }
  }

  const columns: Column<DemoBooking>[] = [
    {
      key: "firstName",
      header: "Contact",
      render: (b) => (
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground truncate">
            {b.firstName} {b.lastName}
          </p>
          {b.company && (
            <p className="text-xs text-muted-foreground truncate">{b.company}</p>
          )}
        </div>
      ),
    },
    {
      key: "email",
      header: "Contact info",
      render: (b) => (
        <div className="space-y-0.5 text-xs text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <Mail className="h-3 w-3 shrink-0" /> <span className="truncate">{b.email}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Phone className="h-3 w-3 shrink-0" /> <span className="truncate">{b.phone}</span>
          </div>
        </div>
      ),
    },
    {
      key: "portfolioSize",
      header: "Portfolio",
      render: (b) => (
        <span className="text-sm text-muted-foreground">{b.portfolioSize ?? "—"}</span>
      ),
    },
    {
      key: "slotDate",
      header: "Requested slot",
      sortable: true,
      render: (b) => (
        <div className="text-sm">
          <p className="font-medium text-foreground">{formatDate(b.slotDate)}</p>
          <p className="text-xs text-muted-foreground">{formatSlotTime(b.slotTime)} ({b.timezone})</p>
        </div>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (b) => (
        <div className="flex items-center gap-2">
          <Badge variant={STATUS_BADGE_VARIANT[b.status]} className="text-xs capitalize min-w-[78px] justify-center">
            {b.status}
          </Badge>
          {updating === b.id && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
        </div>
      ),
    },
    {
      key: "id",
      header: "Action",
      render: (b) => (
        <Select
          value={b.status}
          onValueChange={(v) => handleStatusChange(b, v as DemoBookingStatus)}
        >
          <SelectTrigger className="h-7 w-[130px] text-xs" disabled={updating === b.id}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(["pending", "confirmed", "completed", "cancelled"] as const).map((s) => (
              <SelectItem key={s} value={s} className="text-xs capitalize">{s}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      ),
    },
  ];

  return (
    <PermissionGate
      role="superadmin"
      fallback={
        <div className="flex items-center justify-center min-h-[300px]">
          <p className="text-muted-foreground text-sm">Access restricted to platform administrators.</p>
        </div>
      }
    >
      <div className="space-y-6">
        <PageHeader
          title="Demo Bookings"
          description="Product demo requests submitted via the marketing site's 'Book a Demo' widget."
          actions={
            <Button asChild variant="ghost" size="sm">
              <Link href="/settings"><ArrowLeft className="h-3.5 w-3.5" /> Back</Link>
            </Button>
          }
        />

        <Card>
          <CardContent className="pt-5 space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="relative w-full sm:max-w-xs">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search name, email, company…"
                  className="pl-9"
                />
              </div>
              <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as DemoBookingStatus | "all")}>
                <SelectTrigger className="w-full sm:w-[180px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <DataTable
              data={bookings}
              columns={columns}
              loading={loading}
              rowKey={(b) => b.id}
              emptyTitle="No demo bookings found"
              emptyDescription="Bookings made via the marketing site's 'Book a Demo' widget will appear here."
              pageSize={PAGE_SIZE}
              totalItems={total}
              currentPage={page}
              onPageChange={setPage}
            />
          </CardContent>
        </Card>
      </div>
    </PermissionGate>
  );
}
