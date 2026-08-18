import { useEffect, useRef, useState, type DragEvent } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowRight,
  FileText,
  Folder,
  FolderPlus,
  HardDrive,
  Upload,
  Users,
} from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { useWorkspace } from "../contexts/WorkspaceContext";
import { useToast } from "../contexts/ToastContext";
import {
  createFolder,
  getRecentFiles,
  getWorkspaceStats,
  inviteToWorkspace,
  logActivity,
  type WorkspaceStats,
} from "../services/db";
import { uploadPdf, UploadError } from "../services/storage";
import type { FileItem, UploadProgress } from "../types";
import { folderPath, formatBytes, friendlyError, greeting, timeAgo } from "../lib/utils";
import { ActivityPanel } from "../components/ActivityPanel";
import { Avatar, Button, EmptyState, Field, Input, SkeletonRows } from "../components/ui/primitives";
import { NewFolderDialog, UploadOverlay } from "../components/dialogs";
import { Dialog } from "../components/ui/primitives";

/* ------------------------------------------------ onboarding (no workspace yet) */
function Onboarding() {
  const { createWorkspace } = useWorkspace();
  const { toast } = useToast();
  const [name, setName] = useState("Our Notes");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const create = async () => {
    if (name.trim().length < 2) {
      setError("Give your workspace a name.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await createWorkspace(name.trim(), "Private shared notes for the two of us");
      toast("Workspace created — start adding folders!");
    } catch (err) {
      setError(friendlyError(err, "Could not create the workspace."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="anim-fade-up mx-auto max-w-lg px-4 py-14 sm:px-6">
      <div className="rounded-2xl border border-ink-200 bg-white/80 p-7 shadow-card dark:border-ink-800 dark:bg-ink-900/70">
        <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand-600/12 text-brand-600 dark:text-brand-400">
          <Folder className="h-6 w-6" />
        </span>
        <h2 className="font-display mt-4 text-xl font-extrabold text-ink-900 dark:text-ink-50">
          Create your shared workspace
        </h2>
        <p className="mt-1.5 text-sm leading-relaxed text-ink-500 dark:text-ink-400">
          This is the private vault where both of you organise notes. Create it once — then invite
          your friend from Settings and everything you add shows up on their side instantly.
        </p>
        <div className="mt-5">
          <Field label="Workspace name" error={error}>
            <Input value={name} invalid={Boolean(error)} onChange={(e) => setName(e.target.value)} maxLength={60} />
          </Field>
        </div>
        <Button variant="primary" size="lg" className="mt-4 w-full" loading={busy} onClick={() => void create()}>
          <FolderPlus className="h-4.5 w-4.5" />
          Create workspace
        </Button>
      </div>
    </div>
  );
}

/* ------------------------------------------------ quick invite (owner, one member) */
function InviteNudge() {
  const { workspace, members, refresh } = useWorkspace();
  const { user } = useAuth();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const me = members.find((m) => m.user_id === user?.id);
  if (!workspace || me?.role !== "owner" || members.length >= 2) return null;

  const send = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await inviteToWorkspace(workspace.id, email);
      toast(`${res.display_name} was added to the workspace`);
      setOpen(false);
      setEmail("");
      await refresh();
    } catch (err) {
      const raw = err instanceof Error ? err.message.toLowerCase() : "";
      if (raw.includes("no account") || raw.includes("not found"))
        setError("No StudyVault account exists for that email yet — ask your friend to sign up first.");
      else if (raw.includes("already a member")) setError("That user is already a member.");
      else setError(friendlyError(err, "Could not add the member."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="group flex w-full items-center gap-3 rounded-xl border border-dashed border-brand-400/50 bg-brand-50/60 px-4 py-3 text-left transition-colors hover:border-brand-500 hover:bg-brand-50 dark:border-brand-500/40 dark:bg-brand-900/15 dark:hover:bg-brand-900/25"
      >
        <Users className="h-5 w-5 shrink-0 text-brand-600 dark:text-brand-400" />
        <span className="flex-1">
          <span className="block text-[13.5px] font-bold text-ink-900 dark:text-ink-50">It's just you here so far</span>
          <span className="block text-xs text-ink-500 dark:text-ink-400">Invite your study partner by email</span>
        </span>
        <ArrowRight className="h-4 w-4 text-brand-500 transition-transform group-hover:translate-x-0.5" />
      </button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Invite your study partner"
        description="They must already have a StudyVault account with this email."
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button variant="primary" loading={busy} onClick={() => void send()}>Add member</Button>
          </>
        }
      >
        <Field label="Friend's email" error={error}>
          <Input type="email" autoFocus value={email} invalid={Boolean(error)} onChange={(e) => setEmail(e.target.value)} placeholder="friend@school.edu" />
        </Field>
      </Dialog>
    </>
  );
}

/* ------------------------------------------------ dashboard */
export function Dashboard() {
  const { profile } = useAuth();
  const { workspace, folderById, version, bump } = useWorkspace();
  const { toast } = useToast();
  const navigate = useNavigate();

  const [stats, setStats] = useState<WorkspaceStats | null>(null);
  const [recent, setRecent] = useState<FileItem[] | null>(null);
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [uploads, setUploads] = useState<UploadProgress[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const namesRef = useRef<string[]>([]);

  useEffect(() => {
    if (!workspace) return;
    let cancelled = false;
    setRecent(null);
    Promise.all([getWorkspaceStats(workspace.id), getRecentFiles(workspace.id, 6)])
      .then(([s, r]) => {
        if (cancelled) return;
        setStats(s);
        setRecent(r);
        namesRef.current = r.map((f) => f.name);
      })
      .catch(() => {
        if (!cancelled) setRecent([]);
      });
    return () => {
      cancelled = true;
    };
  }, [workspace, version]);

  if (!workspace) return <Onboarding />;

  const wsId = workspace.id;
  const firstName = (profile?.display_name || "there").split(" ")[0];

  const quickUpload = async (files: FileList) => {
    const list = Array.from(files);
    for (const file of list) {
      const entry: UploadProgress = { fileName: file.name, percent: 0, phase: "uploading" };
      setUploads((prev) => [...prev, entry]);
      const update = (patch: Partial<UploadProgress>) =>
        setUploads((prev) => prev.map((u) => (u.fileName === entry.fileName ? { ...u, ...patch } : u)));
      try {
        const saved = await uploadPdf(wsId, null, file, namesRef.current, (p) => update({ percent: p }));
        namesRef.current = [...namesRef.current, saved.name];
        update({ percent: 100, phase: "done" });
        logActivity(wsId, "uploaded", "file", saved.id, saved.name, { path: "Home" });
        bump();
        toast("PDF uploaded successfully");
      } catch (err) {
        update({ phase: "error" });
        toast(err instanceof UploadError ? err.message : friendlyError(err, "Unable to upload the PDF."), "error");
      } finally {
        window.setTimeout(() => setUploads((prev) => prev.filter((u) => u.fileName !== entry.fileName)), 2600);
      }
    }
  };

  const tiles = [
    { label: "Folders", value: stats ? String(stats.folderCount) : "…", icon: Folder, accent: "text-brand-600 dark:text-brand-400 bg-brand-600/10" },
    { label: "PDFs", value: stats ? String(stats.fileCount) : "…", icon: FileText, accent: "text-danger-500 bg-danger-500/10" },
    { label: "Storage used", value: stats ? formatBytes(stats.bytesUsed) : "…", icon: HardDrive, accent: "text-[#0e9f8a] bg-[#0e9f8a]/10" },
  ];

  return (
    <div
      className="relative mx-auto h-full max-w-6xl px-4 py-6 sm:px-6"
      onDragOver={(e: DragEvent) => {
        if (Array.from(e.dataTransfer.types).includes("Files")) {
          e.preventDefault();
          setDragOver(true);
        }
      }}
      onDragLeave={(e) => {
        if (e.target === e.currentTarget) setDragOver(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        if (e.dataTransfer.files.length) void quickUpload(e.dataTransfer.files);
      }}
    >
      {/* greeting */}
      <div className="anim-fade-up">
        <h1 className="font-display text-[26px] font-extrabold tracking-tight text-ink-900 sm:text-3xl dark:text-ink-50">
          {greeting()}, {firstName} <span aria-hidden="true">👋</span>
        </h1>
        <p className="mt-1 text-sm text-ink-500 dark:text-ink-400">
          Your shared notes in <span className="font-semibold text-ink-700 dark:text-ink-200">{workspace.name}</span>
        </p>
      </div>

      {/* stat tiles */}
      <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
        {tiles.map((t, i) => (
          <div
            key={t.label}
            className="anim-fade-up flex items-center gap-3.5 rounded-xl border border-ink-200 bg-white/80 px-4 py-3.5 shadow-card dark:border-ink-800 dark:bg-ink-900/70"
            style={{ animationDelay: `${i * 60}ms` }}
          >
            <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${t.accent}`}>
              <t.icon className="h-5 w-5" />
            </span>
            <span>
              <span className="font-display block text-xl font-extrabold leading-tight text-ink-900 dark:text-ink-50">{t.value}</span>
              <span className="block text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-400">{t.label}</span>
            </span>
          </div>
        ))}
      </div>

      {/* quick actions + invite */}
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-ink-200 bg-white/80 px-4 py-3 shadow-card dark:border-ink-800 dark:bg-ink-900/70">
          <span className="mr-1 text-[11px] font-bold uppercase tracking-[0.14em] text-ink-400">Quick actions</span>
          <Button variant="primary" size="sm" onClick={() => fileRef.current?.click()}>
            <Upload className="h-3.5 w-3.5" /> Upload PDF
          </Button>
          <Button variant="secondary" size="sm" onClick={() => setNewFolderOpen(true)}>
            <FolderPlus className="h-3.5 w-3.5" /> New folder
          </Button>
          <Button variant="ghost" size="sm" onClick={() => navigate(`/workspace/${wsId}`)}>
            Open workspace <ArrowRight className="h-3.5 w-3.5" />
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept="application/pdf,.pdf"
            multiple
            className="hidden"
            onChange={(e) => {
              if (e.target.files?.length) void quickUpload(e.target.files);
              e.target.value = "";
            }}
          />
        </div>
        <InviteNudge />
      </div>

      {/* recent + activity */}
      <div className="mt-6 grid grid-cols-1 gap-4 pb-8 lg:grid-cols-[1.6fr_1fr]">
        <section className="rounded-xl border border-ink-200 bg-white/80 p-4 shadow-card sm:p-5 dark:border-ink-800 dark:bg-ink-900/70">
          <div className="mb-3.5 flex items-center justify-between">
            <h2 className="font-display text-[15px] font-extrabold text-ink-900 dark:text-ink-50">Recent files</h2>
            <button
              type="button"
              onClick={() => navigate("/recent")}
              className="text-xs font-bold text-brand-600 hover:underline dark:text-brand-400"
            >
              View all
            </button>
          </div>
          {recent === null ? (
            <SkeletonRows count={5} />
          ) : recent.length === 0 ? (
            <EmptyState
              compact
              icon={<FileText />}
              title="No PDFs yet"
              body="Upload your first PDF — it lands in Home and your friend sees it instantly."
              actions={
                <Button variant="primary" size="sm" onClick={() => fileRef.current?.click()}>
                  <Upload className="h-3.5 w-3.5" /> Upload PDF
                </Button>
              }
            />
          ) : (
            <ul className="divide-y divide-ink-150 dark:divide-ink-850">
              {recent.map((f) => (
                <li key={f.id}>
                  <button
                    type="button"
                    onClick={() => navigate(`/file/${f.id}`)}
                    className="group flex w-full items-center gap-3 rounded-lg px-2 py-2.5 text-left transition-colors hover:bg-ink-100/80 dark:hover:bg-ink-850"
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-danger-500/10 text-danger-500">
                      <FileText className="h-4.5 w-4.5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13.5px] font-bold text-ink-900 dark:text-ink-50">{f.name}</span>
                      <span className="block truncate text-[11.5px] text-ink-400">
                        {folderPath(f.folder_id, folderById) || "Home"} · {timeAgo(f.updated_at)}
                      </span>
                    </span>
                    <span className="hidden shrink-0 text-[11px] text-ink-400 sm:block">{formatBytes(f.file_size)}</span>
                    <ArrowRight className="h-4 w-4 shrink-0 text-ink-300 transition-transform group-hover:translate-x-0.5 group-hover:text-brand-500" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-xl border border-ink-200 bg-white/80 p-4 shadow-card sm:p-5 dark:border-ink-800 dark:bg-ink-900/70">
          <h2 className="font-display mb-4 text-[15px] font-extrabold text-ink-900 dark:text-ink-50">Recent activity</h2>
          <ActivityPanel limit={9} />
        </section>
      </div>

      {dragOver ? (
        <div className="pointer-events-none absolute inset-2 z-30 flex items-center justify-center rounded-2xl border-2 border-dashed border-brand-500 bg-brand-500/8">
          <p className="rounded-xl bg-white/95 px-6 py-3 text-sm font-bold text-ink-900 shadow-pop dark:bg-ink-850/95 dark:text-ink-50">
            Drop PDFs to upload into Home
          </p>
        </div>
      ) : null}

      <NewFolderDialog
        open={newFolderOpen}
        onClose={() => setNewFolderOpen(false)}
        busy={busy}
        parentName="Home"
        onCreate={async (name) => {
          setBusy(true);
          try {
            const f = await createFolder(wsId, null, name);
            logActivity(wsId, "created", "folder", f.id, name, { path: "Home" });
            bump();
            toast("Folder created");
          } finally {
            setBusy(false);
          }
        }}
      />
      <UploadOverlay items={uploads} />
    </div>
  );
}
