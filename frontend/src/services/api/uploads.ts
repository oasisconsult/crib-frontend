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
  category: "document" | "signature" | "inspection_photo" | "property_image" | "payment_receipt" | "tenant_document" | "maintenance_photo";
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

function _presignEndpoint(options: UploadOptions): string {
  if (options.onboardingToken) return `/upload/presign/onboarding/${options.onboardingToken}`;
  if (options.category === "payment_receipt") return "/upload/presign/payment-receipt";
  if (options.category === "tenant_document") return "/upload/presign/tenant-document";
  if (options.category === "maintenance_photo") return "/upload/presign/maintenance-photo";
  return "/upload/presign";
}

export const uploadsApi = {
  getPresignedUrl: (filename: string, mimeType: string, options: UploadOptions) => {
    const { onboardingToken, ...rest } = options;
    return apiPost<PresignedUrl>(_presignEndpoint(options), { filename, mimeType, ...rest });
  },

  /**
   * Presign + direct PUT to storage. Used by tenant-role callers who cannot
   * reach the staff-only POST /upload/file proxy endpoint.
   */
  async presignAndUpload(
    file: File,
    options: UploadOptions,
    onProgress?: (percent: number) => void,
  ): Promise<UploadResult> {
    const { onboardingToken, ...rest } = options;
    const presigned = await apiPost<PresignedUrl>(_presignEndpoint(options), {
      filename: file.name,
      mimeType: file.type,
      ...rest,
    });

    await new Promise<void>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("PUT", presigned.uploadUrl);
      xhr.setRequestHeader("Content-Type", file.type);
      if (onProgress) {
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
        };
      }
      xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`Upload failed: ${xhr.status}`)));
      xhr.onerror = () => reject(new Error("Upload network error"));
      xhr.send(file);
    });

    return {
      url: presigned.publicUrl,
      key: presigned.key,
      name: file.name,
      mimeType: file.type,
      sizeBytes: file.size,
    };
  },

  async uploadMaintenancePhoto(
    file: File,
    onProgress?: (percent: number) => void,
  ): Promise<UploadResult> {
    const formData = new FormData();
    formData.append("file", file);

    const { publicUrl, key } = await apiPostForm<PresignedUrl>(
      "/upload/file/maintenance-photo",
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

  async uploadFile(
    file: File,
    options: UploadOptions,
    onProgress?: (percent: number) => void,
  ): Promise<UploadResult> {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("category", options.category);

    // Onboarding uploads use a token-gated proxy endpoint (no JWT available).
    const endpoint = options.onboardingToken
      ? `/upload/file/onboarding/${options.onboardingToken}`
      : "/upload/file";

    if (!options.onboardingToken) {
      if (options.tenantId) formData.append("tenant_id", options.tenantId);
      if (options.leaseId) formData.append("lease_id", options.leaseId);
      if (options.inspectionId) formData.append("inspection_id", options.inspectionId);
    }

    const { publicUrl, key } = await apiPostForm<PresignedUrl>(
      endpoint,
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
