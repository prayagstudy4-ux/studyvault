import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import {
  Clock,
  FileText,
  Folder,
  RotateCcw,
  Star,
  Trash2,
} from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { useWorkspace } from "../contexts/WorkspaceContext";
import { useToast } from "../contexts/ToastContext";
import {
  getRecentFiles,
  getStarredItems,
  getTrash,
  logActivity,
  purgeFolder,
  removeFileRow,
  restoreFile,
  restoreFolder,
  toggleStar,
  type StarredItem,
  type TrashListing,
} from "../services/db";
import { removeStorageObject } from "../services/storage";
import type { FileItem } from "../types";
import { folderPath, formatBytes, friendlyError, timeAgo } from "../lib/utils";
import { Button, EmptyState, SkeletonRows } from "../components/ui/primitives";
import { PurgeDialog } from "../components/dialogs";

function PageHeader({ icon, title, subtitle }: { icon: ReactNode; title: string; subtitle: string }) {
  return (
    <div className="anim-fade-up mb-5 flex items-center gap-3.5">
      <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-600/10 text-brand-600 dark:text-brand-400">
        {icon}
      </span>
      <div>
        <h1 className="font-display text-xl font-extrabold tracking-tight text-ink-900 sm:text-2xl dark:text-ink-50">{title}</h1>
        <p className="text-[13px] text-ink-500 dark:text-ink-400">{subtitle}</p>
      </div>
    </div>
  );
}

const pageWrap = "mx-auto h-full max-w-5xl px-4 py-6 sm:px-6";

/* ================================================================ Recent */
export function RecentPage() {
  const { workspace, folderById, directory, version } = useWorkspace();
  const navigate = useNavigate();
  const [items, setItems] = useState<FileItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!workspace) return;
    let cancelled = false;
    setItems(null);
    setError(null);
    getRecentFiles(workspace.id, 40)
      .then((r) => {
        if (!cancelled) setItems(r);
      })
      .catch((err) => {
        if (!cancelled) setError(friendlyError(err, "Could not load recent files."));
      });
    return () => {
      cancelled = true;
    };
  }, [workspace, version]);

  return (
    <div className={pageWrap}>
      <PageHeader icon={<Clock className="h-5.5 w-5.5" />} title="Recent" subtitle="Latest uploads and edits across the workspace, newest first." />
      {error ? (
        <EmptyState icon={<Clock />} title="Could not load recent files" body={error} />
      ) : items === null ? (
        <SkeletonRows count={7} />
      ) : items.length === 0 ? (
        <EmptyState icon={<FileText />} title="Nothing recent" body="Files appear here as soon as either of you uploads or edits a PDF." />
      ) : (
        <div className="overflow-hidden rounded-xl border border-ink-200 bg-white/80 dark:border-ink-800 dark:bg-ink-900/70">
          <ul className="divide-y divide-ink-150 dark:divide-ink-850">
            {items.map((f) => (
              <li key={f.id}>
                <button
                  type="button"
                  onClick={() => navigate(`/file/${f.id}`)}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-ink-100/80 dark:hover:bg-ink-850"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-danger-500/10 text-danger-500">
                    <FileText className="h-4.5 w-4.5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13.5px] font-bold text-ink-900 dark:text-ink-50">{f.name}</span>
                    <span className="block truncate text-[11.5px] text-ink-400">
                      {folderPath(f.folder_id, folderById) || "Home"} · by {directory.get(f.uploaded_by)?.name ?? "Member"}
                    </span>
                  </span>
                  <span className="hidden text-[11.5px] text-ink-400 sm:block">{formatBytes(f.file_size)}</span>
                  <span className="w-24 shrink-0 text-right text-[11.5px] text-ink-400">{timeAgo(f.updated_at)}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/* ================================================================ Starred */
export function StarredPage() {
  const { user } = useAuth();
  const { workspace, folderById, version, bump } = useWorkspace();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [items, setItems] = useState<StarredItem[] | null>(null);

  useEffect(() => {
    if (!workspace || !user) return;
    let cancelled = false;
    setItems(null);
    getStarredItems(user.id, workspace.id, folderById)
      .then((r) => {
        if (!cancelled) setItems(r);
      })
      .catch(() => {
        if (!cancelled) setItems([]);
      });
    return () => {
      cancelled = true;
    };
  }, [workspace, user, folderById, version]);

  const unstar = async (item: StarredItem) => {
    if (!user) return;
    try {
      await toggleStar(user.id, item.kind === "file" ? { file_id: item.id } : { folder_id: item.id });
      bump();
      toast("Removed from Starred", "info");
    } catch (err) {
      toast(friendlyError(err, "Could not remove the star."), "error");
    }
  };

  return (
    <div className={pageWrap}>
      <PageHeader icon={<Star className="h-5.5 w-5.5" />} title="Starred" subtitle="Your personal shortcuts — stars are private to you." />
      {items === null ? (
        <SkeletonRows count={6} />
      ) : items.length === 0 ? (
        <EmptyState
          icon={<Star />}
          title="No starred items yet"
          body="Tap the star on any PDF or folder to pin it here for quick access. Your friend's stars stay theirs."
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-ink-200 bg-white/80 dark:border-ink-800 dark:bg-ink-900/70">
          <ul className="divide-y divide-ink-150 dark:divide-ink-850">
            {items.map((item) => (
              <li key={`${item.kind}-${item.id}`} className="flex items-center gap-2 px-4 py-2.5">
                <button
                  type="button"
                  onClick={() =>
                    item.kind === "folder"
                      ? navigate(`/workspace/${workspace?.id}/folder/${item.id}`)
                      : navigate(`/file/${item.id}`)
                  }
                  className="flex min-w-0 flex-1 items-center gap-3 rounded-lg px-1 py-1 text-left transition-colors hover:bg-ink-100/80 dark:hover:bg-ink-850"
                >
                  <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${item.kind === "folder" ? "bg-brand-600/10 text-brand-600 dark:text-brand-400" : "bg-danger-500/10 text-danger-500"}`}>
                    {item.kind === "folder" ? <Folder className="h-4.5 w-4.5" /> : <FileText className="h-4.5 w-4.5" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13.5px] font-bold text-ink-900 dark:text-ink-50">{item.name}</span>
                    <span className="block truncate text-[11.5px] text-ink-400">
                      {item.kind === "folder" ? "Folder" : "PDF"} · {item.path}
                    </span>
                  </span>
                  {item.size !== null ? <span className="hidden text-[11.5px] text-ink-400 sm:block">{formatBytes(item.size)}</span> : null}
                  <span className="hidden w-24 shrink-0 text-right text-[11.5px] text-ink-400 md:block">{timeAgo(item.updated_at)}</span>
                </button>
                <button
                  type="button"
                  aria-label={`Unstar ${item.name}`}
                  onClick={() => void unstar(item)}
                  className="rounded-md p-2 text-star-400 transition-colors hover:bg-ink-150 dark:hover:bg-ink-800"
                >
                  <Star className="h-4.5 w-4.5 fill-star-400" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/* ================================================================ Trash */
interface PurgeTarget {
  kind: "file" | "folder";
  id: string;
  name: string;
  storagePath?: string;
}

export function TrashPage() {
  const { workspace, folderById, version, bump } = useWorkspace();
  const { toast } = useToast();
  const [trash, setTrash] = useState<TrashListing | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [purgeTarget, setPurgeTarget] = useState<PurgeTarget | null>(null);
  const [purging, setPurging] = useState(false);

  const load = useCallback(() => {
    if (!workspace) return;
    let cancelled = false;
    setTrash(null);
    setError(null);
    getTrash(workspace.id)
      .then((t) => {
        if (!cancelled) setTrash(t);
      })
      .catch((err) => {
        if (!cancelled) setError(friendlyError(err, "Could not open the Trash."));
      });
    return () => {
      cancelled = true;
    };
  }, [workspace]);

  useEffect(() => {
    const cleanup = load();
    return cleanup;
  }, [load, version]);

  const restore = async (kind: "file" | "folder", id: string, name: string) => {
    if (!workspace) return;
    setBusyId(id);
    try {
      if (kind === "file") await restoreFile(id);
      else await restoreFolder(id);
      if (workspace) logActivity(workspace.id, "restored", kind, id, name, { path: folderPath(null, folderById) });
      bump();
      toast("Restored");
    } catch (err) {
      toast(friendlyError(err, "Could not restore the item."), "error");
    } finally {
      setBusyId(null);
    }
  };

  const purge = async (target: PurgeTarget) => {
    if (!workspace) return;
    setPurging(true);
    try {
      if (target.kind === "file") {
        if (target.storagePath) await removeStorageObject(target.storagePath).catch(() => undefined);
        await removeFileRow(target.id);
      } else {
        await purgeFolder(target.id);
      }
      logActivity(workspace.id, "purged", target.kind, target.id, target.name);
      bump();
      toast("Deleted forever", "info");
    } catch (err) {
      toast(friendlyError(err, "Permanent delete failed."), "error");
    } finally {
      setPurging(false);
    }
  };

  const Row = ({
    kind,
    id,
    name,
    meta,
    storagePath,
  }: {
    kind: "file" | "folder";
    id: string;
    name: string;
    meta: string;
    storagePath?: string;
  }) => (
    <li className="flex items-center gap-3 px-4 py-3">
      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${kind === "folder" ? "bg-brand-600/10 text-brand-600 dark:text-brand-400" : "bg-danger-500/10 text-danger-500"}`}>
        {kind === "folder" ? <Folder className="h-4.5 w-4.5" /> : <FileText className="h-4.5 w-4.5" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13.5px] font-bold text-ink-900 dark:text-ink-50">{name}</span>
        <span className="block truncate text-[11.5px] text-ink-400">{meta}</span>
      </span>
      <Button
        variant="secondary"
        size="sm"
        loading={busyId === id}
        onClick={() => void restore(kind, id, name)}
      >
        <RotateCcw className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">Restore</span>
      </Button>
      <Button
        variant="dangerGhost"
        size="sm"
        onClick={() => setPurgeTarget({ kind, id, name, storagePath })}
      >
        <Trash2 className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">Delete forever</span>
      </Button>
    </li>
  );

  const empty =
    trash !== null && trash.folders.length === 0 && trash.files.length === 0;

  return (
    <div className={pageWrap}>
      <PageHeader icon={<Trash2 className="h-5.5 w-5.5" />} title="Trash" subtitle="Deleted items wait here — restore them or delete them forever." />
      {error ? (
        <EmptyState icon={<Trash2 />} title="Could not open the Trash" body={error} />
      ) : trash === null ? (
        <SkeletonRows count={6} />
      ) : empty ? (
        <EmptyState icon={<Trash2 />} title="Trash is empty" body="Deleted PDFs and folders land here before they're gone for good." />
      ) : (
        <div className="space-y-4 pb-6">
          {trash && trash.folders.length > 0 ? (
            <div className="overflow-hidden rounded-xl border border-ink-200 bg-white/80 dark:border-ink-800 dark:bg-ink-900/70">
              <p className="border-b border-ink-150 px-4 py-2.5 text-[10.5px] font-bold uppercase tracking-[0.14em] text-ink-400 dark:border-ink-850">
                Folders ({trash.folders.length})
              </p>
              <ul className="divide-y divide-ink-150 dark:divide-ink-850">
                {trash.folders.map((f) => (
                  <Row
                    key={f.id}
                    kind="folder"
                    id={f.id}
                    name={f.name}
                    meta={`Deleted ${timeAgo(f.deleted_at ?? f.updated_at)} · includes all subfolders and PDFs`}
                  />
                ))}
              </ul>
            </div>
          ) : null}
          {trash && trash.files.length > 0 ? (
            <div className="overflow-hidden rounded-xl border border-ink-200 bg-white/80 dark:border-ink-800 dark:bg-ink-900/70">
              <p className="border-b border-ink-150 px-4 py-2.5 text-[10.5px] font-bold uppercase tracking-[0.14em] text-ink-400 dark:border-ink-850">
                PDFs ({trash.files.length})
              </p>
              <ul className="divide-y divide-ink-150 dark:divide-ink-850">
                {trash.files.map((f) => (
                  <Row
                    key={f.id}
                    kind="file"
                    id={f.id}
                    name={f.name}
                    meta={`${formatBytes(f.file_size)} · deleted ${timeAgo(f.deleted_at ?? f.updated_at)}`}
                    storagePath={f.storage_path}
                  />
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      )}

      <PurgeDialog
        open={purgeTarget !== null}
        onClose={() => setPurgeTarget(null)}
        busy={purging}
        name={purgeTarget?.name ?? ""}
        pluralThing={purgeTarget?.kind === "folder" ? "everything inside it" : "its stored PDF data"}
        onConfirm={async () => {
          if (purgeTarget) await purge(purgeTarget);
        }}
      />
    </div>
  );
}


