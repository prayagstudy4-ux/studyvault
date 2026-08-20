import { requireClient } from "../lib/supabase";
import type { AINote, FileItem, GenerateAINoteRequest, GenerateAINoteResponse } from "../types";

function functionsUrl(): string {
  const url = import.meta.env.VITE_SUPABASE_URL;
  if (!url) throw new Error("VITE_SUPABASE_URL is not configured");
  return `${url.replace(/\/$/, "")}/functions/v1`;
}

export async function getAINotes(workspaceId: string): Promise<AINote[]> {
  const sb = requireClient();
  const { data, error } = await sb.from("ai_notes").select("*").eq("workspace_id", workspaceId).order("updated_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as AINote[];
}

export async function getAINoteSourceFiles(workspaceId: string): Promise<FileItem[]> {
  const sb = requireClient();
  const { data, error } = await sb
    .from("files")
    .select("*")
    .eq("workspace_id", workspaceId)
    .is("deleted_at", null)
    .or("mime_type.eq.application/pdf,mime_type.like.image/%")
    .order("name");
  if (error) throw error;
  return (data ?? []) as FileItem[];
}

export async function generateAINote(request: GenerateAINoteRequest): Promise<GenerateAINoteResponse> {
  const sb = requireClient();
  const { data: { session } } = await sb.auth.getSession();
  if (!session) throw new Error("You must be signed in to generate notes.");
  const response = await fetch(`${functionsUrl()}/ai-notes`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
    body: JSON.stringify(request),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 429) throw new Error("Too many requests. Please wait a moment before generating more notes.");
    if (response.status === 403) throw new Error("You do not have access to this workspace or source file.");
    throw new Error(data.error || "AI note generation is temporarily unavailable. Please try again.");
  }
  return data as GenerateAINoteResponse;
}

export async function createAINote(note: Omit<AINote, "id" | "created_by" | "created_at" | "updated_at">): Promise<AINote> {
  const sb = requireClient();
  const { data, error } = await sb.from("ai_notes").insert(note).select().single();
  if (error) throw error;
  return data as AINote;
}

export async function updateAINote(id: string, patch: Pick<AINote, "title" | "content">): Promise<AINote> {
  const sb = requireClient();
  const { data, error } = await sb.from("ai_notes").update(patch).eq("id", id).select().single();
  if (error) throw error;
  return data as AINote;
}

export async function deleteAINote(id: string): Promise<void> {
  const sb = requireClient();
  const { error } = await sb.from("ai_notes").delete().eq("id", id);
  if (error) throw error;
}
