import { apiPost, apiPostForm } from "./client";

interface PresignedUrl {
  uploadUrl: string;
  publicUrl: string;
  key: string;
  expiresIn: number;
  provider: string;
}

interface UploadOptions {
  tenantId?: string;
  leaseId?: string;
  inspectionId?: string;
  category: "document" | "signature" | "inspection_photo" | "property_image" | "payment_receipt";
  /** If provided, uses the public onboarding presign endpoint (no JWT required). */
  onboardingToken?: string;
}

export interface UploadResult {
  url: string;
  key: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
}

export const uploadsApi = {
  getPresignedUrl: (filename: string, mimeType: string, options: UploadOptions) => {
    const { onboardingToken, ...rest } = options;
    const endpoint = onboardingToken
      ? `/upload/presign/onboarding/${onboardingToken}`
      : options.category === "payment_receipt"
        ? "/upload/presign/payment-receipt"
        : "/upload/presign";
    return apiPost<PresignedUrl>(endpoint, { filename, mimeType, ...rest });
  },

  async uploadFile(
    file: File,
    options: UploadOptions,
    onProgress?: (percent: number) => void,
  ): Promise<UploadResult> {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("category", options.category);
    if (options.tenantId) formData.append("tenant_id", options.tenantId);
    if (options.leaseId) formData.append("lease_id", options.leaseId);
    if (options.inspectionId) formData.append("inspection_id", options.inspectionId);

    const { publicUrl, key } = await apiPostForm<PresignedUrl>(
      "/upload/file",
      formData,
      onProgress,
    );

    return {
      url: publicUrl,
      key,
      name: file.name,
      mimeType: file.type,
      sizeBytes: file.size,
    };
  },
};
