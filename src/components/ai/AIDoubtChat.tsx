import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Plus,
  MessageSquare,
  Trash2,
  MoreVertical,
  X,
  Image as ImageIcon,
  Send,
  Sparkles,
  ChevronLeft,
} from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";
import { cn } from "../../lib/utils";
import type { AIConversation, AIMessage, AISubject, AIClassLevel } from "../../types";
import {
  getConversations,
  getConversationWithMessages,
  createConversation,
  deleteConversation,
  updateConversationTitle,
  addUserMessage,
  addAssistantMessage,
  askAI,
  uploadAIImage,
  imageToBase64,
} from "../../services/aiService";
import { AIMessageBubble, AIDisclaimer, LoadingIndicator } from "./AIMessage";

const SUBJECTS: { value: AISubject; label: string }[] = [
  { value: "mathematics", label: "Mathematics" },
  { value: "science", label: "Science" },
  { value: "social_science", label: "Social Science" },
  { value: "english", label: "English" },
  { value: "hindi", label: "Hindi" },
  { value: "computer", label: "Computer / AI" },
  { value: "general", label: "General" },
];

const CLASS_LEVELS: { value: AIClassLevel; label: string }[] = [
  { value: "class_9", label: "Class 9" },
  { value: "general", label: "General" },
];

export function AIDoubtSolverPage() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [conversations, setConversations] = useState<AIConversation[]>([]);
  const [selectedConversation, setSelectedConversation] = useState<AIConversation | null>(null);
  const [messages, setMessages] = useState<AIMessage[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [selectedSubject, setSelectedSubject] = useState<AISubject>("general");
  const [selectedClass, setSelectedClass] = useState<AIClassLevel>("class_9");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSidebar, setShowSidebar] = useState(true);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Load conversations on mount
  useEffect(() => {
    loadConversations();
  }, []);

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 150)}px`;
    }
  }, [inputValue]);

  async function loadConversations() {
    try {
      const convs = await getConversations();
      setConversations(convs);
    } catch (err) {
      console.error("Failed to load conversations:", err);
    }
  }

  async function loadConversation(conversationId: string) {
    try {
      const { conversation, messages: msgs } = await getConversationWithMessages(conversationId);
      if (conversation) {
        setSelectedConversation(conversation);
        setSelectedSubject(conversation.subject);
        setSelectedClass(conversation.class_level);
      }
      setMessages(msgs);
      setShowSidebar(false);
    } catch (err) {
      console.error("Failed to load conversation:", err);
      setError("Failed to load conversation. Please try again.");
    }
  }

  async function handleNewConversation() {
    setSelectedConversation(null);
    setMessages([]);
    setInputValue("");
    setImageFile(null);
    setImagePreview(null);
    setShowSidebar(true);
    setError(null);
  }

  async function handleDeleteConversation(conversationId: string, e: React.MouseEvent) {
    e.stopPropagation();
    if (!confirm("Are you sure you want to delete this conversation?")) return;

    try {
      await deleteConversation(conversationId);
      setConversations((prev) => prev.filter((c) => c.id !== conversationId));
      if (selectedConversation?.id === conversationId) {
        handleNewConversation();
      }
    } catch (err) {
      console.error("Failed to delete conversation:", err);
      setError("Failed to delete conversation.");
    }
  }
  async function sendMessage(actionType?: string) {
    if (!inputValue.trim() && !imageFile) return;
    if (isLoading) return;

    setIsLoading(true);
    setError(null);

    let currentConversation = selectedConversation;
    let imageUrl: string | undefined;
    let imageData: { mime_type: string; data: string } | undefined;

    try {
      // Convert image to base64 if present (preferred method for Gemini)
      if (imageFile) {
        setIsUploading(true);
        // Also upload to storage for persistence in database
        imageUrl = await uploadAIImage(imageFile);
        // Convert to base64 for sending to Gemini
        imageData = await imageToBase64(imageFile);
        setIsUploading(false);
      }

      // Create conversation if needed
      if (!currentConversation) {
        const title = inputValue.trim().slice(0, 50) || "New Conversation";
        currentConversation = await createConversation(title, selectedSubject, selectedClass);
        setSelectedConversation(currentConversation);
        setConversations((prev) => [currentConversation!, ...prev]);
      }

      // Add user message
      const userMsg = await addUserMessage(currentConversation.id, inputValue.trim(), imageUrl);
      setMessages((prev) => [...prev, userMsg]);

      // Get AI response - pass image_data instead of just image_url
      const aiResponse = await askAI(
        actionType ? `${actionType}: ${inputValue.trim()}` : inputValue.trim(),
        selectedSubject,
        selectedClass,
        currentConversation.id,
        imageUrl,
        imageData
      );

      // Add assistant message
      const assistantMsg = await addAssistantMessage(currentConversation.id, aiResponse.response);
      setMessages((prev) => [...prev, assistantMsg]);

      // Update conversation timestamp
      setConversations((prev) =>
        prev.map((c) =>
          c.id === currentConversation!.id
            ? { ...c, updated_at: new Date().toISOString() }
            : c
        )
      );

      setInputValue("");
      setImageFile(null);
      setImagePreview(null);
    } catch (err) {
      console.error("Failed to send message:", err);
      setError(err instanceof Error ? err.message : "Failed to get AI response. Please try again.");
    } finally {
      setIsLoading(false);
      setIsUploading(false);
    }
  }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void sendMessage();
    }
  }

  function handleImageSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith("image/")) {
      setError("Please select a valid image file.");
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      setError("Image file must be less than 5MB.");
      return;
    }

    setImageFile(file);
    const reader = new FileReader();
    reader.onload = (e) => {
      setImagePreview(e.target?.result as string);
    };
    reader.readAsDataURL(file);
  }

  function handleAction(action: string) {
    switch (action) {
      case "simpler":
        setInputValue("Please explain the above answer in simpler language.");
        break;
      case "hint":
        setInputValue("Please give me a hint instead of the full answer.");
        break;
      case "step-by-step":
        setInputValue("Please explain step-by-step.");
        break;
      case "another-method":
        setInputValue("Is there another method to solve/explain this?");
        break;
    }
    textareaRef.current?.focus();
  }

  return (
    <div className="flex h-full overflow-hidden bg-ink-50 dark:bg-ink-950">
      {/* Conversation Sidebar */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-30 w-72 border-r border-ink-200 bg-white transition-transform dark:border-ink-800 dark:bg-ink-900 lg:static lg:translate-x-0",
          showSidebar ? "translate-x-0" : "-translate-x-full lg:w-0 lg:border-none lg:overflow-hidden"
        )}
      >
        <div className="flex h-full flex-col">
          <div className="flex items-center justify-between border-b border-ink-200 p-4 dark:border-ink-800">
            <h2 className="text-sm font-bold text-ink-900 dark:text-ink-100">Conversations</h2>
            <button
              type="button"
              onClick={() => setShowSidebar(false)}
              className="rounded-md p-1.5 text-ink-500 hover:bg-ink-100 lg:hidden dark:text-ink-400 dark:hover:bg-ink-800"
              aria-label="Close sidebar"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
          </div>

          <div className="p-3">
            <button
              type="button"
              onClick={handleNewConversation}
              className="flex w-full items-center justify-center gap-2 rounded-lg border border-brand-200 bg-brand-50 px-3 py-2.5 text-sm font-semibold text-brand-700 transition-colors hover:bg-brand-100 dark:border-brand-800 dark:bg-brand-900/30 dark:text-brand-300 dark:hover:bg-brand-900/50"
            >
              <Plus className="h-4 w-4" />
              New Conversation
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-2">
            {conversations.length === 0 ? (
              <div className="px-2 py-6 text-center">
                <MessageSquare className="mx-auto h-8 w-8 text-ink-300" />
                <p className="mt-2 text-xs font-medium text-ink-500 dark:text-ink-400">No conversations yet</p>
                <p className="text-[11px] text-ink-400">Start by asking a question!</p>
              </div>
            ) : (
              <ul className="space-y-1">
                {conversations.map((conv) => (
                  <li key={conv.id}>
                    <button
                      type="button"
                      onClick={() => loadConversation(conv.id)}
                      className={cn(
                        "group flex w-full items-start gap-2 rounded-lg px-2.5 py-2 text-left transition-colors",
                        selectedConversation?.id === conv.id
                          ? "bg-brand-50 dark:bg-brand-900/20"
                          : "hover:bg-ink-100 dark:hover:bg-ink-800"
                      )}
                    >
                      <MessageSquare
                        className={cn(
                          "mt-0.5 h-4 w-4 shrink-0",
                          selectedConversation?.id === conv.id
                            ? "text-brand-600 dark:text-brand-400"
                            : "text-ink-400"
                        )}
                      />
                      <div className="min-w-0 flex-1">
                        <p
                          className={cn(
                            "truncate text-[13px] font-medium",
                            selectedConversation?.id === conv.id
                              ? "text-brand-700 dark:text-brand-300"
                              : "text-ink-700 dark:text-ink-300"
                          )}
                        >
                          {conv.title}
                        </p>
                        <p className="truncate text-[10px] text-ink-400">
                          {SUBJECTS.find((s) => s.value === conv.subject)?.label} ·{" "}
                          {new Date(conv.updated_at).toLocaleDateString()}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={(e) => handleDeleteConversation(conv.id, e)}
                        className="opacity-0 transition-opacity group-hover:opacity-100"
                        aria-label="Delete conversation"
                      >
                        <Trash2 className="h-3.5 w-3.5 text-danger-500" />
                      </button>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </aside>

      {/* Main Chat Area */}
      <main className="flex min-w-0 flex-1 flex-col">
        {/* Header */}
        <header className="flex items-center justify-between border-b border-ink-200 bg-white px-4 py-3 dark:border-ink-800 dark:bg-ink-900 sm:px-6">
          <div className="flex items-center gap-3">
            {!showSidebar && (
              <button
                type="button"
                onClick={() => setShowSidebar(true)}
                className="rounded-md p-1.5 text-ink-500 hover:bg-ink-100 lg:hidden dark:text-ink-400 dark:hover:bg-ink-800"
                aria-label="Open sidebar"
              >
                <MessageSquare className="h-5 w-5" />
              </button>
            )}
            <div>
              <h1 className="text-lg font-bold text-ink-900 dark:text-ink-100">AI Doubt Solver</h1>
              <p className="text-xs text-ink-500 dark:text-ink-400">
                Ask questions, understand concepts, and solve problems step-by-step.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleNewConversation}
            className="hidden items-center gap-2 rounded-lg border border-ink-200 px-3 py-2 text-sm font-medium text-ink-700 transition-colors hover:bg-ink-100 dark:border-ink-700 dark:text-ink-300 dark:hover:bg-ink-800 sm:flex"
          >
            <Plus className="h-4 w-4" />
            New
          </button>
        </header>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto">
          {messages.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center px-4 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-100 text-brand-600 dark:bg-brand-900/30 dark:text-brand-400">
                <Sparkles className="h-8 w-8" />
              </div>
              <h2 className="mt-4 text-lg font-bold text-ink-900 dark:text-ink-100">
                Welcome to AI Doubt Solver
              </h2>
              <p className="mt-1 max-w-md text-sm text-ink-600 dark:text-ink-400">
                Ask any academic question and get clear, step-by-step explanations. Select your subject and class level
                below for tailored help.
              </p>
            </div>
          ) : (
            <>
              <AIDisclaimer />
              <div className="pb-4">
                {messages.map((msg) => (
                  <AIMessageBubble key={msg.id} message={msg} onAction={handleAction} />
                ))}
                {isLoading && <LoadingIndicator />}
                <div ref={messagesEndRef} />
              </div>
            </>
          )}
        </div>

        {/* Error Message */}
        {error && (
          <div className="mx-4 mb-2 rounded-lg border border-danger-200 bg-danger-50 px-3 py-2 text-sm text-danger-700 dark:border-danger-900/50 dark:bg-danger-900/20 dark:text-danger-300">
            {error}
            <button
              type="button"
              onClick={() => setError(null)}
              className="ml-2 text-danger-600 hover:underline dark:text-danger-400"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Input Area */}
        <div className="border-t border-ink-200 bg-white p-3 dark:border-ink-800 dark:bg-ink-900 sm:p-4">
          {/* Image Preview */}
          {imagePreview && (
            <div className="mb-3 flex items-center gap-2">
              <div className="relative">
                <img src={imagePreview} alt="Preview" className="h-20 w-20 rounded-lg object-cover" />
                <button
                  type="button"
                  onClick={() => {
                    setImageFile(null);
                    setImagePreview(null);
                    if (fileInputRef.current) fileInputRef.current.value = "";
                  }}
                  className="absolute -right-1.5 -top-1.5 rounded-full bg-ink-900 p-1 text-white hover:bg-ink-700"
                  aria-label="Remove image"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
              {isUploading && <span className="text-xs text-ink-500">Uploading...</span>}
            </div>
          )}

          {/* Controls */}
          <div className="mb-3 flex flex-wrap gap-2">
            <select
              value={selectedSubject}
              onChange={(e) => setSelectedSubject(e.target.value as AISubject)}
              className="rounded-md border border-ink-200 bg-white px-2.5 py-1.5 text-xs font-medium text-ink-700 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-ink-700 dark:bg-ink-800 dark:text-ink-300"
              aria-label="Select subject"
            >
              {SUBJECTS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>

            <select
              value={selectedClass}
              onChange={(e) => setSelectedClass(e.target.value as AIClassLevel)}
              className="rounded-md border border-ink-200 bg-white px-2.5 py-1.5 text-xs font-medium text-ink-700 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-ink-700 dark:bg-ink-800 dark:text-ink-300"
              aria-label="Select class level"
            >
              {CLASS_LEVELS.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>

          {/* Input */}
          <div className="flex items-end gap-2">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isLoading || isUploading}
              className="shrink-0 rounded-lg p-2.5 text-ink-500 transition-colors hover:bg-ink-100 disabled:opacity-50 dark:text-ink-400 dark:hover:bg-ink-800"
              aria-label="Upload image"
            >
              <ImageIcon className="h-5 w-5" />
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleImageSelect}
              className="hidden"
              aria-hidden="true"
            />

            <div className="min-w-0 flex-1">
              <textarea
                ref={textareaRef}
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask your doubt..."
                rows={1}
                disabled={isLoading || isUploading}
                className="w-full resize-none rounded-lg border border-ink-200 bg-ink-50 px-3 py-2.5 text-sm text-ink-900 placeholder:text-ink-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 disabled:opacity-50 dark:border-ink-700 dark:bg-ink-800 dark:text-ink-100"
              />
            </div>

            <button
              type="button"
              onClick={() => void sendMessage()}
              disabled={!inputValue.trim() && !imageFile}
              className="shrink-0 rounded-lg bg-brand-600 p-2.5 text-white transition-colors hover:bg-brand-700 disabled:opacity-50 dark:bg-brand-500 dark:hover:bg-brand-600"
              aria-label="Send message"
            >
              <Send className="h-5 w-5" />
            </button>
          </div>

          <p className="mt-2 text-[10px] text-ink-400">
            Press Enter to send, Shift + Enter for new line · Images up to 5MB
          </p>
        </div>
      </main>
    </div>
  );
}
