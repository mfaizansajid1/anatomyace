import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Logo } from "@/components/Logo";
import { Spinner } from "@/components/Spinner";
import { ThemeToggle } from "@/components/ThemeToggle";
import { toast } from "sonner";

export const Route = createFileRoute("/bookmarks")({
  head: () => ({
    meta: [
      { title: "Bookmarks — AnatomyAce" },
      { name: "description", content: "Your saved flashcards." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: BookmarksPage,
});

type BookmarkRow = {
  flashcard_id: string;
  flashcards: {
    id: string;
    question: string;
    subtopics: {
      name: string;
      categories: {
        name: string;
        topics: { name: string };
      };
    };
  };
};

function BookmarksPage() {
  const qc = useQueryClient();
  const [removingId, setRemovingId] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["bookmarks"],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return [];
      const { data, error } = await supabase
        .from("bookmarks")
        .select(
          "flashcard_id, flashcards!inner(id, question, subtopics!inner(name, categories!inner(name, topics!inner(name))))"
        )
        .eq("user_id", u.user.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as BookmarkRow[];
    },
  });

  async function removeBookmark(flashcardId: string) {
    setRemovingId(flashcardId);
    const { error } = await supabase.from("bookmarks").delete().eq("flashcard_id", flashcardId);
    setRemovingId(null);
    if (error) {
      toast.error("Couldn't remove bookmark.");
      return;
    }
    toast.success("Bookmark removed");
    qc.invalidateQueries({ queryKey: ["bookmarks"] });
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 h-16 flex items-center justify-between">
          <Link to="/dashboard" className="flex items-center gap-2">
            <Logo />
            <span className="font-bold text-foreground">AnatomyAce</span>
          </Link>
          <div className="flex items-center gap-3">
            <ThemeToggle />
            <Link to="/dashboard" className="btn-outline" style={{ minHeight: 40 }}>
              Back to Dashboard
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 sm:px-6 py-8">
        <h1 className="text-2xl sm:text-3xl font-bold text-foreground">Bookmarks</h1>
        <p className="mt-1 text-muted-foreground">Flashcards you've saved for later.</p>

        {isLoading ? (
          <div className="mt-10 flex justify-center">
            <Spinner className="h-6 w-6" />
          </div>
        ) : !data || data.length === 0 ? (
          <div className="mt-8 card-surface p-8 text-center">
            <p className="font-medium text-foreground">No bookmarks yet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Tap the star on any flashcard to save it here.
            </p>
          </div>
        ) : (
          <div className="mt-6 space-y-3">
            {data.map((b) => (
              <div
                key={b.flashcard_id}
                className="card-surface p-4 flex items-center justify-between gap-4"
              >
                <div>
                  <p className="text-xs text-muted-foreground">
                    {b.flashcards.subtopics.categories.topics.name} ·{" "}
                    {b.flashcards.subtopics.categories.name} ·{" "}
                    {b.flashcards.subtopics.name}
                  </p>
                  <p className="mt-1 font-medium text-foreground">
                    {b.flashcards.question}
                  </p>
                </div>
                <button
                  onClick={() => removeBookmark(b.flashcard_id)}
                  disabled={removingId === b.flashcard_id}
                  className="shrink-0 btn-outline text-sm"
                  style={{ minHeight: 36 }}
                >
                  {removingId === b.flashcard_id ? <Spinner className="h-4 w-4" /> : "Remove"}
                </button>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
