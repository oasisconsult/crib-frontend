import { propertyHandlers } from "./properties";
import { tenantHandlers } from "./tenants";
import { leaseHandlers } from "./leases";
import { paymentHandlers } from "./payments";
import { inspectionHandlers } from "./inspections";
import { notificationHandlers } from "./notifications";
import { userHandlers } from "./users";

export const handlers = [
  ...userHandlers,
  ...propertyHandlers,
  ...tenantHandlers,
  ...leaseHandlers,
  ...paymentHandlers,
  ...inspectionHandlers,
  ...notificationHandlers,
];
