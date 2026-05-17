export type FieldType =
  | "text"
  | "number"
  | "boolean"
  | "select"
  | "multi_select"
  | "date"
  | "currency"
  | "percentage"
  | "days";

export interface FieldOption {
  value: string;
  label: string;
}

export interface RuleField {
  key: string;
  label: string;
  type: FieldType;
  defaultValue?: unknown;
  options?: FieldOption[];
  min?: number;
  max?: number;
  required: boolean;
  description?: string;
  dependsOn?: {
    field: string;
    value: unknown;
  };
}

export interface RuleSchema {
  id: string;
  name: string;
  description?: string;
  propertyTypes: string[]; // applies to these property types
  fields: RuleField[];
}

// Default rule schema applied to all properties
export const DEFAULT_RULE_SCHEMA: RuleSchema = {
  id: "default",
  name: "Standard Property Rules",
  propertyTypes: ["flat", "house", "hostel", "commercial", "villa"],
  fields: [
    {
      key: "gracePeriodDays",
      label: "Grace Period",
      type: "days",
      defaultValue: 5,
      min: 0,
      max: 30,
      required: true,
      description: "Days after due date before late fee is applied",
    },
    {
      key: "lateFeeType",
      label: "Late Fee Type",
      type: "select",
      defaultValue: "flat",
      options: [
        { value: "flat", label: "Fixed Amount" },
        { value: "percentage", label: "Percentage of Rent" },
      ],
      required: true,
    },
    {
      key: "lateFeeValue",
      label: "Late Fee Amount / Rate",
      type: "number",
      defaultValue: 50,
      min: 0,
      required: true,
      description: "Amount (£) or percentage (%) depending on fee type",
    },
    {
      key: "lateFeeCapAmount",
      label: "Late Fee Cap",
      type: "currency",
      required: false,
      description: "Maximum late fee regardless of percentage",
      dependsOn: { field: "lateFeeType", value: "percentage" },
    },
    {
      key: "depositMonths",
      label: "Deposit (months)",
      type: "number",
      defaultValue: 1,
      min: 0,
      max: 6,
      required: true,
    },
    {
      key: "advanceRentMonths",
      label: "Advance Rent (months)",
      type: "number",
      defaultValue: 1,
      min: 1,
      max: 6,
      required: true,
    },
    {
      key: "noticePeriodDays",
      label: "Notice Period",
      type: "days",
      defaultValue: 30,
      min: 7,
      max: 180,
      required: true,
    },
    {
      key: "rentDayOfMonth",
      label: "Rent Due Day",
      type: "number",
      defaultValue: 1,
      min: 1,
      max: 28,
      required: true,
      description: "Day of month rent is due",
    },
    {
      key: "allowSubletting",
      label: "Allow Subletting",
      type: "boolean",
      defaultValue: false,
      required: false,
    },
    {
      key: "allowPets",
      label: "Allow Pets",
      type: "boolean",
      defaultValue: false,
      required: false,
    },
    {
      key: "allowSmoking",
      label: "Allow Smoking",
      type: "boolean",
      defaultValue: false,
      required: false,
    },
  ],
};
