import { requireClient } from "../lib/supabase";
import type {
  ActivityLog,
  FileItem,
  Folder,
  FolderContents,
  SearchResult,
  Star,
  UserProfile,
  Workspace,
  WorkspaceMember,
} from "../types";
import { folderPath } from "../lib/utils";

/* ------------------------------------------------------------------ */
/* Profiles                                                            */
/* ------------------------------------------------------------------ */

export async function getProfile(userId: string): Promise<UserProfile | null> {
  const sb = requireClient();
  const { data, error } = await sb.from("profiles").select("*").eq("id", userId).maybeSingle();
  if (error) throw error;
  return data as UserProfile | null;
}

export async function updateProfile(
  userId: string,
  patch: { display_name?: string; avatar_url?: string }
): Promise<UserProfile> {
  const sb = requireClient();
  const { data, error } = await sb
    .from("profiles")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", userId)
    .select()
    .single();
  if (error) throw error;
  return data as UserProfile;
}

/* ------------------------------------------------------------------ */
/* Workspaces                                                          */
/* ------------------------------------------------------------------ */

export async function getMyWorkspaces(): Promise<Workspace[]> {
  const sb = requireClient();
  const { data, error } = await sb
    .from("workspaces")
    .select("*")
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as Workspace[];
}

export async function createWorkspace(name: string, description: string): Promise<Workspace> {
  const sb = requireClient();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) throw new Error("You must be signed in to create a workspace.");
  const { data, error } = await sb
    .from("workspaces")
    .insert({ name, description })
    .select()
    .single();
  if (error) throw error;
  const ws = data as Workspace;
  const { error: memberError } = await sb
    .from("workspace_members")
    .insert({ workspace_id: ws.id, user_id: user.id, role: "owner" });
  if (memberError) throw memberError;
  return ws;
}

export async function updateWorkspaceName(id: string, name: string): Promise<void> {
  const sb = requireClient();
  const { error } = await sb
    .from("workspaces")
    .update({ name, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

/** Members with display names resolved through the secure member directory. */
export async function getWorkspaceMembers(workspaceId: string): Promise<WorkspaceMember[]> {
  const sb = requireClient();
  const { data, error } = await sb.rpc("get_workspace_members", { ws: workspaceId });
  if (error) throw error;
  return (data ?? []) as WorkspaceMember[];
}

/** Owner-only invite by email, enforced server-side in a security definer function. */
export async function inviteToWorkspace(
  workspaceId: string,
  email: string
): Promise<{ display_name: string }> {
  const sb = requireClient();
  const { data, error } = await sb.rpc("invite_to_workspace", {
    ws: workspaceId,
    invite_email: email.trim().toLowerCase(),
  });
  if (error) throw error;
  return data as { display_name: string };
}

/* ------------------------------------------------------------------ */
/* Folders                                                             */
/* ------------------------------------------------------------------ */

export async function getFoldersByParent(
  workspaceId: string,
  parentId: string | null
): Promise<Folder[]> {
  const sb = requireClient();
  let q = sb.from("folders").select("*").eq("workspace_id", workspaceId).is("deleted_at", null);
  q = parentId
    ? q.eq("parent_folder_id", parentId)
    : q.is("parent_folder_id", null);
  const { data, error } = await q.order("name", { ascending: true });
  if (error) throw error;
  return (data ?? []) as Folder[];
}

/** Every live folder in the workspace — powers the sidebar tree, paths and move validation. */
export async function getAllFolders(workspaceId: string): Promise<Folder[]> {
  const sb = requireClient();
  const { data, error } = await sb
    .from("folders")
    .select("*")
    .eq("workspace_id", workspaceId)
    .is("deleted_at", null)
    .order("name", { ascending: true });
  if (error) throw error;
  return (data ?? []) as Folder[];
}

export async function createFolder(
  workspaceId: string,
  parentId: string | null,
  name: string
): Promise<Folder> {
  const sb = requireClient();
  const { data, error } = await sb
    .from("folders")
    .insert({ workspace_id: workspaceId, parent_folder_id: parentId, name })
    .select()
    .single();
  if (error) throw error;
  return data as Folder;
}

export async function renameFolder(id: string, name: string): Promise<void> {
  const sb = requireClient();
  const { error } = await sb
    .from("folders")
    .update({ name, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

export async function moveFolder(id: string, newParentId: string | null): Promise<void> {
  const sb = requireClient();
  const { error } = await sb
    .from("folders")
    .update({ parent_folder_id: newParentId, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

/** Soft-delete a folder and everything inside it (server-side recursive CTE). */
export async function softDeleteFolder(id: string): Promise<void> {
  const sb = requireClient();
  const { error } = await sb.rpc("soft_delete_folder", { fid: id });
  if (error) throw error;
}

export async function restoreFolder(id: string): Promise<void> {
  const sb = requireClient();
  const { error } = await sb.rpc("restore_folder", { fid: id });
  if (error) throw error;
}

/** Permanently delete a folder subtree, including its storage objects. */
export async function purgeFolder(id: string): Promise<void> {
  const sb = requireClient();
  const { error } = await sb.rpc("purge_folder", { fid: id });
  if (error) throw error;
}

/* ------------------------------------------------------------------ */
/* Files                                                               */
/* ------------------------------------------------------------------ */

export async function getFilesInFolder(
  workspaceId: string,
  folderId: string | null
): Promise<FileItem[]> {
  const sb = requireClient();
  let q = sb.from("files").select("*").eq("workspace_id", workspaceId).is("deleted_at", null);
  q = folderId ? q.eq("folder_id", folderId) : q.is("folder_id", null);
  const { data, error } = await q.order("name", { ascending: true });
  if (error) throw error;
  return (data ?? []) as FileItem[];
}

export async function getFolderContents(
  workspaceId: string,
  folderId: string | null
): Promise<FolderContents> {
  const [folders, files] = await Promise.all([
    getFoldersByParent(workspaceId, folderId),
    getFilesInFolder(workspaceId, folderId),
  ]);
  return { folders, files };
}

export async function insertFileRow(row: {
  id: string;
  workspace_id: string;
  folder_id: string | null;
  name: string;
  storage_path: string;
  mime_type: string;
  file_size: number;
}): Promise<FileItem> {
  const sb = requireClient();
  const { data, error } = await sb.from("files").insert(row).select().single();
  if (error) throw error;
  return data as FileItem;
}

export async function removeFileRow(id: string): Promise<void> {
  const sb = requireClient();
  const { error } = await sb.from("files").delete().eq("id", id);
  if (error) throw error;
}

export async function getFileById(id: string): Promise<FileItem | null> {
  const sb = requireClient();
  const { data, error } = await sb.from("files").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data as FileItem | null;
}

export async function renameFile(id: string, name: string): Promise<void> {
  const sb = requireClient();
  const { error } = await sb
    .from("files")
    .update({ name, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

export async function moveFile(id: string, newFolderId: string | null): Promise<void> {
  const sb = requireClient();
  const { error } = await sb
    .from("files")
    .update({ folder_id: newFolderId, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

export async function softDeleteFile(id: string): Promise<void> {
  const sb = requireClient();
  const { error } = await sb
    .from("files")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

export async function restoreFile(id: string): Promise<void> {
  const sb = requireClient();
  const { error } = await sb.from("files").update({ deleted_at: null }).eq("id", id);
  if (error) throw error;
}

/* ------------------------------------------------------------------ */
/* Trash                                                               */
/* ------------------------------------------------------------------ */

export interface TrashListing {
  files: FileItem[];
  /** deleted folders whose parent is not itself deleted */
  folders: Folder[];
}

export async function getTrash(workspaceId: string): Promise<TrashListing> {
  const sb = requireClient();
  const [filesRes, foldersRes] = await Promise.all([
    sb
      .from("files")
      .select("*")
      .eq("workspace_id", workspaceId)
      .not("deleted_at", "is", null)
      .order("deleted_at", { ascending: false }),
    sb
      .from("folders")
      .select("*")
      .eq("workspace_id", workspaceId)
      .not("deleted_at", "is", null)
      .order("deleted_at", { ascending: false }),
  ]);
  if (filesRes.error) throw filesRes.error;
  if (foldersRes.error) throw foldersRes.error;
  const deletedFolders = (foldersRes.data ?? []) as Folder[];
  const deletedIds = new Set(deletedFolders.map((f) => f.id));
  const topFolders = deletedFolders.filter(
    (f) => !f.parent_folder_id || !deletedIds.has(f.parent_folder_id)
  );
  // files whose containing folder is already (soft) deleted belong to that folder's entry
  const foldersWithDeletedParent = new Set(
    ((filesRes.data ?? []) as FileItem[]).filter((f) => f.folder_id && deletedIds.has(f.folder_id)).map((f) => f.id)
  );
  const looseFiles = ((filesRes.data ?? []) as FileItem[]).filter(
    (f) => !foldersWithDeletedParent.has(f.id)
  );
  return { files: looseFiles, folders: topFolders };
}

/* ------------------------------------------------------------------ */
/* Stars (per-user)                                                    */
/* ------------------------------------------------------------------ */

export async function getMyStars(): Promise<Star[]> {
  const sb = requireClient();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return [];
  const { data, error } = await sb.from("stars").select("*").eq("user_id", user.id);
  if (error) throw error;
  return (data ?? []) as Star[];
}

export async function toggleStar(
  userId: string,
  target: { file_id?: string; folder_id?: string }
): Promise<boolean> {
  const sb = requireClient();
  const key = target.file_id ? "file_id" : "folder_id";
  const value = target.file_id ?? target.folder_id;
  let q = sb.from("stars").select("id").eq("user_id", userId);
  q = key === "file_id" ? q.eq("file_id", value).is("folder_id", null) : q.eq("folder_id", value).is("file_id", null);
  const { data: existing, error: findError } = await q.maybeSingle();
  if (findError) throw findError;
  if (existing) {
    const { error } = await sb.from("stars").delete().eq("id", existing.id);
    if (error) throw error;
    return false;
  }
  const { error } = await sb
    .from("stars")
    .insert({ user_id: userId, file_id: target.file_id ?? null, folder_id: target.folder_id ?? null });
  if (error) throw error;
  return true;
}

export interface StarredItem {
  kind: "file" | "folder";
  id: string;
  name: string;
  path: string;
  updated_at: string;
  size: number | null;
}

export async function getStarredItems(
  userId: string,
  workspaceId: string,
  folderById: Map<string, Folder>
): Promise<StarredItem[]> {
  const sb = requireClient();
  const { data, error } = await sb
    .from("stars")
    .select("id, file_id, folder_id, created_at, files(id, name, folder_id, updated_at, file_size, deleted_at), folders(id, name, parent_folder_id, updated_at, deleted_at)")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  const rows = (data ?? []) as unknown as Array<{
    id: string;
    file_id: string | null;
    folder_id: string | null;
    created_at: string;
    files: { id: string; name: string; folder_id: string | null; updated_at: string; file_size: number; deleted_at: string | null } | null;
    folders: { id: string; name: string; parent_folder_id: string | null; updated_at: string; deleted_at: string | null } | null;
  }>;
  const out: StarredItem[] = [];
  for (const row of rows) {
    if (row.files && !row.files.deleted_at) {
      out.push({
        kind: "file",
        id: row.files.id,
        name: row.files.name,
        path: folderPath(row.files.folder_id, folderById) || "Home",
        updated_at: row.files.updated_at,
        size: row.files.file_size,
      });
    } else if (row.folders && !row.folders.deleted_at && row.folders.id !== workspaceId) {
      out.push({
        kind: "folder",
        id: row.folders.id,
        name: row.folders.name,
        path: folderPath(row.folders.parent_folder_id, folderById) || "Home",
        updated_at: row.folders.updated_at,
        size: null,
      });
    }
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Recent + search + stats                                             */
/* ------------------------------------------------------------------ */

export async function getRecentFiles(workspaceId: string, limit = 30): Promise<FileItem[]> {
  const sb = requireClient();
  const { data, error } = await sb
    .from("files")
    .select("*")
    .eq("workspace_id", workspaceId)
    .is("deleted_at", null)
    .order("updated_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as FileItem[];
}

export async function searchWorkspace(
  workspaceId: string,
  query: string,
  folderById: Map<string, Folder>,
  limit = 25
): Promise<SearchResult[]> {
  const sb = requireClient();
  const like = `%${query.replace(/[%_]/g, "")}%`;
  const [filesRes, foldersRes] = await Promise.all([
    sb
      .from("files")
      .select("id, name, folder_id, updated_at, uploaded_by, file_size")
      .eq("workspace_id", workspaceId)
      .is("deleted_at", null)
      .ilike("name", like)
      .order("updated_at", { ascending: false })
      .limit(limit),
    sb
      .from("folders")
      .select("id, name, parent_folder_id, updated_at, created_by")
      .eq("workspace_id", workspaceId)
      .is("deleted_at", null)
      .ilike("name", like)
      .order("updated_at", { ascending: false })
      .limit(limit),
  ]);
  if (filesRes.error) throw filesRes.error;
  if (foldersRes.error) throw foldersRes.error;
  const files = (filesRes.data ?? []) as Array<{
    id: string; name: string; folder_id: string | null; updated_at: string; uploaded_by: string; file_size: number;
  }>;
  const folders = (foldersRes.data ?? []) as Array<{
    id: string; name: string; parent_folder_id: string | null; updated_at: string; created_by: string;
  }>;
  return [
    ...folders.map((f) => ({
      kind: "folder" as const,
      id: f.id,
      name: f.name,
      path: folderPath(f.parent_folder_id, folderById) || "Home",
      updated_at: f.updated_at,
      by: f.created_by,
      size: null,
    })),
    ...files.map((f) => ({
      kind: "file" as const,
      id: f.id,
      name: f.name,
      path: folderPath(f.folder_id, folderById) || "Home",
      updated_at: f.updated_at,
      by: f.uploaded_by,
      size: f.file_size,
    })),
  ];
}

export interface WorkspaceStats {
  folderCount: number;
  fileCount: number;
  bytesUsed: number;
}

export async function getWorkspaceStats(workspaceId: string): Promise<WorkspaceStats> {
  const sb = requireClient();
  const [foldersRes, filesRes] = await Promise.all([
    sb.from("folders").select("id", { count: "exact", head: true }).eq("workspace_id", workspaceId).is("deleted_at", null),
    sb.from("files").select("file_size").eq("workspace_id", workspaceId).is("deleted_at", null),
  ]);
  if (foldersRes.error) throw foldersRes.error;
  if (filesRes.error) throw filesRes.error;
  const rows = (filesRes.data ?? []) as Array<{ file_size: number }>;
  return {
    folderCount: foldersRes.count ?? 0,
    fileCount: rows.length,
    bytesUsed: rows.reduce((sum, r) => sum + (r.file_size ?? 0), 0),
  };
}

/* ------------------------------------------------------------------ */
/* Activity log                                                        */
/* ------------------------------------------------------------------ */

export async function getActivity(workspaceId: string, limit = 14): Promise<ActivityLog[]> {
  const sb = requireClient();
  const { data, error } = await sb
    .from("activity_logs")
    .select("*")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as ActivityLog[];
}

/** Fire-and-forget audit entry; a logging failure must never break the user's action. */
export function logActivity(
  workspaceId: string,
  action: string,
  targetType: ActivityLog["target_type"],
  targetId: string | null,
  targetName: string,
  metadata?: Record<string, unknown>
): void {
  void (async () => {
    try {
      const sb = requireClient();
      await sb.from("activity_logs").insert({
        workspace_id: workspaceId,
        action,
        target_type: targetType,
        target_id: targetId,
        target_name: targetName,
        metadata: metadata ?? null,
      });
    } catch {
      /* non-fatal */
    }
  })();
}
