<<<<<<< HEAD
"use client";

import { useState, useCallback, useEffect } from "react";
import {
  ChevronLeft, ChevronRight, Clock, Calendar,
  CheckCircle, Globe, ArrowLeft, Building2, Mail,
} from "lucide-react";
import { cn } from "@/utils/cn";
import { apiGet, apiPost } from "@/services/api/client";

// Fallback shown until the superadmin-configurable address loads (or if the
// lookup fails) — kept in sync with notifications.demo_contact_email's seed
// default in backend/app/models/system_setting.py.
const FALLBACK_CONTACT_EMAIL = "demo@geoboxafrica.com";

// ── Constants ─────────────────────────────────────────────────────────────────

const MONTHS = ["January","February","March","April","May","June",
                 "July","August","September","October","November","December"];
const DAYS   = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];

// Static demo time slots (no API needed)
const DEMO_SLOTS = ["09:00","10:00","11:00","14:00","15:00","16:00"];

// All slot times are in this zone — shown alongside the picked time so visitors
// aren't confused when their own calendar later displays the converted local time.
const DEMO_TIMEZONE_LABEL = "EAT";

const PORTFOLIO_SIZES = [
  "1–5 units",
  "6–20 units",
  "21–50 units",
  "51–100 units",
  "100+ units",
];

type Step = "calendar" | "details" | "confirmed";

// ── Helpers ───────────────────────────────────────────────────────────────────

function toISO(y: number, m: number, d: number) {
  return `${y}-${String(m + 1).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
}

function to12h(time: string) {
  const [h, m] = time.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  const h12  = h % 12 || 12;
  return `${h12}:${String(m).padStart(2,"0")} ${ampm}`;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isValidEmail(value: string) {
  return EMAIL_RE.test(value.trim());
}

function formatDateLong(iso: string) {
  const [y, mo, d] = iso.split("-").map(Number);
  return new Date(y, mo - 1, d).toLocaleDateString("en-UG", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });
}

// ── Input style (Crib design system) ─────────────────────────────────────────

const inputCls = [
  "w-full rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--background))]",
  "px-4 py-2.5 text-sm text-[hsl(var(--foreground))]",
  "placeholder:text-[hsl(var(--muted-foreground))]",
  "focus:border-[#239487] focus:outline-none focus:ring-2 focus:ring-[#239487]/20",
  "transition-all duration-150",
].join(" ");

// ── Month Calendar ────────────────────────────────────────────────────────────

function MonthCalendar({
  selectedDate,
  onSelect,
}: {
  selectedDate: string;
  onSelect: (iso: string) => void;
}) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [viewYear,  setViewYear]  = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());

  const firstDay    = new Date(viewYear, viewMonth, 1);
  const startCol    = (firstDay.getDay() + 6) % 7; // Mon = 0
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();

  function prevMonth() {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1); }
    else setViewMonth(m => m - 1);
  }
  function nextMonth() {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1); }
    else setViewMonth(m => m + 1);
  }

  function isDisabled(d: number) {
    const dt = new Date(viewYear, viewMonth, d);
    dt.setHours(0, 0, 0, 0);
    if (dt < today) return true;
    const dow = dt.getDay();
    return dow === 0 || dow === 6; // no weekends
  }

  const cells = Array.from({ length: startCol + daysInMonth }, (_, i) =>
    i < startCol ? null : i - startCol + 1,
  );

  const todayISO = toISO(today.getFullYear(), today.getMonth(), today.getDate());

  return (
    <div>
      {/* Month nav */}
      <div className="mb-5 flex items-center justify-between">
        <button
          onClick={prevMonth}
          aria-label="Previous month"
          className="flex h-8 w-8 items-center justify-center rounded-full text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--accent))] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#239487] transition-colors"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <p className="text-sm font-semibold text-[hsl(var(--foreground))]">
          {MONTHS[viewMonth]} {viewYear}
        </p>
        <button
          onClick={nextMonth}
          aria-label="Next month"
          className="flex h-8 w-8 items-center justify-center rounded-full bg-[#239487] text-white hover:bg-[#1c7a70] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#239487] transition-colors"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      {/* Day headers */}
      <div className="mb-1 grid grid-cols-7 text-center">
        {DAYS.map(d => (
          <p key={d} className="py-1 text-[11px] font-semibold uppercase tracking-wider text-[hsl(var(--muted-foreground))]">
            {d}
          </p>
        ))}
      </div>

      {/* Date grid */}
      <div className="grid grid-cols-7">
        {cells.map((day, idx) => {
          if (!day) return <div key={idx} aria-hidden />;
          const iso      = toISO(viewYear, viewMonth, day);
          const disabled = isDisabled(day);
          const selected = iso === selectedDate;
          const isToday  = iso === todayISO;

          return (
            <button
              key={iso}
              onClick={() => !disabled && onSelect(iso)}
              disabled={disabled}
              aria-label={`${day} ${MONTHS[viewMonth]} ${viewYear}`}
              aria-pressed={selected}
              aria-disabled={disabled}
              className={cn(
                "mx-auto my-0.5 flex h-9 w-9 items-center justify-center rounded-full text-sm transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[#239487]",
                disabled  && "cursor-default text-[hsl(var(--muted-foreground))]/30",
                !disabled && !selected && "hover:bg-[#f3fcfa] text-[hsl(var(--foreground))] cursor-pointer",
                selected  && "bg-[#239487] font-semibold text-white",
                isToday && !selected && "font-semibold text-[#239487] ring-1 ring-[#239487]/40",
              )}
            >
              {day}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Time Slots ────────────────────────────────────────────────────────────────

function TimeSlots({
  selectedTime,
  onSelect,
  onNext,
}: {
  selectedTime: string;
  onSelect: (t: string) => void;
  onNext: () => void;
}) {
  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold uppercase tracking-widest text-[hsl(var(--muted-foreground))] mb-3">
        Available times
      </p>
      {DEMO_SLOTS.map(slot => {
        const isSelected = slot === selectedTime;
        return (
          <div key={slot} className="flex gap-2">
            <button
              onClick={() => onSelect(slot)}
              aria-pressed={isSelected}
              className={cn(
                "flex-1 rounded-lg border py-2.5 text-sm font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[#239487]",
                isSelected
                  ? "border-[#239487] bg-[#239487] text-white"
                  : "border-[hsl(var(--border))] text-[#239487] hover:border-[#239487]/50 hover:bg-[#f3fcfa]",
              )}
            >
              {to12h(slot)}
            </button>
            {isSelected && (
              <button
                onClick={onNext}
                className="rounded-lg bg-[#239487] px-4 text-sm font-semibold text-white hover:bg-[#1c7a70] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#239487] transition-colors"
                aria-label="Confirm this time slot"
              >
                Next
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Info Panel ────────────────────────────────────────────────────────────────

function InfoPanel({
  selectedDate,
  selectedTime,
  onBack,
  showBack,
}: {
  selectedDate: string;
  selectedTime: string;
  onBack?: () => void;
  showBack?: boolean;
}) {
  return (
    <div className="flex flex-col gap-5 border-b border-[hsl(var(--border))] pb-6 lg:border-b-0 lg:border-r lg:pb-0 lg:pr-8">
      {showBack && (
        <button
          onClick={onBack}
          aria-label="Go back"
          className="flex h-9 w-9 items-center justify-center rounded-full border border-[hsl(var(--border))] text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--accent))] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#239487] transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
      )}

      <div>
        <div className="flex items-center gap-2 mb-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#239487]">
            <Building2 className="h-4 w-4 text-white" aria-hidden />
          </div>
          <span className="text-xs font-bold uppercase tracking-widest text-[hsl(var(--muted-foreground))]">
            Crib
          </span>
        </div>
        <h3 className="text-lg font-bold text-[hsl(var(--foreground))]">
          Book a Product Demo
        </h3>
      </div>

      <div className="space-y-2.5 text-sm text-[hsl(var(--muted-foreground))]">
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 shrink-0 text-[hsl(var(--muted-foreground))]" aria-hidden />
          <span>30 minutes</span>
        </div>
        {selectedDate && selectedTime && (
          <div className="flex items-start gap-2">
            <Calendar className="mt-0.5 h-4 w-4 shrink-0 text-[hsl(var(--muted-foreground))]" aria-hidden />
            <span>
              {to12h(selectedTime)} {DEMO_TIMEZONE_LABEL} — {formatDateLong(selectedDate)}
            </span>
          </div>
        )}
        <div className="flex items-center gap-2">
          <Globe className="h-4 w-4 shrink-0 text-[hsl(var(--muted-foreground))]" aria-hidden />
          <span>Africa/Kampala (EAT, UTC+3)</span>
        </div>
      </div>

      <p className="text-sm text-[hsl(var(--muted-foreground))] leading-relaxed">
        A 30-minute walkthrough of the Crib platform tailored to your portfolio.
        We&apos;ll show you exactly how Crib handles your properties, tenants, and payments.
      </p>
    </div>
  );
}

// ── Main Booking Component ────────────────────────────────────────────────────

function BookingWidget() {
  const [step,         setStep]         = useState<Step>("calendar");
  const [selectedDate, setSelectedDate] = useState("");
  const [selectedTime, setSelectedTime] = useState("");
  const [submitting,   setSubmitting]   = useState(false);
  const [submitError,  setSubmitError]  = useState("");
  const [contactEmail, setContactEmail] = useState(FALLBACK_CONTACT_EMAIL);

  // Superadmin-configurable contact address — never rendered as visible text
  // (see mailtoLink below), just used as the click-to-email target. Falls
  // back silently to FALLBACK_CONTACT_EMAIL if the lookup fails.
  useEffect(() => {
    let cancelled = false;
    apiGet<{ email: string }>("/public/demo-bookings/contact")
      .then(res => { if (!cancelled && res?.email) setContactEmail(res.email); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const [form, setForm] = useState({
    firstName:        "",
    lastName:         "",
    email:            "",
    phone:            "",
    company:          "",
    portfolioSize:    "",
    message:          "",
    marketingConsent: false,
    // Honeypot — left blank by humans, filled in by bots.
    website:          "",
  });

  function ff(key: keyof typeof form) {
    return {
      value: form[key] as string,
      onChange: (
        e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>,
      ) => setForm(p => ({ ...p, [key]: e.target.value })),
    };
  }

  const handleSelectTime = useCallback((t: string) => setSelectedTime(t), []);
  const handleNext       = useCallback(() => setStep("details"), []);

  const isDetailsValid =
    form.firstName.trim() !== "" &&
    form.lastName.trim() !== "" &&
    isValidEmail(form.email) &&
    form.phone.trim() !== "" &&
    form.marketingConsent;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setSubmitError("");
    try {
      await apiPost("/public/demo-bookings", {
        firstName:        form.firstName,
        lastName:         form.lastName,
        email:            form.email,
        phone:            form.phone,
        company:          form.company || undefined,
        portfolioSize:    form.portfolioSize || undefined,
        message:          form.message || undefined,
        marketingConsent: form.marketingConsent,
        slotDate:         selectedDate,
        slotTime:         `${selectedTime}:00`,
        timezone:         "Africa/Kampala",
        website:          form.website || undefined,
      });
      setStep("confirmed");
    } catch (err: any) {
      const detail = err?.response?.data?.detail;
      setSubmitError(
        typeof detail === "string"
          ? detail
          : "Something went wrong. Please try again, or use the email link below to reach our team.",
      );
      // The selected slot may have just been taken by someone else — send the
      // visitor back to pick a different time rather than letting them retry blindly.
      if (err?.response?.status === 409) {
        setSelectedTime("");
        setStep("calendar");
      }
    } finally {
      setSubmitting(false);
    }
  }

  // ── Confirmed ──────────────────────────────────────────────────────────────
  if (step === "confirmed") {
    return (
      <div
        role="status"
        aria-live="polite"
        className="flex flex-col items-center gap-6 py-16 text-center"
      >
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[#f3fcfa]">
          <CheckCircle className="h-8 w-8 text-[#239487]" aria-hidden />
        </div>
        <div>
          <h3 className="text-xl font-bold text-[hsl(var(--foreground))]">
            Demo booked!
          </h3>
          <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
            {to12h(selectedTime)} {DEMO_TIMEZONE_LABEL} &mdash; {formatDateLong(selectedDate)}
          </p>
          <p className="mt-0.5 text-xs text-[hsl(var(--muted-foreground))]">
            Your calendar will show this converted to your local time zone.
          </p>
        </div>
        <div className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-6 py-4 text-center max-w-sm">
          <p className="text-xs font-semibold uppercase tracking-widest text-[hsl(var(--muted-foreground))] mb-1">
            Confirmation sent to
          </p>
          <p className="text-sm font-semibold text-[hsl(var(--foreground))]">{form.email}</p>
        </div>
        <p className="max-w-sm text-sm leading-relaxed text-[hsl(var(--muted-foreground))]">
          Our team will be in touch to confirm your session. Have questions before then?{" "}
          <a
            href={`mailto:${contactEmail}`}
            className="inline-flex items-center gap-1 font-medium text-[#239487] hover:underline"
          >
            <Mail className="h-3.5 w-3.5" aria-hidden /> Email us
          </a>
        </p>
      </div>
    );
  }

  // ── Details step ──────────────────────────────────────────────────────────
  if (step === "details") {
    return (
      <div className="flex flex-col gap-8 lg:flex-row">
        <div className="lg:w-56 lg:shrink-0">
          <InfoPanel
            selectedDate={selectedDate}
            selectedTime={selectedTime}
            showBack
            onBack={() => setStep("calendar")}
          />
        </div>

        <div className="flex-1">
          <h3 className="text-base font-bold text-[hsl(var(--foreground))] mb-5">
            Enter your details
          </h3>
          <form
            onSubmit={handleSubmit}
            className="space-y-4"
            noValidate
            aria-label="Demo booking form"
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="bk-first-name" className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-[hsl(var(--muted-foreground))]">
                  First name <span aria-hidden className="text-red-500">*</span>
                </label>
                <input
                  id="bk-first-name"
                  type="text"
                  required
                  autoComplete="given-name"
                  placeholder="Robert"
                  className={inputCls}
                  {...ff("firstName")}
                />
              </div>
              <div>
                <label htmlFor="bk-last-name" className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-[hsl(var(--muted-foreground))]">
                  Last name <span aria-hidden className="text-red-500">*</span>
                </label>
                <input
                  id="bk-last-name"
                  type="text"
                  required
                  autoComplete="family-name"
                  placeholder="Mukasa"
                  className={inputCls}
                  {...ff("lastName")}
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="bk-email" className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-[hsl(var(--muted-foreground))]">
                  Email <span aria-hidden className="text-red-500">*</span>
                </label>
                <input
                  id="bk-email"
                  type="email"
                  required
                  autoComplete="email"
                  placeholder="robert@example.com"
                  className={inputCls}
                  {...ff("email")}
                />
              </div>
              <div>
                <label htmlFor="bk-phone" className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-[hsl(var(--muted-foreground))]">
                  Phone <span aria-hidden className="text-red-500">*</span>
                </label>
                <input
                  id="bk-phone"
                  type="tel"
                  required
                  autoComplete="tel"
                  placeholder="+256 700 000000"
                  className={inputCls}
                  {...ff("phone")}
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="bk-company" className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-[hsl(var(--muted-foreground))]">
                  Company / business name
                </label>
                <input
                  id="bk-company"
                  type="text"
                  placeholder="Mukasa Properties Ltd"
                  className={inputCls}
                  {...ff("company")}
                />
              </div>
              <div>
                <label htmlFor="bk-portfolio" className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-[hsl(var(--muted-foreground))]">
                  Portfolio size
                </label>
                <select id="bk-portfolio" className={cn(inputCls, "cursor-pointer")} {...ff("portfolioSize")}>
                  <option value="">Select range</option>
                  {PORTFOLIO_SIZES.map(s => <option key={s}>{s}</option>)}
                </select>
              </div>
            </div>

            <div>
              <label htmlFor="bk-message" className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-[hsl(var(--muted-foreground))]">
                Anything specific you&apos;d like to cover?
              </label>
              <textarea
                id="bk-message"
                rows={3}
                placeholder="E.g. multi-property setup, rent collection, team access…"
                className={cn(inputCls, "resize-none")}
                {...ff("message")}
              />
            </div>

            <div className="flex items-start gap-3 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--background))] p-3">
              <input
                id="bk-consent"
                type="checkbox"
                required
                checked={form.marketingConsent}
                onChange={e => setForm(p => ({ ...p, marketingConsent: e.target.checked }))}
                className="mt-0.5 h-4 w-4 shrink-0 rounded border-[hsl(var(--border))] accent-[#239487]"
              />
              <label htmlFor="bk-consent" className="text-xs leading-relaxed text-[hsl(var(--muted-foreground))]">
                I agree to receive communications from Crib regarding my demo booking and
                product updates. You can unsubscribe at any time.
              </label>
            </div>

            {/* Honeypot — hidden from sighted users and screen readers; bots tend to fill every field */}
            <div aria-hidden="true" className="absolute -left-[9999px] top-auto h-0 w-0 overflow-hidden">
              <label htmlFor="bk-website">Website</label>
              <input
                id="bk-website"
                type="text"
                tabIndex={-1}
                autoComplete="off"
                {...ff("website")}
              />
            </div>

            {submitError && (
              <div className="space-y-1.5 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-2.5 text-sm text-destructive">
                <p>{submitError}</p>
                <a
                  href={`mailto:${contactEmail}`}
                  className="inline-flex items-center gap-1 font-medium underline-offset-2 hover:underline"
                >
                  <Mail className="h-3.5 w-3.5" aria-hidden /> Email our team
                </a>
              </div>
            )}

            <button
              type="submit"
              disabled={submitting || !isDetailsValid}
              aria-disabled={submitting || !isDetailsValid}
              className="w-full rounded-lg bg-[#239487] py-3 text-sm font-semibold text-white shadow-sm hover:bg-[#1c7a70] disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-[#239487] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#239487] focus-visible:ring-offset-2 transition-colors"
            >
              {submitting ? "Booking your demo…" : "Confirm demo booking"}
            </button>
          </form>
        </div>
      </div>
    );
  }

  // ── Calendar step ─────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-8 lg:flex-row">
      <div className="lg:w-56 lg:shrink-0">
        <InfoPanel selectedDate={selectedDate} selectedTime={selectedTime} />
      </div>

      <div className="flex-1">
        <h3 className="text-base font-bold text-[hsl(var(--foreground))] mb-5">
          Select Date &amp; Time
        </h3>
        <div className="flex flex-col gap-6 sm:flex-row">
          {/* Calendar */}
          <div className="flex-1">
            <MonthCalendar
              selectedDate={selectedDate}
              onSelect={d => { setSelectedDate(d); setSelectedTime(""); }}
            />
            <div className="mt-4 flex items-center gap-2 text-xs text-[hsl(var(--muted-foreground))]">
              <Globe className="h-3.5 w-3.5 shrink-0" aria-hidden />
              <span>East Africa Time (EAT, UTC+3) · Weekdays only</span>
            </div>
          </div>

          {/* Time slots */}
          {selectedDate && (
            <div className="w-full sm:w-44 animate-in fade-in slide-in-from-right-2 duration-200">
              <TimeSlots
                selectedTime={selectedTime}
                onSelect={handleSelectTime}
                onNext={handleNext}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Section wrapper ───────────────────────────────────────────────────────────

export function BookingSection() {
  return (
    <section
      id="booking"
      aria-labelledby="booking-heading"
      className="bg-[#f9fafb] py-20 lg:py-28"
    >
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="text-center max-w-2xl mx-auto mb-12">
          <p className="text-sm font-semibold uppercase tracking-widest text-[#239487] mb-3">
            Book a Demo
          </p>
          <h2
            id="booking-heading"
            className="text-3xl sm:text-4xl font-bold tracking-tight text-[hsl(var(--foreground))] mb-4"
          >
            See Crib in action
          </h2>
          <p className="text-[hsl(var(--muted-foreground))] text-lg leading-relaxed">
            Pick a time that works for you. We&apos;ll walk you through the platform and
            answer any questions about your specific portfolio.
          </p>
        </div>

        <div className="mx-auto max-w-4xl rounded-2xl border border-[hsl(var(--border))] bg-white p-6 sm:p-8 shadow-sm">
          <BookingWidget />
        </div>
      </div>
    </section>
  );
}
=======
"use client";

import { useState, useCallback, useEffect } from "react";
import {
  ChevronLeft, ChevronRight, Clock, Calendar,
  CheckCircle, Globe, ArrowLeft, Building2, Mail,
} from "lucide-react";
import { cn } from "@/utils/cn";
import { apiGet, apiPost } from "@/services/api/client";

// Fallback shown until the superadmin-configurable address loads (or if the
// lookup fails) — kept in sync with notifications.demo_contact_email's seed
// default in backend/app/models/system_setting.py.
const FALLBACK_CONTACT_EMAIL = "demo@geoboxafrica.com";

// ── Constants ─────────────────────────────────────────────────────────────────

const MONTHS = ["January","February","March","April","May","June",
                 "July","August","September","October","November","December"];
const DAYS   = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];

// Static demo time slots (no API needed)
const DEMO_SLOTS = ["09:00","10:00","11:00","14:00","15:00","16:00"];

// All slot times are in this zone — shown alongside the picked time so visitors
// aren't confused when their own calendar later displays the converted local time.
const DEMO_TIMEZONE_LABEL = "EAT";

const PORTFOLIO_SIZES = [
  "1–5 units",
  "6–20 units",
  "21–50 units",
  "51–100 units",
  "100+ units",
];

type Step = "calendar" | "details" | "confirmed";

// ── Helpers ───────────────────────────────────────────────────────────────────

function toISO(y: number, m: number, d: number) {
  return `${y}-${String(m + 1).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
}

function to12h(time: string) {
  const [h, m] = time.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  const h12  = h % 12 || 12;
  return `${h12}:${String(m).padStart(2,"0")} ${ampm}`;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isValidEmail(value: string) {
  return EMAIL_RE.test(value.trim());
}

function formatDateLong(iso: string) {
  const [y, mo, d] = iso.split("-").map(Number);
  return new Date(y, mo - 1, d).toLocaleDateString("en-UG", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });
}

// ── Input style (Crib design system) ─────────────────────────────────────────

const inputCls = [
  "w-full rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--background))]",
  "px-4 py-2.5 text-sm text-[hsl(var(--foreground))]",
  "placeholder:text-[hsl(var(--muted-foreground))]",
  "focus:border-[#239487] focus:outline-none focus:ring-2 focus:ring-[#239487]/20",
  "transition-all duration-150",
].join(" ");

// ── Month Calendar ────────────────────────────────────────────────────────────

function MonthCalendar({
  selectedDate,
  onSelect,
}: {
  selectedDate: string;
  onSelect: (iso: string) => void;
}) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [viewYear,  setViewYear]  = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());

  const firstDay    = new Date(viewYear, viewMonth, 1);
  const startCol    = (firstDay.getDay() + 6) % 7; // Mon = 0
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();

  function prevMonth() {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1); }
    else setViewMonth(m => m - 1);
  }
  function nextMonth() {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1); }
    else setViewMonth(m => m + 1);
  }

  function isDisabled(d: number) {
    const dt = new Date(viewYear, viewMonth, d);
    dt.setHours(0, 0, 0, 0);
    if (dt < today) return true;
    const dow = dt.getDay();
    return dow === 0 || dow === 6; // no weekends
  }

  const cells = Array.from({ length: startCol + daysInMonth }, (_, i) =>
    i < startCol ? null : i - startCol + 1,
  );

  const todayISO = toISO(today.getFullYear(), today.getMonth(), today.getDate());

  return (
    <div>
      {/* Month nav */}
      <div className="mb-5 flex items-center justify-between">
        <button
          onClick={prevMonth}
          aria-label="Previous month"
          className="flex h-8 w-8 items-center justify-center rounded-full text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--accent))] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#239487] transition-colors"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <p className="text-sm font-semibold text-[hsl(var(--foreground))]">
          {MONTHS[viewMonth]} {viewYear}
        </p>
        <button
          onClick={nextMonth}
          aria-label="Next month"
          className="flex h-8 w-8 items-center justify-center rounded-full bg-[#239487] text-white hover:bg-[#1c7a70] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#239487] transition-colors"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      {/* Day headers */}
      <div className="mb-1 grid grid-cols-7 text-center">
        {DAYS.map(d => (
          <p key={d} className="py-1 text-[11px] font-semibold uppercase tracking-wider text-[hsl(var(--muted-foreground))]">
            {d}
          </p>
        ))}
      </div>

      {/* Date grid */}
      <div className="grid grid-cols-7">
        {cells.map((day, idx) => {
          if (!day) return <div key={idx} aria-hidden />;
          const iso      = toISO(viewYear, viewMonth, day);
          const disabled = isDisabled(day);
          const selected = iso === selectedDate;
          const isToday  = iso === todayISO;

          return (
            <button
              key={iso}
              onClick={() => !disabled && onSelect(iso)}
              disabled={disabled}
              aria-label={`${day} ${MONTHS[viewMonth]} ${viewYear}`}
              aria-pressed={selected}
              aria-disabled={disabled}
              className={cn(
                "mx-auto my-0.5 flex h-9 w-9 items-center justify-center rounded-full text-sm transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[#239487]",
                disabled  && "cursor-default text-[hsl(var(--muted-foreground))]/30",
                !disabled && !selected && "hover:bg-[#f3fcfa] text-[hsl(var(--foreground))] cursor-pointer",
                selected  && "bg-[#239487] font-semibold text-white",
                isToday && !selected && "font-semibold text-[#239487] ring-1 ring-[#239487]/40",
              )}
            >
              {day}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Time Slots ────────────────────────────────────────────────────────────────

function TimeSlots({
  selectedTime,
  onSelect,
  onNext,
}: {
  selectedTime: string;
  onSelect: (t: string) => void;
  onNext: () => void;
}) {
  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold uppercase tracking-widest text-[hsl(var(--muted-foreground))] mb-3">
        Available times
      </p>
      {DEMO_SLOTS.map(slot => {
        const isSelected = slot === selectedTime;
        return (
          <div key={slot} className="flex gap-2">
            <button
              onClick={() => onSelect(slot)}
              aria-pressed={isSelected}
              className={cn(
                "flex-1 rounded-lg border py-2.5 text-sm font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[#239487]",
                isSelected
                  ? "border-[#239487] bg-[#239487] text-white"
                  : "border-[hsl(var(--border))] text-[#239487] hover:border-[#239487]/50 hover:bg-[#f3fcfa]",
              )}
            >
              {to12h(slot)}
            </button>
            {isSelected && (
              <button
                onClick={onNext}
                className="rounded-lg bg-[#239487] px-4 text-sm font-semibold text-white hover:bg-[#1c7a70] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#239487] transition-colors"
                aria-label="Confirm this time slot"
              >
                Next
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Info Panel ────────────────────────────────────────────────────────────────

function InfoPanel({
  selectedDate,
  selectedTime,
  onBack,
  showBack,
}: {
  selectedDate: string;
  selectedTime: string;
  onBack?: () => void;
  showBack?: boolean;
}) {
  return (
    <div className="flex flex-col gap-5 border-b border-[hsl(var(--border))] pb-6 lg:border-b-0 lg:border-r lg:pb-0 lg:pr-8">
      {showBack && (
        <button
          onClick={onBack}
          aria-label="Go back"
          className="flex h-9 w-9 items-center justify-center rounded-full border border-[hsl(var(--border))] text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--accent))] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#239487] transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
      )}

      <div>
        <div className="flex items-center gap-2 mb-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#239487]">
            <Building2 className="h-4 w-4 text-white" aria-hidden />
          </div>
          <span className="text-xs font-bold uppercase tracking-widest text-[hsl(var(--muted-foreground))]">
            Crib
          </span>
        </div>
        <h3 className="text-lg font-bold text-[hsl(var(--foreground))]">
          Book a Product Demo
        </h3>
      </div>

      <div className="space-y-2.5 text-sm text-[hsl(var(--muted-foreground))]">
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 shrink-0 text-[hsl(var(--muted-foreground))]" aria-hidden />
          <span>30 minutes</span>
        </div>
        {selectedDate && selectedTime && (
          <div className="flex items-start gap-2">
            <Calendar className="mt-0.5 h-4 w-4 shrink-0 text-[hsl(var(--muted-foreground))]" aria-hidden />
            <span>
              {to12h(selectedTime)} {DEMO_TIMEZONE_LABEL} — {formatDateLong(selectedDate)}
            </span>
          </div>
        )}
        <div className="flex items-center gap-2">
          <Globe className="h-4 w-4 shrink-0 text-[hsl(var(--muted-foreground))]" aria-hidden />
          <span>Africa/Kampala (EAT, UTC+3)</span>
        </div>
      </div>

      <p className="text-sm text-[hsl(var(--muted-foreground))] leading-relaxed">
        A 30-minute walkthrough of the Crib platform tailored to your portfolio.
        We&apos;ll show you exactly how Crib handles your properties, tenants, and payments.
      </p>
    </div>
  );
}

// ── Main Booking Component ────────────────────────────────────────────────────

function BookingWidget() {
  const [step,         setStep]         = useState<Step>("calendar");
  const [selectedDate, setSelectedDate] = useState("");
  const [selectedTime, setSelectedTime] = useState("");
  const [submitting,   setSubmitting]   = useState(false);
  const [submitError,  setSubmitError]  = useState("");
  const [contactEmail, setContactEmail] = useState(FALLBACK_CONTACT_EMAIL);

  // Superadmin-configurable contact address — never rendered as visible text
  // (see mailtoLink below), just used as the click-to-email target. Falls
  // back silently to FALLBACK_CONTACT_EMAIL if the lookup fails.
  useEffect(() => {
    let cancelled = false;
    apiGet<{ email: string }>("/public/demo-bookings/contact")
      .then(res => { if (!cancelled && res?.email) setContactEmail(res.email); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const [form, setForm] = useState({
    firstName:        "",
    lastName:         "",
    email:            "",
    phone:            "",
    company:          "",
    portfolioSize:    "",
    message:          "",
    marketingConsent: false,
    // Honeypot — left blank by humans, filled in by bots.
    website:          "",
  });

  function ff(key: keyof typeof form) {
    return {
      value: form[key] as string,
      onChange: (
        e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>,
      ) => setForm(p => ({ ...p, [key]: e.target.value })),
    };
  }

  const handleSelectTime = useCallback((t: string) => setSelectedTime(t), []);
  const handleNext       = useCallback(() => setStep("details"), []);

  const isDetailsValid =
    form.firstName.trim() !== "" &&
    form.lastName.trim() !== "" &&
    isValidEmail(form.email) &&
    form.phone.trim() !== "" &&
    form.marketingConsent;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setSubmitError("");
    try {
      await apiPost("/public/demo-bookings", {
        firstName:        form.firstName,
        lastName:         form.lastName,
        email:            form.email,
        phone:            form.phone,
        company:          form.company || undefined,
        portfolioSize:    form.portfolioSize || undefined,
        message:          form.message || undefined,
        marketingConsent: form.marketingConsent,
        slotDate:         selectedDate,
        slotTime:         `${selectedTime}:00`,
        timezone:         "Africa/Kampala",
        website:          form.website || undefined,
      });
      setStep("confirmed");
    } catch (err: any) {
      const detail = err?.response?.data?.detail;
      setSubmitError(
        typeof detail === "string"
          ? detail
          : "Something went wrong. Please try again, or use the email link below to reach our team.",
      );
      // The selected slot may have just been taken by someone else — send the
      // visitor back to pick a different time rather than letting them retry blindly.
      if (err?.response?.status === 409) {
        setSelectedTime("");
        setStep("calendar");
      }
    } finally {
      setSubmitting(false);
    }
  }

  // ── Confirmed ──────────────────────────────────────────────────────────────
  if (step === "confirmed") {
    return (
      <div
        role="status"
        aria-live="polite"
        className="flex flex-col items-center gap-6 py-16 text-center"
      >
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[#f3fcfa]">
          <CheckCircle className="h-8 w-8 text-[#239487]" aria-hidden />
        </div>
        <div>
          <h3 className="text-xl font-bold text-[hsl(var(--foreground))]">
            Demo booked!
          </h3>
          <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
            {to12h(selectedTime)} {DEMO_TIMEZONE_LABEL} &mdash; {formatDateLong(selectedDate)}
          </p>
          <p className="mt-0.5 text-xs text-[hsl(var(--muted-foreground))]">
            Your calendar will show this converted to your local time zone.
          </p>
        </div>
        <div className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-6 py-4 text-center max-w-sm">
          <p className="text-xs font-semibold uppercase tracking-widest text-[hsl(var(--muted-foreground))] mb-1">
            Confirmation sent to
          </p>
          <p className="text-sm font-semibold text-[hsl(var(--foreground))]">{form.email}</p>
        </div>
        <p className="max-w-sm text-sm leading-relaxed text-[hsl(var(--muted-foreground))]">
          Our team will be in touch to confirm your session. Have questions before then?{" "}
          <a
            href={`mailto:${contactEmail}`}
            className="inline-flex items-center gap-1 font-medium text-[#239487] hover:underline"
          >
            <Mail className="h-3.5 w-3.5" aria-hidden /> Email us
          </a>
        </p>
      </div>
    );
  }

  // ── Details step ──────────────────────────────────────────────────────────
  if (step === "details") {
    return (
      <div className="flex flex-col gap-8 lg:flex-row">
        <div className="lg:w-56 lg:shrink-0">
          <InfoPanel
            selectedDate={selectedDate}
            selectedTime={selectedTime}
            showBack
            onBack={() => setStep("calendar")}
          />
        </div>

        <div className="flex-1">
          <h3 className="text-base font-bold text-[hsl(var(--foreground))] mb-5">
            Enter your details
          </h3>
          <form
            onSubmit={handleSubmit}
            className="space-y-4"
            noValidate
            aria-label="Demo booking form"
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="bk-first-name" className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-[hsl(var(--muted-foreground))]">
                  First name <span aria-hidden className="text-red-500">*</span>
                </label>
                <input
                  id="bk-first-name"
                  type="text"
                  required
                  autoComplete="given-name"
                  placeholder="Robert"
                  className={inputCls}
                  {...ff("firstName")}
                />
              </div>
              <div>
                <label htmlFor="bk-last-name" className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-[hsl(var(--muted-foreground))]">
                  Last name <span aria-hidden className="text-red-500">*</span>
                </label>
                <input
                  id="bk-last-name"
                  type="text"
                  required
                  autoComplete="family-name"
                  placeholder="Mukasa"
                  className={inputCls}
                  {...ff("lastName")}
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="bk-email" className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-[hsl(var(--muted-foreground))]">
                  Email <span aria-hidden className="text-red-500">*</span>
                </label>
                <input
                  id="bk-email"
                  type="email"
                  required
                  autoComplete="email"
                  placeholder="robert@example.com"
                  className={inputCls}
                  {...ff("email")}
                />
              </div>
              <div>
                <label htmlFor="bk-phone" className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-[hsl(var(--muted-foreground))]">
                  Phone <span aria-hidden className="text-red-500">*</span>
                </label>
                <input
                  id="bk-phone"
                  type="tel"
                  required
                  autoComplete="tel"
                  placeholder="+256 700 000000"
                  className={inputCls}
                  {...ff("phone")}
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="bk-company" className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-[hsl(var(--muted-foreground))]">
                  Company / business name
                </label>
                <input
                  id="bk-company"
                  type="text"
                  placeholder="Mukasa Properties Ltd"
                  className={inputCls}
                  {...ff("company")}
                />
              </div>
              <div>
                <label htmlFor="bk-portfolio" className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-[hsl(var(--muted-foreground))]">
                  Portfolio size
                </label>
                <select id="bk-portfolio" className={cn(inputCls, "cursor-pointer")} {...ff("portfolioSize")}>
                  <option value="">Select range</option>
                  {PORTFOLIO_SIZES.map(s => <option key={s}>{s}</option>)}
                </select>
              </div>
            </div>

            <div>
              <label htmlFor="bk-message" className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-[hsl(var(--muted-foreground))]">
                Anything specific you&apos;d like to cover?
              </label>
              <textarea
                id="bk-message"
                rows={3}
                placeholder="E.g. multi-property setup, rent collection, team access…"
                className={cn(inputCls, "resize-none")}
                {...ff("message")}
              />
            </div>

            <div className="flex items-start gap-3 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--background))] p-3">
              <input
                id="bk-consent"
                type="checkbox"
                required
                checked={form.marketingConsent}
                onChange={e => setForm(p => ({ ...p, marketingConsent: e.target.checked }))}
                className="mt-0.5 h-4 w-4 shrink-0 rounded border-[hsl(var(--border))] accent-[#239487]"
              />
              <label htmlFor="bk-consent" className="text-xs leading-relaxed text-[hsl(var(--muted-foreground))]">
                I agree to receive communications from Crib regarding my demo booking and
                product updates. You can unsubscribe at any time.
              </label>
            </div>

            {/* Honeypot — hidden from sighted users and screen readers; bots tend to fill every field */}
            <div aria-hidden="true" className="absolute -left-[9999px] top-auto h-0 w-0 overflow-hidden">
              <label htmlFor="bk-website">Website</label>
              <input
                id="bk-website"
                type="text"
                tabIndex={-1}
                autoComplete="off"
                {...ff("website")}
              />
            </div>

            {submitError && (
              <div className="space-y-1.5 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-2.5 text-sm text-destructive">
                <p>{submitError}</p>
                <a
                  href={`mailto:${contactEmail}`}
                  className="inline-flex items-center gap-1 font-medium underline-offset-2 hover:underline"
                >
                  <Mail className="h-3.5 w-3.5" aria-hidden /> Email our team
                </a>
              </div>
            )}

            <button
              type="submit"
              disabled={submitting || !isDetailsValid}
              aria-disabled={submitting || !isDetailsValid}
              className="w-full rounded-lg bg-[#239487] py-3 text-sm font-semibold text-white shadow-sm hover:bg-[#1c7a70] disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-[#239487] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#239487] focus-visible:ring-offset-2 transition-colors"
            >
              {submitting ? "Booking your demo…" : "Confirm demo booking"}
            </button>
          </form>
        </div>
      </div>
    );
  }

  // ── Calendar step ─────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-8 lg:flex-row">
      <div className="lg:w-56 lg:shrink-0">
        <InfoPanel selectedDate={selectedDate} selectedTime={selectedTime} />
      </div>

      <div className="flex-1">
        <h3 className="text-base font-bold text-[hsl(var(--foreground))] mb-5">
          Select Date &amp; Time
        </h3>
        <div className="flex flex-col gap-6 sm:flex-row">
          {/* Calendar */}
          <div className="flex-1">
            <MonthCalendar
              selectedDate={selectedDate}
              onSelect={d => { setSelectedDate(d); setSelectedTime(""); }}
            />
            <div className="mt-4 flex items-center gap-2 text-xs text-[hsl(var(--muted-foreground))]">
              <Globe className="h-3.5 w-3.5 shrink-0" aria-hidden />
              <span>East Africa Time (EAT, UTC+3) · Weekdays only</span>
            </div>
          </div>

          {/* Time slots */}
          {selectedDate && (
            <div className="w-full sm:w-44 animate-in fade-in slide-in-from-right-2 duration-200">
              <TimeSlots
                selectedTime={selectedTime}
                onSelect={handleSelectTime}
                onNext={handleNext}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Section wrapper ───────────────────────────────────────────────────────────

export function BookingSection() {
  return (
    <section
      id="booking"
      aria-labelledby="booking-heading"
      className="bg-[#f9fafb] py-20 lg:py-28"
    >
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="text-center max-w-2xl mx-auto mb-12">
          <p className="text-sm font-semibold uppercase tracking-widest text-[#239487] mb-3">
            Book a Demo
          </p>
          <h2
            id="booking-heading"
            className="text-3xl sm:text-4xl font-bold tracking-tight text-[hsl(var(--foreground))] mb-4"
          >
            See Crib in action
          </h2>
          <p className="text-[hsl(var(--muted-foreground))] text-lg leading-relaxed">
            Pick a time that works for you. We&apos;ll walk you through the platform and
            answer any questions about your specific portfolio.
          </p>
        </div>

        <div className="mx-auto max-w-4xl rounded-2xl border border-[hsl(var(--border))] bg-white p-6 sm:p-8 shadow-sm">
          <BookingWidget />
        </div>
      </div>
    </section>
  );
}
>>>>>>> c5b456736fe5b4d2905d6e5582a5cb3aad64eac6
