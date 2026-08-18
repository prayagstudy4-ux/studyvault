import { useParams } from "react-router-dom";
import { FileBrowser } from "../components/files/FileBrowser";
import { useWorkspace } from "../contexts/WorkspaceContext";

/** Renders the folder browser for the workspace root or a specific folder. */
export function BrowsePage() {
  const { workspaceId, folderId } = useParams<{ workspaceId: string; folderId?: string }>();
  const { workspace } = useWorkspace();

  const wsId = workspaceId ?? workspace?.id;
  if (!wsId) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
        <p className="text-sm text-ink-500 dark:text-ink-400">Loading workspace…</p>
      </div>
    );
  }

  return (
    <div className="mx-auto h-full max-w-6xl px-4 py-6 sm:px-6">
      <FileBrowser workspaceId={wsId} folderId={folderId ?? null} />
    </div>
  );
}
