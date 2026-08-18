-- ============================================================================
-- StudyVault — initial migration
-- Tables, indexes, RLS policies, private storage bucket + policies,
-- helper functions and realtime publication.
--
-- Run this ONCE in the Supabase SQL editor (or via `supabase db push`).
-- ============================================================================

create extension if not exists pgcrypto;

-- ----------------------------------------------------------------------------
-- 1. Tables
-- ----------------------------------------------------------------------------

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  display_name text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 80),
  description text,
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.workspace_members (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null default 'editor' check (role in ('owner', 'editor', 'viewer')),
  created_at timestamptz not null default now(),
  unique (workspace_id, user_id)
);

create table if not exists public.folders (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  parent_folder_id uuid references public.folders (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 180),
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists public.files (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  folder_id uuid references public.folders (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 200),
  storage_path text not null,
  mime_type text not null default 'application/pdf' check (mime_type = 'application/pdf'),
  file_size bigint not null check (file_size >= 0 and file_size <= 52428800), -- 50 MB
  uploaded_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists public.stars (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  file_id uuid references public.files (id) on delete cascade,
  folder_id uuid references public.folders (id) on delete cascade,
  created_at timestamptz not null default now(),
  check (
    (file_id is not null and folder_id is null)
    or (file_id is null and folder_id is not null)
  )
);

create table if not exists public.activity_logs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  user_id uuid not null default auth.uid(),
  action text not null,
  target_type text not null check (target_type in ('file', 'folder', 'workspace')),
  target_id uuid,
  target_name text not null,
  metadata jsonb,
  created_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- 2. Indexes
-- ----------------------------------------------------------------------------

create index if not exists folders_workspace_idx on public.folders (workspace_id);
create index if not exists folders_parent_idx on public.folders (parent_folder_id);
create index if not exists folders_name_trgm_idx on public.folders (name);
create index if not exists folders_deleted_idx on public.folders (workspace_id, deleted_at);

create index if not exists files_workspace_idx on public.files (workspace_id);
create index if not exists files_folder_idx on public.files (folder_id);
create index if not exists files_name_idx on public.files (workspace_id, name);
create index if not exists files_deleted_idx on public.files (workspace_id, deleted_at);
create index if not exists files_updated_idx on public.files (workspace_id, updated_at desc);

create index if not exists members_workspace_idx on public.workspace_members (workspace_id);
create index if not exists members_user_idx on public.workspace_members (user_id);
create index if not exists stars_user_idx on public.stars (user_id);
create index if not exists activity_workspace_idx on public.activity_logs (workspace_id, created_at desc);

-- ----------------------------------------------------------------------------
-- 3. Profile auto-provisioning (display name comes from signup metadata)
-- ----------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, display_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1))
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ----------------------------------------------------------------------------
-- 4. Membership helpers (security definer avoids RLS recursion)
-- ----------------------------------------------------------------------------

create or replace function public.is_ws_member(ws uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.workspace_members m
    where m.workspace_id = ws and m.user_id = auth.uid()
  );
$$;

create or replace function public.ws_role_of(ws uuid)
returns text
language sql
security definer
stable
set search_path = public
as $$
  select m.role from public.workspace_members m
  where m.workspace_id = ws and m.user_id = auth.uid()
  limit 1;
$$;

-- Path-safe check for storage policies: the first path segment must be a
-- workspace UUID the caller belongs to.
create or replace function public.can_access_storage_path(p text)
returns boolean
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  ws uuid;
begin
  begin
    ws := split_part(p, '/', 1)::uuid;
  exception when others then
    return false;
  end;
  return public.is_ws_member(ws);
end;
$$;

grant execute on function public.is_ws_member(uuid) to authenticated;
grant execute on function public.ws_role_of(uuid) to authenticated;
grant execute on function public.can_access_storage_path(text) to authenticated;

-- ----------------------------------------------------------------------------
-- 5. Row Level Security
-- ----------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.folders enable row level security;
alter table public.files enable row level security;
alter table public.stars enable row level security;
alter table public.activity_logs enable row level security;

-- profiles: own row only
create policy "profiles_select_own" on public.profiles
  for select to authenticated using (id = auth.uid());
create policy "profiles_update_own" on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- workspaces: visible to members; any authenticated user may create one
create policy "workspaces_select_member" on public.workspaces
  for select to authenticated using (public.is_ws_member(id));
create policy "workspaces_insert_auth" on public.workspaces
  for insert to authenticated with check (auth.uid() is not null);
create policy "workspaces_update_owner" on public.workspaces
  for update to authenticated
  using (public.ws_role_of(id) = 'owner')
  with check (public.ws_role_of(id) = 'owner');

-- workspace_members: members see each other; a user may add only themself
-- (owner-inviting-others happens through the definer function below)
create policy "members_select_member" on public.workspace_members
  for select to authenticated using (public.is_ws_member(workspace_id));
create policy "members_insert_self" on public.workspace_members
  for insert to authenticated with check (user_id = auth.uid());

-- folders: members read; editors/owner write
create policy "folders_select_member" on public.folders
  for select to authenticated using (public.is_ws_member(workspace_id));
create policy "folders_insert_editor" on public.folders
  for insert to authenticated
  with check (
    public.is_ws_member(workspace_id)
    and coalesce(public.ws_role_of(workspace_id), 'viewer') in ('owner', 'editor')
  );
create policy "folders_update_editor" on public.folders
  for update to authenticated
  using (public.is_ws_member(workspace_id) and coalesce(public.ws_role_of(workspace_id), 'viewer') in ('owner', 'editor'))
  with check (public.is_ws_member(workspace_id));
create policy "folders_delete_editor" on public.folders
  for delete to authenticated
  using (public.is_ws_member(workspace_id) and coalesce(public.ws_role_of(workspace_id), 'viewer') in ('owner', 'editor'));

-- files: same model
create policy "files_select_member" on public.files
  for select to authenticated using (public.is_ws_member(workspace_id));
create policy "files_insert_editor" on public.files
  for insert to authenticated
  with check (
    public.is_ws_member(workspace_id)
    and coalesce(public.ws_role_of(workspace_id), 'viewer') in ('owner', 'editor')
    and uploaded_by = auth.uid()
    and mime_type = 'application/pdf'
  );
create policy "files_update_editor" on public.files
  for update to authenticated
  using (public.is_ws_member(workspace_id) and coalesce(public.ws_role_of(workspace_id), 'viewer') in ('owner', 'editor'))
  with check (public.is_ws_member(workspace_id));
create policy "files_delete_editor" on public.files
  for delete to authenticated
  using (public.is_ws_member(workspace_id) and coalesce(public.ws_role_of(workspace_id), 'viewer') in ('owner', 'editor'));

-- stars: strictly personal
create policy "stars_select_own" on public.stars
  for select to authenticated using (user_id = auth.uid());
create policy "stars_insert_own" on public.stars
  for insert to authenticated with check (user_id = auth.uid());
create policy "stars_delete_own" on public.stars
  for delete to authenticated using (user_id = auth.uid());

-- activity: members read, members write their own entries
create policy "activity_select_member" on public.activity_logs
  for select to authenticated using (public.is_ws_member(workspace_id));
create policy "activity_insert_member" on public.activity_logs
  for insert to authenticated
  with check (public.is_ws_member(workspace_id) and user_id = auth.uid());

-- ----------------------------------------------------------------------------
-- 6. Member directory + owner-only invites
-- ----------------------------------------------------------------------------

create or replace function public.get_workspace_members(ws uuid)
returns table (
  id uuid,
  workspace_id uuid,
  user_id uuid,
  role text,
  created_at timestamptz,
  display_name text,
  avatar_url text,
  email text
)
language plpgsql
security definer
stable
set search_path = public
as $$
begin
  if not public.is_ws_member(ws) then
    raise exception 'You are not a member of this workspace.';
  end if;
  return query
    select m.id, m.workspace_id, m.user_id, m.role, m.created_at,
           p.display_name, p.avatar_url, p.email
    from public.workspace_members m
    left join public.profiles p on p.id = m.user_id
    where m.workspace_id = ws
    order by m.created_at;
end;
$$;

create or replace function public.invite_to_workspace(ws uuid, invite_email text)
returns table (user_id uuid, display_name text)
language plpgsql
security definer
set search_path = public
as $$
declare
  target public.profiles%rowtype;
begin
  if public.ws_role_of(ws) <> 'owner' then
    raise exception 'Only the workspace owner can add members.';
  end if;

  select * into target from public.profiles p where lower(p.email) = lower(invite_email) limit 1;
  if not found then
    raise exception 'No StudyVault account exists for that email yet — ask your friend to sign up first.';
  end if;

  if exists (select 1 from public.workspace_members m where m.workspace_id = ws and m.user_id = target.id) then
    raise exception 'That user is already a member.';
  end if;

  insert into public.workspace_members (workspace_id, user_id, role)
  values (ws, target.id, 'editor');

  return query select target.id, coalesce(target.display_name, target.email);
end;
$$;

grant execute on function public.get_workspace_members(uuid) to authenticated;
grant execute on function public.invite_to_workspace(uuid, text) to authenticated;

-- ----------------------------------------------------------------------------
-- 7. Trash helpers (run as definer; each re-checks membership + role)
-- ----------------------------------------------------------------------------

create or replace function public.soft_delete_folder(fid uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  ws uuid;
begin
  select workspace_id into ws from public.folders where id = fid;
  if ws is null then
    raise exception 'Folder not found.';
  end if;
  if not public.is_ws_member(ws) or coalesce(public.ws_role_of(ws), 'viewer') not in ('owner', 'editor') then
    raise exception 'You do not have permission to perform this action.';
  end if;

  with recursive subtree as (
    select fid as id
    union all
    select f.id from public.folders f join subtree s on f.parent_folder_id = s.id
    where f.workspace_id = ws
  )
  update public.folders set deleted_at = now()
  where id in (select id from subtree);

  with recursive subtree as (
    select fid as id
    union all
    select f.id from public.folders f join subtree s on f.parent_folder_id = s.id
    where f.workspace_id = ws
  )
  update public.files set deleted_at = now()
  where folder_id in (select id from subtree) and deleted_at is null;
end;
$$;

create or replace function public.restore_folder(fid uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  ws uuid;
  parent uuid;
begin
  select workspace_id, parent_folder_id into ws, parent from public.folders where id = fid;
  if ws is null then
    raise exception 'Folder not found.';
  end if;
  if not public.is_ws_member(ws) or coalesce(public.ws_role_of(ws), 'viewer') not in ('owner', 'editor') then
    raise exception 'You do not have permission to perform this action.';
  end if;

  with recursive subtree as (
    select fid as id
    union all
    select f.id from public.folders f join subtree s on f.parent_folder_id = s.id
    where f.workspace_id = ws
  )
  update public.folders set deleted_at = null
  where id in (select id from subtree);

  with recursive subtree as (
    select fid as id
    union all
    select f.id from public.folders f join subtree s on f.parent_folder_id = s.id
    where f.workspace_id = ws
  )
  update public.files set deleted_at = null
  where folder_id in (select id from subtree);

  -- if the parent is still in trash, re-attach to the workspace root
  if parent is not null and exists (
    select 1 from public.folders p where p.id = parent and p.deleted_at is not null
  ) then
    update public.folders set parent_folder_id = null where id = fid;
  end if;
end;
$$;

create or replace function public.purge_folder(fid uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  ws uuid;
  paths text[];
begin
  select workspace_id into ws from public.folders where id = fid;
  if ws is null then
    raise exception 'Folder not found.';
  end if;
  if not public.is_ws_member(ws) or coalesce(public.ws_role_of(ws), 'viewer') not in ('owner', 'editor') then
    raise exception 'You do not have permission to perform this action.';
  end if;

  with recursive subtree as (
    select fid as id
    union all
    select f.id from public.folders f join subtree s on f.parent_folder_id = s.id
    where f.workspace_id = ws
  )
  select array_agg(fl.storage_path) into paths
  from public.files fl
  where fl.folder_id in (select id from subtree);

  with recursive subtree as (
    select fid as id
    union all
    select f.id from public.folders f join subtree s on f.parent_folder_id = s.id
    where f.workspace_id = ws
  )
  delete from public.folders where id in (select id from subtree);
  -- files are removed via ON DELETE CASCADE

  if paths is not null then
    delete from storage.objects
    where bucket_id = 'studyvault' and name = any (paths);
  end if;
end;
$$;

grant execute on function public.soft_delete_folder(uuid) to authenticated;
grant execute on function public.restore_folder(uuid) to authenticated;
grant execute on function public.purge_folder(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- 8. Private storage bucket + policies
-- ----------------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('studyvault', 'studyvault', false)
on conflict (id) do update set public = false;

create policy "storage_select_member" on storage.objects
  for select to authenticated
  using (bucket_id = 'studyvault' and public.can_access_storage_path(name));

create policy "storage_insert_member" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'studyvault'
    and auth.uid() is not null
    and public.can_access_storage_path(name)
    and (storage.extension(name) = 'pdf' or lower(storage.extension(name)) = 'pdf')
  );

create policy "storage_update_member" on storage.objects
  for update to authenticated
  using (bucket_id = 'studyvault' and public.can_access_storage_path(name));

create policy "storage_delete_member" on storage.objects
  for delete to authenticated
  using (bucket_id = 'studyvault' and public.can_access_storage_path(name));

-- ----------------------------------------------------------------------------
-- 9. Realtime: broadcast workspace changes to connected members
-- ----------------------------------------------------------------------------

do $$
begin
  alter publication supabase_realtime add table public.folders;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.files;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.activity_logs;
exception when duplicate_object then null;
end $$;
