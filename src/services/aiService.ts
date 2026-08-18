import { requireClient } from "../lib/supabase";
import type { AIConversation, AIMessage, AISubject, AIClassLevel, AIResponse } from "../types";

const EDGE_FUNCTION_URL = "/ai-doubt-solver";

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
 * Call the Supabase Edge Function to get an AI response.
 * The edge function handles authentication, rate limiting, and Gemini API calls.
 */
export async function askAI(
  message: string,
  subject: AISubject,
  classLevel: AIClassLevel,
  conversationId?: string,
  imageUrl?: string,
  imageData?: { mime_type: string; data: string }
): Promise<AIResponse> {
  const sb = requireClient();
  const {
    data: { session },
  } = await sb.auth.getSession();

  if (!session) {
    throw new Error("You must be signed in to use AI Doubt Solver.");
  }

  // Get the project URL from environment
  const supabaseUrl = getSupabaseUrl();
  const functionsUrl = `${supabaseUrl}/functions/v1`;

  const requestBody: any = {
    message,
    subject,
    class_level: classLevel,
    conversation_id: conversationId,
  };

  // Only include image_url if we don't have image_data (image_data is preferred)
  if (imageData) {
    requestBody.image_data = imageData;
  } else if (imageUrl) {
    requestBody.image_url = imageUrl;
  }

  const response = await fetch(`${functionsUrl}${EDGE_FUNCTION_URL}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    if (response.status === 429) {
      throw new Error("Too many requests. Please wait a moment before asking another question.");
    }
    if (response.status === 401) {
      throw new Error("Authentication failed. Please sign in again.");
    }
    throw new Error(errorData.error || "AI service is temporarily unavailable. Please try again.");
  }

  const data = await response.json();
  return data as AIResponse;
}

/**
 * Get all conversations for the current user.
 */
export async function getConversations(): Promise<AIConversation[]> {
  const sb = requireClient();
  const { data, error } = await sb
    .from("ai_conversations")
    .select("*")
    .order("updated_at", { ascending: false });

  if (error) throw error;
  return (data ?? []) as AIConversation[];
}

/**
 * Get a single conversation with its messages.
 */
export async function getConversationWithMessages(conversationId: string): Promise<{
  conversation: AIConversation | null;
  messages: AIMessage[];
}> {
  const sb = requireClient();

  const [{ data: conversation, error: convError }, { data: messages, error: msgError }] = await Promise.all([
    sb.from("ai_conversations").select("*").eq("id", conversationId).maybeSingle(),
    sb.from("ai_messages").select("*").eq("conversation_id", conversationId).order("created_at", { ascending: true }),
  ]);

  if (convError) throw convError;
  if (msgError) throw msgError;

  return {
    conversation: conversation as AIConversation | null,
    messages: (messages ?? []) as AIMessage[],
  };
}

/**
 * Create a new conversation.
 */
export async function createConversation(
  title: string,
  subject: AISubject,
  classLevel: AIClassLevel
): Promise<AIConversation> {
  const sb = requireClient();
  const { data, error } = await sb
    .from("ai_conversations")
    .insert({
      title,
      subject,
      class_level: classLevel,
    })
    .select()
    .single();

  if (error) throw error;
  return data as AIConversation;
}

/**
 * Update conversation title.
 */
export async function updateConversationTitle(conversationId: string, title: string): Promise<void> {
  const sb = requireClient();
  const { error } = await sb
    .from("ai_conversations")
    .update({ title, updated_at: new Date().toISOString() })
    .eq("id", conversationId);

  if (error) throw error;
}

/**
 * Delete a conversation (and its messages via cascade).
 */
export async function deleteConversation(conversationId: string): Promise<void> {
  const sb = requireClient();
  const { error } = await sb.from("ai_conversations").delete().eq("id", conversationId);

  if (error) throw error;
}

/**
 * Add a user message to a conversation.
 */
export async function addUserMessage(
  conversationId: string,
  content: string,
  imageUrl?: string | null
): Promise<AIMessage> {
  const sb = requireClient();
  const { data, error } = await sb
    .from("ai_messages")
    .insert({
      conversation_id: conversationId,
      role: "user",
      content,
      image_url: imageUrl ?? null,
    })
    .select()
    .single();

  if (error) throw error;
  return data as AIMessage;
}

/**
 * Add an assistant message to a conversation.
 */
export async function addAssistantMessage(
  conversationId: string,
  content: string
): Promise<AIMessage> {
  const sb = requireClient();
  const { data, error } = await sb
    .from("ai_messages")
    .insert({
      conversation_id: conversationId,
      role: "assistant",
      content,
    })
    .select()
    .single();

  if (error) throw error;
  return data as AIMessage;
}

/**
 * Upload an image to Supabase Storage for AI analysis.
 */
export async function uploadAIImage(file: File): Promise<string> {
  const sb = requireClient();
  const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}-${file.name}`;
  const storagePath = `ai-images/${fileName}`;

  const { error: uploadError, data } = await sb.storage
    .from("studyvault")
    .upload(storagePath, file, {
      cacheControl: "3600",
      upsert: false,
    });

  if (uploadError) throw uploadError;

  const {
    data: { publicUrl },
  } = sb.storage.from("studyvault").getPublicUrl(storagePath);

  return publicUrl;
}

/**
 * Convert an image file to base64 for sending to the Edge Function.
 */
export async function imageToBase64(file: File): Promise<{ mime_type: string; data: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64Data = result.split(',')[1]; // Remove data:image/jpeg;base64, prefix
      resolve({
        mime_type: file.type || 'image/jpeg',
        data: base64Data,
      });
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
