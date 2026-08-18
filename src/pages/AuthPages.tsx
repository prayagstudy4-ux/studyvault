import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, KeyRound, Mail, ShieldCheck, UserRound } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { friendlyError } from "../lib/utils";
import { Brand } from "../components/layout/AppLayout";
import { Button, Field, Input } from "../components/ui/primitives";

function AuthShell({ children, title, subtitle }: { children: ReactNode; title: string; subtitle: string }) {
  return (
    <div className="flex min-h-dvh bg-ink-50 dark:bg-ink-950">
      {/* brand panel */}
      <aside className="relative hidden w-[42%] flex-col justify-between overflow-hidden bg-ink-900 p-10 lg:flex dark:bg-ink-900">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(700px 400px at 20% 10%, rgba(95,104,236,0.28), transparent 65%), radial-gradient(600px 500px at 85% 90%, rgba(14,159,138,0.16), transparent 60%)",
          }}
        />
        <div className="relative">
          <Brand />
        </div>
        <div className="relative">
          <h1 className="font-display max-w-md text-4xl font-extrabold leading-[1.12] tracking-tight text-ink-50">
            One private vault for both of your notes.
          </h1>
          <p className="mt-4 max-w-sm text-[15px] leading-relaxed text-ink-300">
            Upload a PDF and it appears on your friend's screen in real time. Folders, chapters,
            revisions — organised once, visible to both.
          </p>
          <ul className="mt-8 space-y-3 text-sm text-ink-200">
            <li className="flex items-center gap-3">
              <ShieldCheck className="h-4.5 w-4.5 shrink-0 text-brand-400" />
              Private by default — row-level security on every row and file
            </li>
            <li className="flex items-center gap-3">
              <ArrowRight className="h-4.5 w-4.5 shrink-0 text-brand-400" />
              Unlimited nested folders for every subject and chapter
            </li>
          </ul>
        </div>
        <p className="relative text-xs text-ink-500">StudyVault · built for two students, no one else.</p>
      </aside>

      {/* form panel */}
      <main className="flex flex-1 items-center justify-center px-4 py-10">
        <div className="anim-fade-up w-full max-w-sm">
          <div className="mb-8 lg:hidden">
            <Brand />
          </div>
          <h2 className="font-display text-2xl font-extrabold tracking-tight text-ink-900 dark:text-ink-50">{title}</h2>
          <p className="mt-1.5 text-sm text-ink-500 dark:text-ink-400">{subtitle}</p>
          <div className="mt-7">{children}</div>
        </div>
      </main>
    </div>
  );
}

function mapAuthError(err: unknown): string {
  const raw = err instanceof Error ? err.message.toLowerCase() : "";
  if (raw.includes("invalid login credentials")) return "Incorrect email or password.";
  if (raw.includes("already registered") || raw.includes("already been registered"))
    return "That email is already registered — try signing in instead.";
  if (raw.includes("password should be")) return "Password must be at least 6 characters long.";
  if (raw.includes("valid email")) return "Please enter a valid email address.";
  if (raw.includes("rate limit")) return "Too many attempts. Please wait a moment and try again.";
  if (raw.includes("email not confirmed"))
    return "Please confirm your email first — check your inbox for the confirmation link.";
  return friendlyError(err, "Something went wrong. Please try again.");
}

export function LoginPage() {
  const { session, signIn } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (session) navigate("/dashboard", { replace: true });
  }, [session, navigate]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await signIn(email.trim(), password);
      navigate("/dashboard", { replace: true });
    } catch (err) {
      setError(mapAuthError(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell title="Welcome back" subtitle="Sign in to open your shared notes.">
      <form onSubmit={(e) => void submit(e)} className="space-y-4" noValidate>
        {error ? (
          <p role="alert" className="rounded-lg border border-danger-500/30 bg-danger-500/8 px-3.5 py-2.5 text-[13px] font-medium text-danger-500 dark:text-[#f3a7a7]">
            {error}
          </p>
        ) : null}
        <Field label="Email">
          <div className="relative">
            <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
            <Input type="email" required autoComplete="email" className="pl-9.5" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@school.edu" />
          </div>
        </Field>
        <Field label="Password">
          <div className="relative">
            <KeyRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
            <Input type="password" required autoComplete="current-password" className="pl-9.5" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
          </div>
        </Field>
        <Button type="submit" variant="primary" size="lg" loading={loading} className="w-full">
          Sign in
        </Button>
        <div className="flex items-center justify-between pt-1 text-[13px]">
          <Link to="/forgot-password" className="font-semibold text-brand-600 hover:underline dark:text-brand-400">
            Forgot password?
          </Link>
          <Link to="/signup" className="font-semibold text-ink-600 hover:underline dark:text-ink-300">
            Create account
          </Link>
        </div>
      </form>
    </AuthShell>
  );
}

export function SignupPage() {
  const { session, signUp } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [needsConfirm, setNeedsConfirm] = useState(false);

  useEffect(() => {
    if (session) navigate("/dashboard", { replace: true });
  }, [session, navigate]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    setLoading(true);
    try {
      const res = await signUp(email.trim(), password, name.trim() || email.split("@")[0]);
      if (res.needsConfirmation) {
        setNeedsConfirm(true);
      } else {
        navigate("/dashboard", { replace: true });
      }
    } catch (err) {
      setError(mapAuthError(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell title="Create your account" subtitle="One of two seats in this private study vault.">
      {needsConfirm ? (
        <div className="anim-pop rounded-xl border border-ok-500/30 bg-ok-500/8 p-5">
          <h3 className="font-display text-base font-bold text-ink-900 dark:text-ink-50">Check your inbox</h3>
          <p className="mt-1.5 text-sm leading-relaxed text-ink-600 dark:text-ink-300">
            We sent a confirmation link to <span className="font-semibold">{email}</span>. Click it, then sign in
            to start organising your notes.
          </p>
          <Link to="/login" className="mt-4 inline-block text-sm font-bold text-brand-600 hover:underline dark:text-brand-400">
            Go to sign in →
          </Link>
        </div>
      ) : (
        <form onSubmit={(e) => void submit(e)} className="space-y-4" noValidate>
          {error ? (
            <p role="alert" className="rounded-lg border border-danger-500/30 bg-danger-500/8 px-3.5 py-2.5 text-[13px] font-medium text-danger-500 dark:text-[#f3a7a7]">
              {error}
            </p>
          ) : null}
          <Field label="Display name">
            <div className="relative">
              <UserRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
              <Input required className="pl-9.5" value={name} onChange={(e) => setName(e.target.value)} placeholder="Prayag" maxLength={40} />
            </div>
          </Field>
          <Field label="Email">
            <div className="relative">
              <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
              <Input type="email" required autoComplete="email" className="pl-9.5" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@school.edu" />
            </div>
          </Field>
          <Field label="Password">
            <Input type="password" required autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 6 characters" />
          </Field>
          <Field label="Confirm password">
            <Input type="password" required autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="Repeat password" />
          </Field>
          <Button type="submit" variant="primary" size="lg" loading={loading} className="w-full">
            Create account
          </Button>
          <p className="pt-1 text-center text-[13px] text-ink-500 dark:text-ink-400">
            Already have an account?{" "}
            <Link to="/login" className="font-semibold text-brand-600 hover:underline dark:text-brand-400">
              Sign in
            </Link>
          </p>
        </form>
      )}
    </AuthShell>
  );
}

export function ForgotPasswordPage() {
  const { resetPassword } = useAuth();
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await resetPassword(email.trim());
      setSent(true);
    } catch (err) {
      setError(mapAuthError(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell title="Reset password" subtitle="We'll email you a secure reset link.">
      {sent ? (
        <div className="anim-pop rounded-xl border border-ok-500/30 bg-ok-500/8 p-5">
          <h3 className="font-display text-base font-bold text-ink-900 dark:text-ink-50">Reset link sent</h3>
          <p className="mt-1.5 text-sm leading-relaxed text-ink-600 dark:text-ink-300">
            If an account exists for <span className="font-semibold">{email}</span>, a reset link is on its way.
            Check your inbox (and spam, just in case).
          </p>
          <Link to="/login" className="mt-4 inline-block text-sm font-bold text-brand-600 hover:underline dark:text-brand-400">
            Back to sign in →
          </Link>
        </div>
      ) : (
        <form onSubmit={(e) => void submit(e)} className="space-y-4" noValidate>
          {error ? (
            <p role="alert" className="rounded-lg border border-danger-500/30 bg-danger-500/8 px-3.5 py-2.5 text-[13px] font-medium text-danger-500 dark:text-[#f3a7a7]">
              {error}
            </p>
          ) : null}
          <Field label="Email">
            <div className="relative">
              <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
              <Input type="email" required autoComplete="email" className="pl-9.5" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@school.edu" />
            </div>
          </Field>
          <Button type="submit" variant="primary" size="lg" loading={loading} className="w-full">
            Send reset link
          </Button>
          <p className="pt-1 text-center text-[13px]">
            <Link to="/login" className="font-semibold text-brand-600 hover:underline dark:text-brand-400">
              ← Back to sign in
            </Link>
          </p>
        </form>
      )}
    </AuthShell>
  );
}
