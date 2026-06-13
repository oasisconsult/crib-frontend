import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";
import { MoveInInspectionPanel } from "../MoveInInspectionPanel";

// ── Mocks ──────────────────────────────────────────────────────────────────────

vi.mock("@/hooks/useInspections", () => ({
  useInspections: vi.fn(),
}));

vi.mock("@/utils/formatters", () => ({
  formatDate: (d: string) => d,
}));

import { useInspections } from "@/hooks/useInspections";
import { useRouter } from "next/navigation";

const mockUseInspections = vi.mocked(useInspections);
const mockPush = vi.fn();

// Override the global useRouter mock to capture push calls
vi.mock("next/navigation", async (importOriginal) => {
  const original = await importOriginal<typeof import("next/navigation")>();
  return {
    ...original,
    useRouter: () => ({ push: mockPush, back: vi.fn(), replace: vi.fn() }),
    useSearchParams: () => new URLSearchParams(),
  };
});

// ── Helpers ────────────────────────────────────────────────────────────────────

const BASE_PROPS = {
  leaseId:    "lease-abc",
  propertyId: "prop-123",
  unitId:     "unit-456",
  leaseStatus: "active",
};

function makeInspection(overrides: Record<string, unknown> = {}) {
  return {
    id:               "insp-001",
    type:             "move_in",
    state:            "scheduled",
    propertyId:       "prop-123",
    unitId:           "unit-456",
    leaseId:          "lease-abc",
    landlordId:       "",
    scheduledDate:    "2026-07-01",
    scheduledTimeSlot: "10:00 – 12:00",
    inspectorName:    "John Mugisha",
    checklist:        [],
    overallCondition: undefined,
    summary:          undefined,
    photoUrls:        [],
    videoUrls:        [],
    maintenanceIssueIds: [],
    tenantSignedAt:   undefined,
    landlordSignedAt: undefined,
    createdAt:        "2026-06-01T00:00:00Z",
    updatedAt:        "2026-06-01T00:00:00Z",
    ...overrides,
  };
}

function setInspections(data: unknown[] = [], loading = false) {
  mockUseInspections.mockReturnValue({
    data:      { data, total: data.length, page: 1, pageSize: 10 },
    isLoading: loading,
  } as ReturnType<typeof useInspections>);
}

// ── Tests ──────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  setInspections([]);
});

describe("MoveInInspectionPanel", () => {
  describe("empty state", () => {
    it("shows placeholder when no inspections exist", () => {
      render(<MoveInInspectionPanel {...BASE_PROPS} />);
      expect(screen.getByText("No move-in inspection scheduled.")).toBeInTheDocument();
    });

    it("shows Schedule button for schedulable lease states", () => {
      for (const state of ["pending", "onboarding", "active"]) {
        const { unmount } = render(<MoveInInspectionPanel {...BASE_PROPS} leaseStatus={state} />);
        expect(screen.getByRole("button", { name: /schedule/i })).toBeInTheDocument();
        unmount();
      }
    });

    it("hides Schedule button for non-schedulable lease states", () => {
      render(<MoveInInspectionPanel {...BASE_PROPS} leaseStatus="terminated" />);
      expect(screen.queryByRole("button", { name: /schedule/i })).not.toBeInTheDocument();
    });
  });

  describe("Schedule button deep-link", () => {
    it("navigates to /inspections/new with type, leaseId, propertyId and unitId pre-filled", () => {
      render(<MoveInInspectionPanel {...BASE_PROPS} />);
      fireEvent.click(screen.getByRole("button", { name: /schedule/i }));

      expect(mockPush).toHaveBeenCalledOnce();
      const url = new URL(mockPush.mock.calls[0][0], "http://x");
      expect(url.pathname).toBe("/inspections/new");
      expect(url.searchParams.get("type")).toBe("move_in");
      expect(url.searchParams.get("leaseId")).toBe("lease-abc");
      expect(url.searchParams.get("propertyId")).toBe("prop-123");
      expect(url.searchParams.get("unitId")).toBe("unit-456");
    });

    it("omits unitId param when not provided", () => {
      render(<MoveInInspectionPanel {...BASE_PROPS} unitId={undefined} />);
      fireEvent.click(screen.getByRole("button", { name: /schedule/i }));

      const url = new URL(mockPush.mock.calls[0][0], "http://x");
      expect(url.searchParams.has("unitId")).toBe(false);
    });
  });

  describe("with existing inspection", () => {
    it("renders inspection card with state badge and scheduled date", () => {
      setInspections([makeInspection()]);
      render(<MoveInInspectionPanel {...BASE_PROPS} />);

      // "scheduled" appears in both the card header badge and the inspection row badge
      expect(screen.getAllByText("scheduled").length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText(/2026-07-01/)).toBeInTheDocument();
      expect(screen.getByText(/John Mugisha/)).toBeInTheDocument();
    });

    it("hides Schedule button when an active inspection exists", () => {
      setInspections([makeInspection({ state: "scheduled" })]);
      render(<MoveInInspectionPanel {...BASE_PROPS} />);
      expect(screen.queryByRole("button", { name: /schedule/i })).not.toBeInTheDocument();
    });

    it("shows Schedule button again when inspection is cancelled", () => {
      setInspections([makeInspection({ state: "cancelled" })]);
      render(<MoveInInspectionPanel {...BASE_PROPS} />);
      expect(screen.getByRole("button", { name: /schedule/i })).toBeInTheDocument();
    });

    it("View button navigates to the inspection detail page", () => {
      setInspections([makeInspection({ id: "insp-999" })]);
      render(<MoveInInspectionPanel {...BASE_PROPS} />);
      fireEvent.click(screen.getByRole("button", { name: /view/i }));
      expect(mockPush).toHaveBeenCalledWith("/inspections/insp-999");
    });

    it("shows overall condition when present", () => {
      setInspections([makeInspection({ overallCondition: "good", state: "completed" })]);
      render(<MoveInInspectionPanel {...BASE_PROPS} />);
      expect(screen.getByText(/Overall: good/i)).toBeInTheDocument();
    });

    it("shows photo count when photos exist", () => {
      setInspections([makeInspection({ photoUrls: ["a.jpg", "b.jpg"] })]);
      render(<MoveInInspectionPanel {...BASE_PROPS} />);
      expect(screen.getByText(/2 photos/i)).toBeInTheDocument();
    });

    it("filters out non-move_in inspections from the list", () => {
      setInspections([
        makeInspection({ type: "routine", state: "scheduled" }),
        makeInspection({ type: "move_in",  state: "approved", id: "insp-mi" }),
      ]);
      render(<MoveInInspectionPanel {...BASE_PROPS} />);
      // Only the move_in one should appear — no Schedule button, "approved" badge visible
      expect(screen.queryByRole("button", { name: /schedule/i })).not.toBeInTheDocument();
      // "approved" appears in header badge + card badge (both from the move_in inspection)
      expect(screen.getAllByText("approved").length).toBeGreaterThanOrEqual(1);
      // "scheduled" from the routine inspection must NOT appear
      expect(screen.queryByText("scheduled")).not.toBeInTheDocument();
    });
  });

  describe("loading state", () => {
    it("shows spinner while loading", () => {
      setInspections([], true);
      render(<MoveInInspectionPanel {...BASE_PROPS} />);
      // Spinner renders as svg; placeholder text should be absent
      expect(screen.queryByText("No move-in inspection scheduled.")).not.toBeInTheDocument();
    });
  });
});
