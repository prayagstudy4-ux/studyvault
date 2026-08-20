import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.98.0";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const MAX_SOURCE_BYTES = 10 * 1024 * 1024;
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_DRIVE_API_BASE = "https://www.googleapis.com/drive/v3";

type NoteFormat = "structured" | "revision" | "flashcards";
type SourceType = "topic" | "text" | "file";
interface RequestBody {
  workspace_id: string;
  format: NoteFormat;
  source_type: SourceType;
  source_text?: string;
  source_file_id?: string;
}

function error(message: string, status: number): Response {
  return new Response(JSON.stringify({ error: message }), { status, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });
}

function formatPrompt(format: NoteFormat): string {
  if (format === "revision") return "Create concise, exam-focused revision notes using headings and high-value bullet points. Include a short memory aid where useful.";
  if (format === "flashcards") return "Create a set of clear flashcards in Markdown. Use one `## Question` heading followed by its answer for every card.";
  return "Create structured study notes in Markdown with a title, clear headings, key points, examples where helpful, and a short recap.";
}

function base64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(binary);
}

async function googleAccessToken(): Promise<string> {
  const clientId = Deno.env.get("GOOGLE_CLIENT_ID");
  const clientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET");
  const refreshToken = Deno.env.get("GOOGLE_REFRESH_TOKEN");
  if (!clientId || !clientSecret || !refreshToken) throw new Error("Google Drive is not configured");
  const response = await fetch(GOOGLE_TOKEN_URL, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, refresh_token: refreshToken, grant_type: "refresh_token" }) });
  if (!response.ok) throw new Error("Could not access the selected Drive file");
  return (await response.json()).access_token;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (req.method !== "POST") return error("Method not allowed", 405);
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return error("Unauthorized", 401);
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) return error("Invalid authentication", 401);

    const body = await req.json() as RequestBody;
    if (!body.workspace_id || !["structured", "revision", "flashcards"].includes(body.format) || !["topic", "text", "file"].includes(body.source_type)) return error("Invalid note request", 400);
    if ((body.source_type === "file" && !body.source_file_id) || (body.source_type !== "file" && !body.source_text?.trim())) return error("A source is required", 400);
    if (body.source_text && body.source_text.length > 50000) return error("Pasted material is too long (maximum 50,000 characters).", 400);

    const { data: membership } = await userClient.from("workspace_members").select("workspace_id").eq("workspace_id", body.workspace_id).eq("user_id", user.id).maybeSingle();
    if (!membership) return error("You do not have access to this workspace", 403);

    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!serviceKey) return error("AI service is not configured", 503);
    const adminClient = createClient(supabaseUrl, serviceKey);
    const oneMinuteAgo = new Date(Date.now() - 60_000).toISOString();
    const { count } = await adminClient.from("ai_note_requests").select("*", { count: "exact", head: true }).eq("user_id", user.id).gte("created_at", oneMinuteAgo);
    if ((count ?? 0) >= 10) return error("Rate limit exceeded. Please wait a moment.", 429);
    await adminClient.from("ai_note_requests").insert({ user_id: user.id });

    let sourceDescription = body.source_text?.trim() ?? "";
    const parts: Array<{ text?: string; inline_data?: { mime_type: string; data: string } }> = [];
    if (body.source_type === "file") {
      const { data: file } = await userClient.from("files").select("id, workspace_id, name, mime_type, file_size, storage_path, drive_file_id, deleted_at").eq("id", body.source_file_id).maybeSingle();
      if (!file || file.workspace_id !== body.workspace_id || file.deleted_at || !(file.mime_type === "application/pdf" || file.mime_type.startsWith("image/"))) return error("That source file is unavailable or unsupported.", 400);
      if (file.file_size > MAX_SOURCE_BYTES) return error("Source files must be 10 MB or smaller for AI Notes.", 400);
      let data: Uint8Array;
      if (file.drive_file_id) {
        const token = await googleAccessToken();
        const download = await fetch(`${GOOGLE_DRIVE_API_BASE}/files/${file.drive_file_id}?alt=media`, { headers: { Authorization: `Bearer ${token}` } });
        if (!download.ok) return error("Could not read the selected Drive file.", 503);
        data = new Uint8Array(await download.arrayBuffer());
      } else {
        const { data: blob, error: downloadError } = await userClient.storage.from("studyvault").download(file.storage_path);
        if (downloadError || !blob) return error("Could not read the selected file.", 503);
        data = new Uint8Array(await blob.arrayBuffer());
      }
      if (data.byteLength > MAX_SOURCE_BYTES) return error("Source files must be 10 MB or smaller for AI Notes.", 400);
      sourceDescription = `the workspace file “${file.name}”`;
      parts.push({ text: `Create notes from ${sourceDescription}.` }, { inline_data: { mime_type: file.mime_type, data: base64(data) } });
    } else {
      const label = body.source_type === "topic" ? "topic" : "study material";
      parts.push({ text: `Create notes from this ${label}:\n\n${sourceDescription}` });
    }

    const geminiApiKey = Deno.env.get("GEMINI_API_KEY");
    if (!geminiApiKey) return error("AI service is not configured", 503);
    const prompt = `You are a careful educational note-making assistant. ${formatPrompt(body.format)} Use accurate, student-friendly language. Do not invent details not present in the source. Return only the Markdown note content, beginning with a level-one title.`;
    const gemini = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiApiKey}`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ role: "user", parts }], systemInstruction: { parts: [{ text: prompt }] }, generationConfig: { temperature: 0.4, maxOutputTokens: 4096 } }),
    });
    if (!gemini.ok) return error("AI service temporarily unavailable", 503);
    const result = await gemini.json();
    const content = result.candidates?.[0]?.content?.parts?.map((part: { text?: string }) => part.text ?? "").join("\n").trim();
    if (!content) return error("AI could not generate notes from that source.", 503);
    const title = content.match(/^#\s+(.+)$/m)?.[1]?.trim().slice(0, 160) || (body.source_type === "topic" ? sourceDescription.slice(0, 160) : "AI study notes");
    return new Response(JSON.stringify({ title, content }), { headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });
  } catch (cause) {
    console.error("AI Notes error", cause);
    return error("Internal server error", 500);
  }
});
