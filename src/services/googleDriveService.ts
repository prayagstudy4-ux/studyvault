import { requireClient } from "../lib/supabase";
import type { FileItem } from "../types";

const EDGE_FUNCTION_PATH = "/google-drive";

/**
 * Get the Supabase project URL from environment.
 */
function getSupabaseUrl(): string {
  const url = import.meta.env.VITE_SUPABASE_URL;
  if (!url) {
    throw new Error("VITE_SUPABASE_URL is not configured");
  }
  return url.replace(/\/$/, ""); // Remove trailing slash
}

/**
 * Upload a file to Google Drive via the Edge Function.
 * Returns the Google Drive file ID and folder ID.
 */
export async function uploadToGoogleDrive(
  workspaceId: string,
  fileName: string,
  fileData: ArrayBuffer | string,
  mimeType: string,
  classLevel: string,
  subject: string
): Promise<{ drive_file_id: string; drive_folder_id: string }> {
  const sb = requireClient();
  const {
    data: { session },
  } = await sb.auth.getSession();

  if (!session) {
    throw new Error("You must be signed in to upload files.");
  }

  const supabaseUrl = getSupabaseUrl();
  const functionsUrl = `${supabaseUrl}/functions/v1`;

  // Convert ArrayBuffer to base64 if needed
  let base64Data: string;
  if (fileData instanceof ArrayBuffer) {
    const bytes = new Uint8Array(fileData);
    let binary = "";
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    base64Data = btoa(binary);
  } else {
    // Already a string, might be base64 with or without data URL prefix
    base64Data = fileData.includes(",") ? fileData.split(",")[1] : fileData;
  }

  const response = await fetch(`${functionsUrl}${EDGE_FUNCTION_PATH}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({
      operation: "upload",
      workspace_id: workspaceId,
      file_name: fileName,
      file_data: base64Data,
      mime_type: mimeType,
      class_level: classLevel,
      subject: subject,
    }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    if (response.status === 401) {
      throw new Error("Authentication failed. Please sign in again.");
    }
    if (response.status === 403) {
      throw new Error("You do not have permission to upload to this workspace.");
    }
    if (response.status === 503) {
      throw new Error("Storage service temporarily unavailable. Please try again.");
    }
    throw new Error(errorData.error || "Failed to upload file to storage.");
  }

  const data = await response.json();
  
  if (!data.success || !data.drive_file_id) {
    throw new Error("Upload completed but did not return file information.");
  }

  return {
    drive_file_id: data.drive_file_id,
    drive_folder_id: data.drive_folder_id,
  };
}

/**
 * Delete a file from Google Drive via the Edge Function.
 */
export async function deleteFromGoogleDrive(driveFileId: string): Promise<void> {
  const sb = requireClient();
  const {
    data: { session },
  } = await sb.auth.getSession();

  if (!session) {
    throw new Error("You must be signed in to delete files.");
  }

  const supabaseUrl = getSupabaseUrl();
  const functionsUrl = `${supabaseUrl}/functions/v1`;

  const response = await fetch(`${functionsUrl}${EDGE_FUNCTION_PATH}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({
      operation: "delete",
      drive_file_id: driveFileId,
    }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    if (response.status === 401) {
      throw new Error("Authentication failed. Please sign in again.");
    }
    throw new Error(errorData.error || "Failed to delete file from storage.");
  }
}

/**
 * Get a download URL for a Google Drive file.
 * This URL requires authentication to access.
 */
export async function getGoogleDriveDownloadUrl(driveFileId: string): Promise<{ download_url: string; requires_auth: boolean }> {
  const sb = requireClient();
  const {
    data: { session },
  } = await sb.auth.getSession();

  if (!session) {
    throw new Error("You must be signed in to access files.");
  }

  const supabaseUrl = getSupabaseUrl();
  const functionsUrl = `${supabaseUrl}/functions/v1`;

  const response = await fetch(`${functionsUrl}${EDGE_FUNCTION_PATH}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({
      operation: "get-download-url",
      drive_file_id: driveFileId,
    }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    if (response.status === 401) {
      throw new Error("Authentication failed. Please sign in again.");
    }
    throw new Error(errorData.error || "Failed to get download URL.");
  }

  const data = await response.json();
  return data;
}

/**
 * Fetch PDF data from Google Drive via the Edge Function proxy.
 * This ensures secure, authenticated access.
 */
export async function fetchPdfFromGoogleDrive(driveFileId: string): Promise<ArrayBuffer> {
  const sb = requireClient();
  const {
    data: { session },
  } = await sb.auth.getSession();

  if (!session) {
    throw new Error("You must be signed in to access files.");
  }

  const supabaseUrl = getSupabaseUrl();
  const functionsUrl = `${supabaseUrl}/functions/v1`;

  const response = await fetch(`${functionsUrl}${EDGE_FUNCTION_PATH}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({
      operation: "proxy-download",
      drive_file_id: driveFileId,
    }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    if (response.status === 401) {
      throw new Error("Authentication failed. Please sign in again.");
    }
    throw new Error(errorData.error || "Failed to download file.");
  }

  return await response.arrayBuffer();
}
