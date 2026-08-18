// Follow Deno runtime syntax for Supabase Edge Functions
// This function handles AI doubt solving using Google Gemini API

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.98.0";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// System prompts for different subjects
const SYSTEM_PROMPTS: Record<string, string> = {
  mathematics:
    "You are a helpful mathematics tutor. Explain mathematical concepts step-by-step and show calculations clearly. Use age-appropriate language. For Class 9 students, keep explanations at their level unless they ask for advanced content.",
  science:
    "You are a helpful science tutor. Explain scientific concepts accurately using simple language and examples. Avoid fabricated facts. For Class 9 students, keep explanations at their level.",
  social_science:
    "You are a helpful social science tutor. Explain historical events, geographical concepts, and civics topics clearly with relevant examples. Use age-appropriate language.",
  english:
    "You are a helpful English tutor. Explain grammar, vocabulary, literature, and writing clearly. Provide examples where helpful.",
  hindi:
    "You are a helpful Hindi tutor. Explain grammar, vocabulary, and literature clearly. Respond in Hindi when appropriate or mix Hindi-English if the question is in Hinglish.",
  computer:
    "You are a helpful computer science/AI tutor. Explain programming concepts, algorithms, and technology clearly. Provide working code examples where relevant and explain important lines.",
  general:
    "You are a helpful academic tutor. Explain concepts clearly using age-appropriate language. Prefer step-by-step reasoning for educational questions. Give examples and encourage understanding.",
};

interface RequestBody {
  message: string;
  subject: string;
  class_level: string;
  conversation_id?: string;
  image_url?: string;
  image_data?: {
    mime_type: string;
    data: string;
  };
}

serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  try {
    // Verify authentication
    const authHeader = req.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      {
        global: {
          headers: { Authorization: authHeader },
        },
      }
    );

    // Get user from token
    const {
      data: { user },
      error: userError,
    } = await supabaseClient.auth.getUser();

    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Invalid authentication" }), {
        status: 401,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    // Parse request body
    const body: RequestBody = await req.json();
    const { message, subject, class_level, conversation_id, image_url, image_data } = body;

    // Validate input
    if (!message || message.trim().length === 0) {
      return new Response(JSON.stringify({ error: "Message is required" }), {
        status: 400,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    // Rate limiting check - count requests in last minute
    const oneMinuteAgo = new Date(Date.now() - 60000).toISOString();
    const { count, error: countError } = await supabaseClient
      .from("ai_messages")
      .select("*", { count: "exact", head: true })
      .eq("user_id", user.id)
      .gte("created_at", oneMinuteAgo);

    if (!countError && count !== null && count >= 10) {
      return new Response(JSON.stringify({ error: "Rate limit exceeded. Please wait a moment." }), {
        status: 429,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    // Get Gemini API key from secrets
    const geminiApiKey = Deno.env.get("GEMINI_API_KEY");
    if (!geminiApiKey) {
      console.error("GEMINI_API_KEY not configured");
      return new Response(JSON.stringify({ error: "AI service not configured" }), {
        status: 500,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    // Build system prompt based on subject and class level
    let systemPrompt = SYSTEM_PROMPTS[subject] || SYSTEM_PROMPTS.general;

    if (class_level === "class_9") {
      systemPrompt +=
        " The student is in Class 9 (approximately 14-15 years old). Tailor your explanation to this level. Avoid overly complex terminology unless necessary, and explain any advanced terms you do use.";
    }

    // Build conversation history for context (last 10 messages)
    let conversationHistory = [];
    if (conversation_id) {
      const { data: messages, error: msgError } = await supabaseClient
        .from("ai_messages")
        .select("role, content")
        .eq("conversation_id", conversation_id)
        .order("created_at", { ascending: true })
        .limit(10);

      if (!msgError && messages) {
        conversationHistory = messages.map((m) => ({
          role: m.role === "user" ? "user" : "model",
          parts: [{ text: m.content }],
        }));
      }
    }

    // Build the user content parts array
    const userContentParts: Array<{ text?: string; inline_data?: { mime_type: string; data: string } }> = [];
    
    // Add the text question
    userContentParts.push({ text: `Student's question: ${message}` });
    
    // Add image if provided via image_data (preferred method)
    if (image_data && image_data.data) {
      userContentParts.push({
        inline_data: {
          mime_type: image_data.mime_type || "image/jpeg",
          data: image_data.data,
        },
      });
    } else if (image_url) {
      // Fallback: fetch image from URL and convert to base64
      try {
        const imageResponse = await fetch(image_url);
        if (imageResponse.ok) {
          const contentType = imageResponse.headers.get("content-type") || "image/jpeg";
          const arrayBuffer = await imageResponse.arrayBuffer();
          const base64Data = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));
          userContentParts.push({
            inline_data: {
              mime_type: contentType,
              data: base64Data,
            },
          });
        }
      } catch (imgErr) {
        console.warn("Failed to fetch image from URL:", imgErr);
        // Continue without image if fetch fails
      }
    }

    // Call Gemini API using the official format
    // Using gemini-1.5-flash as it's stable and supports multimodal input
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiApiKey}`;

    const geminiPayload = {
      contents: [
        {
          role: "user",
          parts: userContentParts,
        },
        ...conversationHistory,
      ],
      systemInstruction: {
        parts: [{ text: systemPrompt }],
      },
      generationConfig: {
        temperature: 0.7,
        topK: 40,
        topP: 0.95,
        maxOutputTokens: 2048,
      },
    };

    const geminiResponse = await fetch(geminiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(geminiPayload),
    });

    if (!geminiResponse.ok) {
      const errorData = await geminiResponse.json().catch(() => ({}));
      console.error("Gemini API error:", errorData);
      return new Response(JSON.stringify({ error: "AI service temporarily unavailable" }), {
        status: 503,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    const geminiData = await geminiResponse.json();

    // Extract response text
    let aiResponse = "";
    if (geminiData.candidates && geminiData.candidates[0]?.content?.parts) {
      aiResponse = geminiData.candidates[0].content.parts
        .map((p: { text?: string }) => p.text)
        .filter(Boolean)
        .join("\n");
    }

    if (!aiResponse) {
      aiResponse = "I apologize, but I couldn't generate a response. Please try rephrasing your question.";
    }

    // Return response
    return new Response(
      JSON.stringify({
        response: aiResponse,
        conversation_id: conversation_id || "",
      }),
      {
        status: 200,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Edge function error:", error);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }
});
