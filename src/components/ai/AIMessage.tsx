import { memo } from "react";
import { Sparkles, User, AlertTriangle } from "lucide-react";
import type { AIMessage } from "../../types";
import { cn } from "../../lib/utils";

interface AIMessageProps {
  message: AIMessage;
  onAction?: (action: string) => void;
}

export const AIMessageBubble = memo(function AIMessageBubble({ message, onAction }: AIMessageProps) {
  const isUser = message.role === "user";

  return (
    <div
      className={cn(
        "flex w-full gap-3 px-4 py-5 sm:px-6",
        isUser ? "bg-ink-50/50 dark:bg-ink-900/30" : "bg-white dark:bg-ink-900"
      )}
    >
      <div
        className={cn(
          "flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
          isUser
            ? "bg-brand-100 text-brand-700 dark:bg-brand-900/40 dark:text-brand-300"
            : "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
        )}
      >
        {isUser ? <User className="h-4.5 w-4.5" /> : <Sparkles className="h-4.5 w-4.5" />}
      </div>

      <div className="min-w-0 flex-1 space-y-2">
        {message.image_url && (
          <div className="mb-2 overflow-hidden rounded-lg border border-ink-200 dark:border-ink-700">
            <img
              src={message.image_url}
              alt="Question image"
              className="max-h-64 w-full object-contain"
              loading="lazy"
            />
          </div>
        )}

        <div
          className={cn(
            "prose prose-sm max-w-none dark:prose-invert",
            "prose-headings:font-semibold prose-headings:text-ink-900 dark:prose-headings:text-ink-100",
            "prose-p:text-ink-700 dark:prose-p:text-ink-300",
            "prose-strong:text-ink-900 dark:prose-strong:text-ink-100",
            "prose-code:bg-ink-100 dark:prose-code:bg-ink-800",
            "prose-code:rounded-md prose-code:px-1.5 prose-code:py-0.5",
            "prose-pre:bg-ink-900 prose-pre:text-ink-100",
            "prose-ul:list-disc prose-ol:list-decimal",
            "prose-li:text-ink-700 dark:prose-li:text-ink-300"
          )}
        >
          {message.content.split("\n").map((paragraph, idx) => {
            if (paragraph.trim() === "") return <br key={idx} />;

            // Simple markdown-like parsing
            let content: React.ReactNode = paragraph;

            // Bold text
            content = String(content).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");

            // Code blocks
            if (paragraph.startsWith("```")) {
              return (
                <pre key={idx} className="overflow-x-auto rounded-lg bg-ink-900 p-3 text-xs text-ink-100">
                  <code>{paragraph.replace(/```\w*\n?/g, "")}</code>
                </pre>
              );
            }

            // Inline code
            content = String(content)
              .split(/(`[^`]+`)/g)
              .map((part, i) =>
                part.startsWith("`") && part.endsWith("`") ? (
                  <code key={i} className="rounded bg-ink-100 px-1.5 py-0.5 text-xs dark:bg-ink-800">
                    {part.slice(1, -1)}
                  </code>
                ) : (
                  <span key={i} dangerouslySetInnerHTML={{ __html: part }} />
                )
              );

            // Headers
            if (paragraph.startsWith("### ")) {
              return (
                <h3 key={idx} className="mt-3 text-base font-semibold text-ink-900 dark:text-ink-100">
                  {String(paragraph).replace("### ", "")}
                </h3>
              );
            }
            if (paragraph.startsWith("## ")) {
              return (
                <h2 key={idx} className="mt-3 text-lg font-semibold text-ink-900 dark:text-ink-100">
                  {String(paragraph).replace("## ", "")}
                </h2>
              );
            }
            if (paragraph.startsWith("# ")) {
              return (
                <h1 key={idx} className="mt-3 text-xl font-bold text-ink-900 dark:text-ink-100">
                  {String(paragraph).replace("# ", "")}
                </h1>
              );
            }

            return <p key={idx}>{content}</p>;
          })}
        </div>

        {!isUser && onAction && (
          <div className="flex flex-wrap gap-2 pt-2">
            <button
              type="button"
              onClick={() => onAction("simpler")}
              className="rounded-md border border-ink-200 px-2.5 py-1 text-[11px] font-medium text-ink-600 transition-colors hover:bg-ink-100 dark:border-ink-700 dark:text-ink-300 dark:hover:bg-ink-800"
            >
              Explain Simpler
            </button>
            <button
              type="button"
              onClick={() => onAction("hint")}
              className="rounded-md border border-ink-200 px-2.5 py-1 text-[11px] font-medium text-ink-600 transition-colors hover:bg-ink-100 dark:border-ink-700 dark:text-ink-300 dark:hover:bg-ink-800"
            >
              Give a Hint
            </button>
            <button
              type="button"
              onClick={() => onAction("step-by-step")}
              className="rounded-md border border-ink-200 px-2.5 py-1 text-[11px] font-medium text-ink-600 transition-colors hover:bg-ink-100 dark:border-ink-700 dark:text-ink-300 dark:hover:bg-ink-800"
            >
              Step-by-Step
            </button>
            <button
              type="button"
              onClick={() => onAction("another-method")}
              className="rounded-md border border-ink-200 px-2.5 py-1 text-[11px] font-medium text-ink-600 transition-colors hover:bg-ink-100 dark:border-ink-700 dark:text-ink-300 dark:hover:bg-ink-800"
            >
              Another Method
            </button>
          </div>
        )}
      </div>
    </div>
  );
});

export function AIDisclaimer() {
  return (
    <div className="mx-4 mb-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-800 dark:border-amber-900/50 dark:bg-amber-900/20 dark:text-amber-200 sm:mx-6">
      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <p>
        <strong>AI can make mistakes.</strong> Check important answers with your textbook or teacher.
      </p>
    </div>
  );
}

export function LoadingIndicator() {
  return (
    <div className="flex w-full gap-3 px-4 py-5 sm:px-6">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
        <Sparkles className="h-4.5 w-4.5 animate-pulse" />
      </div>
      <div className="flex items-center gap-2">
        <div className="flex gap-1">
          <span className="h-2 w-2 animate-bounce rounded-full bg-emerald-500 [animation-delay:-0.3s]"></span>
          <span className="h-2 w-2 animate-bounce rounded-full bg-emerald-500 [animation-delay:-0.15s]"></span>
          <span className="h-2 w-2 animate-bounce rounded-full bg-emerald-500"></span>
        </div>
        <span className="text-sm font-medium text-ink-600 dark:text-ink-300">AI is thinking...</span>
      </div>
    </div>
  );
}
