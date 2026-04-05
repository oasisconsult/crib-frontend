import { apiPost } from "./client";

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
  category: "document" | "signature" | "inspection_photo" | "property_image";
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
      : "/upload/presign";
    return apiPost<PresignedUrl>(endpoint, { filename, mimeType, ...rest });
  },

  async uploadFile(
    file: File,
    options: UploadOptions,
    onProgress?: (percent: number) => void,
  ): Promise<UploadResult> {
    const { uploadUrl, publicUrl, key } = await uploadsApi.getPresignedUrl(
      file.name,
      file.type,
      options,
    );

    await new Promise<void>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("PUT", uploadUrl);
      xhr.setRequestHeader("Content-Type", file.type);

      if (onProgress) {
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) {
            onProgress(Math.round((e.loaded / e.total) * 100));
          }
        };
      }

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve();
        } else {
          reject(new Error(`Upload failed: ${xhr.statusText}`));
        }
      };
      xhr.onerror = () => reject(new Error("Upload network error"));
      xhr.send(file);
    });

    return {
      url: publicUrl,
      key,
      name: file.name,
      mimeType: file.type,
      sizeBytes: file.size,
    };
  },
};
