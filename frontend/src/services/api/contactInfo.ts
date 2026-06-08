import { apiGet } from "./client";

export interface ContactInfo {
  supportEmail: string;
  supportPhone: string;
  supportWhatsapp: string;
}

export const contactInfoApi = {
  get: () => apiGet<ContactInfo>("/public/contact-info"),
};
