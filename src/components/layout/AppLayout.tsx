import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  Clock,
  FileText,
  Folder,
  FolderOpen,
  HardDrive,
  Home,
  LogOut,
  Menu as MenuIcon,
  Moon,
  RefreshCw,
  Search,
  Settings,
  Star,
  Sun,
  Trash2,
  X,
} from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";
import { useWorkspace } from "../../contexts/WorkspaceContext";
import { useTheme } from "../../contexts/ThemeContext";
import { searchWorkspace, getWorkspaceStats, type WorkspaceStats } from "../../services/db";
import { cn, debounce, formatBytes, timeAgo } from "../../lib/utils";
import type { SearchResult } from "../../types";
import { Avatar, Spinner } from "../ui/primitives";
import { FolderTree } from "../folders/FolderTree";

/* ------------------------------------------------------------ brand */
export function Brand({ compact }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="flex h-8.5 w-8.5 items-center justify-center rounded-lg bg-brand-600 shadow-sm shadow-brand-600/30">
        <svg viewBox="0 0 24 24" className="h-5 w-5 text-[#f4f6ff]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden="true">
          <path d="M12 6.5 5 3.8v14.4l7 2.7 7-2.7V3.8l-7 2.7Z" />
          <path d="M12 6.5v14.4" />
        </svg>
      </span>
      {!compact && (
        <span className="font-display text-[17px] font-extrabold tracking-tight text-ink-900 dark:text-ink-50">
          Study<span className="text-brand-600 dark:text-brand-400">Vault</span>
        </span>
      )}
    </div>
  );
}

/* ------------------------------------------------------------ global search */
function GlobalSearch() {
  const { workspace, folderById, directory } = useWorkspace();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const boxRef = useRef<HTMLDivElement | null>(null);

  const runSearch = useRef(
    debounce(
      async (wsId: string, q: string, fmap: Map<string, import("../../types").Folder>) => {
        setSearching(true);
        try {
          const res = await searchWorkspace(wsId, q, fmap);
          setResults(res);
          setOpen(true);
        } catch {
          setResults([]);
        } finally {
          setSearching(false);
        }
      },
      300
    )
  ).current;

  useEffect(() => {
    if (!workspace) return;
    if (query.trim().length < 2) {
      setResults([]);
      setOpen(false);
      return;
    }
    // folderById is passed at call time so the debounced closure never goes stale
    void runSearch(workspace.id, query.trim(), folderById);
  }, [query, workspace, folderById, runSearch]);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  const go = useCallback(
    (r: SearchResult) => {
      setOpen(false);
      setQuery("");
      if (!workspace) return;
      if (r.kind === "folder") navigate(`/workspace/${workspace.id}/folder/${r.id}`);
      else navigate(`/file/${r.id}`);
    },
    [navigate, workspace]
  );

  return (
    <div ref={boxRef} className="relative w-full max-w-md">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => {
            if (results.length > 0 && query.trim().length >= 2) setOpen(true);
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") setOpen(false);
            if (e.key === "Enter" && results.length > 0) go(results[0]);
          }}
          placeholder="Search PDFs and folders…"
          aria-label="Search PDFs and folders"
          className="h-9.5 w-full rounded-lg border border-ink-200 bg-ink-100/70 pl-9 pr-8 text-sm text-ink-900 placeholder:text-ink-400 transition-colors focus:border-brand-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-500/20 dark:border-ink-700 dark:bg-ink-850 dark:text-ink-100 dark:focus:bg-ink-900"
        />
        {searching ? (
          <Spinner className="absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-400" />
        ) : null}
      </div>

      {open ? (
        <div className="anim-pop absolute left-0 right-0 top-full z-50 mt-1.5 max-h-[60dvh] overflow-y-auto rounded-xl border border-ink-200 bg-white/98 py-1.5 shadow-pop backdrop-blur-sm dark:border-ink-700 dark:bg-ink-850/98">
          {results.length === 0 ? (
            <div className="px-4 py-6 text-center">
              <Search className="mx-auto h-5 w-5 text-ink-300" />
              <p className="mt-2 text-sm font-semibold text-ink-700 dark:text-ink-200">No results found</p>
              <p className="text-xs text-ink-400">Try another file or folder name.</p>
            </div>
          ) : (
            results.map((r) => (
              <button
                key={`${r.kind}-${r.id}`}
                type="button"
                onClick={() => go(r)}
                className="flex w-full items-start gap-3 px-3.5 py-2.5 text-left transition-colors hover:bg-ink-100 dark:hover:bg-ink-800"
              >
                {r.kind === "folder" ? (
                  <Folder className="mt-0.5 h-4.5 w-4.5 shrink-0 text-brand-500" />
                ) : (
                  <FileText className="mt-0.5 h-4.5 w-4.5 shrink-0 text-danger-500/80" />
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-semibold text-ink-800 dark:text-ink-100">
                    {r.name}
                  </span>
                  <span className="block truncate text-[11px] text-ink-400">
                    {r.kind === "folder" ? "Folder" : "PDF"} · {r.path}
                  </span>
                </span>
                <span className="shrink-0 text-[10px] text-ink-400">{timeAgo(r.updated_at)}</span>
              </button>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------ storage meter */
function StorageMeter() {
  const { workspace, version } = useWorkspace();
  const [stats, setStats] = useState<WorkspaceStats | null>(null);
  const ASSUMED_QUOTA = 1024 * 1024 * 1024; // Supabase free tier ≈ 1 GB

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
  }, [workspace, version]);

  if (!stats) return null;
  const pct = Math.min(100, Math.round((stats.bytesUsed / ASSUMED_QUOTA) * 100));

  return (
    <div className="rounded-lg border border-ink-200 bg-ink-100/60 p-3 dark:border-ink-800 dark:bg-ink-850/60">
      <div className="flex items-center gap-2 text-xs font-semibold text-ink-600 dark:text-ink-300">
        <HardDrive className="h-3.5 w-3.5 text-brand-500" />
        Storage
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-ink-200 dark:bg-ink-700">
        <div
          className="h-full rounded-full bg-brand-500 transition-all duration-500"
          style={{ width: `${Math.max(pct, 1)}%` }}
        />
      </div>
      <p className="mt-1.5 text-[11px] text-ink-500 dark:text-ink-400">
        {formatBytes(stats.bytesUsed)} used · {stats.fileCount} PDF{stats.fileCount === 1 ? "" : "s"} ·{" "}
        {stats.folderCount} folder{stats.folderCount === 1 ? "" : "s"}
      </p>
    </div>
  );
}

/* ------------------------------------------------------------ nav */
const NAV = [
  { to: "/dashboard", label: "Home", icon: Home, end: true },
  { to: "/starred", label: "Starred", icon: Star },
  { to: "/recent", label: "Recent", icon: Clock },
  { to: "/trash", label: "Trash", icon: Trash2 },
  { to: "/settings", label: "Settings", icon: Settings },
];

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <nav className="space-y-0.5" aria-label="Primary">
      {NAV.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.end}
          onClick={onNavigate}
          className={({ isActive }) =>
            cn(
              "flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13.5px] font-semibold transition-colors",
              isActive
                ? "bg-brand-600/12 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300"
                : "text-ink-600 hover:bg-ink-150/70 hover:text-ink-900 dark:text-ink-300 dark:hover:bg-ink-800 dark:hover:text-ink-100"
            )
          }
        >
          <item.icon className="h-4.5 w-4.5 shrink-0" />
          {item.label}
        </NavLink>
      ))}
    </nav>
  );
}

function SidebarContent({ workspaceId, currentFolderId, onNavigate }: { workspaceId: string; currentFolderId: string | null; onNavigate?: () => void }) {
  const { workspace, folders } = useWorkspace();
  return (
    <div className="flex h-full flex-col gap-5 overflow-y-auto p-4">
      <NavLinks onNavigate={onNavigate} />
      <div>
        <div className="mb-1.5 flex items-center gap-2 px-3 text-[10px] font-bold uppercase tracking-[0.14em] text-ink-400 dark:text-ink-500">
          <FolderOpen className="h-3.5 w-3.5" />
          {workspace?.name ?? "Our Notes"}
        </div>
        <FolderTree folders={folders} workspaceId={workspaceId} currentFolderId={currentFolderId} />
      </div>
      <div className="mt-auto">
        <StorageMeter />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ shell */
export function AppLayout() {
  const { profile, user, signOut } = useAuth();
  const { workspace, error: wsError, refresh } = useWorkspace();
  const { isDark, setMode } = useTheme();
  const location = useLocation();
  const navigate = useNavigate();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement | null>(null);

  // close drawer on navigation
  useEffect(() => {
    setDrawerOpen(false);
    setProfileOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) setProfileOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  const folderMatch = location.pathname.match(/\/folder\/([^/]+)/);
  const currentFolderId = folderMatch ? folderMatch[1] : null;

  const displayName = profile?.display_name || user?.email || "Student";

  const sidebarBody: ReactNode = workspace ? (
    <SidebarContent workspaceId={workspace.id} currentFolderId={currentFolderId} onNavigate={() => setDrawerOpen(false)} />
  ) : (
    <div className="p-4">
      <NavLinks onNavigate={() => setDrawerOpen(false)} />
    </div>
  );

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-ink-50 dark:bg-ink-950">
      {/* topbar */}
      <header className="z-30 flex h-15 shrink-0 items-center gap-3 border-b border-ink-200/90 bg-ink-50/95 px-3 backdrop-blur-sm sm:px-5 dark:border-ink-800 dark:bg-ink-950/95">
        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          aria-label="Open navigation menu"
          className="rounded-md p-2 text-ink-500 transition-colors hover:bg-ink-150 hover:text-ink-800 lg:hidden dark:text-ink-400 dark:hover:bg-ink-800 dark:hover:text-ink-100"
        >
          <MenuIcon className="h-5 w-5" />
        </button>
        <button type="button" onClick={() => navigate("/dashboard")} aria-label="StudyVault home" className="shrink-0">
          <Brand />
        </button>
        <div className="flex flex-1 justify-center px-2 sm:px-6">
          {workspace ? <GlobalSearch /> : null}
        </div>
        <button
          type="button"
          onClick={() => setMode(isDark ? "light" : "dark")}
          aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
          className="rounded-md p-2 text-ink-500 transition-colors hover:bg-ink-150 hover:text-ink-800 dark:text-ink-400 dark:hover:bg-ink-800 dark:hover:text-ink-100"
        >
          {isDark ? <Sun className="h-4.5 w-4.5" /> : <Moon className="h-4.5 w-4.5" />}
        </button>

        <div className="relative" ref={profileRef}>
          <button
            type="button"
            onClick={() => setProfileOpen((v) => !v)}
            aria-label="Open profile menu"
            aria-haspopup="menu"
            aria-expanded={profileOpen}
            className="flex items-center gap-2 rounded-full p-1 transition-colors hover:bg-ink-150 dark:hover:bg-ink-800"
          >
            <Avatar name={displayName} src={profile?.avatar_url} size="md" />
          </button>
          {profileOpen ? (
            <div
              role="menu"
              className="anim-pop absolute right-0 top-full z-50 mt-1.5 w-60 overflow-hidden rounded-xl border border-ink-200 bg-white/98 shadow-pop backdrop-blur-sm dark:border-ink-700 dark:bg-ink-850/98"
            >
              <div className="border-b border-ink-150 px-4 py-3 dark:border-ink-700">
                <p className="truncate text-sm font-bold text-ink-900 dark:text-ink-50">{displayName}</p>
                <p className="truncate text-xs text-ink-400">{user?.email}</p>
              </div>
              <div className="py-1">
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => navigate("/settings")}
                  className="flex w-full items-center gap-2.5 px-4 py-2 text-left text-[13px] font-medium text-ink-700 transition-colors hover:bg-ink-100 dark:text-ink-200 dark:hover:bg-ink-800"
                >
                  <Settings className="h-4 w-4" /> Settings
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => void signOut()}
                  className="flex w-full items-center gap-2.5 px-4 py-2 text-left text-[13px] font-medium text-danger-500 transition-colors hover:bg-danger-500/10"
                >
                  <LogOut className="h-4 w-4" /> Sign out
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </header>

      {wsError ? (
        <div
          role="alert"
          className="flex items-center gap-3 border-b border-danger-500/25 bg-danger-500/10 px-4 py-2.5 text-[13px] font-medium text-danger-600 dark:text-[#f0a2a2]"
        >
          <AlertTriangle className="h-4.5 w-4.5 shrink-0" />
          <span className="min-w-0 flex-1">{wsError}</span>
          <button
            type="button"
            onClick={() => void refresh()}
            className="flex shrink-0 items-center gap-1.5 rounded-md border border-danger-500/30 px-2.5 py-1 text-[12px] font-bold transition-colors hover:bg-danger-500/10"
          >
            <RefreshCw className="h-3.5 w-3.5" /> Retry
          </button>
        </div>
      ) : null}

      <div className="flex min-h-0 flex-1">
        {/* desktop sidebar */}
        <aside className="hidden w-64 shrink-0 border-r border-ink-200/90 bg-ink-100/50 lg:block dark:border-ink-800 dark:bg-ink-900/40">
          {sidebarBody}
        </aside>

        <main className="min-w-0 flex-1 overflow-y-auto pb-20 lg:pb-0">
          <Outlet />
        </main>
      </div>

      {/* mobile drawer */}
      {drawerOpen ? (
        <div className="anim-fade fixed inset-0 z-50 bg-ink-950/55 lg:hidden" onClick={() => setDrawerOpen(false)}>
          <div
            className="anim-pop absolute inset-y-0 left-0 w-[290px] max-w-[85vw] border-r border-ink-200 bg-ink-50 shadow-pop dark:border-ink-800 dark:bg-ink-900"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Navigation"
          >
            <div className="flex h-15 items-center justify-between border-b border-ink-200/90 px-4 dark:border-ink-800">
              <Brand />
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                aria-label="Close menu"
                className="rounded-md p-2 text-ink-500 hover:bg-ink-150 dark:hover:bg-ink-800"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="h-[calc(100%-3.75rem)]">{sidebarBody}</div>
          </div>
        </div>
      ) : null}

      {/* mobile bottom nav */}
      <nav
        aria-label="Primary mobile"
        className="fixed inset-x-0 bottom-0 z-40 flex items-stretch justify-around border-t border-ink-200 bg-ink-50/97 py-1.5 backdrop-blur-sm lg:hidden dark:border-ink-800 dark:bg-ink-950/97"
        style={{ paddingBottom: "max(0.375rem, env(safe-area-inset-bottom))" }}
      >
        {NAV.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              cn(
                "flex min-w-15 flex-col items-center gap-0.5 rounded-lg px-2 py-1.5 text-[10px] font-semibold transition-colors",
                isActive
                  ? "text-brand-600 dark:text-brand-400"
                  : "text-ink-500 hover:text-ink-800 dark:text-ink-400 dark:hover:text-ink-100"
              )
            }
          >
            <item.icon className="h-5 w-5" />
            {item.label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
