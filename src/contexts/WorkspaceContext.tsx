import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { requireClient } from "../lib/supabase";
import { friendlyError } from "../lib/utils";
import {
  createWorkspace as createWorkspaceDb,
  getAllFolders,
  getMyWorkspaces,
  getWorkspaceMembers,
} from "../services/db";
import type { Folder, Workspace, WorkspaceMember } from "../types";
import { useAuth } from "./AuthContext";

export interface MemberDirectoryEntry {
  name: string;
  avatar: string | null;
  email: string;
}

interface WorkspaceContextValue {
  workspaces: Workspace[];
  workspace: Workspace | null;
  members: WorkspaceMember[];
  /** userId → display info, for "uploaded by" labels */
  directory: Map<string, MemberDirectoryEntry>;
  folders: Folder[];
  folderById: Map<string, Folder>;
  /** bumped on every realtime change or manual refresh — pages reload when this moves */
  version: number;
  loading: boolean;
  /** human-readable failure from the last workspace load, if any */
  error: string | null;
  refresh: () => Promise<void>;
  bump: () => void;
  createWorkspace: (name: string, description: string) => Promise<Workspace>;
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export function useWorkspace(): WorkspaceContextValue {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error("useWorkspace must be used inside <WorkspaceProvider>");
  return ctx;
}

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [members, setMembers] = useState<WorkspaceMember[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [version, setVersion] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const coalesceRef = useRef<number | undefined>(undefined);

  const bump = useCallback(() => setVersion((v) => v + 1), []);

  const loadWorkspaceData = useCallback(async (wsId: string) => {
    const [m, f] = await Promise.all([getWorkspaceMembers(wsId), getAllFolders(wsId)]);
    setMembers(m);
    setFolders(f);
  }, []);

  const refresh = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const list = await getMyWorkspaces();
      setWorkspaces(list);
      if (list.length > 0) {
        setWorkspace(list[0]);
        await loadWorkspaceData(list[0].id);
      } else {
        setWorkspace(null);
        setMembers([]);
        setFolders([]);
      }
      bump();
    } catch (err) {
      // Don't mask database failures — record them so the UI can explain
      // what happened instead of pretending the workspace is empty.
      console.error("[StudyVault] workspace load failed:", err);
      setError(friendlyError(err, "Could not load your workspace. Please try again."));
    } finally {
      setLoading(false);
    }
  }, [user, loadWorkspaceData, bump]);

  useEffect(() => {
    if (!user) {
      setWorkspaces([]);
      setWorkspace(null);
      setMembers([]);
      setFolders([]);
      setLoading(false);
      return;
    }
    void refresh();
  }, [user, refresh]);

  /* ------------------------------------------------ realtime */
  useEffect(() => {
    if (!workspace) return;
    const sb = requireClient();
    const wsId = workspace.id;

    const scheduleRefresh = () => {
      // coalesce bursts (e.g. folder subtree delete touches many rows)
      if (coalesceRef.current) window.clearTimeout(coalesceRef.current);
      coalesceRef.current = window.setTimeout(() => {
        void loadWorkspaceData(wsId);
        bump();
      }, 350);
    };

    const channel = sb
      .channel(`studyvault-ws-${wsId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "folders", filter: `workspace_id=eq.${wsId}` },
        scheduleRefresh
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "files", filter: `workspace_id=eq.${wsId}` },
        scheduleRefresh
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "activity_logs", filter: `workspace_id=eq.${wsId}` },
        () => bump()
      )
      .subscribe();

    return () => {
      if (coalesceRef.current) window.clearTimeout(coalesceRef.current);
      void sb.removeChannel(channel);
    };
  }, [workspace, loadWorkspaceData, bump]);

  const createWorkspace = useCallback(
    async (name: string, description: string) => {
      const ws = await createWorkspaceDb(name, description);
      await refresh();
      return ws;
    },
    [refresh]
  );

  const directory = useMemo(() => {
    const map = new Map<string, MemberDirectoryEntry>();
    for (const m of members) {
      map.set(m.user_id, {
        name: m.display_name || m.email || "Member",
        avatar: m.avatar_url ?? null,
        email: m.email ?? "",
      });
    }
    return map;
  }, [members]);

  const folderById = useMemo(() => new Map(folders.map((f) => [f.id, f])), [folders]);

  const value = useMemo<WorkspaceContextValue>(
    () => ({
      workspaces,
      workspace,
      members,
      directory,
      folders,
      folderById,
      version,
      loading,
      error,
      refresh,
      bump,
      createWorkspace,
    }),
    [workspaces, workspace, members, directory, folders, folderById, version, loading, error, refresh, bump, createWorkspace]
  );

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}
