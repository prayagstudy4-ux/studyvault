import type { Folder, SortDir, SortKey } from "../types";

export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

export const MAX_PDF_BYTES = 50 * 1024 * 1024; // 50 MB

export function formatBytes(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined || Number.isNaN(bytes)) return "—";
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i += 1;
  }
  return `${value >= 100 ? Math.round(value) : value.toFixed(1)} ${units[i]}`;
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function timeAgo(iso: string): string {
  const d = new Date(iso).getTime();
  if (Number.isNaN(d)) return "";
  const diff = Date.now() - d;
  const min = Math.floor(diff / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hrs = Math.floor(min / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;
  return formatDate(iso);
}

export function greeting(): string {
  const h = new Date().getHours();
  if (h < 5) return "Working late";
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

export function isPdfFile(file: File): boolean {
  return file.type === "application/pdf" || /\.pdf$/i.test(file.name);
}

/** Strip control chars and path separators so display names stay safe and honest. */
export function sanitizeName(name: string): string {
  return (
    name
      .replace(/[\u0000-\u001f\u007f-\u009f]/g, "")
      .replace(/[/\\]+/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .replace(/^\.+|\.+$/g, "")
      .slice(0, 180) || "Untitled"
  );
}

/**
 * Convert an arbitrary display filename into a Supabase-Storage-safe object name.
 * Storage only accepts letters, numbers and `- _ . /`, so Unicode punctuation
 * (em dash "—", brackets, "&", …) makes the upload fail with "Invalid key".
 * The original display name stored in the database is untouched by this.
 *
 *   "Indian Political Science — Detailed Notes2.pdf"
 *     → "Indian-Political-Science-Detailed-Notes2.pdf"
 */
export function toStorageFileName(name: string): string {
  const dot = name.lastIndexOf(".");
  const baseRaw = dot > 0 ? name.slice(0, dot) : name;
  const extRaw = dot > 0 ? name.slice(dot) : "";

  const clean = (part: string) =>
    part
      .normalize("NFKD") // é → e + combining accent
      .replace(/[\u0300-\u036f]/g, "") // drop combining accents
      .replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\ufeff]/g, "") // control + zero-width chars
      .replace(/\s+/g, "-") // whitespace → dash
      .replace(/[^\p{L}\p{N}._-]/gu, "-") // punctuation, em dash, "&" → dash
      .replace(/-{2,}/g, "-") // collapse repeated dashes
      .replace(/^[-.]+|[-.]+$/g, ""); // trim leading/trailing dashes and dots

  const base = clean(baseRaw) || "notes";
  const ext = clean(extRaw.replace(/^\.+/, "")) || "pdf";
  return `${base}.${ext}`;
}

/** Append " (2)", " (3)"… until the name is unique within `existing`. */
export function uniqueName(name: string, existing: string[]): string {
  const taken = new Set(existing.map((n) => n.toLowerCase()));
  if (!taken.has(name.toLowerCase())) return name;
  const dot = name.lastIndexOf(".");
  const base = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : "";
  let i = 2;
  while (taken.has(`${base} (${i})${ext}`.toLowerCase())) i += 1;
  return `${base} (${i})${ext}`;
}

/** Human-readable error for Supabase / network failures. */
export function friendlyError(err: unknown, fallback: string): string {
  const raw =
    typeof err === "string"
      ? err
      : err && typeof err === "object" && "message" in err
        ? String((err as { message: unknown }).message)
        : "";
  const msg = raw.toLowerCase();
  if (msg.includes("row-level security") || msg.includes("violates row-level"))
    return "You do not have permission to perform this action.";
  if (msg.includes("jwt") || msg.includes("session") || msg.includes("token"))
    return "Your session has expired. Please sign in again.";
  if (msg.includes("maximum size") || msg.includes("too large") || msg.includes("payload too large"))
    return "This file is too large. Maximum allowed size is 50 MB.";
  if (msg.includes("duplicate key") || msg.includes("unique constraint"))
    return "An item with that name already exists here.";
  if (msg.includes("failed to fetch") || msg.includes("network"))
    return "Network error. Please check your connection and try again.";
  if (msg.includes("signups not allowed") || msg.includes("signups are disabled") || msg.includes("signup is disabled"))
    return "New sign-ups are disabled for this Supabase project. In the Supabase dashboard, open Authentication → Sign In / Up → Email and enable it.";
  if (msg.includes("schema cache") || (msg.includes("could not find") && msg.includes("table")))
    return "The StudyVault database isn't set up yet. Run supabase/migrations/001_studyvault.sql in your Supabase SQL editor (see README), then try again.";
  if (msg.includes("not found")) return "This item no longer exists.";
  // Human-readable messages raised by our database functions (invites,
  // permission checks…) are shown verbatim; raw Postgres internals are not.
  const looksInternal =
    /(violates|constraint|syntax error|permission denied|pgrst|schema cache|does not exist|invalid input|unexpected|operator does not|function .* does not)/i;
  if (raw && raw.length < 240 && !looksInternal.test(raw) && /[a-z]/i.test(raw)) {
    return raw;
  }
  return fallback;
}

/** Build "Class 9 / Mathematics / Chapter 2" from a folder map. */
export function folderPath(folderId: string | null, byId: Map<string, Folder>): string {
  const parts: string[] = [];
  let cur = folderId ? byId.get(folderId) : undefined;
  let guard = 0;
  while (cur && guard < 64) {
    parts.unshift(cur.name);
    cur = cur.parent_folder_id ? byId.get(cur.parent_folder_id) : undefined;
    guard += 1;
  }
  return parts.join(" / ");
}

export function folderAncestors(folderId: string | null, byId: Map<string, Folder>): Folder[] {
  const out: Folder[] = [];
  let cur = folderId ? byId.get(folderId) : undefined;
  let guard = 0;
  while (cur && guard < 64) {
    out.unshift(cur);
    cur = cur.parent_folder_id ? byId.get(cur.parent_folder_id) : undefined;
    guard += 1;
  }
  return out;
}

/** True when `candidateId` is `folderId` itself or one of its descendants. */
export function isSelfOrDescendant(
  folderId: string,
  candidateId: string,
  byId: Map<string, Folder>
): boolean {
  let cur = candidateId;
  let guard = 0;
  while (guard < 64) {
    if (cur === folderId) return true;
    const f = byId.get(cur);
    if (!f || !f.parent_folder_id) return false;
    cur = f.parent_folder_id;
    guard += 1;
  }
  return false;
}

export function sortItems<T extends { name: string; created_at: string; updated_at: string }>(
  items: T[],
  key: SortKey,
  dir: SortDir
): T[] {
  const mul = dir === "asc" ? 1 : -1;
  return [...items].sort((a, b) => {
    if (key === "name") return a.name.localeCompare(b.name, undefined, { sensitivity: "base" }) * mul;
    if (key === "file_size") {
      const av = "file_size" in a ? Number((a as unknown as { file_size: number }).file_size) : 0;
      const bv = "file_size" in b ? Number((b as unknown as { file_size: number }).file_size) : 0;
      return (av - bv) * mul;
    }
    return (new Date(a[key]).getTime() - new Date(b[key]).getTime()) * mul;
  });
}

export function debounce<A extends unknown[]>(fn: (...args: A) => void, ms: number) {
  let t: ReturnType<typeof setTimeout> | undefined;
  const wrapped = (...args: A) => {
    if (t) clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
  wrapped.cancel = () => {
    if (t) clearTimeout(t);
  };
  return wrapped as typeof wrapped & { cancel: () => void };
}
