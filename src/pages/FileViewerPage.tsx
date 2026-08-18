import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, FileText, Star } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { useWorkspace } from "../contexts/WorkspaceContext";
import { useToast } from "../contexts/ToastContext";
import { getFileById, getMyStars, toggleStar } from "../services/db";
import type { FileItem } from "../types";
import { folderAncestors, formatBytes, formatDate, friendlyError } from "../lib/utils";
import { Avatar, Button } from "../components/ui/primitives";
import { PdfViewer } from "../components/pdf/PdfViewer";

export function FileViewerPage() {
  const { fileId } = useParams<{ fileId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { workspace, folderById, directory, bump } = useWorkspace();
  const { toast } = useToast();

  const [file, setFile] = useState<FileItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [starred, setStarred] = useState(false);

  useEffect(() => {
    if (!fileId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all([getFileById(fileId), getMyStars()])
      .then(([f, stars]) => {
        if (cancelled) return;
        if (!f || f.deleted_at) {
          setError("This PDF no longer exists — it may have been deleted.");
          return;
        }
        setFile(f);
        setStarred(stars.some((s) => s.file_id === f.id));
      })
      .catch((err) => {
        if (!cancelled) setError(friendlyError(err, "Unable to open this PDF."));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [fileId]);

  const goBack = () => {
    if (workspace && file?.folder_id) navigate(`/workspace/${workspace.id}/folder/${file.folder_id}`);
    else if (workspace) navigate(`/workspace/${workspace.id}`);
    else navigate(-1);
  };

  const onStar = async () => {
    if (!user || !file) return;
    try {
      const nowStarred = await toggleStar(user.id, { file_id: file.id });
      setStarred(nowStarred);
      bump();
      toast(nowStarred ? "Added to Starred" : "Removed from Starred", "info");
    } catch (err) {
      toast(friendlyError(err, "Could not update the star."), "error");
    }
  };

  const uploader = file ? directory.get(file.uploaded_by) : null;
  const path = file ? folderAncestors(file.folder_id, folderById).map((f) => f.name).join(" / ") : "";

  return (
    <div className="mx-auto flex h-full max-w-6xl flex-col px-4 py-4 sm:px-6">
      {/* header */}
      <div className="anim-fade-up mb-3 flex flex-wrap items-center gap-3">
        <Button variant="secondary" size="sm" onClick={goBack} aria-label="Back to folder">
          <ArrowLeft className="h-4 w-4" />
          <span className="hidden sm:inline">Back</span>
        </Button>
        {file ? (
          <>
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-danger-500/10 text-danger-500">
              <FileText className="h-4.5 w-4.5" />
            </span>
            <div className="min-w-0 flex-1">
              <h1 className="truncate font-display text-[15px] font-extrabold text-ink-900 sm:text-base dark:text-ink-50" title={file.name}>
                {file.name}
              </h1>
              <p className="flex items-center gap-1.5 truncate text-[11.5px] text-ink-400">
                {path || "Home"} · {formatBytes(file.file_size)} · uploaded {formatDate(file.created_at)}
              </p>
            </div>
            <div className="hidden items-center gap-2 md:flex">
              {uploader ? (
                <span className="flex items-center gap-1.5 text-[12px] font-semibold text-ink-500 dark:text-ink-400">
                  <Avatar name={uploader.name} src={uploader.avatar} size="xs" />
                  {uploader.name}
                </span>
              ) : null}
            </div>
            <button
              type="button"
              onClick={() => void onStar()}
              aria-pressed={starred}
              aria-label={starred ? "Remove star" : "Add star"}
              className={`rounded-md p-2 transition-all hover:bg-ink-150 dark:hover:bg-ink-800 ${starred ? "text-star-400" : "text-ink-400 hover:text-star-400"}`}
            >
              <Star className={`h-5 w-5 ${starred ? "fill-star-400" : ""}`} />
            </button>
          </>
        ) : (
          <div className="flex-1" />
        )}
      </div>

      {/* body */}
      <div className="min-h-0 flex-1">
        {loading ? (
          <div className="flex h-full items-center justify-center rounded-xl border border-ink-200 bg-white/80 dark:border-ink-800 dark:bg-ink-900/70">
            <div className="skeleton h-4/5 w-3/4 rounded-lg" aria-hidden="true" />
          </div>
        ) : error || !file ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-ink-300 text-center dark:border-ink-700">
            <FileText className="h-8 w-8 text-ink-300" />
            <p className="max-w-sm px-6 text-sm font-semibold text-ink-700 dark:text-ink-200">{error ?? "File not found."}</p>
            <Button variant="secondary" onClick={goBack}>
              <ArrowLeft className="h-4 w-4" /> Go back
            </Button>
          </div>
        ) : (
          <PdfViewer file={file} />
        )}
      </div>
    </div>
  );
}
