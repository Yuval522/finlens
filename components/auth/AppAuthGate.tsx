"use client";

import type { ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { AuthProvider, useAuth } from "@/lib/auth/AuthContext";

/**
 * Multi-User Authentication feature: mounted once at the app root (see
 * app/layout.tsx) so every page has access to useAuth(). GateContent holds
 * back rendering the real page tree until the initial session check (and,
 * if a session exists, the server->local data hydration it triggers) has
 * resolved — without this, a page that reads the portfolio/watchlist/
 * settings stores on first render could briefly flash whatever was last
 * left in this browser's localStorage (e.g. a previous friend's data, or
 * the anonymous demo seed) before AuthContext's login-driven hydrateFrom
 * Server() call overwrites it moments later. A brief spinner on cold load
 * is the standard, expected tradeoff apps with server-verified sessions
 * make to avoid that flash of someone else's data.
 */
function GateContent({ children }: { children: ReactNode }) {
  const { ready } = useAuth();

  if (!ready) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return <>{children}</>;
}

export function AppAuthGate({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <GateContent>{children}</GateContent>
    </AuthProvider>
  );
}
