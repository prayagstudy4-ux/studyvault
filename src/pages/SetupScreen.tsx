import { Database, KeyRound, Rocket, TerminalSquare } from "lucide-react";
import { Brand } from "../components/layout/AppLayout";

/**
 * Shown only when VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY are missing.
 * StudyVault never falls back to fake data — it waits for a real Supabase project.
 */
export function SetupScreen() {
  const steps = [
    {
      icon: Database,
      title: "Create a Supabase project",
      body: "Go to supabase.com → New project (the free tier works). Note the Project URL from Settings → API.",
    },
    {
      icon: TerminalSquare,
      title: "Run the migration",
      body: "In the SQL editor, run supabase/migrations/001_studyvault.sql — it creates every table, index, RLS policy, storage bucket and helper function.",
    },
    {
      icon: KeyRound,
      title: "Add your public keys",
      body: "Copy .env.example to .env.local and fill in the Project URL and the anon public key (both are safe for browsers — security lives in RLS, never in these keys).",
    },
    {
      icon: Rocket,
      title: "Restart and sign up",
      body: "Run npm run dev again, create the first account, create the “Our Notes” workspace, then invite your friend from Settings.",
    },
  ];

  return (
    <div className="min-h-dvh bg-ink-950 px-4 py-10 sm:px-8">
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0"
        style={{
          background:
            "radial-gradient(800px 420px at 15% 8%, rgba(95,104,236,0.22), transparent 65%), radial-gradient(700px 500px at 90% 92%, rgba(14,159,138,0.13), transparent 60%)",
        }}
      />
      <div className="relative mx-auto max-w-2xl">
        <Brand />
        <h1 className="font-display mt-10 text-3xl font-extrabold tracking-tight text-ink-50 sm:text-4xl">
          Connect StudyVault to Supabase
        </h1>
        <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-ink-300">
          This app stores everything in a real Supabase project — auth, database, private file storage
          and realtime sync. It doesn't ship with demo data or simulated logins, so it needs your
          project's two <span className="font-semibold text-ink-100">public</span> values before it can start.
        </p>

        <div className="mt-8 overflow-hidden rounded-xl border border-ink-800 bg-ink-900/80">
          <div className="border-b border-ink-800 px-4 py-2 text-[10.5px] font-bold uppercase tracking-[0.16em] text-ink-500">
            .env.local
          </div>
          <pre className="overflow-x-auto px-4 py-3.5 font-mono text-[13px] leading-relaxed text-ink-200">
{`VITE_SUPABASE_URL=https://YOUR-PROJECT-REF.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR-ANON-PUBLIC-KEY`}
          </pre>
        </div>

        <ol className="mt-8 space-y-4">
          {steps.map((s, i) => (
            <li key={s.title} className="flex gap-4 rounded-xl border border-ink-800 bg-ink-900/60 p-4">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-600/15 text-brand-400">
                <s.icon className="h-5 w-5" />
              </span>
              <div>
                <p className="font-display text-[14.5px] font-bold text-ink-100">
                  <span className="mr-2 text-brand-400">{i + 1}.</span>
                  {s.title}
                </p>
                <p className="mt-1 text-[13px] leading-relaxed text-ink-400">{s.body}</p>
              </div>
            </li>
          ))}
        </ol>

        <p className="mt-8 text-[12.5px] leading-relaxed text-ink-500">
          The complete walkthrough — database setup, enabling email auth, storage policies, Vercel
          deployment and the security model — lives in the project <span className="font-semibold text-ink-300">README.md</span>.
          Never add the service-role key to a browser app.
        </p>
      </div>
    </div>
  );
}
