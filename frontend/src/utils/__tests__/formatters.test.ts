import { describe, it, expect } from "vitest";
import {
  formatCurrency,
  formatDate,
  formatFileSize,
  getInitials,
  formatDays,
  capitalise,
} from "../formatters";

describe("formatCurrency", () => {
  it("formats KES correctly", () => {
    const result = formatCurrency(50000, "KES");
    expect(result).toContain("50,000");
  });

  it("formats USD correctly", () => {
    const result = formatCurrency(1234.5, "USD");
    expect(result).toContain("1,234.50");
  });

  it("handles zero", () => {
    const result = formatCurrency(0, "KES");
    expect(result).toContain("0");
  });

  it("handles large numbers", () => {
    const result = formatCurrency(1_000_000, "KES");
    expect(result).toContain("1,000,000");
  });
});

describe("formatDate", () => {
  it("formats ISO date string", () => {
    const result = formatDate("2025-01-15T00:00:00Z");
    expect(result).toMatch(/Jan|January/i);
    expect(result).toMatch(/2025/);
  });

  it("returns empty string for empty input", () => {
    expect(formatDate("")).toBe("");
  });
});

describe("formatFileSize", () => {
  it("formats bytes", () => {
    expect(formatFileSize(500)).toMatch(/500 B/);
  });

  it("formats kilobytes", () => {
    expect(formatFileSize(1024)).toMatch(/1(\.\d+)? KB/);
  });

  it("formats megabytes", () => {
    expect(formatFileSize(1024 * 1024)).toMatch(/1(\.\d+)? MB/);
  });

  it("formats gigabytes", () => {
    expect(formatFileSize(1024 * 1024 * 1024)).toMatch(/1(\.\d+)? GB/);
  });
});

describe("getInitials", () => {
  it("returns initials from full name", () => {
    expect(getInitials("Alice Kamau")).toBe("AK");
  });

  it("handles single name", () => {
    expect(getInitials("Alice")).toBe("A");
  });

  it("handles three names (takes first two)", () => {
    const result = getInitials("Alice Jane Kamau");
    expect(result).toHaveLength(2);
  });

  it("handles empty string", () => {
    expect(getInitials("")).toBe("");
  });
});

describe("formatDays", () => {
  it("formats 1 day", () => {
    expect(formatDays(1)).toMatch(/1 day/i);
  });

  it("formats multiple days", () => {
    expect(formatDays(30)).toMatch(/30 days/i);
  });

  it("formats months", () => {
    expect(formatDays(60)).toMatch(/2 month/i);
  });
});

describe("capitalise", () => {
  it("capitalises first letter", () => {
    expect(capitalise("hello")).toBe("Hello");
  });

  it("handles already capitalised", () => {
    expect(capitalise("Hello")).toBe("Hello");
  });

  it("handles empty string", () => {
    expect(capitalise("")).toBe("");
  });

  it("handles underscore strings", () => {
    expect(capitalise("hello_world")).toBe("Hello_world");
  });
});
