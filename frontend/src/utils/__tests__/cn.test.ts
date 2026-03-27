import { describe, it, expect } from "vitest";
import { cn } from "../cn";

describe("cn", () => {
  it("merges class names", () => {
    expect(cn("foo", "bar")).toBe("foo bar");
  });

  it("deduplicates tailwind classes (last wins)", () => {
    expect(cn("p-4", "p-8")).toBe("p-8");
  });

  it("handles conditional classes", () => {
    expect(cn("base", false && "hidden", "visible")).toBe("base visible");
  });

  it("handles undefined and null", () => {
    expect(cn("base", undefined, null as never, "extra")).toBe("base extra");
  });

  it("handles object syntax", () => {
    expect(cn({ active: true, inactive: false })).toBe("active");
  });

  it("handles empty input", () => {
    expect(cn()).toBe("");
  });
});
