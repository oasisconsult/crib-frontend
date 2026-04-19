import { format, formatDistanceToNow, isValid, parseISO } from "date-fns";
import { parsePhoneNumber, CountryCode } from "libphonenumber-js";

// ─── Currency ─────────────────────────────────────────────────────────────────
export function formatCurrency(
  amount: number,
  currency = "UGX",
  locale = "en-UG",
): string {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function formatCurrencyCompact(amount: number, currency = "UGX"): string {
  if (amount >= 1_000_000) {
    return `${formatCurrency(amount / 1_000_000, currency)}M`;
  }
  if (amount >= 1_000) {
    return `${formatCurrency(amount / 1_000, currency)}k`;
  }
  return formatCurrency(amount, currency);
}

// ─── Dates ────────────────────────────────────────────────────────────────────
export function formatDate(
  dateStr: string | null | undefined,
  fmt = "d MMM yyyy",
): string {
  if (!dateStr) return "—";
  const date = parseISO(dateStr);
  if (!isValid(date)) return "—";
  return format(date, fmt);
}

export function formatDateTime(dateStr: string | null | undefined): string {
  return formatDate(dateStr, "d MMM yyyy, HH:mm");
}

export function formatRelative(dateStr: string | null | undefined): string {
  if (!dateStr) return "—";
  const date = parseISO(dateStr);
  if (!isValid(date)) return "—";
  return formatDistanceToNow(date, { addSuffix: true });
}

export function formatDateRange(start: string, end?: string): string {
  return `${formatDate(start)} – ${end ? formatDate(end) : "Present"}`;
}

// ─── Phone ────────────────────────────────────────────────────────────────────
export function formatPhone(
  phone: string,
  defaultCountry: CountryCode = "GB",
): string {
  try {
    const parsed = parsePhoneNumber(phone, defaultCountry);
    return parsed.formatInternational();
  } catch {
    return phone;
  }
}

// ─── Numbers ─────────────────────────────────────────────────────────────────
export function formatPercentage(value: number, decimals = 1): string {
  return `${value.toFixed(decimals)}%`;
}

export function formatOccupancy(occupied: number, total: number): string {
  if (total === 0) return "0%";
  return formatPercentage((occupied / total) * 100);
}

// ─── File size ────────────────────────────────────────────────────────────────
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ─── Initials ─────────────────────────────────────────────────────────────────
export function getInitials(name: string): string {
  return name
    .split(" ")
    .slice(0, 2)
    .map((n) => n[0]?.toUpperCase() ?? "")
    .join("");
}

// ─── Lease reference ──────────────────────────────────────────────────────────
export function generateLeaseRef(propertyCode: string, index: number): string {
  return `${propertyCode.toUpperCase()}-L${String(index).padStart(4, "0")}`;
}

// ─── Duration in days ─────────────────────────────────────────────────────────
export function formatDays(days: number): string {
  if (days === 1) return "1 day";
  if (days < 7) return `${days} days`;
  if (days < 30) return `${Math.round(days / 7)} weeks`;
  if (days < 365) return `${Math.round(days / 30)} months`;
  return `${(days / 365).toFixed(1)} years`;
}

// ─── Short reference display ──────────────────────────────────────────────────
export function formatRef(ref: string | null | undefined, fallbackPrefix = "RCP"): string {
  if (ref) return ref;
  return `${fallbackPrefix}-UNKNOWN`;
}

// ─── Status label helpers ─────────────────────────────────────────────────────
export function capitalise(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1).replace(/_/g, " ");
}
