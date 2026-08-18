import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowDownWideNarrow,
  ArrowUpNarrowWide,
  Download,
  FileText,
  Folder as FolderIcon,
  FolderInput,
  FolderPlus,
  Info,
  LayoutGrid,
  List,
  MoreVertical,
  Pencil,
  RotateCcw,
  Star,
  Trash2,
  Upload,
} from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";
import { useWorkspace } from "../../contexts/WorkspaceContext";
import { useToast } from "../../contexts/ToastContext";
import {
  createFolder,
  getFolderContents,
  getMyStars,
  logActivity,
  moveFile,
  moveFolder,
  renameFile,
  renameFolder,
  softDeleteFile,
  softDeleteFolder,
  toggleStar,
} from "../../services/db";
import { downloadFile, uploadPdf, UploadError } from "../../services/storage";
import type { FileItem, Folder, FolderContents, SortDir, SortKey, UploadProgress, ViewMode } from "../../types";
import { cn, folderAncestors, formatBytes, friendlyError, sortItems, timeAgo, isPdfFile, MAX_PDF_BYTES } from "../../lib/utils";
import { Button, EmptyState, Menu, MenuItem, SkeletonRows } from "../ui/primitives";
import {
  DeleteDialog,
  FileDetailsDialog,
  MoveDialog,
  NewFolderDialog,
  RenameDialog,
  UploadOverlay,
  type MoveTarget,
} from "../dialogs";

const DND_MIME = "application/x-studyvault-item";

interface SelectedItem {
  kind: "file" | "folder";
  id: string;
  name: string;
  parentId: string | null;
}

export function FileBrowser({ workspaceId, folderId }: { workspaceId: string; folderId: string | null }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const { folderById, folders, version, bump, directory, workspace, members } = useWorkspace();

  const [contents, setContents] = useState<FolderContents>({ folders: [], files: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [view, setView] = useState<ViewMode>(() => (localStorage.getItem("sv-view") === "list" ? "list" : "grid"));
  const [sortKey, setSortKey] = useState<SortKey>(() => (localStorage.getItem("sv-sort-key") as SortKey) || "name");
  const [sortDir, setSortDir] = useState<SortDir>(() => (localStorage.getItem("sv-sort-dir") as SortDir) || "asc");

  const [starredFiles, setStarredFiles] = useState<Set<string>>(new Set());
  const [starredFolders, setStarredFolders] = useState<Set<string>>(new Set());

  const [uploads, setUploads] = useState<UploadProgress[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const namesRef = useRef<string[]>([]);

  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [renameTarget, setRenameTarget] = useState<SelectedItem | null>(null);
  const [moveTarget, setMoveTarget] = useState<MoveTarget | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<SelectedItem | null>(null);
  const [detailsFile, setDetailsFile] = useState<FileItem | null>(null);
  const [busy, setBusy] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; item: SelectedItem } | null>(null);

  // viewer role = read-only; roles are enforced server-side by RLS as well
  const canEdit = useMemo(() => {
    if (!user) return false;
    const me = members.find((m) => m.user_id === user.id);
    return me ? me.role !== "viewer" : true;
  }, [user, members]);

  /* ---------------------------------------------------------- load */
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all([getFolderContents(workspaceId, folderId), getMyStars()])
      .then(([c, stars]) => {
        if (cancelled) return;
        setContents(c);
        namesRef.current = c.files.map((f) => f.name);
        setStarredFiles(new Set(stars.filter((s) => s.file_id).map((s) => s.file_id as string)));
        setStarredFolders(new Set(stars.filter((s) => s.folder_id).map((s) => s.folder_id as string)));
      })
      .catch((err) => {
        if (!cancelled) setError(friendlyError(err, "Unable to load this folder. Please try again."));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [workspaceId, folderId, version]);

  // close context menu on any click
  useEffect(() => {
    if (!contextMenu) return;
    const close = () => setContextMenu(null);
    document.addEventListener("click", close);
    document.addEventListener("scroll", close, true);
    return () => {
      document.removeEventListener("click", close);
      document.removeEventListener("scroll", close, true);
    };
  }, [contextMenu]);

  const pathLabel = folderId
    ? folderAncestors(folderId, folderById).map((f) => f.name).join(" / ")
    : "Home";

  /* ---------------------------------------------------------- actions */
  const runAction = useCallback(
    async (fn: () => Promise<void>, successMsg: string) => {
      setBusy(true);
      try {
        await fn();
        bump();
        toast(successMsg);
      } catch (err) {
        toast(friendlyError(err, "Something went wrong. Please try again."), "error");
        throw err;
      } finally {
        setBusy(false);
      }
    },
    [bump, toast]
  );

  const handleUploads = useCallback(
    async (fileList: FileList | File[], targetFolderId: string | null = folderId) => {
      if (!canEdit) {
        toast("You have view-only access to this workspace.", "error");
        return;
      }
      const destLabel = targetFolderId
        ? folderAncestors(targetFolderId, folderById).map((f) => f.name).join(" / ")
        : pathLabel;
      const files = Array.from(fileList);
      for (const file of files) {
        if (!isPdfFile(file)) {
          toast(`“${file.name}” was skipped — only PDF files are supported.`, "error");
          continue;
        }
        if (file.size > MAX_PDF_BYTES) {
          toast(`“${file.name}” is too large. Maximum allowed size is 50 MB.`, "error");
          continue;
        }
        const entry: UploadProgress = { fileName: file.name, percent: 0, phase: "uploading" };
        setUploads((prev) => [...prev, entry]);
        const update = (patch: Partial<UploadProgress>) =>
          setUploads((prev) => prev.map((u) => (u.fileName === entry.fileName ? { ...u, ...patch } : u)));
        try {
          const saved = await uploadPdf(workspaceId, targetFolderId, file, namesRef.current, (pct) =>
            update({ percent: pct })
          );
          namesRef.current = [...namesRef.current, saved.name];
          update({ percent: 100, phase: "done" });
          logActivity(workspaceId, "uploaded", "file", saved.id, saved.name, { path: destLabel });
          bump();
          toast("PDF uploaded successfully");
        } catch (err) {
          update({ phase: "error" });
          toast(err instanceof UploadError ? err.message : friendlyError(err, "Unable to upload the PDF. Please check your connection and try again."), "error");
        } finally {
          window.setTimeout(() => {
            setUploads((prev) => prev.filter((u) => u.fileName !== entry.fileName));
          }, 2600);
        }
      }
    },
    [canEdit, workspaceId, folderId, folderById, pathLabel, bump, toast]
  );

  const onNewFolder = async (name: string) => {
    await runAction(async () => {
      const f = await createFolder(workspaceId, folderId, name);
      logActivity(workspaceId, "created", "folder", f.id, name, { path: pathLabel });
    }, "Folder created");
  };

  const onRename = async (item: SelectedItem, name: string) => {
    await runAction(async () => {
      if (item.kind === "file") await renameFile(item.id, name);
      else await renameFolder(item.id, name);
      logActivity(workspaceId, "renamed", item.kind, item.id, name, { path: pathLabel });
    }, "Renamed");
  };

  const onMove = async (item: SelectedItem, newParentId: string | null) => {
    await runAction(async () => {
      if (item.kind === "file") await moveFile(item.id, newParentId);
      else await moveFolder(item.id, newParentId);
      const dest = newParentId ? folderAncestors(newParentId, folderById).map((f) => f.name).join(" / ") : "Home";
      logActivity(workspaceId, "moved", item.kind, item.id, item.name, { path: dest });
    }, "Moved");
  };

  const onDelete = async (item: SelectedItem) => {
    await runAction(async () => {
      if (item.kind === "file") await softDeleteFile(item.id);
      else await softDeleteFolder(item.id);
      logActivity(workspaceId, "deleted", item.kind, item.id, item.name, { path: pathLabel });
    }, "Moved to Trash");
  };

  const onStar = async (item: SelectedItem) => {
    if (!user) return;
    try {
      const starred = await toggleStar(
        user.id,
        item.kind === "file" ? { file_id: item.id } : { folder_id: item.id }
      );
      if (item.kind === "file") {
        setStarredFiles((prev) => {
          const next = new Set(prev);
          if (starred) next.add(item.id);
          else next.delete(item.id);
          return next;
        });
      } else {
        setStarredFolders((prev) => {
          const next = new Set(prev);
          if (starred) next.add(item.id);
          else next.delete(item.id);
          return next;
        });
      }
      toast(starred ? "Added to Starred" : "Removed from Starred", "info");
    } catch (err) {
      toast(friendlyError(err, "Could not update the star."), "error");
    }
  };

  const onDownload = async (file: FileItem) => {
    toast(`Preparing “${file.name}”…`, "info");
    try {
      await downloadFile(file);
      toast("Download started");
    } catch (err) {
      toast(friendlyError(err, "Download failed. Please try again."), "error");
    }
  };

  const openItem = (item: SelectedItem) => {
    if (item.kind === "folder") navigate(`/workspace/${workspaceId}/folder/${item.id}`);
    else navigate(`/file/${item.id}`);
  };

  /* ---------------------------------------------------------- drag & drop */
  const onDragOverRoot = (e: DragEvent) => {
    if (Array.from(e.dataTransfer.types).includes("Files")) {
      e.preventDefault();
      setDragOver(true);
    }
  };
  const onDropRoot = (e: DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files.length > 0) void handleUploads(e.dataTransfer.files);
  };

  const onDropOnFolder = (e: DragEvent, folder: Folder) => {
    e.preventDefault();
    e.stopPropagation();
    setDropTarget(null);
    const raw = e.dataTransfer.getData(DND_MIME);
    if (!raw) {
      // OS files dropped straight onto a folder card → upload into that folder
      if (e.dataTransfer.files.length > 0) void handleUploads(e.dataTransfer.files, folder.id);
      return;
    }
    try {
      const item = JSON.parse(raw) as SelectedItem;
      if (item.kind === "file" && item.parentId !== folder.id) {
        void onMove(item, folder.id);
      } else if (item.kind === "folder" && item.id !== folder.id && item.parentId !== folder.id) {
        void onMove(item, folder.id);
      }
    } catch {
      /* ignore malformed payloads */
    }
  };

  const onItemDragStart = (e: DragEvent, item: SelectedItem) => {
    e.dataTransfer.setData(DND_MIME, JSON.stringify(item));
    e.dataTransfer.effectAllowed = "move";
  };

  /* ---------------------------------------------------------- derived */
  const sortedFolders = useMemo(() => {
    const sortable = sortItems(contents.folders, sortKey === "file_size" ? "name" : sortKey, sortDir);
    return sortable;
  }, [contents.folders, sortKey, sortDir]);

  const sortedFiles = useMemo(
    () => sortItems(contents.files, sortKey, sortDir),
    [contents.files, sortKey, sortDir]
  );

  const toggleSortDir = () => {
    const next = sortDir === "asc" ? "desc" : "asc";
    setSortDir(next);
    localStorage.setItem("sv-sort-dir", next);
  };
  const cycleSortKey = () => {
    const order: SortKey[] = ["name", "updated_at", "created_at", "file_size"];
    const next = order[(order.indexOf(sortKey) + 1) % order.length];
    setSortKey(next);
    localStorage.setItem("sv-sort-key", next);
  };
  const toggleView = () => {
    const next = view === "grid" ? "list" : "grid";
    setView(next);
    localStorage.setItem("sv-view", next);
  };

  const sortLabel: Record<SortKey, string> = {
    name: "Name",
    updated_at: "Modified",
    created_at: "Created",
    file_size: "Size",
  };

  const starsFor = (item: SelectedItem) =>
    item.kind === "file" ? starredFiles.has(item.id) : starredFolders.has(item.id);

  /* ---------------------------------------------------------- item bits */
  const starButton = (item: SelectedItem) => (
    <button
      type="button"
      aria-label={starsFor(item) ? `Unstar ${item.name}` : `Star ${item.name}`}
      onClick={(e) => {
        e.stopPropagation();
        void onStar(item);
      }}
      className={cn(
        "rounded-md p-1.5 transition-all hover:bg-ink-150 dark:hover:bg-ink-800",
        starsFor(item) ? "text-star-400" : "text-ink-300 hover:text-star-400 dark:text-ink-600"
      )}
    >
      <Star className={cn("h-4 w-4", starsFor(item) && "fill-star-400")} />
    </button>
  );

  const itemMenu = (item: SelectedItem) => (
    <Menu trigger={<MoreVertical className="h-4.5 w-4.5" />} triggerLabel={`Actions for ${item.name}`}>
      <MenuItem icon={<Info />} label={item.kind === "file" ? "Open" : "Open folder"} onClick={() => openItem(item)} />
      {item.kind === "file" ? (
        <MenuItem icon={<Download />} label="Download" onClick={() => void onDownload(contents.files.find((f) => f.id === item.id)!)} />
      ) : null}
      {canEdit ? (
        <>
          <MenuItem icon={<Pencil />} label="Rename" onClick={() => setRenameTarget(item)} />
          <MenuItem icon={<FolderInput />} label="Move" onClick={() => setMoveTarget({ kind: item.kind, id: item.id, name: item.name, currentParentId: item.parentId })} />
        </>
      ) : null}
      {item.kind === "file" ? (
        <MenuItem icon={<Info />} label="Details" onClick={() => setDetailsFile(contents.files.find((f) => f.id === item.id) ?? null)} />
      ) : null}
      {canEdit ? (
        <MenuItem icon={<Trash2 />} label="Delete" danger onClick={() => setDeleteTarget(item)} />
      ) : null}
    </Menu>
  );

  const contextActions = (item: SelectedItem) => (
    <>
      <MenuItem icon={<Info />} label={item.kind === "file" ? "Open" : "Open folder"} onClick={() => openItem(item)} />
      {item.kind === "file" ? (
        <MenuItem icon={<Download />} label="Download" onClick={() => void onDownload(contents.files.find((f) => f.id === item.id)!)} />
      ) : null}
      <MenuItem
        icon={<Star className={cn(starsFor(item) && "fill-star-400 text-star-400")} />}
        label={starsFor(item) ? "Unstar" : "Star"}
        onClick={() => void onStar(item)}
      />
      {canEdit ? (
        <>
          <MenuItem icon={<Pencil />} label="Rename" onClick={() => setRenameTarget(item)} />
          <MenuItem icon={<FolderInput />} label="Move" onClick={() => setMoveTarget({ kind: item.kind, id: item.id, name: item.name, currentParentId: item.parentId })} />
          <MenuItem icon={<Trash2 />} label="Delete" danger onClick={() => setDeleteTarget(item)} />
        </>
      ) : null}
      {item.kind === "file" ? (
        <MenuItem icon={<Info />} label="Details" onClick={() => setDetailsFile(contents.files.find((f) => f.id === item.id) ?? null)} />
      ) : null}
    </>
  );

  /* ---------------------------------------------------------- render */
  const breadcrumbs = folderId ? folderAncestors(folderId, folderById) : [];

  return (
    <div
      className="relative h-full"
      onDragOver={onDragOverRoot}
      onDragLeave={(e) => {
        if (e.target === e.currentTarget) setDragOver(false);
      }}
      onDrop={onDropRoot}
    >
      {/* breadcrumbs */}
      <nav aria-label="Breadcrumb" className="mb-4 flex min-w-0 items-center gap-1 overflow-x-auto text-[13px] whitespace-nowrap">
        <button
          type="button"
          onClick={() => navigate(`/workspace/${workspaceId}`)}
          className={cn(
            "rounded px-1.5 py-0.5 font-semibold transition-colors hover:bg-ink-150 dark:hover:bg-ink-800",
            breadcrumbs.length === 0 ? "text-ink-900 dark:text-ink-50" : "text-ink-500 dark:text-ink-400"
          )}
        >
          {workspace?.name ?? "Home"}
        </button>
        {breadcrumbs.map((f, i) => (
          <span key={f.id} className="flex items-center gap-1">
            <span className="text-ink-300 dark:text-ink-600">/</span>
            <button
              type="button"
              onClick={() => navigate(`/workspace/${workspaceId}/folder/${f.id}`)}
              className={cn(
                "rounded px-1.5 py-0.5 font-semibold transition-colors hover:bg-ink-150 dark:hover:bg-ink-800",
                i === breadcrumbs.length - 1 ? "text-ink-900 dark:text-ink-50" : "text-ink-500 dark:text-ink-400"
              )}
            >
              {f.name}
            </button>
          </span>
        ))}
      </nav>

      {/* toolbar */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {canEdit ? (
          <>
            <Button variant="primary" size="md" onClick={() => fileInputRef.current?.click()}>
              <Upload className="h-4 w-4" />
              Upload PDF
            </Button>
            <Button variant="secondary" size="md" onClick={() => setNewFolderOpen(true)}>
              <FolderPlus className="h-4 w-4" />
              New folder
            </Button>
          </>
        ) : null}
        <input
          ref={fileInputRef}
          type="file"
          accept="application/pdf,.pdf"
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files?.length) void handleUploads(e.target.files);
            e.target.value = "";
          }}
        />
        <div className="ml-auto flex items-center gap-1.5">
          <Button variant="ghost" size="sm" onClick={cycleSortKey} aria-label={`Sort by ${sortLabel[sortKey]}`}>
            {sortLabel[sortKey]}
          </Button>
          <Button variant="ghost" size="sm" onClick={toggleSortDir} aria-label={`Sort ${sortDir === "asc" ? "ascending" : "descending"}`}>
            {sortDir === "asc" ? <ArrowUpNarrowWide className="h-4 w-4" /> : <ArrowDownWideNarrow className="h-4 w-4" />}
          </Button>
          <span className="mx-1 h-5 w-px bg-ink-200 dark:bg-ink-700" aria-hidden="true" />
          <Button variant="ghost" size="sm" onClick={toggleView} aria-label={view === "grid" ? "Switch to list view" : "Switch to grid view"}>
            {view === "grid" ? <List className="h-4 w-4" /> : <LayoutGrid className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      {error ? (
        <EmptyState
          icon={<RotateCcw />}
          title="Couldn't load this folder"
          body={error}
          actions={<Button variant="secondary" onClick={() => bump()}>Try again</Button>}
        />
      ) : loading ? (
        <SkeletonRows count={6} />
      ) : sortedFolders.length === 0 && sortedFiles.length === 0 ? (
        <EmptyState
          icon={<FolderIcon />}
          title="This folder is empty"
          body="Upload your first PDF or create a new folder to start organising your notes."
          actions={
            canEdit ? (
              <>
                <Button variant="primary" onClick={() => fileInputRef.current?.click()}>
                  <Upload className="h-4 w-4" /> Upload PDF
                </Button>
                <Button variant="secondary" onClick={() => setNewFolderOpen(true)}>
                  <FolderPlus className="h-4 w-4" /> New folder
                </Button>
              </>
            ) : undefined
          }
        />
      ) : view === "grid" ? (
        /* ------------------------------------------------ grid view */
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5">
          {sortedFolders.map((f) => {
            const item: SelectedItem = { kind: "folder", id: f.id, name: f.name, parentId: f.parent_folder_id };
            return (
              <div
                key={f.id}
                role="button"
                tabIndex={0}
                draggable={canEdit}
                onDragStart={(e) => onItemDragStart(e as unknown as DragEvent, item)}
                onDragOver={(e) => {
                  const types = Array.from(e.dataTransfer.types);
                  if (types.includes(DND_MIME) || types.includes("Files")) {
                    e.preventDefault();
                    setDropTarget(f.id);
                  }
                }}
                onDragLeave={() => setDropTarget((t) => (t === f.id ? null : t))}
                onDrop={(e) => onDropOnFolder(e as unknown as DragEvent, f)}
                onClick={() => openItem(item)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    openItem(item);
                  }
                }}
                onContextMenu={(e) => {
                  e.preventDefault();
                  setContextMenu({ x: Math.min(e.clientX, window.innerWidth - 210), y: Math.min(e.clientY, window.innerHeight - 280), item });
                }}
                className={cn(
                  "anim-fade-up group cursor-pointer rounded-xl border bg-white/80 p-4 text-left transition-all duration-150 hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-card dark:bg-ink-900/70",
                  dropTarget === f.id
                    ? "border-brand-500 ring-2 ring-brand-500/30"
                    : "border-ink-200 dark:border-ink-800"
                )}
              >
                <div className="flex items-start justify-between">
                  <FolderIcon className="h-9 w-9 text-brand-500/90 transition-transform duration-150 group-hover:scale-105" fill="currentColor" fillOpacity={0.14} />
                  <div className="flex items-center gap-0.5 opacity-70 transition-opacity group-hover:opacity-100">
                    {starButton(item)}
                    {itemMenu(item)}
                  </div>
                </div>
                <p className="mt-2.5 truncate text-[13.5px] font-bold text-ink-900 dark:text-ink-50">{f.name}</p>
                <p className="mt-0.5 text-[11px] text-ink-400">Folder · {timeAgo(f.updated_at)}</p>
              </div>
            );
          })}
          {sortedFiles.map((file) => {
            const item: SelectedItem = { kind: "file", id: file.id, name: file.name, parentId: file.folder_id };
            return (
              <div
                key={file.id}
                role="button"
                tabIndex={0}
                draggable={canEdit}
                onDragStart={(e) => onItemDragStart(e as unknown as DragEvent, item)}
                onClick={() => openItem(item)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    openItem(item);
                  }
                }}
                onContextMenu={(e) => {
                  e.preventDefault();
                  setContextMenu({ x: Math.min(e.clientX, window.innerWidth - 210), y: Math.min(e.clientY, window.innerHeight - 280), item });
                }}
                className="anim-fade-up group cursor-pointer rounded-xl border border-ink-200 bg-white/80 p-4 text-left transition-all duration-150 hover:-translate-y-0.5 hover:border-danger-500/40 hover:shadow-card dark:border-ink-800 dark:bg-ink-900/70"
              >
                <div className="flex items-start justify-between">
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-danger-500/10 text-danger-500">
                    <FileText className="h-5 w-5" />
                  </span>
                  <div className="flex items-center gap-0.5 opacity-70 transition-opacity group-hover:opacity-100">
                    {starButton(item)}
                    {itemMenu(item)}
                  </div>
                </div>
                <p className="mt-2.5 truncate text-[13.5px] font-bold text-ink-900 dark:text-ink-50" title={file.name}>
                  {file.name}
                </p>
                <p className="mt-0.5 text-[11px] text-ink-400">
                  PDF · {formatBytes(file.file_size)} · {timeAgo(file.updated_at)}
                </p>
              </div>
            );
          })}
        </div>
      ) : (
        /* ------------------------------------------------ list view */
        <div className="overflow-x-auto rounded-xl border border-ink-200 bg-white/80 dark:border-ink-800 dark:bg-ink-900/70">
          <table className="w-full min-w-125 text-left text-[13px]">
            <thead>
              <tr className="border-b border-ink-200 text-[10.5px] font-bold uppercase tracking-[0.12em] text-ink-400 dark:border-ink-800">
                <th className="px-4 py-2.5">Name</th>
                <th className="hidden px-4 py-2.5 sm:table-cell">Size</th>
                <th className="hidden px-4 py-2.5 md:table-cell">Uploaded by</th>
                <th className="px-4 py-2.5">Modified</th>
                <th className="w-24 px-2 py-2.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {sortedFolders.map((f) => {
                const item: SelectedItem = { kind: "folder", id: f.id, name: f.name, parentId: f.parent_folder_id };
                return (
                  <tr
                    key={f.id}
                    tabIndex={0}
                    draggable={canEdit}
                    onDragStart={(e) => onItemDragStart(e as unknown as DragEvent, item)}
                    onDragOver={(e) => {
                      const types = Array.from(e.dataTransfer.types);
                      if (types.includes(DND_MIME) || types.includes("Files")) {
                        e.preventDefault();
                        setDropTarget(f.id);
                      }
                    }}
                    onDragLeave={() => setDropTarget((t) => (t === f.id ? null : t))}
                    onDrop={(e) => onDropOnFolder(e as unknown as DragEvent, f)}
                    onClick={() => openItem(item)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") openItem(item);
                    }}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      setContextMenu({ x: Math.min(e.clientX, window.innerWidth - 210), y: Math.min(e.clientY, window.innerHeight - 280), item });
                    }}
                    className={cn(
                      "cursor-pointer border-b border-ink-150 transition-colors last:border-0 hover:bg-ink-100/70 dark:border-ink-850 dark:hover:bg-ink-850/70",
                      dropTarget === f.id && "bg-brand-50 dark:bg-brand-900/20"
                    )}
                  >
                    <td className="px-4 py-2.5">
                      <span className="flex items-center gap-2.5 font-semibold text-ink-900 dark:text-ink-50">
                        <FolderIcon className="h-4.5 w-4.5 shrink-0 text-brand-500" />
                        <span className="truncate">{f.name}</span>
                        {starredFolders.has(f.id) ? <Star className="h-3.5 w-3.5 shrink-0 fill-star-400 text-star-400" /> : null}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-ink-400">—</td>
                    <td className="hidden px-4 py-2.5 text-ink-500 dark:text-ink-400 md:table-cell">
                      {directory.get(f.created_by)?.name ?? "—"}
                    </td>
                    <td className="px-4 py-2.5 text-ink-500 dark:text-ink-400">{timeAgo(f.updated_at)}</td>
                    <td className="px-2 py-2.5" onClick={(e) => e.stopPropagation()}>
                      <div className="flex justify-end gap-0.5">
                        {starButton(item)}
                        {itemMenu(item)}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {sortedFiles.map((file) => {
                const item: SelectedItem = { kind: "file", id: file.id, name: file.name, parentId: file.folder_id };
                return (
                  <tr
                    key={file.id}
                    tabIndex={0}
                    draggable={canEdit}
                    onDragStart={(e) => onItemDragStart(e as unknown as DragEvent, item)}
                    onClick={() => openItem(item)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") openItem(item);
                    }}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      setContextMenu({ x: Math.min(e.clientX, window.innerWidth - 210), y: Math.min(e.clientY, window.innerHeight - 280), item });
                    }}
                    className="cursor-pointer border-b border-ink-150 transition-colors last:border-0 hover:bg-ink-100/70 dark:border-ink-850 dark:hover:bg-ink-850/70"
                  >
                    <td className="px-4 py-2.5">
                      <span className="flex items-center gap-2.5 font-semibold text-ink-900 dark:text-ink-50">
                        <span className="flex h-6.5 w-6.5 shrink-0 items-center justify-center rounded-md bg-danger-500/10 text-danger-500">
                          <FileText className="h-3.5 w-3.5" />
                        </span>
                        <span className="truncate" title={file.name}>{file.name}</span>
                        {starredFiles.has(file.id) ? <Star className="h-3.5 w-3.5 shrink-0 fill-star-400 text-star-400" /> : null}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-ink-500 dark:text-ink-400">{formatBytes(file.file_size)}</td>
                    <td className="hidden px-4 py-2.5 text-ink-500 dark:text-ink-400 md:table-cell">
                      {directory.get(file.uploaded_by)?.name ?? "—"}
                    </td>
                    <td className="px-4 py-2.5 text-ink-500 dark:text-ink-400">{timeAgo(file.updated_at)}</td>
                    <td className="px-2 py-2.5" onClick={(e) => e.stopPropagation()}>
                      <div className="flex justify-end gap-0.5">
                        {starButton(item)}
                        {itemMenu(item)}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* drag overlay */}
      {dragOver && canEdit ? (
        <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center rounded-xl border-2 border-dashed border-brand-500 bg-brand-500/8">
          <div className="rounded-xl bg-white/95 px-6 py-4 text-center shadow-pop dark:bg-ink-850/95">
            <Upload className="mx-auto h-6 w-6 text-brand-600" />
            <p className="mt-1.5 text-sm font-bold text-ink-900 dark:text-ink-50">Drop PDFs to upload</p>
            <p className="text-xs text-ink-500">Into {pathLabel}</p>
          </div>
        </div>
      ) : null}

      {/* right-click context menu */}
      {contextMenu ? (
        <div
          role="menu"
          className="anim-pop fixed z-[75] min-w-48 overflow-hidden rounded-lg border border-ink-200 bg-white/98 py-1 shadow-pop backdrop-blur-sm dark:border-ink-700 dark:bg-ink-850/98"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          {contextActions(contextMenu.item)}
        </div>
      ) : null}

      {/* dialogs */}
      <NewFolderDialog
        open={newFolderOpen}
        onClose={() => setNewFolderOpen(false)}
        busy={busy}
        parentName={pathLabel}
        onCreate={onNewFolder}
      />
      {renameTarget ? (
        <RenameDialog
          open
          onClose={() => setRenameTarget(null)}
          busy={busy}
          kind={renameTarget.kind}
          initialName={renameTarget.name}
          onRename={(name) => onRename(renameTarget, name).then(() => setRenameTarget(null)).catch(() => undefined)}
        />
      ) : null}
      {moveTarget ? (
        <MoveDialog
          open
          onClose={() => setMoveTarget(null)}
          busy={busy}
          target={moveTarget}
          folders={folders}
          folderById={folderById}
          onMove={(newParent) => onMove({ kind: moveTarget.kind, id: moveTarget.id, name: moveTarget.name, parentId: moveTarget.currentParentId }, newParent)}
        />
      ) : null}
      {deleteTarget ? (
        <DeleteDialog
          open
          onClose={() => setDeleteTarget(null)}
          busy={busy}
          kind={deleteTarget.kind}
          name={deleteTarget.name}
          detail={deleteTarget.kind === "folder" ? "Everything inside this folder — subfolders and PDFs — will move to Trash with it." : undefined}
          onConfirm={() => onDelete(deleteTarget).then(() => setDeleteTarget(null)).catch(() => undefined)}
        />
      ) : null}
      <FileDetailsDialog
        open={detailsFile !== null}
        onClose={() => setDetailsFile(null)}
        file={detailsFile}
        path={detailsFile ? folderAncestors(detailsFile.folder_id, folderById).map((f) => f.name).join(" / ") : ""}
        uploadedByName={detailsFile ? directory.get(detailsFile.uploaded_by)?.name ?? "Member" : ""}
      />

      <UploadOverlay items={uploads} />
    </div>
  );
}
