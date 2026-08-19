-- ============================================================================
-- StudyVault — Google Drive Storage Integration (idempotent, production-safe)
--
-- Adds columns to files table for Google Drive file/folder IDs.
-- Does NOT remove existing Supabase Storage functionality.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Add Google Drive columns to files table
-- ----------------------------------------------------------------------------

alter table public.files
add column if not exists drive_file_id text,
add column if not exists drive_folder_id text;

-- Add indexes for Google Drive lookups
create index if not exists files_drive_file_idx on public.files (drive_file_id) where drive_file_id is not null;
create index if not exists files_drive_folder_idx on public.files (drive_folder_id) where drive_folder_id is not null;

-- Add comments for documentation
comment on column public.files.drive_file_id is 'Google Drive file ID for files stored in Google Drive';
comment on column public.files.drive_folder_id is 'Google Drive folder ID where this file is stored';

-- Note: storage_path column is still used for Supabase Storage files.
-- For Google Drive files, storage_path may be null or contain a placeholder.
