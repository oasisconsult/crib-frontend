import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import React from "react";
import { GeocodeField } from "../geocode-field";

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock("@/services/api/geobox", () => ({
  geoboxApi: {
    resolveGeocode: vi.fn(),
  },
}));

import { geoboxApi } from "@/services/api/geobox";
const mockResolveGeocode = vi.mocked(geoboxApi.resolveGeocode);

// ── Helpers ───────────────────────────────────────────────────────────────────

const PORTAL_URL = "https://app.geoboxafrica.com";
const VALID_GEOCODE = "UGKAN-JF5";
const HIERARCHY = ["KAMPALA", "KAMPALA CAPITAL CITY", "NAKAWA", "NTINDA", "Central"];

function renderField(props: Partial<React.ComponentProps<typeof GeocodeField>> = {}) {
  const onChange = vi.fn();
  const onHierarchyFound = vi.fn();
  const result = render(
    <GeocodeField
      value=""
      onChange={onChange}
      onHierarchyFound={onHierarchyFound}
      portalUrl={PORTAL_URL}
      whatsappNumber="+256767171092"
      whatsappCreateMessage="Hi, I want to create a GeoBox code"
      {...props}
    />,
  );
  return { ...result, onChange, onHierarchyFound };
}

function dispatchMessage(data: unknown, origin = PORTAL_URL) {
  act(() => {
    // Use a plain Event with manually-assigned data/origin so that jsdom's
    // read-only MessageEvent.origin restriction doesn't block us.
    const event = Object.assign(new Event("message"), { data, origin });
    window.dispatchEvent(event);
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

// Spy is created once per test in the outer beforeEach so inner describes can
// safely override .mockReturnValue without creating a second spy on the same
// prototype property (which confuses vi.restoreAllMocks across describe blocks).
let userAgentSpy: ReturnType<typeof vi.spyOn<Navigator, "userAgent">>;

describe("GeocodeField", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(window, "open").mockReturnValue(null);
    userAgentSpy = vi.spyOn(Navigator.prototype, "userAgent", "get")
      .mockReturnValue("Mozilla/5.0 (Macintosh; Intel Mac OS X) AppleWebKit") as typeof userAgentSpy;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ── Look up button ──────────────────────────────────────────────────────────

  describe("Look up button", () => {
    it("is disabled when the input is empty", () => {
      renderField({ value: "" });
      expect(screen.getByTitle(/look up this code/i)).toBeDisabled();
    });

    it("is disabled when the geocode format is invalid", () => {
      renderField({ value: "NOTVALID" });
      expect(screen.getByTitle(/look up this code/i)).toBeDisabled();
    });

    it("calls resolveGeocode and fires onHierarchyFound on success", async () => {
      mockResolveGeocode.mockResolvedValue({ hierarchy: HIERARCHY });
      const { onHierarchyFound } = renderField({ value: VALID_GEOCODE });

      fireEvent.click(screen.getByTitle(/look up this code/i));

      await waitFor(() => {
        expect(mockResolveGeocode).toHaveBeenCalledWith(VALID_GEOCODE);
        expect(onHierarchyFound).toHaveBeenCalledWith(HIERARCHY);
      });
      expect(screen.getByText(/address hierarchy applied/i)).toBeInTheDocument();
    });

    it("shows not_found state when hierarchy is empty", async () => {
      mockResolveGeocode.mockResolvedValue({ hierarchy: [] });
      renderField({ value: VALID_GEOCODE });

      fireEvent.click(screen.getByTitle(/look up this code/i));

      await waitFor(() =>
        expect(screen.getByText(/code found but address hierarchy is unavailable/i)).toBeInTheDocument(),
      );
    });

    it("shows error state when resolveGeocode throws", async () => {
      mockResolveGeocode.mockRejectedValue(new Error("network"));
      renderField({ value: VALID_GEOCODE });

      fireEvent.click(screen.getByTitle(/look up this code/i));

      await waitFor(() =>
        expect(screen.getByText(/geobox unavailable/i)).toBeInTheDocument(),
      );
    });
  });

  // ── Get a code — mobile ─────────────────────────────────────────────────────

  describe("Get a code button — mobile", () => {
    beforeEach(() => {
      userAgentSpy.mockReturnValue("Mozilla/5.0 (Linux; Android 11) AppleWebKit");
    });

    it("opens WhatsApp on mobile", () => {
      renderField();
      fireEvent.click(screen.getByTitle(/register a location/i));

      expect(window.open).toHaveBeenCalledWith(
        expect.stringContaining("wa.me/256767171092"),
        "_blank",
        "noopener,noreferrer",
      );
    });

    it("does NOT open the GeoBox portal on mobile", () => {
      renderField();
      fireEvent.click(screen.getByTitle(/register a location/i));

      const [url] = vi.mocked(window.open).mock.calls[0];
      expect(String(url)).not.toContain("geoboxafrica.com/create-address");
    });
  });

  // ── Get a code — desktop (postMessage popup) ────────────────────────────────

  describe("Get a code button — desktop", () => {
    // outer beforeEach already sets desktop UA — no override needed

    it("opens GeoBox portal as a popup with callback params", () => {
      renderField();
      fireEvent.click(screen.getByTitle(/register a location/i));

      expect(window.open).toHaveBeenCalledOnce();
      const [url, target, features] = vi.mocked(window.open).mock.calls[0];
      const parsed = new URL(String(url));
      expect(parsed.origin).toBe(PORTAL_URL);
      expect(parsed.pathname).toBe("/create-address");
      expect(parsed.searchParams.get("callback")).toBe("postmessage");
      expect(parsed.searchParams.get("origin")).toBeTruthy();
      expect(target).toBe("geobox-create");
      expect(String(features)).toContain("width=");
    });

    it("does NOT use noopener so window.opener works in the portal", () => {
      renderField();
      fireEvent.click(screen.getByTitle(/register a location/i));

      const [, , features] = vi.mocked(window.open).mock.calls[0];
      expect(String(features ?? "")).not.toContain("noopener");
    });
  });

  // ── postMessage listener ────────────────────────────────────────────────────

  describe("postMessage callback", () => {
    it("ignores messages from unknown origins", async () => {
      mockResolveGeocode.mockResolvedValue({ hierarchy: HIERARCHY });
      const { onChange } = renderField();

      dispatchMessage(
        { type: "geobox:address_created", geocode: VALID_GEOCODE },
        "https://evil.example.com",
      );

      await new Promise((r) => setTimeout(r, 50));
      expect(onChange).not.toHaveBeenCalled();
      expect(mockResolveGeocode).not.toHaveBeenCalled();
    });

    it("ignores messages with wrong type", async () => {
      const { onChange } = renderField();

      dispatchMessage(
        { type: "some_other_event", geocode: VALID_GEOCODE },
        PORTAL_URL,
      );

      await new Promise((r) => setTimeout(r, 50));
      expect(onChange).not.toHaveBeenCalled();
    });

    it("ignores messages with empty geocode", async () => {
      const { onChange } = renderField();

      dispatchMessage({ type: "geobox:address_created", geocode: "" }, PORTAL_URL);

      await new Promise((r) => setTimeout(r, 50));
      expect(onChange).not.toHaveBeenCalled();
    });

    it("calls onChange with uppercased geocode on valid message", async () => {
      mockResolveGeocode.mockResolvedValue({ hierarchy: HIERARCHY });
      const { onChange } = renderField();

      dispatchMessage(
        { type: "geobox:address_created", geocode: "ugkan-jf5" },
        PORTAL_URL,
      );

      await waitFor(() => expect(onChange).toHaveBeenCalledWith("UGKAN-JF5"));
    });

    it("triggers hierarchy lookup and calls onHierarchyFound", async () => {
      mockResolveGeocode.mockResolvedValue({ hierarchy: HIERARCHY });
      const { onHierarchyFound } = renderField();

      dispatchMessage(
        { type: "geobox:address_created", geocode: VALID_GEOCODE },
        PORTAL_URL,
      );

      await waitFor(() => {
        expect(mockResolveGeocode).toHaveBeenCalledWith(VALID_GEOCODE);
        expect(onHierarchyFound).toHaveBeenCalledWith(HIERARCHY);
      });
    });

    it("shows address hierarchy applied banner after successful callback", async () => {
      mockResolveGeocode.mockResolvedValue({ hierarchy: HIERARCHY });
      renderField();

      dispatchMessage(
        { type: "geobox:address_created", geocode: VALID_GEOCODE },
        PORTAL_URL,
      );

      await waitFor(() =>
        expect(screen.getByText(/address hierarchy applied/i)).toBeInTheDocument(),
      );
    });
  });
});
