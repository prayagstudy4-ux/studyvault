# StudyVault

A **private cloud workspace** where two students organise, upload, preview and share PDF school
notes — with unlimited nested folders, realtime sync, and Supabase Row Level Security keeping
everyone else out.

> "A private Google Drive made specifically for me and my friend to organize school notes."

Stack: **React 18 + Vite + TypeScript + Tailwind CSS v4 + lucide-react + pdf.js** on the front,
**Supabase** (Auth, PostgreSQL, Storage, Realtime) on the back. Deployable to Vercel. Designed to
run within provider free tiers (see [Free-tier notes](#free-tier-notes)).

---

## How the sharing model works

There is **no per-file sharing**. Access is granted once, at the workspace level:

```
Shared workspace "Our Notes"   ←  both users are members (owner + editor)
  └── any folder tree          ←  visible to every member automatically
        └── any PDF            ←  visible to every member automatically
```

When Prayag uploads `Mathematics/Chapter 1/Notes.pdf`, the file row is written to Postgres and the
bytes to a private storage bucket. Supabase Realtime pushes the change to the friend's open session
and the file appears in their folder view immediately — no invite per file, ever.

---

## Requirements

- Node.js 18+ and npm
- A [Supabase](https://supabase.com) account (free tier is fine)
- A [Vercel](https://vercel.com) account (optional, for hosting)

## Installation

```bash
npm install
npm run dev
```

## Environment variables

Create `.env.local` in the project root:

```bash
VITE_SUPABASE_URL=https://YOUR-PROJECT-REF.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR-ANON-PUBLIC-KEY
```

Both values live in the Supabase dashboard under **Project Settings → API**. They are *public by
design* — the anon key only grants what RLS policies allow. **Never** put the `service_role` key
in this app or any browser code.

If the variables are missing, the app shows a setup screen instead of a broken UI. It never falls
back to fake data.

---

## Supabase setup — step by step

1. **Create a project** at supabase.com (free tier). Pick a region close to you.
2. **Run the migration.** Open **SQL Editor → New query**, paste the full contents of
   `supabase/migrations/001_studyvault.sql` and run it. This creates:
   - tables: `profiles`, `workspaces`, `workspace_members`, `folders`, `files`, `stars`, `activity_logs`
   - indexes on `workspace_id`, `folder_id`, `parent_folder_id`, names, `deleted_at`, timestamps
   - a `handle_new_user` trigger that creates a profile row on signup
   - **RLS enabled on every table with membership-scoped policies** (no `using (true)` anywhere)
   - the **private** `studyvault` storage bucket + member-scoped storage policies
   - definer functions: `is_ws_member`, `ws_role_of`, `get_workspace_members`,
     `invite_to_workspace`, `soft_delete_folder`, `restore_folder`, `purge_folder`
   - the Realtime publication for `folders`, `files`, `activity_logs`
3. **Storage bucket check.** Storage → you should see a private bucket named `studyvault`.
   (The migration creates it; verify `Public bucket` is off.)
4. **Enable email auth.** Authentication → Providers → Email: enabled. For a two-person vault,
   turn **off** "Confirm email" if you don't want the confirmation step — the app handles both flows.
5. **(Recommended) Site URL.** Authentication → URL Configuration: set the Site URL to
   `http://localhost:5173` locally, and add your Vercel URL to the redirect allow-list later.
6. **Create the two users.** Authentication → Users → Add user: create Prayag and the friend with
   emails + passwords, or let each person sign up through `/signup`.
7. **Create the workspace.** Sign in as Prayag → the dashboard offers "Create your shared
   workspace" (Prayag becomes owner). Optionally run `supabase/seed.sql` instead — edit
   `OWNER_EMAIL` at the top of that file first — to also get the Class 9 folder skeleton.
8. **Invite the friend.** Prayag: Settings → Workspace → Invite, enter the friend's email.
   The friend signs in and immediately sees "Our Notes". (The invite RPC checks owner role
   server-side.)

## Local development

```bash
npm install
npm run dev      # http://localhost:5173
```

## Deployment to Vercel

1. Push this repository to GitHub.
2. Vercel → **Add New Project** → import the repo (Vite preset is auto-detected).
3. Add environment variables `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
4. Deploy. Copy the production URL (e.g. `https://studyvault.vercel.app`).
5. Back in Supabase:
   - Authentication → URL Configuration → set **Site URL** to the Vercel URL.
   - Add `https://studyvault.vercel.app/**` to the redirect URL allow-list (used by password-reset emails).
6. Smoke-test: sign up / sign in, upload a PDF in one browser, watch it appear in another.

> The app uses hash-based routing (`/#/dashboard`) so it works on any static host with zero
> rewrite rules. If you prefer clean URLs, switch `HashRouter` → `BrowserRouter` in `src/App.tsx`
> and add a Vercel rewrite of `/(.*)` → `/index.html`.

---

## Security — how RLS protects the vault

Frontend route guards are convenience only; **authorization lives in the database**:

| Table | Rule |
|---|---|
| `profiles` | Read/update **own row only**. Display names are shared through the `get_workspace_members` definer function, scoped to a workspace you belong to. |
| `workspaces` | Readable only by members; only the **owner** can update. |
| `workspace_members` | Members see each other. A user can insert **only their own** membership; adding someone else happens exclusively through `invite_to_workspace`, which verifies the caller is owner. |
| `folders` / `files` | Select requires membership (`is_ws_member(workspace_id)`). Insert/update/delete additionally require `owner` or `editor` role. |
| `stars` | Strictly `user_id = auth.uid()` — your friend's stars are invisible to you. |
| `activity_logs` | Read + insert for workspace members only. |
| Storage bucket `studyvault` | **Private.** Every object policy calls `can_access_storage_path(name)`, which parses the leading `workspace_id/` path segment and requires membership in that workspace. PDF-only inserts, 50 MB limit enforced by a `CHECK` constraint on `files.file_size`. |

Definer functions re-check membership and role internally, so a crafted RPC call from a
non-member fails. The client never receives raw Postgres errors — messages are mapped to
human-readable ones.

Storage paths follow `workspaceId/folderId/fileId/Original Name.pdf`; display names stay original
while the UUID segment makes collisions impossible. Files are only ever reached through
**short-lived signed URLs (10 min)** or authenticated session uploads — there are no public links.

---

## Feature map

- **Auth** — email/password sign-up, sign-in, logout, password reset, persisted sessions, protected routes, loading + error + empty states
- **Workspace** — single shared vault ("Our Notes"), multi-workspace-ready schema, owner/editor/viewer roles, owner-only email invites
- **Folders** — unlimited nesting, create/rename/move/delete, breadcrumbs, sidebar tree, sorting
- **Files** — PDF-only upload (button, drag-and-drop, dashboard quick-upload) with live progress, automatic duplicate-name handling, 50 MB validation
- **PDF viewer** — in-app rendering via pdf.js: page navigation, zoom in/out, fit-to-width, fullscreen, download, uploader + date metadata; mobile-friendly
- **Actions** — open, download, rename, move (folder-picker with cycle protection), details panel, three-dot menu **and** right-click context menu
- **Search** — debounced global search over PDF and folder names with paths; opens results directly
- **Realtime** — `postgres_changes` subscriptions per workspace (coalesced); uploads/renames/moves/deletes appear on the other user's screen without refresh; channels are removed on unmount
- **Trash** — soft delete (`deleted_at`) for files and whole folder subtrees, restore, explicit permanent delete (storage objects removed too)
- **Starred** — per-user favorites for files and folders
- **Recent** — newest-first activity across the workspace with uploader + location
- **Activity log** — "Prayag uploaded Notes.pdf"-style feed on the dashboard
- **Settings** — display name, avatar (resized client-side), light/dark/system theme (persisted), workspace rename, members list + invite, storage usage from metadata, password change, sign out
- **Views** — grid/list toggle, four sort keys, asc/desc; choices remembered per browser
- **Responsive** — desktop sidebar + topbar; mobile hamburger drawer + bottom tab bar, touch-sized controls

---

## Testing checklist

Run these with two browsers (or one browser + one incognito window):

**User A (Prayag, owner)**

- [ ] Sign up / sign in, lands on `/dashboard`
- [ ] Create workspace "Our Notes"
- [ ] Create nested folders: `Class 9 → Mathematics → Chapter 2`
- [ ] Upload a PDF via the button; progress bar shows percent; toast "PDF uploaded successfully"
- [ ] Drag a second PDF onto the folder area; it uploads
- [ ] Rename, star, move (into another folder), view (page nav/zoom/fit/fullscreen), download the PDF
- [ ] Delete the PDF → it appears in Trash → Restore → it is back
- [ ] Delete a folder with contents → whole subtree in Trash → Restore
- [ ] Right-click an item → context menu works; three-dot menu works
- [ ] Invite the friend by email from Settings

**User B (friend, editor)**

- [ ] Sees "Our Notes" immediately after login — no manual share needed
- [ ] Watches a live upload/rename/move from User A appear without refreshing
- [ ] Uploads a PDF; User A sees it instantly
- [ ] Their stars do **not** appear for User A

**Unauthorized user (third account, not invited)**

- [ ] Cannot see the workspace in `/dashboard`
- [ ] Direct query to `folders`/`files` returns zero rows (RLS)
- [ ] Guessing a storage path → 403/404; signed URLs expire after 10 minutes
- [ ] RPC calls (`soft_delete_folder`, `invite_to_workspace`) fail with permission errors

**Edge cases**

- [ ] Duplicate file name → auto-suffixed `Notes (2).pdf`
- [ ] Non-PDF drag/drop → clear "Only PDF files are supported" error, nothing breaks
- [ ] 60 MB file → "too large" error, no orphan row
- [ ] Moving a folder into itself/descendant is impossible in the picker
- [ ] Kill the network mid-upload → error toast; retry works; no duplicate rows
- [ ] Session expires → friendly message, redirect to login

---

## Free-tier notes

The app targets free tiers: Supabase Free (500 MB database, ~1 GB file storage, Realtime included)
and Vercel Hobby. Provider limits change over time — check current quotas before relying on them
for large archives. Large PDFs are fine individually (50 MB cap per file by design); storage is
the constraint, and the Settings page shows live usage calculated from metadata.

## Project structure

```
src/
├── components/
│   ├── layout/AppLayout.tsx     # sidebar, topbar, global search, mobile nav
│   ├── files/FileBrowser.tsx    # grid/list, DnD upload + move, context menu
│   ├── folders/FolderTree.tsx   # recursive sidebar tree
│   ├── pdf/PdfViewer.tsx        # pdf.js canvas viewer
│   ├── dialogs/                 # new-folder, rename, move, delete, details, upload overlay
│   └── ui/primitives.tsx        # Button, Dialog, Menu, Avatar, EmptyState…
├── contexts/                    # Auth, Workspace(+Realtime), Theme, Toast
├── services/                    # db.ts (all queries/RPCs), storage.ts (upload/signed URLs)
├── pages/                       # Auth, Dashboard, Browse, FileViewer, Collections, Settings
├── lib/                         # supabase client, formatting/validation utils
└── types/
supabase/
├── migrations/001_studyvault.sql
└── seed.sql
```
