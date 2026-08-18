# Supabase setup files

| File | Purpose | When to run |
|---|---|---|
| `migrations/001_studyvault.sql` | Creates all tables, indexes, RLS policies, security-definer functions, the private `studyvault` storage bucket with member-scoped policies, and the Realtime publication. Also backfills profile rows for pre-existing users. | **Once**, right after creating the project (SQL Editor → paste → Run). **Idempotent — safe to re-run** to upgrade an older copy. |
| `seed.sql` | Optional: creates the "Our Notes" workspace with the Class 9 folder skeleton for the first user. | After the first user exists in Authentication. Edit `OWNER_EMAIL` at the top first. Skip it if you prefer creating the workspace from the dashboard. |

## What the migration creates

**Tables** — `profiles`, `workspaces`, `workspace_members`, `folders` (self-referencing
`parent_folder_id`, soft-delete `deleted_at`), `files` (PDF-only check constraint,
50 MB check constraint), `stars` (partial unique indexes: one star per user per
file / per folder), `activity_logs` (`user_id` defaults to `auth.uid()` — clients
cannot impersonate).

**Functions (security definer)**
- `handle_new_user()` — trigger: profile on signup, display name from
  `raw_user_meta_data ->> 'display_name'`, falling back to the email username.
- `ensure_profile()` — returns the caller's profile, creating it if missing.
- `create_workspace(name, description)` — atomic workspace + owner membership.
- `is_ws_member(ws)` / `ws_role_of(ws)` — RLS helpers (avoid policy recursion).
- `get_workspace_members(ws)` — member directory with display names.
- `invite_to_workspace(ws, email)` — owner-only; returns `{ user_id, display_name }`;
  raises friendly errors for unknown emails / duplicate members.
- `soft_delete_folder` / `restore_folder` / `purge_folder` — recursive subtree
  trash operations; each re-checks membership **and** owner/editor role, so a
  viewer can never run them. `purge_folder` also deletes the storage objects.
- `can_access_storage_path` / `can_write_storage_path` — parse the
  `workspace-id/...` prefix; writes additionally require owner/editor.

**RLS** — enabled on every table; membership-scoped `select` everywhere;
owner/editor-gated writes on folders/files; owner-only workspace updates;
no client writes at all on `workspace_members` (only definer functions change
membership); stars strictly personal. No `using (true)` anywhere.

**Storage** — private bucket `studyvault`; select for members via signed URLs;
insert/update/delete for owner/editor only, PDF extension enforced in policy.

**Realtime** — `folders`, `files`, `activity_logs` added to `supabase_realtime`
(guarded, so re-running the migration doesn't fail).

## Verifying the setup

1. **Authentication → Policies**: every table shows `ENABLED` with the policies above.
2. **Storage**: bucket `studyvault` with `Public bucket` off and 4 policies.
3. **Database → Publications**: `supabase_realtime` includes the three tables.
4. **SQL Editor smoke test** (as an authenticated user via the app, or):
   `select public.create_workspace('Test', '');` then check both `workspaces`
   and `workspace_members` gained one row, then delete them.

## Notes

- Never add the `service_role` key to the frontend — the anon key + RLS is the
  entire security model, by design.
- If you ran an **older** copy of the migration: paste the current file and run
  it again. Policies are dropped and recreated, functions replaced, tables and
  indexes left untouched, and any missing profile rows are backfilled.
