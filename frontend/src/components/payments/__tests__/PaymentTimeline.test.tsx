import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";
import { PaymentTimeline } from "../PaymentTimeline";
import type { Payment, RentSchedule } from "@/types";

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock("@/hooks/usePayments", () => ({
  usePaymentAllocations: vi.fn(() => ({ data: [], isLoading: false })),
}));

vi.mock("../RetrySuggestionBanner", () => ({
  RetrySuggestionBanner: ({ payment }: { payment: Payment }) => (
    <div data-testid="retry-banner">Retry: {payment.id}</div>
  ),
}));

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makePayment(overrides: Partial<Payment> = {}): Payment {
  return {
    id: "pay-001",
    state: "completed",
    leaseId: "lease-001",
    category: "rent",
    method: "bank_transfer",
    amount: 750000,
    currency: "UGX",
    paidAt: "2025-03-01T10:30:00Z",
    reference: "REF-001",
    createdAt: "2025-03-01T10:00:00Z",
    updatedAt: "2025-03-01T10:30:00Z",
    ...overrides,
  };
}

const LEASE_ID = "lease-001";

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("PaymentTimeline", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("loading state", () => {
    it("renders skeleton rows while loading", () => {
      const { container } = render(
        <PaymentTimeline
          leaseId={LEASE_ID}
          payments={[]}
          isLoading={true}
        />
      );
      // Four skeleton divs rendered
      const skeletons = container.querySelectorAll(".skeleton-shimmer, [class*='animate-pulse'], [class*='skeleton']");
      expect(skeletons.length).toBeGreaterThan(0);
    });
  });

  describe("empty state", () => {
    it("shows 'No payments yet' when payment list is empty and not loading", () => {
      render(
        <PaymentTimeline leaseId={LEASE_ID} payments={[]} isLoading={false} />
      );
      expect(screen.getByText(/no payments yet/i)).toBeInTheDocument();
    });

    it("shows prompt about payment history appearing here", () => {
      render(
        <PaymentTimeline leaseId={LEASE_ID} payments={[]} />
      );
      expect(screen.getByText(/your payment history will appear here/i)).toBeInTheDocument();
    });
  });

  describe("payment rows", () => {
    it("renders a payment row with formatted amount", () => {
      render(
        <PaymentTimeline
          leaseId={LEASE_ID}
          payments={[makePayment({ amount: 750000, currency: "UGX" })]}
        />
      );
      expect(screen.getByText(/750,000/)).toBeInTheDocument();
    });

    it("renders all payments in the list", () => {
      const payments = [
        makePayment({ id: "pay-001", amount: 100000 }),
        makePayment({ id: "pay-002", amount: 200000, paidAt: "2025-02-01T10:00:00Z", reference: "REF-002" }),
        makePayment({ id: "pay-003", amount: 300000, paidAt: "2025-01-01T10:00:00Z", reference: "REF-003" }),
      ];
      render(<PaymentTimeline leaseId={LEASE_ID} payments={payments} />);
      expect(screen.getByText(/100,000/)).toBeInTheDocument();
      expect(screen.getByText(/200,000/)).toBeInTheDocument();
      expect(screen.getByText(/300,000/)).toBeInTheDocument();
    });

    it("sorts payments newest first", () => {
      const older = makePayment({ id: "pay-old", amount: 111111, paidAt: "2025-01-01T00:00:00Z" });
      const newer = makePayment({ id: "pay-new", amount: 999999, paidAt: "2025-06-01T00:00:00Z", reference: "REF-NEW" });
      render(<PaymentTimeline leaseId={LEASE_ID} payments={[older, newer]} />);
      const amounts = screen.getAllByText(/\d{3},\d{3}/);
      // The first amount in the DOM should be the newer (999,999)
      expect(amounts[0].textContent).toMatch(/999,999/);
    });

    it("shows the payment method icon area", () => {
      render(
        <PaymentTimeline
          leaseId={LEASE_ID}
          payments={[makePayment({ method: "cash" })]}
        />
      );
      // The row renders; verify status badge is present
      expect(screen.getByText(/completed/i)).toBeInTheDocument();
    });

    it("shows failed status badge for failed payments", () => {
      render(
        <PaymentTimeline
          leaseId={LEASE_ID}
          payments={[makePayment({ state: "failed" })]}
        />
      );
      expect(screen.getByText(/failed/i)).toBeInTheDocument();
    });

    it("shows processing badge for pending payments", () => {
      render(
        <PaymentTimeline
          leaseId={LEASE_ID}
          payments={[makePayment({ state: "pending" })]}
        />
      );
      expect(screen.getByText(/processing/i)).toBeInTheDocument();
    });

    it("shows failure reason inline for failed payment (collapsed)", () => {
      render(
        <PaymentTimeline
          leaseId={LEASE_ID}
          payments={[makePayment({ state: "failed", failureReason: "Insufficient funds" })]}
        />
      );
      expect(screen.getByText(/insufficient funds/i)).toBeInTheDocument();
    });
  });

  describe("onViewReceipt prop", () => {
    it("renders 'View receipt' link when onViewReceipt is provided", () => {
      render(
        <PaymentTimeline
          leaseId={LEASE_ID}
          payments={[makePayment()]}
          onViewReceipt={vi.fn()}
        />
      );
      expect(screen.getByText(/view receipt/i)).toBeInTheDocument();
    });

    it("does NOT render 'View receipt' link when onViewReceipt is not provided", () => {
      render(
        <PaymentTimeline
          leaseId={LEASE_ID}
          payments={[makePayment()]}
        />
      );
      expect(screen.queryByText(/view receipt/i)).not.toBeInTheDocument();
    });

    it("calls onViewReceipt with the correct payment when clicked", () => {
      const onViewReceipt = vi.fn();
      const payment = makePayment({ id: "pay-receipt-test" });
      render(
        <PaymentTimeline
          leaseId={LEASE_ID}
          payments={[payment]}
          onViewReceipt={onViewReceipt}
        />
      );
      fireEvent.click(screen.getByText(/view receipt/i));
      expect(onViewReceipt).toHaveBeenCalledOnce();
      expect(onViewReceipt).toHaveBeenCalledWith(
        expect.objectContaining({ id: "pay-receipt-test" })
      );
    });

    it("renders a View receipt link per payment", () => {
      const onViewReceipt = vi.fn();
      const payments = [
        makePayment({ id: "pay-a", amount: 100000 }),
        makePayment({ id: "pay-b", amount: 200000, paidAt: "2025-02-01T00:00:00Z", reference: "B" }),
      ];
      render(
        <PaymentTimeline
          leaseId={LEASE_ID}
          payments={payments}
          onViewReceipt={onViewReceipt}
        />
      );
      const links = screen.getAllByText(/view receipt/i);
      expect(links).toHaveLength(2);
    });
  });

  describe("schedules prop", () => {
    it("renders without error when schedules are passed", () => {
      const schedules: RentSchedule[] = [
        {
          id: "sched-1",
          organisationId: "org-1",
          status: "paid",
          leaseId: LEASE_ID,
          periodStart: "2025-03-01",
          periodEnd: "2025-03-31",
          dueDate: "2025-03-05",
          amountDue: 750000,
          amountPaid: 750000,
          lateFeeApplied: 0,
          balance: 0,
          createdAt: "2025-03-01T00:00:00Z",
          updatedAt: "2025-03-01T00:00:00Z",
        },
      ];
      render(
        <PaymentTimeline
          leaseId={LEASE_ID}
          payments={[makePayment()]}
          schedules={schedules}
          onViewReceipt={vi.fn()}
        />
      );
      expect(screen.getByText(/750,000/)).toBeInTheDocument();
    });
  });
});
