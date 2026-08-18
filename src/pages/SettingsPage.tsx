import { useEffect, useRef, useState, type ChangeEvent, type ReactNode } from "react";
import {
  Camera,
  HardDrive,
  KeyRound,
  LogOut,
  Monitor,
  Moon,
  ShieldCheck,
  Sun,
  UserRound,
  Users,
  Library as WorkspaceIcon,
} from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { useWorkspace } from "../contexts/WorkspaceContext";
import { useTheme, type ThemeMode } from "../contexts/ThemeContext";
import { useToast } from "../contexts/ToastContext";
import { getWorkspaceStats, inviteToWorkspace, updateWorkspaceName, type WorkspaceStats } from "../services/db";
import { cn, formatBytes, friendlyError } from "../lib/utils";
import { Avatar, Button, Field, Input } from "../components/ui/primitives";

function Section({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <section className="anim-fade-up rounded-xl border border-ink-200 bg-white/80 shadow-card dark:border-ink-800 dark:bg-ink-900/70">
      <header className="flex items-center gap-2.5 border-b border-ink-150 px-5 py-3.5 dark:border-ink-850">
        <span className="text-brand-600 dark:text-brand-400 [&>svg]:h-4.5 [&>svg]:w-4.5">{icon}</span>
        <h2 className="font-display text-[15px] font-extrabold text-ink-900 dark:text-ink-50">{title}</h2>
      </header>
      <div className="px-5 py-4">{children}</div>
    </section>
  );
}

/** Downscale an image file to a small square data-URL (stored on the profile row). */
function processAvatar(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith("image/")) {
      reject(new Error("Please choose an image file."));
      return;
    }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      try {
        const size = 160;
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("Could not process the image.");
        const scale = Math.max(size / img.width, size / img.height);
        const w = img.width * scale;
        const h = img.height * scale;
        ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
        resolve(canvas.toDataURL("image/jpeg", 0.85));
      } catch (err) {
        reject(err instanceof Error ? err : new Error("Could not process the image."));
      } finally {
        URL.revokeObjectURL(url);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("That file doesn't look like a valid image."));
    };
    img.src = url;
  });
}

export function SettingsPage() {
  const { user, profile, saveProfile, changePassword, signOut, refreshProfile } = useAuth();
  const { workspace, members, refresh } = useWorkspace();
  const { mode, setMode } = useTheme();
  const { toast } = useToast();

  const [name, setName] = useState(profile?.display_name ?? "");
  const [savingName, setSavingName] = useState(false);
  const [savingAvatar, setSavingAvatar] = useState(false);
  const avatarRef = useRef<HTMLInputElement | null>(null);

  const [wsName, setWsName] = useState(workspace?.name ?? "");
  const [savingWs, setSavingWs] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);

  const [stats, setStats] = useState<WorkspaceStats | null>(null);

  const [pwNew, setPwNew] = useState("");
  const [pwConfirm, setPwConfirm] = useState("");
  const [pwError, setPwError] = useState<string | null>(null);
  const [savingPw, setSavingPw] = useState(false);

  useEffect(() => {
    setName(profile?.display_name ?? "");
  }, [profile]);
  useEffect(() => {
    setWsName(workspace?.name ?? "");
  }, [workspace]);
  useEffect(() => {
    if (!workspace) return;
    let cancelled = false;
    getWorkspaceStats(workspace.id)
      .then((s) => {
        if (!cancelled) setStats(s);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [workspace]);

  const me = members.find((m) => m.user_id === user?.id);
  const isOwner = me?.role === "owner";
  const ASSUMED_QUOTA = 1024 * 1024 * 1024;

  const onPickAvatar = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setSavingAvatar(true);
    try {
      const dataUrl = await processAvatar(file);
      await saveProfile({ avatar_url: dataUrl });
      await refreshProfile();
      toast("Profile photo updated");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not update the photo.", "error");
    } finally {
      setSavingAvatar(false);
    }
  };

  const saveName = async () => {
    if (name.trim().length < 1) {
      toast("Please enter a display name.", "error");
      return;
    }
    setSavingName(true);
    try {
      await saveProfile({ display_name: name.trim() });
      toast("Name saved");
    } catch (err) {
      toast(friendlyError(err, "Could not save the name."), "error");
    } finally {
      setSavingName(false);
    }
  };

  const saveWsName = async () => {
    if (!workspace || wsName.trim().length < 2) {
      toast("Please enter a workspace name.", "error");
      return;
    }
    setSavingWs(true);
    try {
      await updateWorkspaceName(workspace.id, wsName.trim());
      await refresh();
      toast("Workspace renamed");
    } catch (err) {
      toast(friendlyError(err, "Only the owner can rename the workspace."), "error");
    } finally {
      setSavingWs(false);
    }
  };

  const invite = async () => {
    if (!workspace) return;
    setInviting(true);
    setInviteError(null);
    try {
      const res = await inviteToWorkspace(workspace.id, inviteEmail);
      toast(`${res.display_name} was added to the workspace`);
      setInviteEmail("");
      await refresh();
    } catch (err) {
      const raw = err instanceof Error ? err.message.toLowerCase() : "";
      if (raw.includes("no account") || raw.includes("not found"))
        setInviteError("No StudyVault account exists for that email yet — ask your friend to sign up first.");
      else if (raw.includes("already a member")) setInviteError("That user is already a member.");
      else setInviteError(friendlyError(err, "Could not add the member."));
    } finally {
      setInviting(false);
    }
  };

  const savePassword = async () => {
    setPwError(null);
    if (pwNew.length < 6) {
      setPwError("New password must be at least 6 characters.");
      return;
    }
    if (pwNew !== pwConfirm) {
      setPwError("Passwords do not match.");
      return;
    }
    setSavingPw(true);
    try {
      await changePassword(pwNew);
      setPwNew("");
      setPwConfirm("");
      toast("Password changed");
    } catch (err) {
      setPwError(friendlyError(err, "Could not change the password."));
    } finally {
      setSavingPw(false);
    }
  };

  const themeOptions: Array<{ value: ThemeMode; label: string; icon: typeof Sun }> = [
    { value: "light", label: "Light", icon: Sun },
    { value: "dark", label: "Dark", icon: Moon },
    { value: "system", label: "System", icon: Monitor },
  ];

  const roleBadge = (role: string) => (
    <span
      className={cn(
        "rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide",
        role === "owner"
          ? "bg-brand-600/12 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300"
          : role === "editor"
            ? "bg-[#0e9f8a]/12 text-[#0b7a6a] dark:text-[#5fd0bd]"
            : "bg-ink-150 text-ink-500 dark:bg-ink-800 dark:text-ink-400"
      )}
    >
      {role}
    </span>
  );

  return (
    <div className="mx-auto max-w-3xl space-y-4 px-4 py-6 pb-10 sm:px-6">
      <div className="anim-fade-up">
        <h1 className="font-display text-xl font-extrabold tracking-tight text-ink-900 sm:text-2xl dark:text-ink-50">Settings</h1>
        <p className="text-[13px] text-ink-500 dark:text-ink-400">Account, appearance, workspace and security.</p>
      </div>

      {/* account */}
      <Section icon={<UserRound />} title="Account">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
          <div className="flex items-center gap-4">
            <Avatar name={profile?.display_name || user?.email || "?"} src={profile?.avatar_url} size="lg" />
            <div>
              <input ref={avatarRef} type="file" accept="image/*" className="hidden" onChange={(e) => void onPickAvatar(e)} />
              <Button variant="secondary" size="sm" loading={savingAvatar} onClick={() => avatarRef.current?.click()}>
                <Camera className="h-3.5 w-3.5" /> Change photo
              </Button>
              <p className="mt-1.5 max-w-45 text-[11px] leading-snug text-ink-400">Square images work best. Stored privately on your profile.</p>
            </div>
          </div>
          <div className="flex-1 space-y-3">
            <Field label="Display name">
              <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} placeholder="Prayag" />
            </Field>
            <Field label="Email">
              <Input value={user?.email ?? ""} readOnly className="opacity-70" />
            </Field>
            <div className="flex justify-end">
              <Button variant="primary" size="sm" loading={savingName} onClick={() => void saveName()}>Save profile</Button>
            </div>
          </div>
        </div>
      </Section>

      {/* appearance */}
      <Section icon={<Sun />} title="Appearance">
        <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Theme">
          {themeOptions.map((opt) => (
            <button
              key={opt.value}
              type="button"
              role="radio"
              aria-checked={mode === opt.value}
              onClick={() => setMode(opt.value)}
              className={cn(
                "flex flex-col items-center gap-1.5 rounded-xl border px-3 py-3.5 text-[13px] font-bold transition-all",
                mode === opt.value
                  ? "border-brand-500 bg-brand-600/8 text-brand-700 shadow-sm dark:bg-brand-500/10 dark:text-brand-300"
                  : "border-ink-200 text-ink-500 hover:border-ink-300 hover:text-ink-800 dark:border-ink-700 dark:text-ink-400 dark:hover:text-ink-100"
              )}
            >
              <opt.icon className="h-5 w-5" />
              {opt.label}
            </button>
          ))}
        </div>
      </Section>

      {/* workspace */}
      {workspace ? (
        <Section icon={<WorkspaceIcon />} title="Workspace">
          <div className="space-y-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
              <div className="flex-1">
                <Field label="Workspace name">
                  <Input value={wsName} onChange={(e) => setWsName(e.target.value)} maxLength={60} disabled={!isOwner} />
                </Field>
              </div>
              {isOwner ? (
                <Button variant="secondary" loading={savingWs} onClick={() => void saveWsName()}>Save</Button>
              ) : null}
            </div>
            {!isOwner ? (
              <p className="text-[12px] text-ink-400">Only the workspace owner can rename it or manage members.</p>
            ) : null}

            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-500 dark:text-ink-400">Members</p>
              <ul className="space-y-2">
                {members.map((m) => (
                  <li key={m.id} className="flex items-center gap-3 rounded-lg border border-ink-150 px-3 py-2 dark:border-ink-800">
                    <Avatar name={m.display_name || m.email || "?"} src={m.avatar_url} size="sm" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-bold text-ink-900 dark:text-ink-50">
                        {m.display_name || "Member"}
                        {m.user_id === user?.id ? <span className="text-ink-400"> (you)</span> : null}
                      </span>
                      <span className="block truncate text-[11px] text-ink-400">{m.email}</span>
                    </span>
                    {roleBadge(m.role)}
                  </li>
                ))}
              </ul>
            </div>

            {isOwner && members.length < 2 ? (
              <div className="rounded-lg border border-dashed border-ink-300 p-3.5 dark:border-ink-700">
                <p className="mb-2 flex items-center gap-2 text-[13px] font-bold text-ink-800 dark:text-ink-100">
                  <Users className="h-4 w-4 text-brand-500" /> Invite your study partner
                </p>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Input
                    type="email"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    placeholder="friend@school.edu"
                    invalid={Boolean(inviteError)}
                  />
                  <Button variant="primary" loading={inviting} onClick={() => void invite()}>Invite</Button>
                </div>
                {inviteError ? <p className="mt-1.5 text-xs font-medium text-danger-500">{inviteError}</p> : null}
                <p className="mt-1.5 text-[11px] text-ink-400">They need a StudyVault account with this email first.</p>
              </div>
            ) : null}
          </div>
        </Section>
      ) : null}

      {/* storage */}
      {workspace ? (
        <Section icon={<HardDrive />} title="Storage">
          {stats ? (
            <div>
              <div className="flex items-baseline justify-between">
                <span className="font-display text-lg font-extrabold text-ink-900 dark:text-ink-50">{formatBytes(stats.bytesUsed)}</span>
                <span className="text-[12px] text-ink-400">of ~1 GB free-tier storage</span>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-ink-150 dark:bg-ink-800">
                <div
                  className="h-full rounded-full bg-brand-500 transition-all duration-500"
                  style={{ width: `${Math.max(Math.min((stats.bytesUsed / ASSUMED_QUOTA) * 100, 100), 1)}%` }}
                />
              </div>
              <p className="mt-2 text-[12.5px] text-ink-500 dark:text-ink-400">
                {stats.fileCount} PDF{stats.fileCount === 1 ? "" : "s"} · {stats.folderCount} folder{stats.folderCount === 1 ? "" : "s"} — calculated from file metadata, no downloads involved.
              </p>
            </div>
          ) : (
            <p className="text-sm text-ink-400">Loading storage info…</p>
          )}
        </Section>
      ) : null}

      {/* security */}
      <Section icon={<ShieldCheck />} title="Security">
        <div className="space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="New password">
              <Input type="password" autoComplete="new-password" value={pwNew} onChange={(e) => setPwNew(e.target.value)} placeholder="At least 6 characters" />
            </Field>
            <Field label="Confirm new password" error={pwError}>
              <Input type="password" autoComplete="new-password" value={pwConfirm} invalid={Boolean(pwError)} onChange={(e) => setPwConfirm(e.target.value)} placeholder="Repeat password" />
            </Field>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            <Button variant="dangerGhost" onClick={() => void signOut()}>
              <LogOut className="h-4 w-4" /> Sign out
            </Button>
            <Button variant="primary" loading={savingPw} onClick={() => void savePassword()}>
              <KeyRound className="h-4 w-4" /> Update password
            </Button>
          </div>
        </div>
      </Section>
    </div>
  );
}
