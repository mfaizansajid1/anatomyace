import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Logo } from "@/components/Logo";
import { Spinner } from "@/components/Spinner";
import { ThemeToggle } from "@/components/ThemeToggle";
import { BookOpen, Bone, ClipboardCheck } from "lucide-react";

export const Route = createFileRoute("/study")({
  head: () => ({
    meta: [
      { title: "Study Hub — AnatomyAce" },
      { name: "description", content: "Choose how you want to study: flashcards, practical mode, or clinical MCQs." },
      { property: "og:title", content: "Study Hub — AnatomyAce" },
      { property: "og:description", content: "Choose how you want to study: flashcards, practical mode, or clinical MCQs." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: StudyHubPage,
});

function StudyHubPage() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!data.user) { navigate({ to: "/login" }); return; }
      setReady(true);
    })();
  }, [navigate]);

  if (!ready) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-background">
        <Spinner />
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="mx-auto max-w-4xl px-4 py-4 flex items-center justify-between">
          <Link to="/dashboard" className="flex items-center gap-2">
            <Logo size={32} />
            <span className="font-semibold text-foreground">AnatomyAce</span>
          </Link>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Link to="/dashboard" className="text-sm text-muted-foreground hover:text-foreground">
              ← Dashboard
            </Link>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-4xl px-4 py-8 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Study Hub</h1>
          <p className="text-sm text-muted-foreground mt-1">Pick a study mode to get going.</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <Link
            to="/review"
            search={{ subtopic: undefined }}
            className="card-surface p-6 flex flex-col gap-2 hover:shadow-lg transition"
            style={{ minHeight: 160 }}
          >
            <BookOpen className="w-8 h-8 text-primary" aria-hidden="true" />
            <h2 className="text-lg font-semibold text-foreground">Flashcards</h2>
            <p className="text-sm text-muted-foreground">
              Spaced-repetition question and answer cards by subtopic.
            </p>
          </Link>

          <Link
            to="/practical"
            className="card-surface p-6 flex flex-col gap-2 hover:shadow-lg transition"
            style={{ minHeight: 160 }}
          >
            <Bone className="w-8 h-8 text-primary" aria-hidden="true" />
            <h2 className="text-lg font-semibold text-foreground">Practical Mode</h2>
            <p className="text-sm text-muted-foreground">
              Identify structures from real specimen and diagram images.
            </p>
          </Link>

          <Link
            to="/mcq"
            className="card-surface p-6 flex flex-col gap-2 hover:shadow-lg transition"
            style={{ minHeight: 160 }}
          >
            <ClipboardCheck className="w-8 h-8 text-primary" aria-hidden="true" />
            <h2 className="text-lg font-semibold text-foreground">Clinical MCQs</h2>
            <p className="text-sm text-muted-foreground">
              Exam-style clinical multiple-choice questions with instant feedback.
            </p>
          </Link>
        </div>
      </section>
    </main>
  );
}
