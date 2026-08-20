-- Shared, workspace-scoped AI Notes. Run after 001_studyvault.sql.

create table if not exists public.ai_notes (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  created_by uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 160),
  content text not null check (char_length(content) between 1 and 100000),
  format text not null check (format in ('structured', 'revision', 'flashcards')),
  source_type text not null check (source_type in ('topic', 'text', 'file')),
  source_text text,
  source_file_id uuid references public.files (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (source_type = 'file' and source_file_id is not null and source_text is null)
    or (source_type in ('topic', 'text') and source_file_id is null and source_text is not null)
  )
);

create index if not exists ai_notes_workspace_updated_idx on public.ai_notes (workspace_id, updated_at desc);
create index if not exists ai_notes_source_file_idx on public.ai_notes (source_file_id) where source_file_id is not null;

-- Internal request log used exclusively by the Edge Function for a shared
-- per-user generation limit. No client policies are granted.
create table if not exists public.ai_note_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);
create index if not exists ai_note_requests_user_created_idx on public.ai_note_requests (user_id, created_at desc);

create or replace function public.set_ai_note_audit_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := auth.uid();
  elsif new.created_by is distinct from old.created_by then
    raise exception 'The note creator cannot be changed.';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists set_ai_note_audit_fields on public.ai_notes;
create trigger set_ai_note_audit_fields
  before insert or update on public.ai_notes
  for each row execute function public.set_ai_note_audit_fields();

alter table public.ai_notes enable row level security;
alter table public.ai_note_requests enable row level security;

drop policy if exists "ai_notes_select_workspace_member" on public.ai_notes;
create policy "ai_notes_select_workspace_member" on public.ai_notes
  for select to authenticated using (public.is_ws_member(workspace_id));
drop policy if exists "ai_notes_insert_workspace_member" on public.ai_notes;
create policy "ai_notes_insert_workspace_member" on public.ai_notes
  for insert to authenticated with check (public.is_ws_member(workspace_id));
drop policy if exists "ai_notes_update_workspace_member" on public.ai_notes;
create policy "ai_notes_update_workspace_member" on public.ai_notes
  for update to authenticated using (public.is_ws_member(workspace_id)) with check (public.is_ws_member(workspace_id));
drop policy if exists "ai_notes_delete_workspace_member" on public.ai_notes;
create policy "ai_notes_delete_workspace_member" on public.ai_notes
  for delete to authenticated using (public.is_ws_member(workspace_id));
