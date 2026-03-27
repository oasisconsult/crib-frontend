import { propertyHandlers } from "./properties";
import { tenantHandlers } from "./tenants";
import { leaseHandlers } from "./leases";
import { paymentHandlers } from "./payments";
import { inspectionHandlers } from "./inspections";
import { notificationHandlers } from "./notifications";

export const handlers = [
  ...propertyHandlers,
  ...tenantHandlers,
  ...leaseHandlers,
  ...paymentHandlers,
  ...inspectionHandlers,
  ...notificationHandlers,
];
