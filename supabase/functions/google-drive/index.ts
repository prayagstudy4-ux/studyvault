// Supabase Edge Function for Google Drive Storage Integration
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.98.0";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_DRIVE_API_BASE = "https://www.googleapis.com/drive/v3";
const GOOGLE_UPLOAD_BASE = "https://www.googleapis.com/upload/drive/v3";
const STUDYVAULT_ROOT_NAME = "StudyVault";

interface RequestBody {
  operation: "upload" | "list" | "delete" | "create-folder" | "get-download-url" | "proxy-download";
  workspace_id?: string;
  class_level?: string;
  subject?: string;
  file_name?: string;
  mime_type?: string;
  drive_file_id?: string;
  drive_folder_id?: string;
  file_data?: string;
  folder_name?: string;
  parent_folder_id?: string | null;
}

async function getGoogleAccessToken(): Promise<string> {
  const clientId = Deno.env.get("GOOGLE_CLIENT_ID");
  const clientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET");
  const refreshToken = Deno.env.get("GOOGLE_REFRESH_TOKEN");
  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error("Google credentials not configured");
  }
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  if (!response.ok) throw new Error("Failed to obtain Google access token");
  const data = await response.json();
  return data.access_token;
}

async function findOrCreateFolder(accessToken: string, parentFolderId: string | null, folderName: string): Promise<string> {
  const q = parentFolderId
    ? `name='${folderName}' and mimeType='application/vnd.google-apps.folder' and '${parentFolderId}' in parents and trashed=false`
    : `name='${folderName}' and mimeType='application/vnd.google-apps.folder' and 'root' in parents and trashed=false`;
  const searchUrl = `${GOOGLE_DRIVE_API_BASE}/files?q=${encodeURIComponent(q)}&fields=files(id,name)`;
  const searchResponse = await fetch(searchUrl, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!searchResponse.ok) throw new Error("Failed to search Google Drive folders");
  const searchData = await searchResponse.json();
  if (searchData.files && searchData.files.length > 0) return searchData.files[0].id;
  const createResponse = await fetch(`${GOOGLE_DRIVE_API_BASE}/files`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ name: folderName, mimeType: "application/vnd.google-apps.folder", parents: parentFolderId ? [parentFolderId] : [] }),
  });
  if (!createResponse.ok) throw new Error("Failed to create Google Drive folder");
  const createData = await createResponse.json();
  return createData.id;
}

async function getOrCreatePathFolders(accessToken: string, classLevel: string, subject: string): Promise<{ rootFolderId: string; classFolderId: string; subjectFolderId: string }> {
  const rootFolderId = await findOrCreateFolder(accessToken, null, STUDYVAULT_ROOT_NAME);
  const className = classLevel.replace(/_/g, " ").replace(/\b\w/g, (l: string) => l.toUpperCase());
  const classFolderId = await findOrCreateFolder(accessToken, rootFolderId, className);
  const subjectName = subject.replace(/_/g, " ").replace(/\b\w/g, (l: string) => l.toUpperCase());
  const subjectFolderId = await findOrCreateFolder(accessToken, classFolderId, subjectName);
  return { rootFolderId, classFolderId, subjectFolderId };
}

async function uploadFileToDrive(accessToken: string, fileName: string, mimeType: string, fileData: ArrayBuffer, parentFolderId: string): Promise<{ fileId: string; webViewLink: string }> {
  const boundary = "studyvault_" + Date.now();
  const metadata = { name: fileName, parents: [parentFolderId] };
  const requestBody = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`;
  const requestBodyBytes = new TextEncoder().encode(requestBody);
  const trailerBytes = new TextEncoder().encode(`\r\n--${boundary}--`);
  const combinedLength = requestBodyBytes.byteLength + fileData.byteLength + trailerBytes.byteLength;
  const combinedData = new Uint8Array(combinedLength);
  combinedData.set(requestBodyBytes, 0);
  combinedData.set(new Uint8Array(fileData), requestBodyBytes.byteLength);
  combinedData.set(trailerBytes, requestBodyBytes.byteLength + fileData.byteLength);
  const uploadUrl = `${GOOGLE_UPLOAD_BASE}/files?uploadType=multipart`;
  const uploadResponse = await fetch(uploadUrl, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": `multipart/related; boundary="${boundary}"` },
    body: combinedData,
  });
  if (!uploadResponse.ok) throw new Error("Failed to upload file to Google Drive");
  const uploadData = await uploadResponse.json();
  return { fileId: uploadData.id, webViewLink: uploadData.webViewLink };
}

async function deleteFileFromDrive(accessToken: string, fileId: string): Promise<void> {
  const deleteUrl = `${GOOGLE_DRIVE_API_BASE}/files/${fileId}`;
  const deleteResponse = await fetch(deleteUrl, { method: "DELETE", headers: { Authorization: `Bearer ${accessToken}` } });
  if (!deleteResponse.ok && deleteResponse.status !== 404) throw new Error("Failed to delete file from Google Drive");
}

async function proxyFileDownload(accessToken: string, fileId: string): Promise<Response> {
  const downloadUrl = `${GOOGLE_DRIVE_API_BASE}/files/${fileId}?alt=media`;
  const response = await fetch(downloadUrl, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!response.ok) throw new Error("Failed to download file from Google Drive");
  const metaUrl = `${GOOGLE_DRIVE_API_BASE}/files/${fileId}?fields=mimeType,name`;
  const metaResponse = await fetch(metaUrl, { headers: { Authorization: `Bearer ${accessToken}` } });
  let contentType = "application/octet-stream";
  let fileName = "download";
  if (metaResponse.ok) {
    const metaData = await metaResponse.json();
    contentType = metaData.mimeType || "application/octet-stream";
    fileName = metaData.name || "download";
  }
  return new Response(response.body, { headers: { "Content-Type": contentType, "Content-Disposition": `attachment; filename="${fileName}"` } });
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });
    }
    const supabaseClient = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_ANON_KEY") ?? "", { global: { headers: { Authorization: authHeader } } });
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Invalid authentication" }), { status: 401, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });
    }
    const body: RequestBody = await req.json();
    const { operation } = body;
    let accessToken: string;
    try {
      accessToken = await getGoogleAccessToken();
    } catch {
      return new Response(JSON.stringify({ error: "Storage service temporarily unavailable" }), { status: 503, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });
    }
    switch (operation) {
      case "upload": {
        if (!body.workspace_id || !body.file_name || !body.file_data) {
          return new Response(JSON.stringify({ error: "Missing required fields" }), { status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });
        }
        const { data: membership } = await supabaseClient.from("workspace_members").select("role").eq("workspace_id", body.workspace_id).eq("user_id", user.id).maybeSingle();
        if (!membership || membership.role === "viewer") {
          return new Response(JSON.stringify({ error: "You do not have permission to upload to this workspace" }), { status: 403, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });
        }
        const classLevel = body.class_level || "general";
        const subject = body.subject || "general";
        const { subjectFolderId } = await getOrCreatePathFolders(accessToken, classLevel, subject);
        const fileDataString = body.file_data;
        const isBase64 = fileDataString.includes(",");
        const base64Data = isBase64 ? fileDataString.split(",")[1] : fileDataString;
        const mimeType = body.mime_type || "application/pdf";
        const binaryString = atob(base64Data);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i);
        const uploadResult = await uploadFileToDrive(accessToken, body.file_name, mimeType, bytes.buffer, subjectFolderId);
        return new Response(JSON.stringify({ success: true, drive_file_id: uploadResult.fileId, drive_folder_id: subjectFolderId }), { status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });
      }
      case "delete": {
        if (!body.drive_file_id) {
          return new Response(JSON.stringify({ error: "Missing drive_file_id" }), { status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });
        }
        await deleteFileFromDrive(accessToken, body.drive_file_id);
        return new Response(JSON.stringify({ success: true }), { status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });
      }
      case "get-download-url": {
        if (!body.drive_file_id) {
          return new Response(JSON.stringify({ error: "Missing drive_file_id" }), { status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });
        }
        const downloadUrl = `https://www.googleapis.com/drive/v3/files/${body.drive_file_id}?alt=media`;
        return new Response(JSON.stringify({ download_url: downloadUrl, requires_auth: true }), { status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });
      }
      case "proxy-download": {
        if (!body.drive_file_id) {
          return new Response(JSON.stringify({ error: "Missing drive_file_id" }), { status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });
        }
        return await proxyFileDownload(accessToken, body.drive_file_id);
      }
      case "list": {
        if (!body.drive_folder_id) {
          return new Response(JSON.stringify({ error: "Missing drive_folder_id" }), { status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });
        }
        const q = `'${body.drive_folder_id}' in parents and trashed=false`;
        const listUrl = `${GOOGLE_DRIVE_API_BASE}/files?q=${encodeURIComponent(q)}&fields=files(id,name,mimeType,size,createdTime,modifiedTime)`;
        const listResponse = await fetch(listUrl, { headers: { Authorization: `Bearer ${accessToken}` } });
        if (!listResponse.ok) throw new Error("Failed to list files from Google Drive");
        const listData = await listResponse.json();
        return new Response(JSON.stringify({ files: listData.files || [] }), { status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });
      }
      case "create-folder": {
        if (!body.folder_name) {
          return new Response(JSON.stringify({ error: "Missing folder_name" }), { status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });
        }
        const folderId = await findOrCreateFolder(accessToken, body.parent_folder_id || null, body.folder_name);
        return new Response(JSON.stringify({ folder_id: folderId }), { status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });
      }
      default:
        return new Response(JSON.stringify({ error: "Unknown operation" }), { status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });
    }
  } catch (error) {
    console.error("Edge function error:", error);
    return new Response(JSON.stringify({ error: "Internal server error" }), { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });
  }
});
