import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { BookOpen, FileText, Loader2, Plus, Save, Sparkles, Trash2 } from "lucide-react";
import { useWorkspace } from "../contexts/WorkspaceContext";
import { useToast } from "../contexts/ToastContext";
import { friendlyError } from "../lib/utils";
import {
  createAINote,
  deleteAINote,
  generateAINote,
  getAINoteSourceFiles,
  getAINotes,
  updateAINote,
} from "../services/aiNotesService";
import type { AINote, AINoteFormat, AINoteSourceType, FileItem } from "../types";

const formats: Array<{ value: AINoteFormat; label: string; description: string }> = [
  { value: "structured", label: "Study notes", description: "Headings, key points, examples and recap" },
  { value: "revision", label: "Revision notes", description: "Concise, exam-focused bullets" },
  { value: "flashcards", label: "Flashcards", description: "Question and answer cards" },
];

const sourceLabels: Record<AINoteSourceType, string> = { topic: "Topic", text: "Pasted material", file: "Workspace file" };

export function AINotesPage() {
  const { workspaceId } = useParams<{ workspaceId: string }>();
  const { workspace, directory } = useWorkspace();
  const { toast } = useToast();
  const wsId = workspaceId ?? workspace?.id;
  const [notes, setNotes] = useState<AINote[]>([]);
  const [files, setFiles] = useState<FileItem[]>([]);
  const [selected, setSelected] = useState<AINote | null>(null);
  const [sourceType, setSourceType] = useState<AINoteSourceType>("topic");
  const [sourceText, setSourceText] = useState("");
  const [sourceFileId, setSourceFileId] = useState("");
  const [format, setFormat] = useState<AINoteFormat>("structured");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);

  const selectedFile = useMemo(() => files.find((file) => file.id === sourceFileId), [files, sourceFileId]);

  useEffect(() => {
    if (!wsId) return;
    let cancelled = false;
    setLoading(true);
    Promise.all([getAINotes(wsId), getAINoteSourceFiles(wsId)])
      .then(([noteRows, fileRows]) => {
        if (!cancelled) {
          setNotes(noteRows);
          setFiles(fileRows);
        }
      })
      .catch((error) => !cancelled && toast(friendlyError(error, "Could not load AI Notes."), "error"))
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [wsId, toast]);

  function newNote() {
    setSelected(null);
    setSourceType("topic");
    setSourceText("");
    setSourceFileId("");
    setFormat("structured");
    setTitle("");
    setContent("");
  }

  function openNote(note: AINote) {
    setSelected(note);
    setSourceType(note.source_type);
    setSourceText(note.source_text ?? "");
    setSourceFileId(note.source_file_id ?? "");
    setFormat(note.format);
    setTitle(note.title);
    setContent(note.content);
  }

  async function onGenerate() {
    if (!wsId) return;
    const trimmed = sourceText.trim();
    if ((sourceType === "topic" || sourceType === "text") && !trimmed) {
      toast(sourceType === "topic" ? "Enter a topic first." : "Paste study material first.", "error");
      return;
    }
    if (sourceType === "file" && !sourceFileId) {
      toast("Choose a PDF or image from this workspace.", "error");
      return;
    }
    setGenerating(true);
    try {
      const generated = await generateAINote({
        workspace_id: wsId,
        format,
        source_type: sourceType,
        source_text: sourceType === "file" ? undefined : trimmed,
        source_file_id: sourceType === "file" ? sourceFileId : undefined,
      });
      setTitle(generated.title);
      setContent(generated.content);
      toast("Your notes are ready to review and save.", "success");
    } catch (error) {
      toast(friendlyError(error, "Could not generate notes."), "error");
    } finally {
      setGenerating(false);
    }
  }

  async function onSave() {
    if (!wsId || !title.trim() || !content.trim()) {
      toast("Generate or enter a title and note content before saving.", "error");
      return;
    }
    setSaving(true);
    try {
      if (selected) {
        const updated = await updateAINote(selected.id, { title: title.trim(), content: content.trim() });
        setSelected(updated);
        setNotes((current) => current.map((note) => note.id === updated.id ? updated : note));
      } else {
        const created = await createAINote({
          workspace_id: wsId,
          title: title.trim(),
          content: content.trim(),
          format,
          source_type: sourceType,
          source_text: sourceType === "file" ? null : sourceText.trim(),
          source_file_id: sourceType === "file" ? sourceFileId : null,
        });
        setSelected(created);
        setNotes((current) => [created, ...current]);
      }
      toast("AI note saved.", "success");
    } catch (error) {
      toast(friendlyError(error, "Could not save this note."), "error");
    } finally {
      setSaving(false);
    }
  }

  async function onDelete() {
    if (!selected || !confirm(`Delete “${selected.title}”?`)) return;
    try {
      await deleteAINote(selected.id);
      setNotes((current) => current.filter((note) => note.id !== selected.id));
      newNote();
      toast("AI note deleted.", "info");
    } catch (error) {
      toast(friendlyError(error, "Could not delete this note."), "error");
    }
  }

  if (!wsId) return <div className="p-6 text-sm text-ink-500">Loading workspace…</div>;

  return (
    <div className="mx-auto grid h-full max-w-7xl gap-4 p-4 lg:grid-cols-[280px_minmax(0,1fr)] lg:p-6">
      <aside className="flex min-h-0 flex-col rounded-xl border border-ink-200 bg-white dark:border-ink-800 dark:bg-ink-900">
        <div className="flex items-center justify-between border-b border-ink-150 p-3 dark:border-ink-800">
          <div className="flex items-center gap-2 font-display text-sm font-extrabold text-ink-900 dark:text-ink-50"><BookOpen className="h-4 w-4 text-brand-500" /> AI Notes</div>
          <button type="button" onClick={newNote} className="rounded-md p-1.5 text-brand-600 hover:bg-brand-500/10" aria-label="New AI note"><Plus className="h-4 w-4" /></button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          {loading ? <div className="p-4 text-center text-xs text-ink-400">Loading notes…</div> : notes.length === 0 ? (
            <div className="p-5 text-center text-xs text-ink-400">No saved notes yet.</div>
          ) : notes.map((note) => (
            <button key={note.id} type="button" onClick={() => openNote(note)} className={`mb-1 w-full rounded-lg p-3 text-left ${selected?.id === note.id ? "bg-brand-500/10" : "hover:bg-ink-100 dark:hover:bg-ink-800"}`}>
              <p className="truncate text-sm font-bold text-ink-800 dark:text-ink-100">{note.title}</p>
              <p className="mt-1 text-[11px] text-ink-400">{sourceLabels[note.source_type]} · {formats.find((item) => item.value === note.format)?.label}</p>
            </button>
          ))}
        </div>
      </aside>

      <section className="min-w-0 rounded-xl border border-ink-200 bg-white p-4 dark:border-ink-800 dark:bg-ink-900 sm:p-6">
        <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
          <div><h1 className="font-display text-xl font-extrabold text-ink-900 dark:text-ink-50">{selected ? "Edit AI Note" : "Create AI Notes"}</h1><p className="mt-1 text-sm text-ink-500">Generate shared study material for {workspace?.name ?? "this workspace"}.</p></div>
          {selected && <button type="button" onClick={() => void onDelete()} className="inline-flex items-center gap-1.5 rounded-lg border border-danger-500/30 px-3 py-2 text-xs font-bold text-danger-600 hover:bg-danger-500/10"><Trash2 className="h-3.5 w-3.5" /> Delete</button>}
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <label className="text-xs font-bold text-ink-600 dark:text-ink-300">Source
            <select value={sourceType} onChange={(e) => setSourceType(e.target.value as AINoteSourceType)} disabled={Boolean(selected)} className="mt-1.5 w-full rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm dark:border-ink-700 dark:bg-ink-800">
              <option value="topic">Topic</option><option value="text">Pasted material</option><option value="file">Workspace PDF or image</option>
            </select>
          </label>
          <label className="text-xs font-bold text-ink-600 dark:text-ink-300">Note format
            <select value={format} onChange={(e) => setFormat(e.target.value as AINoteFormat)} disabled={Boolean(selected)} className="mt-1.5 w-full rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm dark:border-ink-700 dark:bg-ink-800">
              {formats.map((item) => <option key={item.value} value={item.value}>{item.label} — {item.description}</option>)}
            </select>
          </label>
        </div>

        {sourceType === "file" ? <label className="mt-4 block text-xs font-bold text-ink-600 dark:text-ink-300">Source file
          <select value={sourceFileId} onChange={(e) => setSourceFileId(e.target.value)} disabled={Boolean(selected)} className="mt-1.5 w-full rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm dark:border-ink-700 dark:bg-ink-800">
            <option value="">Choose a PDF or image…</option>{files.map((file) => <option key={file.id} value={file.id}>{file.name}</option>)}
          </select>
          {files.length === 0 && <span className="mt-1 block text-[11px] font-medium text-ink-400">No supported files are available in this workspace yet.</span>}
        </label> : <label className="mt-4 block text-xs font-bold text-ink-600 dark:text-ink-300">{sourceType === "topic" ? "Topic" : "Study material"}
          <textarea value={sourceText} onChange={(e) => setSourceText(e.target.value)} disabled={Boolean(selected)} rows={sourceType === "topic" ? 2 : 6} placeholder={sourceType === "topic" ? "e.g. Photosynthesis for Class 9" : "Paste textbook passages, lecture notes, or other material…"} className="mt-1.5 w-full resize-y rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm dark:border-ink-700 dark:bg-ink-800" />
        </label>}

        {!selected && <button type="button" onClick={() => void onGenerate()} disabled={generating} className="mt-4 inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-brand-700 disabled:opacity-50">{generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}{generating ? "Generating…" : "Generate notes"}</button>}

        <div className="mt-6 border-t border-ink-150 pt-5 dark:border-ink-800">
          <label className="block text-xs font-bold text-ink-600 dark:text-ink-300">Title<input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={160} placeholder="Your note title" className="mt-1.5 w-full rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm font-bold dark:border-ink-700 dark:bg-ink-800" /></label>
          <label className="mt-4 block text-xs font-bold text-ink-600 dark:text-ink-300">Note content <span className="font-medium text-ink-400">(Markdown supported)</span><textarea value={content} onChange={(e) => setContent(e.target.value)} rows={16} placeholder="Generated notes will appear here. You can edit them before saving." className="mt-1.5 w-full resize-y rounded-lg border border-ink-200 bg-white px-3 py-2 font-mono text-sm leading-6 dark:border-ink-700 dark:bg-ink-800" /></label>
          <div className="mt-4 flex items-center justify-between gap-3"><span className="text-xs text-ink-400">{selectedFile ? <><FileText className="mr-1 inline h-3.5 w-3.5" />{selectedFile.name}</> : selected ? `Created by ${directory.get(selected.created_by)?.name ?? "a workspace member"}` : ""}</span><button type="button" onClick={() => void onSave()} disabled={saving || !content.trim() || !title.trim()} className="inline-flex items-center gap-2 rounded-lg bg-ink-900 px-4 py-2.5 text-sm font-bold text-white hover:bg-ink-700 disabled:opacity-50 dark:bg-ink-100 dark:text-ink-900">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}{saving ? "Saving…" : "Save note"}</button></div>
        </div>
      </section>
    </div>
  );
}
