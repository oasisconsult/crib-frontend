import { describe, it, expect } from "vitest";
import {
  schemaToDefaultValues,
  getVisibleFields,
  validateRuleField,
  detectRuleConflicts,
} from "../dynamicForm";
import type { RuleSchema, RuleField } from "@/types/rule";
import { DEFAULT_RULE_SCHEMA } from "@/types/rule";

describe("schemaToDefaultValues", () => {
  it("produces an entry for every field in DEFAULT_RULE_SCHEMA", () => {
    const defaults = schemaToDefaultValues(DEFAULT_RULE_SCHEMA);
    for (const field of DEFAULT_RULE_SCHEMA.fields) {
      expect(Object.prototype.hasOwnProperty.call(defaults, field.key)).toBe(true);
    }
  });

  it("uses field.defaultValue when present", () => {
    const schema: RuleSchema = {
      version: "1",
      fields: [
        { key: "monthlyRent", label: "Rent", type: "currency", required: true, defaultValue: 5000 },
      ],
    };
    expect(schemaToDefaultValues(schema).monthlyRent).toBe(5000);
  });

  it("falls back to null for fields without a defaultValue", () => {
    // implementation: defaultValue ?? null
    const schema: RuleSchema = {
      version: "1",
      fields: [
        { key: "notes", label: "Notes", type: "text", required: false },
      ],
    };
    expect(schemaToDefaultValues(schema).notes).toBeNull();
  });

  it("uses existing values when provided", () => {
    const schema: RuleSchema = {
      version: "1",
      fields: [
        { key: "rentDayOfMonth", label: "Rent Day", type: "number", required: true, defaultValue: 1 },
      ],
    };
    const defaults = schemaToDefaultValues(schema, { rentDayOfMonth: 15 });
    expect(defaults.rentDayOfMonth).toBe(15);
  });
});

describe("getVisibleFields", () => {
  // getVisibleFields takes RuleField[] (not a schema object)
  const fields: RuleField[] = [
    { key: "lateFeeEnabled", label: "Enable Late Fee", type: "boolean", required: false },
    {
      key: "lateFeeAmount",
      label: "Amount",
      type: "currency",
      required: false,
      dependsOn: { field: "lateFeeEnabled", value: true },
    },
  ];

  it("returns all fields when conditions are met", () => {
    const visible = getVisibleFields(fields, { lateFeeEnabled: true });
    expect(visible.map((f) => f.key)).toContain("lateFeeEnabled");
    expect(visible.map((f) => f.key)).toContain("lateFeeAmount");
  });

  it("hides dependent field when condition is not met", () => {
    const visible = getVisibleFields(fields, { lateFeeEnabled: false });
    expect(visible.map((f) => f.key)).not.toContain("lateFeeAmount");
  });

  it("returns all fields that have no dependsOn", () => {
    const simple: RuleField[] = [
      { key: "a", label: "A", type: "text", required: false },
      { key: "b", label: "B", type: "number", required: false },
    ];
    expect(getVisibleFields(simple, {})).toHaveLength(2);
  });
});

describe("validateRuleField", () => {
  it("returns null for valid value", () => {
    const field: RuleField = { key: "rent", label: "Rent", type: "currency", required: true };
    expect(validateRuleField(field, 5000)).toBeNull();
  });

  it("returns error message for required field with empty value", () => {
    const field: RuleField = { key: "rent", label: "Rent", type: "currency", required: true };
    const result = validateRuleField(field, "");
    expect(result).toContain("Rent");
    expect(result).toContain("required");
  });

  it("returns error when value is below min", () => {
    const field: RuleField = { key: "days", label: "Days", type: "number", required: false, min: 1 };
    const result = validateRuleField(field, 0);
    expect(result).toContain("at least 1");
  });

  it("returns error when value exceeds max", () => {
    const field: RuleField = { key: "pct", label: "Pct", type: "number", required: false, max: 100 };
    const result = validateRuleField(field, 150);
    expect(result).toContain("at most 100");
  });
});

describe("detectRuleConflicts", () => {
  // detectRuleConflicts takes values Record<string, unknown> directly (no schema arg)
  it("returns empty array when no conflicts", () => {
    const conflicts = detectRuleConflicts({
      gracePeriodDays: 3,
      noticePeriodDays: 30,
      rentDayOfMonth: 1,
    });
    expect(conflicts).toEqual([]);
  });

  it("detects conflict when grace period > notice period", () => {
    const conflicts = detectRuleConflicts({
      gracePeriodDays: 60,
      noticePeriodDays: 30,
    });
    expect(conflicts.length).toBeGreaterThan(0);
    expect(conflicts[0]).toMatch(/grace period/i);
  });

  it("detects conflict when rentDayOfMonth > 28", () => {
    const conflicts = detectRuleConflicts({
      gracePeriodDays: 0,
      noticePeriodDays: 30,
      rentDayOfMonth: 31,
    });
    expect(conflicts.some((c) => c.match(/rent day/i))).toBe(true);
  });
});
