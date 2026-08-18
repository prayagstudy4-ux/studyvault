import type { ReactNode } from "react";
import { HashRouter, Navigate, Route, Routes } from "react-router-dom";
import { isSupabaseConfigured } from "./lib/supabase";
import { ThemeProvider } from "./contexts/ThemeContext";
import { ToastProvider } from "./contexts/ToastContext";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import { WorkspaceProvider } from "./contexts/WorkspaceContext";
import { AppLayout } from "./components/layout/AppLayout";
import { Spinner } from "./components/ui/primitives";
import { SetupScreen } from "./pages/SetupScreen";
import { ForgotPasswordPage, LoginPage, SignupPage } from "./pages/AuthPages";
import { Dashboard } from "./pages/Dashboard";
import { BrowsePage } from "./pages/BrowsePage";
import { FileViewerPage } from "./pages/FileViewerPage";
import { RecentPage, StarredPage, TrashPage } from "./pages/Collections";
import { SettingsPage } from "./pages/SettingsPage";

function FullScreenLoader({ label }: { label: string }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-ink-50 dark:bg-ink-950">
      <Spinner className="h-6 w-6 text-brand-500" />
      <p className="text-sm font-semibold text-ink-500 dark:text-ink-400">{label}</p>
    </div>
  );
}

/** Redirects to /login until a session exists. */
function RequireAuth({ children }: { children: ReactNode }) {
  const { session, initializing } = useAuth();
  if (initializing) return <FullScreenLoader label="Checking your session…" />;
  if (!session) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

/** Redirects signed-in users away from the auth pages. */
function GuestOnly({ children }: { children: ReactNode }) {
  const { session, initializing } = useAuth();
  if (initializing) return <FullScreenLoader label="Loading…" />;
  if (session) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}

/** Authenticated shell: workspace state + realtime + app chrome. */
function ProtectedApp() {
  return (
    <WorkspaceProvider>
      <AppLayout />
    </WorkspaceProvider>
  );
}

export default function App() {
  if (!isSupabaseConfigured) {
    return (
      <ThemeProvider>
        <SetupScreen />
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider>
      <ToastProvider>
        <AuthProvider>
          <HashRouter>
            <Routes>
              <Route path="/login" element={<GuestOnly><LoginPage /></GuestOnly>} />
              <Route path="/signup" element={<GuestOnly><SignupPage /></GuestOnly>} />
              <Route path="/forgot-password" element={<GuestOnly><ForgotPasswordPage /></GuestOnly>} />

              <Route
                element={
                  <RequireAuth>
                    <ProtectedApp />
                  </RequireAuth>
                }
              >
                <Route path="/dashboard" element={<Dashboard />} />
                <Route path="/workspace/:workspaceId" element={<BrowsePage />} />
                <Route path="/workspace/:workspaceId/folder/:folderId" element={<BrowsePage />} />
                <Route path="/file/:fileId" element={<FileViewerPage />} />
                <Route path="/recent" element={<RecentPage />} />
                <Route path="/starred" element={<StarredPage />} />
                <Route path="/trash" element={<TrashPage />} />
                <Route path="/settings" element={<SettingsPage />} />
              </Route>

              <Route path="/" element={<Navigate to="/dashboard" replace />} />
              <Route path="*" element={<Navigate to="/dashboard" replace />} />
            </Routes>
          </HashRouter>
        </AuthProvider>
      </ToastProvider>
    </ThemeProvider>
  );
}
