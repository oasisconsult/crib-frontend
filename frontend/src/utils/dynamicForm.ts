import type { RuleField, RuleSchema, PropertyRules } from "@/types";

/**
 * Converts a RuleSchema into react-hook-form default values.
 */
export function schemaToDefaultValues(
  schema: RuleSchema,
  existing?: Partial<PropertyRules>,
): Record<string, unknown> {
  return schema.fields.reduce(
    (acc, field) => {
      acc[field.key] =
        existing?.[field.key as keyof PropertyRules] ?? field.defaultValue ?? null;
      return acc;
    },
    {} as Record<string, unknown>,
  );
}

/**
 * Filters fields that should be visible given the current form values.
 */
export function getVisibleFields(
  fields: RuleField[],
  values: Record<string, unknown>,
): RuleField[] {
  return fields.filter((field) => {
    if (!field.dependsOn) return true;
    const dependentValue = values[field.dependsOn.field];
    return dependentValue === field.dependsOn.value;
  });
}

/**
 * Validates a rule value against field constraints.
 */
export function validateRuleField(
  field: RuleField,
  value: unknown,
): string | null {
  if (field.required && (value === null || value === undefined || value === "")) {
    return `${field.label} is required`;
  }
  if (typeof value === "number") {
    if (field.min !== undefined && value < field.min) {
      return `${field.label} must be at least ${field.min}`;
    }
    if (field.max !== undefined && value > field.max) {
      return `${field.label} must be at most ${field.max}`;
    }
  }
  return null;
}

/**
 * Detects conflicting rules (e.g. notice period < grace period).
 */
export function detectRuleConflicts(
  values: Record<string, unknown>,
): string[] {
  const conflicts: string[] = [];
  const grace = Number(values.gracePeriodDays ?? 0);
  const notice = Number(values.noticePeriodDays ?? 0);
  const rentDay = Number(values.rentDayOfMonth ?? 1);

  if (grace > notice) {
    conflicts.push(
      "Grace period cannot be longer than the notice period.",
    );
  }
  if (rentDay > 28) {
    conflicts.push("Rent day must be between 1 and 28 to cover all months.");
  }
  return conflicts;
}
