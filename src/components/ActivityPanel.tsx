import { useEffect, useState } from "react";
import { FileUp, FolderInput, FolderPlus, Pencil, RotateCcw, Trash2, Upload } from "lucide-react";
import { getActivity } from "../services/db";
import { useWorkspace } from "../contexts/WorkspaceContext";
import type { ActivityLog } from "../types";
import { friendlyError, timeAgo } from "../lib/utils";
import { Avatar } from "./ui/primitives";

const ACTION_META: Record<string, { label: string; icon: typeof Upload }> = {
  uploaded: { label: "uploaded", icon: Upload },
  created: { label: "created folder", icon: FolderPlus },
  renamed: { label: "renamed", icon: Pencil },
  moved: { label: "moved", icon: FolderInput },
  deleted: { label: "deleted", icon: Trash2 },
  restored: { label: "restored", icon: RotateCcw },
  purged: { label: "permanently deleted", icon: Trash2 },
  invited: { label: "added member", icon: FileUp },
};

export function ActivityPanel({ limit = 10 }: { limit?: number }) {
  const { workspace, directory, version } = useWorkspace();
  const [items, setItems] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!workspace) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    getActivity(workspace.id, limit)
      .then((data) => {
        if (!cancelled) setItems(data);
      })
      .catch((err) => {
        if (!cancelled) setError(friendlyError(err, "Could not load activity."));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [workspace, limit, version]);

  if (loading) {
    return (
      <div className="space-y-3" aria-hidden="true">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3">
            <div className="skeleton h-8 w-8 rounded-full" />
            <div className="flex-1 space-y-1.5">
              <div className="skeleton h-3 w-3/4 rounded" />
              <div className="skeleton h-2.5 w-1/3 rounded" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return <p className="text-sm text-ink-500 dark:text-ink-400">{error}</p>;
  }

  if (items.length === 0) {
    return (
      <p className="text-[13px] leading-relaxed text-ink-500 dark:text-ink-400">
        Nothing here yet — uploads, folders and edits will show up as they happen.
      </p>
    );
  }

  return (
    <ol className="relative space-y-4 before:absolute before:bottom-2 before:left-[15px] before:top-2 before:w-px before:bg-ink-200 dark:before:bg-ink-800">
      {items.map((item) => {
        const meta = ACTION_META[item.action] ?? { label: item.action, icon: Upload };
        const Icon = meta.icon;
        const who = directory.get(item.user_id);
        const where =
          item.metadata && typeof (item.metadata as { path?: unknown }).path === "string"
            ? (item.metadata as { path: string }).path
            : null;
        return (
          <li key={item.id} className="relative flex items-start gap-3">
            <span className="relative z-10 shrink-0">
              <Avatar name={who?.name ?? "Member"} src={who?.avatar} size="sm" />
            </span>
            <div className="min-w-0 flex-1 pt-0.5">
              <p className="truncate text-[13px] leading-snug text-ink-800 dark:text-ink-100">
                <span className="font-semibold">{who?.name ?? "Someone"}</span>{" "}
                <span className="text-ink-500 dark:text-ink-400">{meta.label}</span>{" "}
                <span className="font-medium">{item.target_name}</span>
              </p>
              <p className="mt-0.5 flex items-center gap-1.5 text-[11px] text-ink-400 dark:text-ink-500">
                <Icon className="h-3 w-3" />
                {where ? <span className="truncate">{where}</span> : null}
                {where ? <span aria-hidden="true">·</span> : null}
                <span className="shrink-0">{timeAgo(item.created_at)}</span>
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
