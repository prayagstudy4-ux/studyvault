-- ============================================================================
-- StudyVault — optional seed
-- Creates the "Our Notes" workspace with the Class 9 folder skeleton.
--
-- BEFORE RUNNING: replace OWNER_EMAIL below with the email of the FIRST user
-- you created in Authentication → Users. If that email has no account yet,
-- the script exits gracefully (the app can also create the workspace from
-- the dashboard instead).
-- ============================================================================

do $$
declare
  OWNER_EMAIL constant text := 'owner@example.com'; -- ← change this
  owner_id uuid;
  ws_id uuid;
  class9 uuid;
  maths uuid;
  science uuid;
  sst uuid;
begin
  select id into owner_id from auth.users where lower(email) = lower(OWNER_EMAIL) limit 1;

  if owner_id is null then
    raise notice 'Seed skipped: no user with email %. Sign up in the app first, then re-run this script (or create the workspace from the dashboard).', OWNER_EMAIL;
    return;
  end if;

  -- workspace + owner membership
  insert into public.workspaces (name, description, created_by)
  values ('Our Notes', 'Private shared notes for the two of us', owner_id)
  returning id into ws_id;

  insert into public.workspace_members (workspace_id, user_id, role)
  values (ws_id, owner_id, 'owner');

  -- folder skeleton
  insert into public.folders (workspace_id, parent_folder_id, name, created_by)
  values (ws_id, null, 'Class 9', owner_id)
  returning id into class9;

  insert into public.folders (workspace_id, parent_folder_id, name, created_by)
  values (ws_id, class9, 'Mathematics', owner_id)
  returning id into maths;

  insert into public.folders (workspace_id, parent_folder_id, name, created_by) values
    (ws_id, maths, 'Chapter 1 - Number Systems', owner_id),
    (ws_id, maths, 'Chapter 2 - Polynomials', owner_id),
    (ws_id, maths, 'Chapter 3 - Coordinate Geometry', owner_id),
    (ws_id, maths, 'Chapter 4 - Linear Equations', owner_id);

  insert into public.folders (workspace_id, parent_folder_id, name, created_by)
  values (ws_id, class9, 'Science', owner_id)
  returning id into science;

  insert into public.folders (workspace_id, parent_folder_id, name, created_by) values
    (ws_id, science, 'Physics', owner_id),
    (ws_id, science, 'Chemistry', owner_id),
    (ws_id, science, 'Biology', owner_id);

  insert into public.folders (workspace_id, parent_folder_id, name, created_by)
  values (ws_id, class9, 'Social Science', owner_id)
  returning id into sst;

  insert into public.folders (workspace_id, parent_folder_id, name, created_by) values
    (ws_id, sst, 'History', owner_id),
    (ws_id, sst, 'Geography', owner_id),
    (ws_id, sst, 'Civics', owner_id),
    (ws_id, sst, 'Economics', owner_id),
    (ws_id, class9, 'English', owner_id),
    (ws_id, class9, 'Hindi', owner_id),
    (ws_id, class9, 'AI', owner_id);

  raise notice 'Seed complete — workspace % created with the Class 9 skeleton.', ws_id;
end $$;
