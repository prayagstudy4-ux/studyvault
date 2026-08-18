-- ============================================================================
-- StudyVault — AI Doubt Solver Tables (idempotent, production-safe)
--
-- Creates tables for storing AI conversations and messages with proper RLS.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. AI Conversations Table
-- ----------------------------------------------------------------------------

create table if not exists public.ai_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 100),
  subject text not null default 'general' check (subject in ('mathematics', 'science', 'social_science', 'english', 'hindi', 'computer', 'general')),
  class_level text not null default 'general' check (class_level in ('class_9', 'general')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- 2. AI Messages Table
-- ----------------------------------------------------------------------------

create table if not exists public.ai_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.ai_conversations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  image_url text,
  created_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- 3. Indexes
-- ----------------------------------------------------------------------------

create index if not exists ai_conversations_user_idx on public.ai_conversations (user_id);
create index if not exists ai_conversations_updated_idx on public.ai_conversations (user_id, updated_at desc);
create index if not exists ai_messages_conversation_idx on public.ai_messages (conversation_id);
create index if not exists ai_messages_user_created_idx on public.ai_messages (user_id, created_at desc);

-- ----------------------------------------------------------------------------
-- 4. Row Level Security (RLS)
-- ----------------------------------------------------------------------------

-- Enable RLS on both tables
alter table public.ai_conversations enable row level security;
alter table public.ai_messages enable row level security;

-- AI Conversations Policies
-- Users can only see their own conversations
drop policy if exists "Users can view own conversations" on public.ai_conversations;
create policy "Users can view own conversations"
  on public.ai_conversations
  for select
  using (auth.uid() = user_id);

-- Users can insert their own conversations
drop policy if exists "Users can create own conversations" on public.ai_conversations;
create policy "Users can create own conversations"
  on public.ai_conversations
  for insert
  with check (auth.uid() = user_id);

-- Users can update their own conversations
drop policy if exists "Users can update own conversations" on public.ai_conversations;
create policy "Users can update own conversations"
  on public.ai_conversations
  for update
  using (auth.uid() = user_id);

-- Users can delete their own conversations
drop policy if exists "Users can delete own conversations" on public.ai_conversations;
create policy "Users can delete own conversations"
  on public.ai_conversations
  for delete
  using (auth.uid() = user_id);

-- AI Messages Policies
-- Users can only see messages from their own conversations
drop policy if exists "Users can view own messages" on public.ai_messages;
create policy "Users can view own messages"
  on public.ai_messages
  for select
  using (
    auth.uid() = user_id AND
    exists (
      select 1 from public.ai_conversations c
      where c.id = conversation_id AND c.user_id = auth.uid()
    )
  );

-- Users can insert messages into their own conversations
drop policy if exists "Users can create own messages" on public.ai_messages;
create policy "Users can create own messages"
  on public.ai_messages
  for insert
  with check (
    auth.uid() = user_id AND
    exists (
      select 1 from public.ai_conversations c
      where c.id = conversation_id AND c.user_id = auth.uid()
    )
  );

-- Users can delete messages from their own conversations
drop policy if exists "Users can delete own messages" on public.ai_messages;
create policy "Users can delete own messages"
  on public.ai_messages
  for delete
  using (
    auth.uid() = user_id AND
    exists (
      select 1 from public.ai_conversations c
      where c.id = conversation_id AND c.user_id = auth.uid()
    )
  );

-- ----------------------------------------------------------------------------
-- 5. Auto-populate user_id on insert
-- ----------------------------------------------------------------------------

-- Trigger to auto-populate user_id for ai_conversations
create or replace function public.set_ai_conversation_user_id()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null then
    new.user_id := auth.uid();
  end if;
  return new;
end;
$$;

drop trigger if exists set_ai_conversation_user_id on public.ai_conversations;
create trigger set_ai_conversation_user_id
  before insert on public.ai_conversations
  for each row
  execute function public.set_ai_conversation_user_id();

-- Trigger to auto-populate user_id for ai_messages
create or replace function public.set_ai_message_user_id()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null then
    new.user_id := auth.uid();
  end if;
  return new;
end;
$$;

drop trigger if exists set_ai_message_user_id on public.ai_messages;
create trigger set_ai_message_user_id
  before insert on public.ai_messages
  for each row
  execute function public.set_ai_message_user_id();

-- ----------------------------------------------------------------------------
-- 6. Storage Policy for AI Images (if not already exists)
-- ----------------------------------------------------------------------------

-- Allow authenticated users to upload AI images to a specific folder
-- This assumes the studyvault bucket already exists from the main migration
-- We just add policies for the ai-images folder

-- Insert policy for ai-images folder
insert into storage.policies (name, bucket_id, policy_type, action, target)
select 
  'Allow authenticated users to upload AI images',
  'studyvault',
  'upload',
  'insert',
  'authenticated'
where not exists (
  select 1 from storage.policies 
  where name = 'Allow authenticated users to upload AI images'
  and bucket_id = 'studyvault'
  and policy_type = 'upload'
);

-- Select policy for ai-images folder  
insert into storage.policies (name, bucket_id, policy_type, action, target)
select 
  'Allow authenticated users to view AI images',
  'studyvault',
  'select',
  'select',
  'authenticated'
where not exists (
  select 1 from storage.policies 
  where name = 'Allow authenticated users to view AI images'
  and bucket_id = 'studyvault'
  and policy_type = 'select'
);

-- Delete policy for ai-images folder
insert into storage.policies (name, bucket_id, policy_type, action, target)
select 
  'Allow authenticated users to delete AI images',
  'studyvault',
  'delete',
  'delete',
  'authenticated'
where not exists (
  select 1 from storage.policies 
  where name = 'Allow authenticated users to delete AI images'
  and bucket_id = 'studyvault'
  and policy_type = 'delete'
);
