# Supabase setup files

| File | Purpose | When to run |
|---|---|---|
| `migrations/001_studyvault.sql` | Creates all tables, indexes, RLS policies, definer functions, the private `studyvault` storage bucket with member-scoped policies, and the Realtime publication. | **Once**, right after creating the project (SQL Editor → paste → Run). |
| `seed.sql` | Optional: creates the "Our Notes" workspace with the Class 9 folder skeleton for the first user. | After the first user exists in Authentication. Edit `OWNER_EMAIL` at the top first. Skip it if you prefer creating the workspace from the dashboard. |

## Verifying the setup

After running the migration, check in the dashboard:

1. **Authentication → Policies**: every table shows `ENABLED` with membership-scoped policies.
2. **Storage**: a private bucket named `studyvault` with 4 policies (select/insert/update/delete),
   all gated by `can_access_storage_path`.
3. **Database → Publications**: `supabase_realtime` includes `folders`, `files`, `activity_logs`.

## Notes

- The definer functions (`is_ws_member`, `ws_role_of`, `invite_to_workspace`, trash helpers) are
  how the app avoids RLS recursion and enforces owner-only actions server-side.
- File size is capped at 50 MB by a `CHECK` constraint on `files.file_size` *and* by client
  validation; MIME type is constrained to `application/pdf` at the column level.
- Never add the `service_role` key to the frontend — the anon key + RLS is the entire security
  model, by design.
