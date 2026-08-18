# AI Doubt Solver - Setup Guide

This document explains how to set up and configure the AI Doubt Solver feature in StudyVault.

## Overview

The AI Doubt Solver allows students to ask academic questions and receive clear, step-by-step explanations using Google Gemini AI. The feature is fully integrated into StudyVault and uses Supabase Edge Functions for secure API key management.

## Architecture

```
React Frontend (Browser)
    ↓ (authenticated requests)
Supabase Edge Function
    ↓ (server-side API call)
Google Gemini API
    ↓
Response → Frontend
```

**Security:** The Gemini API key is stored ONLY on the server-side (Supabase Edge Function secrets) and NEVER exposed to the browser.

---

## Setup Instructions

### Step 1: Run Database Migrations

Apply the new database tables for AI conversations and messages:

```bash
# In your Supabase Dashboard, go to SQL Editor and run:
# OR use the Supabase CLI:
supabase db push
```

The migration file `supabase/migrations/002_ai_doubt_solver.sql` creates:
- `ai_conversations` table - stores conversation metadata
- `ai_messages` table - stores individual messages
- Row Level Security (RLS) policies - ensures users can only access their own data
- Storage policies for AI image uploads

### Step 2: Get a Free Google Gemini API Key

1. Go to [Google AI Studio](https://aistudio.google.com/app/apikey)
2. Sign in with your Google account
3. Click "Create API Key"
4. Copy the generated key

**Free Tier Limits (as of 2024):**
- 15 requests per minute (RPM)
- 1 million tokens per minute (TPM)
- 1,500 requests per day (RPD)

These limits are sufficient for personal/educational use.

### Step 3: Configure Supabase Edge Function Secret

Deploy the secret to your Supabase project:

```bash
# Login to Supabase
npx supabase login

# Link to your project (get project ref from Supabase Dashboard)
npx supabase link --project-ref YOUR_PROJECT_REF

# Set the Gemini API key as a secret
npx supabase secrets set GEMINI_API_KEY=your_gemini_api_key_here
```

**Important:** Never commit the API key to Git. It's stored securely in Supabase.

### Step 4: Deploy the Edge Function

```bash
# Deploy the AI doubt solver function
npx supabase functions deploy ai-doubt-solver
```

### Step 5: Test the Feature

1. Start your development server:
   ```bash
   npm run dev
   ```

2. Sign in to StudyVault

3. Navigate to **AI Doubt Solver** from the sidebar (or go to `/ai`)

4. Select a subject and class level, then ask a question!

---

## Files Created/Modified

### New Files:
- `src/types/index.ts` - Added AI-related TypeScript types
- `src/services/aiService.ts` - AI service layer for frontend
- `src/components/ai/AIMessage.tsx` - Message bubble component
- `src/components/ai/AIDoubtChat.tsx` - Main AI chat page component
- `supabase/functions/ai-doubt-solver/index.ts` - Edge function
- `supabase/migrations/002_ai_doubt_solver.sql` - Database schema

### Modified Files:
- `src/App.tsx` - Added `/ai` route
- `src/components/layout/AppLayout.tsx` - Added navigation link

---

## Features

### Subject Selection
- Mathematics
- Science
- Social Science
- English
- Hindi
- Computer / AI
- General

### Class Levels
- Class 9 (tailored explanations for 14-15 year olds)
- General (default level)

### Special Actions (after each AI response)
- **Explain Simpler** - Get easier explanation
- **Give a Hint** - Receive helpful hints instead of full answer
- **Step-by-Step** - Detailed breakdown
- **Another Method** - Alternative solution approach

### Image Support
Upload images of problems (screenshots, photos of homework, diagrams).

### Conversation History
- Save and revisit past conversations
- Delete unwanted conversations
- Continue previous discussions

---

## Rate Limiting

To prevent abuse and stay within free tier limits:
- Maximum 10 requests per user per minute
- Server-side enforcement in Edge Function

---

## Troubleshooting

### "AI service not configured"
- Ensure you've set the `GEMINI_API_KEY` secret in Supabase
- Verify the edge function is deployed

### "Rate limit exceeded"
- Wait a moment before sending another request
- The limit resets every minute

### "Authentication failed"
- Sign out and sign back in
- Check that your Supabase project is properly configured

### Edge Function Errors
Check logs in Supabase Dashboard → Edge Functions → ai-doubt-solver → Logs

---

## Production Deployment

1. **Deploy migrations** to production database
2. **Set secrets** on production Supabase project
3. **Deploy edge function** to production
4. **Build frontend** with production environment variables

```bash
# Build for production
npm run build

# Deploy to your hosting provider (Vercel, Netlify, etc.)
```

---

## Privacy & Security

✅ **Secure by Design:**
- API keys never exposed to browser
- Row Level Security ensures data isolation
- Authenticated-only access
- Input validation on server-side

⚠️ **Important Notes:**
- AI can make mistakes - always verify important answers
- Don't upload sensitive personal information in images
- Conversations are stored in your Supabase database

---

## Cost

**Completely FREE** using:
- Google Gemini free tier (1,500 requests/day)
- Supabase free tier (Edge Functions included)
- Your existing Supabase storage

For heavy usage, consider upgrading to Gemini API paid tier ($0.50 per 1M characters input).

---

## Support

If you encounter issues:
1. Check Supabase Edge Function logs
2. Verify API key is correctly set
3. Ensure database migrations ran successfully
4. Check browser console for errors

For more help, refer to:
- [Supabase Edge Functions Docs](https://supabase.com/docs/guides/functions)
- [Google Gemini API Docs](https://ai.google.dev/docs)
