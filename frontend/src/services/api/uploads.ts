import { apiPost } from "./client";

interface PresignedUrl {
  uploadUrl: string;
  publicUrl: string;
  key: string;
  expiresIn: number;
}

interface UploadOptions {
  tenantId?: string;
  leaseId?: string;
  inspectionId?: string;
  category: "document" | "signature" | "inspection_photo" | "property_image";
}

export const uploadsApi = {
  getPresignedUrl: (filename: string, mimeType: string, options: UploadOptions) =>
    apiPost<PresignedUrl>("/upload/presign", { filename, mimeType, ...options }),

  async uploadFile(
    file: File,
    options: UploadOptions,
    onProgress?: (percent: number) => void,
  ): Promise<string> {
    const { uploadUrl, publicUrl } = await uploadsApi.getPresignedUrl(
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

    return publicUrl;
  },
};
