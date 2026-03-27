export const APP_NAME = "Crib";
export const APP_VERSION = "1.0.0";

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_FILE_SIZE_MB = 50;
export const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;
export const SUPPORTED_DOCUMENT_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
];
export const SUPPORTED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic"];

export const ONBOARDING_TOKEN_EXPIRY_HOURS = 72;

export const CURRENCIES = [
  { code: "GBP", symbol: "£", name: "British Pound" },
  { code: "EUR", symbol: "€", name: "Euro" },
  { code: "USD", symbol: "$", name: "US Dollar" },
  { code: "NGN", symbol: "₦", name: "Nigerian Naira" },
  { code: "KES", symbol: "KSh", name: "Kenyan Shilling" },
  { code: "ZAR", symbol: "R", name: "South African Rand" },
] as const;

export const PROPERTY_TYPES = [
  { value: "flat", label: "Flat / Apartment" },
  { value: "house", label: "House" },
  { value: "hostel", label: "Hostel / HMO" },
  { value: "commercial", label: "Commercial" },
  { value: "villa", label: "Villa" },
] as const;

export const UNIT_TYPES = [
  { value: "single", label: "Single Room" },
  { value: "double", label: "Double Room" },
  { value: "studio", label: "Studio" },
  { value: "ensuite", label: "En-suite" },
  { value: "shared", label: "Shared Room" },
] as const;

export const NOTIFICATION_CHANNELS = [
  { value: "whatsapp", label: "WhatsApp", icon: "MessageCircle" },
  { value: "email", label: "Email", icon: "Mail" },
  { value: "sms", label: "SMS", icon: "MessageSquare" },
  { value: "in_app", label: "In-App", icon: "Bell" },
] as const;

export const AMENITIES = [
  "WiFi",
  "Parking",
  "Laundry",
  "CCTV",
  "Gym",
  "Pool",
  "Garden",
  "Storage",
  "Lift",
  "Concierge",
  "Bike Storage",
  "EV Charging",
] as const;

export const INSPECTION_AREAS = [
  "Living Room",
  "Bedroom 1",
  "Bedroom 2",
  "Kitchen",
  "Bathroom",
  "Toilet",
  "Hallway",
  "Garden",
  "Garage",
  "Basement",
  "Roof",
  "External",
] as const;

// Workflow step configs for UI rendering
export const LEASE_STEPS = [
  { state: "draft", label: "Draft", step: 1 },
  { state: "pending", label: "Pending Signature", step: 2 },
  { state: "active", label: "Active", step: 3 },
  { state: "notice", label: "Notice Period", step: 4 },
  { state: "closed", label: "Closed", step: 5 },
] as const;

export const ONBOARDING_STEPS = [
  { state: "invited", label: "Invited", step: 1 },
  { state: "started", label: "Profile", step: 2 },
  { state: "submitted", label: "Documents", step: 3 },
  { state: "approved", label: "Under Review", step: 4 },
  { state: "activated", label: "Active", step: 5 },
] as const;
