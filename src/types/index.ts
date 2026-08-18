export interface UserProfile {
  id: string;
  email: string;
  display_name: string | null;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface Workspace {
  id: string;
  name: string;
  description: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export type WorkspaceRole = "owner" | "editor" | "viewer";

export interface WorkspaceMember {
  id: string;
  workspace_id: string;
  user_id: string;
  role: WorkspaceRole;
  created_at: string;
  /** resolved from the member directory */
  display_name?: string | null;
  avatar_url?: string | null;
  email?: string;
}

export interface Folder {
  id: string;
  workspace_id: string;
  parent_folder_id: string | null;
  name: string;
  created_by: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface FileItem {
  id: string;
  workspace_id: string;
  folder_id: string | null;
  name: string;
  storage_path: string;
  mime_type: string;
  file_size: number;
  uploaded_by: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface Star {
  id: string;
  user_id: string;
  file_id: string | null;
  folder_id: string | null;
  created_at: string;
}

export interface ActivityLog {
  id: string;
  workspace_id: string;
  user_id: string;
  action: string;
  target_type: "file" | "folder" | "workspace";
  target_id: string | null;
  target_name: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

export interface FolderContents {
  folders: Folder[];
  files: FileItem[];
}

export type SortKey = "name" | "created_at" | "updated_at" | "file_size";
export type SortDir = "asc" | "desc";
export type ViewMode = "grid" | "list";

export interface SearchResult {
  kind: "file" | "folder";
  id: string;
  name: string;
  path: string;
  updated_at: string;
  by: string;
  size: number | null;
}

export interface UploadProgress {
  fileName: string;
  percent: number;
  phase: "uploading" | "done" | "error";
}
