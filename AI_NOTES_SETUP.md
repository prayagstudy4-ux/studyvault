# AI Notes setup

AI Notes uses the existing server-side `GEMINI_API_KEY`; no new Gemini key or
browser environment variable is required.

1. Apply `supabase/migrations/004_ai_notes.sql` after the existing migrations.
2. Deploy the function:

   ```bash
   npx supabase functions deploy ai-notes
   ```

3. Ensure `GEMINI_API_KEY` remains configured in Supabase Edge Function secrets.

The feature accepts a topic, pasted study material, or a workspace PDF/image.
Source files are validated against workspace membership, read only through
private storage or the existing Google Drive credentials, and are limited to
10 MB for Gemini inline processing.
