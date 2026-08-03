"use client";

import { useState, type ReactNode } from "react";
import { Lock, LogIn } from "lucide-react";
import { useAuth } from "@/lib/auth/AuthContext";
import { AuthModal } from "@/components/auth/AuthModal";

interface RequireAuthProps {
  children: ReactNode;
  title?: string;
  description?: string;
}

/**
 * Strict Data Isolation feature: gates a whole page's content behind
 * login. Portfolio/Watchlist/Settings all hold data that must never leak
 * between friends sharing one browser — rather than letting an anonymous
 * visitor interact with a purely-local (and therefore un-isolated) copy of
 * these pages, each one is wrapped in this component so using them at all
 * requires being signed in as a specific account.
 *
 * Renders nothing while the app-wide auth check is still in flight
 * (`!ready`) — AppAuthGate already shows a spinner for that window app-
 * wide, so this just avoids a redundant flash of the "log in" prompt
 * itself before the real answer (logged in or not) is known.
 */
export function RequireAuth({
  children,
  title = "Log in to continue",
  description = "Sign in to view and manage this — your data stays private to your account.",
}: RequireAuthProps) {
  const { user, ready } = useAuth();
  const [authOpen, setAuthOpen] = useState(false);

  if (!ready) return null;

  if (!user) {
    return (
      <>
        <div className="glass-card flex flex-col items-center justify-center gap-3 rounded-2xl !border-dashed py-24 text-center">
          <Lock className="h-8 w-8 text-muted-foreground" />
          <h2 className="text-lg font-semibold text-foreground">{title}</h2>
          <p className="max-w-sm text-sm text-muted-foreground">{description}</p>
          <button
            type="button"
            onClick={() => setAuthOpen(true)}
            className="mt-2 flex h-11 items-center gap-2 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
          >
            <LogIn className="h-4 w-4" /> Log In or Sign Up
          </button>
        </div>
        <AuthModal open={authOpen} onClose={() => setAuthOpen(false)} />
      </>
    );
  }

  return <>{children}</>;
}
