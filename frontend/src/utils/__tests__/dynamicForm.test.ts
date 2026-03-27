import { describe, it, expect } from "vitest";
import {
  schemaToDefaultValues,
  getVisibleFields,
  detectRuleConflicts,
} from "../dynamicForm";
import type { RuleSchema } from "@/types/rule";
import { DEFAULT_RULE_SCHEMA } from "@/types/rule";

describe("schemaToDefaultValues", () => {
  it("produces defaults for all fields in DEFAULT_RULE_SCHEMA", () => {
    const defaults = schemaToDefaultValues(DEFAULT_RULE_SCHEMA);
    expect(defaults).toBeDefined();
    expect(typeof defaults).toBe("object");
    // Should have an entry for every field
    for (const field of DEFAULT_RULE_SCHEMA.fields) {
      expect(Object.prototype.hasOwnProperty.call(defaults, field.key)).toBe(true);
    }
  });

  it("uses field defaultValue when present", () => {
    const schema: RuleSchema = {
      version: "1",
      fields: [
        { key: "monthlyRent", label: "Rent", type: "currency", required: true, defaultValue: 5000 },
      ],
    };
    const defaults = schemaToDefaultValues(schema);
    expect(defaults.monthlyRent).toBe(5000);
  });

  it("uses empty string for text fields without default", () => {
    const schema: RuleSchema = {
      version: "1",
      fields: [
        { key: "notes", label: "Notes", type: "text", required: false },
      ],
    };
    const defaults = schemaToDefaultValues(schema);
    expect(defaults.notes).toBe("");
  });

  it("uses false for boolean fields without default", () => {
    const schema: RuleSchema = {
      version: "1",
      fields: [
        { key: "lateFeeEnabled", label: "Enable", type: "boolean", required: false },
      ],
    };
    const defaults = schemaToDefaultValues(schema);
    expect(defaults.lateFeeEnabled).toBe(false);
  });
});

describe("getVisibleFields", () => {
  it("returns all fields when no conditions", () => {
    const schema: RuleSchema = {
      version: "1",
      fields: [
        { key: "a", label: "A", type: "text", required: false },
        { key: "b", label: "B", type: "number", required: false },
      ],
    };
    const visible = getVisibleFields(schema, {});
    expect(visible).toHaveLength(2);
  });

  it("hides fields whose condition is not met", () => {
    const schema: RuleSchema = {
      version: "1",
      fields: [
        { key: "lateFeeEnabled", label: "Enable", type: "boolean", required: false },
        {
          key: "lateFeeAmount",
          label: "Amount",
          type: "currency",
          required: false,
          condition: { field: "lateFeeEnabled", value: true },
        },
      ],
    };
    const visible = getVisibleFields(schema, { lateFeeEnabled: false });
    expect(visible.map((f) => f.key)).not.toContain("lateFeeAmount");
  });

  it("shows fields when condition is met", () => {
    const schema: RuleSchema = {
      version: "1",
      fields: [
        { key: "lateFeeEnabled", label: "Enable", type: "boolean", required: false },
        {
          key: "lateFeeAmount",
          label: "Amount",
          type: "currency",
          required: false,
          condition: { field: "lateFeeEnabled", value: true },
        },
      ],
    };
    const visible = getVisibleFields(schema, { lateFeeEnabled: true });
    expect(visible.map((f) => f.key)).toContain("lateFeeAmount");
  });
});

describe("detectRuleConflicts", () => {
  it("returns empty array when no conflicts", () => {
    const conflicts = detectRuleConflicts(DEFAULT_RULE_SCHEMA, {
      monthlyRent: 10000,
      depositMonths: 2,
      lateFeeEnabled: false,
    });
    expect(conflicts).toEqual([]);
  });

  it("detects conflict when late fee % > 100", () => {
    const conflicts = detectRuleConflicts(DEFAULT_RULE_SCHEMA, {
      lateFeeEnabled: true,
      lateFeeType: "percentage",
      lateFeeValue: 150,
    });
    expect(conflicts.length).toBeGreaterThan(0);
  });
});
