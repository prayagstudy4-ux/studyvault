import type { SupabaseClient } from "@supabase/supabase-js";
import { BUCKET_ID, requireClient } from "../lib/supabase";
import { MAX_PDF_BYTES, isPdfFile, sanitizeName, uniqueName } from "../lib/utils";
import { insertFileRow, removeFileRow } from "./db";
import type { FileItem } from "../types";

export class UploadError extends Error {}

/**
 * POST the object to the Storage REST API with XHR so we get genuine
 * `upload.onprogress` events (the bundled storage-js exposes none).
 * Same endpoint and auth storage-js itself uses — scoped to the user's session.
 */
function uploadWithProgress(
  sb: SupabaseClient,
  storagePath: string,
  file: File,
  onProgress: (percent: number) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    void (async () => {
      try {
        const { data } = await sb.auth.getSession();
        const session = data.session;
        if (!session) {
          reject(new UploadError("Your session has expired. Please sign in again."));
          return;
        }
        const base = (import.meta.env.VITE_SUPABASE_URL ?? "").replace(/\/$/, "");
        const encodedPath = storagePath.split("/").map(encodeURIComponent).join("/");
        const xhr = new XMLHttpRequest();
        xhr.open("POST", `${base}/storage/v1/object/${BUCKET_ID}/${encodedPath}`);
        xhr.setRequestHeader("Authorization", `Bearer ${session.access_token}`);
        xhr.setRequestHeader("apikey", import.meta.env.VITE_SUPABASE_ANON_KEY ?? "");
        xhr.setRequestHeader("Content-Type", "application/pdf");
        xhr.setRequestHeader("x-upsert", "false");
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable && e.total > 0) {
            onProgress(Math.min(99, Math.round((e.loaded / e.total) * 100)));
          }
        };
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve();
          } else {
            let message = "Unable to upload the PDF. Please check your connection and try again.";
            try {
              const parsed = JSON.parse(xhr.responseText) as { message?: string; statusCode?: string };
              if (parsed.statusCode === "413" || /size/i.test(parsed.message ?? "")) {
                message = "This file is too large. Maximum allowed size is 50 MB.";
              } else if (parsed.message) {
                message = parsed.message;
              }
            } catch {
              /* keep default */
            }
            reject(new UploadError(message));
          }
        };
        xhr.onerror = () => reject(new UploadError("Network error — the upload did not complete. Please try again."));
        xhr.onabort = () => reject(new UploadError("Upload cancelled."));
        xhr.send(file);
      } catch (err) {
        reject(err instanceof Error ? err : new UploadError("Unable to upload the PDF."));
      }
    })();
  });
}

/**
 * Upload a PDF into the private bucket at `workspace/folder/fileId/name.pdf`,
 * registering the metadata row first and cleaning up if the transfer fails.
 */
export async function uploadPdf(
  workspaceId: string,
  folderId: string | null,
  file: File,
  existingNames: string[],
  onProgress: (percent: number) => void
): Promise<FileItem> {
  const sb = requireClient();

  if (!isPdfFile(file)) {
    throw new UploadError("Only PDF files are supported.");
  }
  if (file.size > MAX_PDF_BYTES) {
    throw new UploadError("This file is too large. Maximum allowed size is 50 MB.");
  }
  if (file.size === 0) {
    throw new UploadError("That file is empty — nothing to upload.");
  }

  const fileId = crypto.randomUUID();
  const name = uniqueName(sanitizeName(file.name.replace(/\.pdf$/i, "")) + ".pdf", existingNames);
  const storagePath = `${workspaceId}/${folderId ?? "root"}/${fileId}/${name}`;

  // Register metadata first so the row exists even if the UI is closed mid-upload.
  const row = await insertFileRow({
    id: fileId,
    workspace_id: workspaceId,
    folder_id: folderId,
    name,
    storage_path: storagePath,
    mime_type: "application/pdf",
    file_size: file.size,
  });

  try {
    await uploadWithProgress(sb, storagePath, file, onProgress);
    onProgress(100);
    return row;
  } catch (err) {
    // Keep the tables and the bucket consistent.
    await removeFileRow(fileId).catch(() => undefined);
    throw err;
  }
}

/** Short-lived signed URL (10 minutes) — never a public link. */
export async function getSignedUrl(storagePath: string, seconds = 600): Promise<string> {
  const sb = requireClient();
  const { data, error } = await sb.storage.from(BUCKET_ID).createSignedUrl(storagePath, seconds);
  if (error) throw error;
  return data.signedUrl;
}

/** Streams the PDF through a signed URL and triggers a browser download with the original name. */
export async function downloadFile(file: FileItem): Promise<void> {
  const url = await getSignedUrl(file.storage_path, 300);
  const res = await fetch(url);
  if (!res.ok) throw new Error("Download failed. The file may have been removed.");
  const blob = await res.blob();
  const blobUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = blobUrl;
  a.download = file.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(blobUrl), 4000);
}

/** Fetch a PDF as an ArrayBuffer via signed URL (for the in-app viewer). */
export async function fetchPdfData(storagePath: string): Promise<ArrayBuffer> {
  const url = await getSignedUrl(storagePath, 600);
  const res = await fetch(url);
  if (!res.ok) throw new Error("Unable to load this PDF. It may have been deleted from storage.");
  const blob = await res.blob();
  return blob.arrayBuffer();
}

/** Permanently remove a storage object (used for purge + failed uploads). */
export async function removeStorageObject(storagePath: string): Promise<void> {
  const sb = requireClient();
  await sb.storage.from(BUCKET_ID).remove([storagePath]);
}
