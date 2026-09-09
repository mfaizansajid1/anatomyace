import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, Clock3, Construction } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Logo } from "@/components/Logo";
import { Spinner } from "@/components/Spinner";
import { ThemeToggle } from "@/components/ThemeToggle";

export const Route = createFileRoute("/practical")({
  head: () => ({
    meta: [
      { title: "Practical Mode — Coming Soon | AnatomyAce" },
      {
        name: "description",
        content:
          "Practical Mode is currently being improved and will be available.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: PracticalPage,
});

function PracticalPage() {
  const navigate = useNavigate();
  const [authChecked, setAuthChecked] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();

      if (!data.user) {
        navigate({ to: "/login" });
        return;
      }

      setAuthChecked(true);
    })();
  }, [navigate]);

  if (!authChecked) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-background">
        <Spinner />
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="mx-auto max-w-3xl px-4 py-4 flex items-center justify-between">
          <Link to="/dashboard" className="flex items-center gap-2">
            <Logo size={32} />
            <span className="font-semibold text-foreground">
              AnatomyAce
            </span>
          </Link>

          <div className="flex items-center gap-2">
            <ThemeToggle />

            <Link
              to="/study"
              className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft aria-hidden className="h-4 w-4" />
              Study Hub
            </Link>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-3xl px-4 py-16">
        <div className="card-surface p-8 sm:p-12 text-center">
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
            <Construction
              aria-hidden
              className="h-8 w-8 text-primary"
            />
          </div>

          <div className="inline-flex items-center gap-2 rounded-full bg-muted px-3 py-1.5 text-xs font-medium text-muted-foreground mb-5">
            <Clock3 aria-hidden className="h-3.5 w-3.5" />
            Coming Soon
          </div>

          <h1 className="text-3xl font-bold text-foreground">
            Practical Mode is Coming Soon
          </h1>

          <p className="mx-auto mt-4 max-w-xl text-sm leading-6 text-muted-foreground">
            We’re currently working on Practical Mode to make the image-based
            anatomy experience better and more useful for your studies.
          </p>

          <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-muted-foreground">
            Insha’Allah, Practical Mode will be live soon. Stay tuned!
          </p>

          <div className="mt-8">
            <Link to="/dashboard" className="btn-primary">
              Back to Dashboard
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
