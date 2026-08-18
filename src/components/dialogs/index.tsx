import { useEffect, useMemo, useState, type FormEvent } from "react";
import { AlertTriangle, ChevronRight, FileText, Folder, Home, MoveRight } from "lucide-react";
import { Button, Dialog, Field, Input } from "../ui/primitives";
import type { FileItem, Folder as FolderType, UploadProgress } from "../../types";
import { cn, folderAncestors, formatBytes, formatDate, formatDateTime, isSelfOrDescendant, sanitizeName } from "../../lib/utils";

/* ------------------------------------------------------------- NewFolder */
export function NewFolderDialog({
  open,
  onClose,
  busy,
  parentName,
  onCreate,
}: {
  open: boolean;
  onClose: () => void;
  busy: boolean;
  parentName: string;
  onCreate: (name: string) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setName("");
      setError(null);
    }
  }, [open]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const clean = sanitizeName(name);
    if (clean.length < 1) {
      setError("Please give the folder a name.");
      return;
    }
    setError(null);
    try {
      await onCreate(clean);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create the folder.");
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="New folder"
      description={`Inside ${parentName || "Home"}`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={busy} onClick={() => void submit({ preventDefault: () => undefined } as FormEvent)}>
            Create folder
          </Button>
        </>
      }
    >
      <form onSubmit={(e) => void submit(e)}>
        <Field label="Folder name" error={error}>
          <Input
            autoFocus
            value={name}
            invalid={Boolean(error)}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Chapter 4 — Linear Equations"
            maxLength={120}
          />
        </Field>
        <button type="submit" className="hidden" aria-hidden="true" />
      </form>
    </Dialog>
  );
}

/* ------------------------------------------------------------- Rename */
export function RenameDialog({
  open,
  onClose,
  busy,
  kind,
  initialName,
  onRename,
}: {
  open: boolean;
  onClose: () => void;
  busy: boolean;
  kind: "file" | "folder";
  initialName: string;
  onRename: (name: string) => Promise<void>;
}) {
  const [name, setName] = useState(initialName);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setName(initialName);
      setError(null);
    }
  }, [open, initialName]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    let clean = sanitizeName(name);
    if (kind === "file" && !/\.pdf$/i.test(clean)) clean += ".pdf";
    if (clean.length < 4) {
      setError("Please enter a valid name.");
      return;
    }
    setError(null);
    try {
      await onRename(clean);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not rename the item.");
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={kind === "file" ? "Rename PDF" : "Rename folder"}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={busy} onClick={() => void submit({ preventDefault: () => undefined } as FormEvent)}>
            Save name
          </Button>
        </>
      }
    >
      <form onSubmit={(e) => void submit(e)}>
        <Field label="New name" error={error}>
          <Input
            autoFocus
            value={name}
            invalid={Boolean(error)}
            onChange={(e) => setName(e.target.value)}
            onFocus={(e) => {
              // select the base name, keep the .pdf extension
              const dot = e.target.value.lastIndexOf(".");
              e.target.setSelectionRange(0, dot > 0 ? dot : e.target.value.length);
            }}
            maxLength={160}
          />
        </Field>
        <button type="submit" className="hidden" aria-hidden="true" />
      </form>
    </Dialog>
  );
}

/* ------------------------------------------------------------- Move */
export interface MoveTarget {
  kind: "file" | "folder";
  id: string;
  name: string;
  currentParentId: string | null;
}

export function MoveDialog({
  open,
  onClose,
  busy,
  target,
  folders,
  folderById,
  onMove,
}: {
  open: boolean;
  onClose: () => void;
  busy: boolean;
  target: MoveTarget | null;
  folders: FolderType[];
  folderById: Map<string, FolderType>;
  onMove: (newParentId: string | null) => Promise<void>;
}) {
  const [selected, setSelected] = useState<string | null>("root");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open && target) {
      setSelected(target.currentParentId ?? "root");
      setError(null);
    }
  }, [open, target]);

  const options = useMemo(() => {
    const rows: Array<{ id: string; label: string; depth: number; disabled: boolean; reason?: string }> = [];
    const build = (parentId: string | null, depth: number) => {
      if (depth > 24) return;
      const kids = folders
        .filter((f) => f.parent_folder_id === parentId)
        .sort((a, b) => a.name.localeCompare(b.name));
      for (const f of kids) {
        let disabled = false;
        let reason: string | undefined;
        if (target?.kind === "folder") {
          if (isSelfOrDescendant(target.id, f.id, folderById)) {
            disabled = true;
            reason = "Can't move a folder into itself";
          }
        }
        rows.push({ id: f.id, label: f.name, depth, disabled, reason });
        if (!disabled) build(f.id, depth + 1);
        else build(f.id, depth + 1);
      }
    };
    build(null, 0);
    return rows;
  }, [folders, folderById, target]);

  if (!target) return null;

  const alreadyThere = selected === (target.currentParentId ?? "root");
  const destinationLabel =
    selected === "root"
      ? "Home"
      : folderAncestors(selected, folderById).map((f) => f.name).join(" / ");

  const confirm = async () => {
    if (alreadyThere) {
      setError("The item is already in that folder.");
      return;
    }
    setError(null);
    try {
      await onMove(selected === "root" ? null : selected);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not move the item.");
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={`Move “${target.name}”`}
      description="Pick a destination folder"
      wide
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={busy} disabled={alreadyThere} onClick={() => void confirm()}>
            <MoveRight className="h-4 w-4" />
            Move here
          </Button>
        </>
      }
    >
      <div className="rounded-lg border border-brand-500/30 bg-brand-50/60 px-3.5 py-2.5 text-[13px] text-brand-800 dark:bg-brand-900/20 dark:text-brand-200">
        Destination: <span className="font-bold">{destinationLabel}</span>
      </div>
      {error ? <p className="mt-2 text-xs font-medium text-danger-500">{error}</p> : null}
      <div className="mt-3 max-h-[46dvh] overflow-y-auto rounded-lg border border-ink-200 dark:border-ink-700" role="radiogroup" aria-label="Destination folder">
        <button
          type="button"
          role="radio"
          aria-checked={selected === "root"}
          onClick={() => setSelected("root")}
          className={cn(
            "flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-[13.5px] font-medium transition-colors",
            selected === "root"
              ? "bg-brand-600/10 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300"
              : "text-ink-700 hover:bg-ink-100 dark:text-ink-200 dark:hover:bg-ink-800"
          )}
        >
          <Home className="h-4 w-4 shrink-0" />
          Home (workspace root)
        </button>
        {options.map((opt) => (
          <button
            key={opt.id}
            type="button"
            role="radio"
            aria-checked={selected === opt.id}
            disabled={opt.disabled}
            title={opt.reason}
            onClick={() => setSelected(opt.id)}
            className={cn(
              "flex w-full items-center gap-2 border-t border-ink-150 px-3.5 py-2.5 text-left text-[13.5px] font-medium transition-colors dark:border-ink-800",
              opt.disabled
                ? "cursor-not-allowed text-ink-300 line-through decoration-ink-300/60 dark:text-ink-600"
                : selected === opt.id
                  ? "bg-brand-600/10 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300"
                  : "text-ink-700 hover:bg-ink-100 dark:text-ink-200 dark:hover:bg-ink-800"
            )}
            style={{ paddingLeft: `${14 + opt.depth * 18}px` }}
          >
            {opt.depth > 0 ? <ChevronRight className="h-3 w-3 shrink-0 text-ink-300" /> : null}
            <Folder className="h-4 w-4 shrink-0" />
            <span className="truncate">{opt.label}</span>
          </button>
        ))}
        {options.length === 0 ? (
          <p className="border-t border-ink-150 px-3.5 py-4 text-center text-[13px] text-ink-400 dark:border-ink-800">
            No other folders yet — create one first.
          </p>
        ) : null}
      </div>
    </Dialog>
  );
}

/* ------------------------------------------------------------- Delete confirm */
export function DeleteDialog({
  open,
  onClose,
  busy,
  kind,
  name,
  detail,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  busy: boolean;
  kind: "file" | "folder";
  name: string;
  detail?: string;
  onConfirm: () => Promise<void>;
}) {
  const [error, setError] = useState<string | null>(null);
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={kind === "file" ? "Delete PDF?" : "Delete folder?"}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button
            variant="danger"
            loading={busy}
            onClick={() => {
              setError(null);
              onConfirm().then(onClose).catch((err) => setError(err instanceof Error ? err.message : "Delete failed."));
            }}
          >
            <AlertTriangle className="h-4 w-4" />
            Move to Trash
          </Button>
        </>
      }
    >
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-danger-500/12 text-danger-500">
          {kind === "file" ? <FileText className="h-5 w-5" /> : <Folder className="h-5 w-5" />}
        </span>
        <div className="text-sm leading-relaxed text-ink-600 dark:text-ink-300">
          <p>
            <span className="font-bold text-ink-900 dark:text-ink-100">{name}</span> will be moved to
            Trash. You can restore it later from the Trash page.
          </p>
          {detail ? <p className="mt-1.5 text-[13px] text-ink-500 dark:text-ink-400">{detail}</p> : null}
          {error ? <p className="mt-2 text-[13px] font-medium text-danger-500">{error}</p> : null}
        </div>
      </div>
    </Dialog>
  );
}

/* ------------------------------------------------------------- Permanent delete confirm */
export function PurgeDialog({
  open,
  onClose,
  busy,
  name,
  pluralThing,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  busy: boolean;
  name: string;
  pluralThing: string;
  onConfirm: () => Promise<void>;
}) {
  const [error, setError] = useState<string | null>(null);
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Delete forever?"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Keep it</Button>
          <Button
            variant="danger"
            loading={busy}
            onClick={() => {
              setError(null);
              onConfirm().then(onClose).catch((err) => setError(err instanceof Error ? err.message : "Delete failed."));
            }}
          >
            <AlertTriangle className="h-4 w-4" />
            Delete forever
          </Button>
        </>
      }
    >
      <p className="text-sm leading-relaxed text-ink-600 dark:text-ink-300">
        <span className="font-bold text-ink-900 dark:text-ink-100">{name}</span> and {pluralThing} will be
        permanently removed — including the PDF data in cloud storage.{" "}
        <span className="font-semibold text-danger-500">This cannot be undone.</span>
      </p>
      {error ? <p className="mt-2 text-[13px] font-medium text-danger-500">{error}</p> : null}
    </Dialog>
  );
}

/* ------------------------------------------------------------- File details */
export function FileDetailsDialog({
  open,
  onClose,
  file,
  path,
  uploadedByName,
}: {
  open: boolean;
  onClose: () => void;
  file: FileItem | null;
  path: string;
  uploadedByName: string;
}) {
  if (!file) return null;
  const rows: Array<[string, string]> = [
    ["Type", "PDF document"],
    ["Size", formatBytes(file.file_size)],
    ["Location", path || "Home"],
    ["Uploaded by", uploadedByName],
    ["Uploaded", formatDate(file.created_at)],
    ["Last modified", formatDateTime(file.updated_at)],
  ];
  return (
    <Dialog open={open} onClose={onClose} title={file.name} description="File details">
      <div className="overflow-hidden rounded-lg border border-ink-200 dark:border-ink-700">
        {rows.map(([label, value], i) => (
          <div
            key={label}
            className={cn(
              "flex items-start justify-between gap-4 px-3.5 py-2.5 text-[13px]",
              i % 2 === 0 ? "bg-ink-100/60 dark:bg-ink-850" : "bg-transparent"
            )}
          >
            <span className="shrink-0 font-semibold text-ink-500 dark:text-ink-400">{label}</span>
            <span className="text-right font-medium text-ink-800 dark:text-ink-100">{value}</span>
          </div>
        ))}
      </div>
    </Dialog>
  );
}

/* ------------------------------------------------------------- Upload overlay */
export function UploadOverlay({ items }: { items: UploadProgress[] }) {
  if (items.length === 0) return null;
  return (
    <div className="pointer-events-none fixed bottom-20 right-4 z-[80] w-[min(92vw,330px)] space-y-2 lg:bottom-5">
      {items.map((item) => (
        <div
          key={item.fileName}
          className="anim-pop pointer-events-auto rounded-xl border border-ink-200 bg-white/97 p-3.5 shadow-pop backdrop-blur-sm dark:border-ink-700 dark:bg-ink-850/97"
        >
          <div className="flex items-center gap-2.5">
            <FileText className="h-4.5 w-4.5 shrink-0 text-danger-500/80" />
            <p className="min-w-0 flex-1 truncate text-[13px] font-semibold text-ink-800 dark:text-ink-100">
              {item.fileName}
            </p>
            <span className="shrink-0 font-display text-[11px] font-bold text-brand-600 dark:text-brand-400">
              {item.phase === "done" ? "Done" : item.phase === "error" ? "Failed" : `${item.percent}%`}
            </span>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-ink-150 dark:bg-ink-700">
            <div
              className={cn(
                "h-full rounded-full transition-all duration-200",
                item.phase === "error" ? "bg-danger-500" : "bg-brand-500"
              )}
              style={{ width: `${item.phase === "error" ? 100 : item.percent}%` }}
            />
          </div>
          <p className="mt-1.5 text-[11px] text-ink-400">
            {item.phase === "uploading" ? "Uploading…" : item.phase === "done" ? "PDF uploaded successfully" : "Upload failed"}
          </p>
        </div>
      ))}
    </div>
  );
}
