import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";
import { PaymentReceipt } from "../PaymentReceipt";
import type { Payment, RentSchedule } from "@/types";

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockUsePaymentAllocations = vi.fn(() => ({ data: [], isLoading: false }));

vi.mock("@/hooks/usePayments", () => ({
  usePaymentAllocations: (...args: unknown[]) => mockUsePaymentAllocations(...args),
}));

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makePayment(overrides: Partial<Payment> = {}): Payment {
  return {
    id: "pay-abc-123",
    state: "completed",
    leaseId: "lease-001",
    category: "rent",
    method: "bank_transfer",
    amount: 750000,
    currency: "UGX",
    paidAt: "2025-03-15T14:22:00Z",
    reference: "TXN-REF-001",
    notes: undefined,
    createdAt: "2025-03-15T14:00:00Z",
    updatedAt: "2025-03-15T14:22:00Z",
    ...overrides,
  };
}

const DEFAULT_PROPS = {
  leaseId: "lease-001",
  leaseRef: "LEASE-2025-001",
  propertyName: "Greenview Apartments",
  unitName: "Unit 3B",
  schedules: [] as RentSchedule[],
  open: true,
  onClose: vi.fn(),
};

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("PaymentReceipt", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("null payment guard", () => {
    it("renders nothing when payment is null", () => {
      const { container } = render(
        <PaymentReceipt {...DEFAULT_PROPS} payment={null} />
      );
      expect(container.firstChild).toBeNull();
    });
  });

  describe("dialog visibility", () => {
    it("renders the dialog when open=true and payment is set", () => {
      render(<PaymentReceipt {...DEFAULT_PROPS} payment={makePayment()} />);
      expect(screen.getByText(/payment receipt/i)).toBeInTheDocument();
    });

    it("does not show dialog content when open=false", () => {
      render(
        <PaymentReceipt {...DEFAULT_PROPS} payment={makePayment()} open={false} />
      );
      expect(screen.queryByText(/payment receipt/i)).not.toBeInTheDocument();
    });
  });

  describe("payment details", () => {
    it("displays the payment amount prominently", () => {
      render(<PaymentReceipt {...DEFAULT_PROPS} payment={makePayment({ amount: 750000, currency: "UGX" })} />);
      expect(screen.getByText(/750,000/)).toBeInTheDocument();
    });

    it("displays the payment reference", () => {
      render(<PaymentReceipt {...DEFAULT_PROPS} payment={makePayment({ reference: "TXN-REF-001" })} />);
      expect(screen.getByText("TXN-REF-001")).toBeInTheDocument();
    });

    it("displays lease reference when provided", () => {
      render(<PaymentReceipt {...DEFAULT_PROPS} payment={makePayment()} leaseRef="LEASE-2025-001" />);
      expect(screen.getByText("LEASE-2025-001")).toBeInTheDocument();
    });

    it("displays property name when provided", () => {
      render(<PaymentReceipt {...DEFAULT_PROPS} payment={makePayment()} propertyName="Greenview Apartments" />);
      expect(screen.getByText("Greenview Apartments")).toBeInTheDocument();
    });

    it("displays unit name when provided", () => {
      render(<PaymentReceipt {...DEFAULT_PROPS} payment={makePayment()} unitName="Unit 3B" />);
      expect(screen.getByText("Unit 3B")).toBeInTheDocument();
    });

    it("shows payment method label for bank_transfer", () => {
      render(<PaymentReceipt {...DEFAULT_PROPS} payment={makePayment({ method: "bank_transfer" })} />);
      expect(screen.getByText(/bank transfer/i)).toBeInTheDocument();
    });

    it("shows payment method label for mobile_money_mtn", () => {
      render(<PaymentReceipt {...DEFAULT_PROPS} payment={makePayment({ method: "mobile_money_mtn" as any })} />);
      expect(screen.getByText(/mtn mobile money/i)).toBeInTheDocument();
    });

    it("shows payment method label for cash", () => {
      render(<PaymentReceipt {...DEFAULT_PROPS} payment={makePayment({ method: "cash" })} />);
      expect(screen.getByText(/cash/i)).toBeInTheDocument();
    });

    it("shows category label for rent", () => {
      render(<PaymentReceipt {...DEFAULT_PROPS} payment={makePayment({ category: "rent" })} />);
      expect(screen.getByText(/rent payment/i)).toBeInTheDocument();
    });

    it("shows category label for deposit", () => {
      render(<PaymentReceipt {...DEFAULT_PROPS} payment={makePayment({ category: "deposit" })} />);
      expect(screen.getByText(/security deposit/i)).toBeInTheDocument();
    });

    it("displays notes when present", () => {
      render(<PaymentReceipt {...DEFAULT_PROPS} payment={makePayment({ notes: "Cash paid at office" })} />);
      expect(screen.getByText("Cash paid at office")).toBeInTheDocument();
    });

    it("shows the payment UUID in the receipt footer", () => {
      render(<PaymentReceipt {...DEFAULT_PROPS} payment={makePayment({ id: "pay-abc-123" })} />);
      expect(screen.getByText("pay-abc-123")).toBeInTheDocument();
    });
  });

  describe("status display", () => {
    it("shows Completed badge for completed payments", () => {
      render(<PaymentReceipt {...DEFAULT_PROPS} payment={makePayment({ state: "completed" })} />);
      expect(screen.getByText("Completed")).toBeInTheDocument();
    });

    it("shows Confirmed badge for confirmed payments", () => {
      render(<PaymentReceipt {...DEFAULT_PROPS} payment={makePayment({ state: "confirmed" })} />);
      expect(screen.getByText("Confirmed")).toBeInTheDocument();
    });

    it("shows Failed badge for failed payments", () => {
      render(<PaymentReceipt {...DEFAULT_PROPS} payment={makePayment({ state: "failed" })} />);
      expect(screen.getByText("Failed")).toBeInTheDocument();
    });

    it("shows Processing badge for pending payments", () => {
      render(<PaymentReceipt {...DEFAULT_PROPS} payment={makePayment({ state: "pending" })} />);
      expect(screen.getByText("Processing")).toBeInTheDocument();
    });

    it("shows Refunded badge for refunded payments", () => {
      render(<PaymentReceipt {...DEFAULT_PROPS} payment={makePayment({ state: "refunded" })} />);
      expect(screen.getByText("Refunded")).toBeInTheDocument();
    });
  });

  describe("failure reason", () => {
    it("shows failure reason section for failed payment", () => {
      render(
        <PaymentReceipt
          {...DEFAULT_PROPS}
          payment={makePayment({ state: "failed", failureReason: "Insufficient funds in account" })}
        />
      );
      expect(screen.getByText(/failure reason/i)).toBeInTheDocument();
      expect(screen.getByText(/insufficient funds in account/i)).toBeInTheDocument();
    });

    it("does not show failure reason section for completed payment", () => {
      render(
        <PaymentReceipt
          {...DEFAULT_PROPS}
          payment={makePayment({ state: "completed", failureReason: null })}
        />
      );
      expect(screen.queryByText(/failure reason/i)).not.toBeInTheDocument();
    });

    it("does not show failure section when failureReason is not set", () => {
      render(
        <PaymentReceipt
          {...DEFAULT_PROPS}
          payment={makePayment({ state: "failed", failureReason: undefined })}
        />
      );
      expect(screen.queryByText(/failure reason/i)).not.toBeInTheDocument();
    });
  });

  describe("allocations section", () => {
    it("shows 'Applied to' section for completed payments", () => {
      mockUsePaymentAllocations.mockReturnValue({
        data: [{ id: "alloc-1", rentScheduleId: "sched-1", amountApplied: 750000 }],
        isLoading: false,
      } as any);

      render(
        <PaymentReceipt
          {...DEFAULT_PROPS}
          payment={makePayment({ state: "completed" })}
        />
      );
      expect(screen.getByText(/applied to/i)).toBeInTheDocument();
    });

    it("does not show 'Applied to' section for failed payments", () => {
      render(
        <PaymentReceipt
          {...DEFAULT_PROPS}
          payment={makePayment({ state: "failed" })}
        />
      );
      expect(screen.queryByText(/applied to/i)).not.toBeInTheDocument();
    });

    it("shows loading skeleton while allocations are loading", () => {
      mockUsePaymentAllocations.mockReturnValue({
        data: undefined,
        isLoading: true,
      } as any);

      render(
        <PaymentReceipt
          {...DEFAULT_PROPS}
          payment={makePayment({ state: "completed" })}
        />
      );
      // Dialog renders via portal into document.body — query document, not container
      const skeletons = document.querySelectorAll(".skeleton-shimmer");
      expect(skeletons.length).toBeGreaterThan(0);
    });
  });

  describe("actions", () => {
    it("calls onClose when Close button is clicked", () => {
      const onClose = vi.fn();
      render(
        <PaymentReceipt {...DEFAULT_PROPS} payment={makePayment()} onClose={onClose} />
      );
      // Use exact name to distinguish from the dialog's "Close dialog" X button
      fireEvent.click(screen.getByRole("button", { name: "Close" }));
      expect(onClose).toHaveBeenCalledOnce();
    });

    it("calls window.print when Print button is clicked", () => {
      const printMock = vi.fn();
      vi.stubGlobal("print", printMock);

      render(<PaymentReceipt {...DEFAULT_PROPS} payment={makePayment()} />);
      fireEvent.click(screen.getByRole("button", { name: /print/i }));
      expect(printMock).toHaveBeenCalledOnce();

      vi.unstubAllGlobals();
    });

    it("renders Print and Close buttons", () => {
      render(<PaymentReceipt {...DEFAULT_PROPS} payment={makePayment()} />);
      expect(screen.getByRole("button", { name: /print/i })).toBeInTheDocument();
      // Footer "Close" button (distinct from dialog's sr-only "Close dialog" X)
      expect(screen.getByRole("button", { name: "Close" })).toBeInTheDocument();
    });
  });

  describe("date field", () => {
    it("renders a date label in the details section", () => {
      render(<PaymentReceipt {...DEFAULT_PROPS} payment={makePayment()} />);
      expect(screen.getByText(/date & time/i)).toBeInTheDocument();
    });
  });
});
