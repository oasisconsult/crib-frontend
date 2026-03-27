import LogtoClient from "@logto/next";

export const logtoClient = new LogtoClient({
  appId: process.env.NEXT_PUBLIC_LOGTO_APP_ID!,
  appSecret: process.env.LOGTO_APP_SECRET!,
  endpoint: process.env.NEXT_PUBLIC_LOGTO_ENDPOINT!,
  baseUrl: process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000",
  cookieSecret: process.env.NEXTAUTH_SECRET!,
  cookieSecure: process.env.NODE_ENV === "production",
  resources: [process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"],
  scopes: [
    "openid",
    "profile",
    "email",
    "phone",
    "roles",
    "custom_data",
    "offline_access",
  ],
});

export const LOGTO_ROLES = {
  SUPERADMIN: "superadmin",
  LANDLORD: "landlord",
  TENANT: "tenant",
} as const;

export type LogtoRole = (typeof LOGTO_ROLES)[keyof typeof LOGTO_ROLES];
