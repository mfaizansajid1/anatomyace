import { createFileRoute, Link } from "@tanstack/react-router";
import { Logo } from "@/components/Logo";

export const Route = createFileRoute("/review")({
  head: () => ({
    meta: [
      { title: "Flashcard Review — AnatomyAce" },
      { name: "description", content: "Review your anatomy flashcards." },
      { property: "og:title", content: "Flashcard Review — AnatomyAce" },
      { property: "og:description", content: "Review your anatomy flashcards." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ReviewPlaceholder,
});

function ReviewPlaceholder() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-background px-6 text-center">
      <Logo size={56} />
      <h1 className="mt-6 text-3xl font-bold text-foreground">Flashcard Review Coming Soon</h1>
      <p className="mt-3 text-muted-foreground max-w-md">
        This is where you'll drill anatomy cards with spaced repetition. Stay tuned.
      </p>
      <Link to="/dashboard" className="btn-primary mt-8">Back to Dashboard</Link>
    </main>
  );
}
