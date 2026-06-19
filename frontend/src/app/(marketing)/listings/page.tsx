"use client";

import { useState, useEffect, useCallback } from "react";
import { Home, Bed, Bath, Ruler, Phone, Mail, Search, SlidersHorizontal, X } from "lucide-react";
import { MarketingPageShell } from "@/components/marketing/MarketingPageShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { listingsApi, type Listing, type ListingsFilter } from "@/services/api/listings";
import { settingsApi } from "@/services/api/settings";

const UNIT_TYPE_LABELS: Record<string, string> = {
  studio: "Studio", bedsitter: "Bedsitter",
  one_bed: "1 Bedroom", two_bed: "2 Bedrooms",
  three_bed: "3 Bedrooms", four_bed_plus: "4+ Bedrooms",
  single: "Single Room", double: "Double Room",
  ensuite: "En-suite", shared: "Shared Room",
};

const FURNISHED_LABELS: Record<string, string> = {
  unfurnished: "Unfurnished",
  semi_furnished: "Semi-furnished",
  furnished: "Furnished",
};

function fmt(amount: number, currency: string) {
  return `${currency} ${amount.toLocaleString()}`;
}

function ListingCard({ listing }: { listing: Listing }) {
  const img = listing.coverImage || listing.propertyImages[0] || listing.unitImages[0];
  const addr = [listing.address.city, listing.address.district].filter(Boolean).join(", ");
  const inquiryPhone = listing.orgContactPhone?.replace(/\D/g, "");
  const waUrl = inquiryPhone
    ? `https://wa.me/${inquiryPhone}?text=${encodeURIComponent(`Hi, I'm interested in ${listing.unitName} at ${listing.propertyName}`)}`
    : null;

  return (
    <div className="rounded-lg border bg-card overflow-hidden flex flex-col hover:shadow-md transition-shadow">
      {/* Cover image */}
      <div className="relative h-44 bg-muted shrink-0">
        {img ? (
          <img src={img} alt={listing.propertyName} className="h-full w-full object-cover" />
        ) : (
          <div className="h-full flex items-center justify-center text-muted-foreground/40">
            <Home className="h-10 w-10" />
          </div>
        )}
        <Badge
          variant="secondary"
          className="absolute top-2 left-2 text-xs font-medium bg-background/90 backdrop-blur-sm"
        >
          {UNIT_TYPE_LABELS[listing.unitType] ?? listing.unitType}
        </Badge>
      </div>

      {/* Body */}
      <div className="p-4 flex flex-col flex-1 gap-3">
        {/* Title + price */}
        <div>
          <p className="text-xs text-muted-foreground truncate">{listing.propertyName}</p>
          <h3 className="font-semibold text-sm mt-0.5 truncate">{listing.unitName}</h3>
          <p className="text-lg font-bold text-primary mt-1">{fmt(listing.monthlyRent, listing.currency)}<span className="text-xs font-normal text-muted-foreground">/mo</span></p>
        </div>

        {/* Stats row */}
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1"><Bed className="h-3.5 w-3.5" />{listing.bedrooms}</span>
          <span className="flex items-center gap-1"><Bath className="h-3.5 w-3.5" />{listing.bathrooms}</span>
          {listing.area && <span className="flex items-center gap-1"><Ruler className="h-3.5 w-3.5" />{listing.area}m²</span>}
          {listing.furnishedStatus !== "unfurnished" && (
            <span className="text-emerald-600 font-medium">{FURNISHED_LABELS[listing.furnishedStatus] ?? listing.furnishedStatus}</span>
          )}
        </div>

        {/* Location */}
        {addr && <p className="text-xs text-muted-foreground truncate">{addr}</p>}

        {/* Agency */}
        <p className="text-xs text-muted-foreground mt-auto">{listing.orgName}</p>

        {/* Inquiry buttons */}
        <div className="flex gap-2 mt-1">
          {waUrl && (
            <a
              href={waUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1"
            >
              <Button size="sm" variant="default" className="w-full h-8 text-xs gap-1.5">
                <Phone className="h-3.5 w-3.5" />
                WhatsApp
              </Button>
            </a>
          )}
          {listing.orgContactEmail && (
            <a href={`mailto:${listing.orgContactEmail}?subject=Inquiry: ${listing.unitName} at ${listing.propertyName}`} className="flex-1">
              <Button size="sm" variant="outline" className="w-full h-8 text-xs gap-1.5">
                <Mail className="h-3.5 w-3.5" />
                Email
              </Button>
            </a>
          )}
          {!waUrl && !listing.orgContactEmail && (
            <span className="text-xs text-muted-foreground">Contact not listed</span>
          )}
        </div>
      </div>
    </div>
  );
}

const UNIT_TYPE_OPTIONS = [
  { value: "", label: "All types" },
  { value: "bedsitter", label: "Bedsitter" },
  { value: "one_bed",   label: "1 Bedroom" },
  { value: "two_bed",   label: "2 Bedrooms" },
  { value: "three_bed", label: "3 Bedrooms" },
  { value: "four_bed_plus", label: "4+ Bedrooms" },
  { value: "studio",    label: "Studio" },
];

export default function ListingsPage() {
  const [enabled, setEnabled] = useState<boolean | null>(null); // null = loading
  const [listings, setListings] = useState<Listing[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [showFilters, setShowFilters] = useState(false);

  useEffect(() => {
    settingsApi.getAnonymousFlags()
      .then(flags => setEnabled(flags["features.listings_page"] !== "false"))
      .catch(() => setEnabled(true)); // fail open
  }, []);

  const [unitType, setUnitType] = useState("");
  const [district, setDistrict] = useState("");
  const [minRent, setMinRent] = useState("");
  const [maxRent, setMaxRent] = useState("");

  const PAGE_SIZE = 20;

  const load = useCallback(async (p: number) => {
    setLoading(true);
    try {
      const filter: ListingsFilter = { page: p, pageSize: PAGE_SIZE };
      if (unitType) filter.unitType = unitType;
      if (district) filter.district = district;
      if (minRent) filter.minRent = parseFloat(minRent);
      if (maxRent) filter.maxRent = parseFloat(maxRent);
      const data = await listingsApi.list(filter);
      setListings(data.items);
      setTotal(data.total);
    } catch {
      setListings([]);
    } finally {
      setLoading(false);
    }
  }, [unitType, district, minRent, maxRent]);

  useEffect(() => {
    setPage(1);
    load(1);
  }, [load]);

  function clearFilters() {
    setUnitType("");
    setDistrict("");
    setMinRent("");
    setMaxRent("");
  }

  const hasFilters = unitType || district || minRent || maxRent;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  // Disabled by admin — show a polite notice instead of the board
  if (enabled === false) {
    return (
      <MarketingPageShell
        eyebrow="Find your next home"
        title="Listings Unavailable"
        description=""
      >
        <div className="mx-auto max-w-md px-4 py-24 text-center">
          <Home className="mx-auto h-12 w-12 text-muted-foreground/30 mb-6" />
          <h2 className="text-lg font-semibold text-foreground mb-2">
            This page is currently unavailable
          </h2>
          <p className="text-sm text-muted-foreground leading-relaxed mb-6">
            The public listings board has been temporarily disabled.
            Please check back soon or contact us to enquire about available units.
          </p>
          <Button asChild variant="outline">
            <a href="/#booking">Contact Us</a>
          </Button>
        </div>
      </MarketingPageShell>
    );
  }

  return (
    <MarketingPageShell
      eyebrow="Find your next home"
      title="Available Rentals"
      description="Browse properties and units available for rent from agencies and landlords on Crib."
    >
      <div className="mx-auto max-w-6xl px-4 sm:px-6 py-10">
        {/* Filter bar */}
        <div className="mb-6 flex flex-wrap gap-3 items-center">
          <Button
            variant="outline"
            size="sm"
            className="gap-2 h-9"
            onClick={() => setShowFilters((v) => !v)}
          >
            <SlidersHorizontal className="h-3.5 w-3.5" />
            Filters
            {hasFilters && <Badge variant="secondary" className="ml-1 text-[10px] px-1.5 py-0">On</Badge>}
          </Button>
          {hasFilters && (
            <Button variant="ghost" size="sm" className="gap-1 h-9 text-muted-foreground" onClick={clearFilters}>
              <X className="h-3.5 w-3.5" />Clear
            </Button>
          )}
          <span className="ml-auto text-sm text-muted-foreground">
            {total} {total === 1 ? "unit" : "units"} available
          </span>
        </div>

        {/* Expanded filters */}
        {showFilters && (
          <div className="mb-6 p-4 rounded-lg border bg-card grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Unit type</label>
              <select
                value={unitType}
                onChange={(e) => setUnitType(e.target.value)}
                className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm"
              >
                {UNIT_TYPE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">District</label>
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  value={district}
                  onChange={(e) => setDistrict(e.target.value)}
                  placeholder="e.g. Kampala"
                  className="pl-8 h-9 text-sm"
                />
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Min rent (UGX)</label>
              <Input
                type="number"
                value={minRent}
                onChange={(e) => setMinRent(e.target.value)}
                placeholder="0"
                className="h-9 text-sm"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Max rent (UGX)</label>
              <Input
                type="number"
                value={maxRent}
                onChange={(e) => setMaxRent(e.target.value)}
                placeholder="Any"
                className="h-9 text-sm"
              />
            </div>
          </div>
        )}

        {/* Grid */}
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="rounded-lg border bg-card h-72 animate-pulse bg-muted" />
            ))}
          </div>
        ) : listings.length === 0 ? (
          <div className="py-20 text-center">
            <Home className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">No units available right now — check back soon.</p>
            {hasFilters && (
              <Button variant="link" className="mt-2 text-sm" onClick={clearFilters}>Clear filters</Button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {listings.map((l) => (
              <ListingCard key={l.unitId} listing={l} />
            ))}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="mt-8 flex items-center justify-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => { const p = page - 1; setPage(p); load(p); }}
            >
              Previous
            </Button>
            <span className="text-sm text-muted-foreground">Page {page} of {totalPages}</span>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => { const p = page + 1; setPage(p); load(p); }}
            >
              Next
            </Button>
          </div>
        )}
      </div>
    </MarketingPageShell>
  );
}
