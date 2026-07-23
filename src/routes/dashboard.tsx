import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Spinner } from "@/components/Spinner";
import { Logo } from "@/components/Logo";

export const Route = createFileRoute("/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — AnatomyAce" },
      { name: "description", content: "Your AnatomyAce study dashboard." },
      { property: "og:title", content: "Dashboard — AnatomyAce" },
      { property: "og:description", content: "Your AnatomyAce study dashboard." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  const navigate = useNavigate();
  const [state, setState] = useState<
    { status: "loading" } | { status: "ready"; email: string | null; fullName: string | null }
  >({ status: "loading" });

  useEffect(() => {
    let active = true;
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!active) return;
      if (!data.user) {
        navigate({ to: "/login" });
        return;
      }
      const meta = (data.user.user_metadata ?? {}) as { full_name?: string; name?: string };
      setState({
        status: "ready",
        email: data.user.email ?? null,
        fullName: meta.full_name ?? meta.name ?? null,
      });
    })();
    return () => { active = false; };
  }, [navigate]);

  async function onLogout() {
    await supabase.auth.signOut();
    navigate({ to: "/", replace: true });
  }

  if (state.status === "loading") {
    return (
      <main className="min-h-screen flex items-center justify-center bg-background">
        <Spinner className="h-6 w-6 text-primary" />
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-4">
          <div className="flex items-center gap-3">
            <Logo size={36} />
            <span className="font-semibold text-foreground">AnatomyAce</span>
          </div>
          <div className="flex items-center gap-2">
            <Link to="/profile" className="btn-outline" style={{ minHeight: 40 }}>Profile</Link>
            <button onClick={onLogout} className="btn-outline" style={{ minHeight: 40 }}>Log out</button>
          </div>
        </div>
      </header>
      <section className="mx-auto max-w-4xl px-4 py-16 text-center">
        <p className="text-sm text-muted-foreground">
          Welcome{state.fullName ? `, ${state.fullName}` : ""}!
        </p>
        <h1 className="mt-2 text-3xl sm:text-4xl font-bold text-foreground">Dashboard Coming Soon</h1>
        <p className="mt-3 text-muted-foreground">
          Your flashcards, decks, and progress will live here.
        </p>
        {state.email && (
          <p className="mt-6 text-xs text-muted-foreground">Signed in as {state.email}</p>
        )}
      </section>
    </main>
  );
}
