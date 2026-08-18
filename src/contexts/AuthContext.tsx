import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Session, User } from "@supabase/supabase-js";
import { requireClient } from "../lib/supabase";
import { getProfile, updateProfile } from "../services/db";
import type { UserProfile } from "../types";

interface SignUpResult {
  needsConfirmation: boolean;
}

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  profile: UserProfile | null;
  initializing: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, displayName: string) => Promise<SignUpResult>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  changePassword: (newPassword: string) => Promise<void>;
  saveProfile: (patch: { display_name?: string; avatar_url?: string }) => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [initializing, setInitializing] = useState(true);

  const loadProfile = useCallback(async (userId: string) => {
    try {
      const p = await getProfile(userId);
      setProfile(p);
    } catch {
      setProfile(null);
    }
  }, []);

  useEffect(() => {
    const sb = requireClient();
    let cancelled = false;

    void sb.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      setSession(data.session);
      if (data.session?.user) void loadProfile(data.session.user.id);
      setInitializing(false);
    });

    const { data: sub } = sb.auth.onAuthStateChange((_event, nextSession) => {
      if (cancelled) return;
      setSession(nextSession);
      if (nextSession?.user) {
        void loadProfile(nextSession.user.id);
      } else {
        setProfile(null);
      }
      setInitializing(false);
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, [loadProfile]);

  const signIn = useCallback(async (email: string, password: string) => {
    const sb = requireClient();
    const { error } = await sb.auth.signInWithPassword({ email, password });
    if (error) throw error;
  }, []);

  const signUp = useCallback(async (email: string, password: string, displayName: string) => {
    const sb = requireClient();
    const { data, error } = await sb.auth.signUp({
      email,
      password,
      options: { data: { display_name: displayName } },
    });
    if (error) throw error;
    return { needsConfirmation: !data.session };
  }, []);

  const signOut = useCallback(async () => {
    const sb = requireClient();
    await sb.auth.signOut();
  }, []);

  const resetPassword = useCallback(async (email: string) => {
    const sb = requireClient();
    const { error } = await sb.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin,
    });
    if (error) throw error;
  }, []);

  const changePassword = useCallback(async (newPassword: string) => {
    const sb = requireClient();
    const { error } = await sb.auth.updateUser({ password: newPassword });
    if (error) throw error;
  }, []);

  const saveProfile = useCallback(
    async (patch: { display_name?: string; avatar_url?: string }) => {
      const sb = requireClient();
      const {
        data: { user },
      } = await sb.auth.getUser();
      if (!user) throw new Error("You must be signed in.");
      const updated = await updateProfile(user.id, patch);
      setProfile(updated);
    },
    []
  );

  const refreshProfile = useCallback(async () => {
    const sb = requireClient();
    const {
      data: { user },
    } = await sb.auth.getUser();
    if (user) await loadProfile(user.id);
  }, [loadProfile]);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      user: session?.user ?? null,
      profile,
      initializing,
      signIn,
      signUp,
      signOut,
      resetPassword,
      changePassword,
      saveProfile,
      refreshProfile,
    }),
    [session, profile, initializing, signIn, signUp, signOut, resetPassword, changePassword, saveProfile, refreshProfile]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
