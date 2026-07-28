import { createFileRoute, Link } from "@tanstack/react-router";
import { Logo } from "@/components/Logo";
import { ThemeToggle } from "@/components/ThemeToggle";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "AnatomyAce — Master Anatomy, One Card at a Time" },
      { name: "description", content: "Flashcards designed for MBBS students to master anatomy faster." },
      { property: "og:title", content: "AnatomyAce" },
      { property: "og:description", content: "Master Anatomy, One Card at a Time." },
    ],
  }),
  component: Welcome,
});

function Welcome() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-6 py-12 bg-background relative">
      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>
      <div className="w-full max-w-md text-center">
        <div className="flex justify-center">
          <Logo size={72} />
        </div>
        <h1 className="mt-6 text-4xl sm:text-5xl font-bold tracking-tight text-foreground">
          AnatomyAce
        </h1>
        <p className="mt-3 text-lg text-muted-foreground">
          Master Anatomy, One Card at a Time
        </p>
        <div className="mt-10 flex flex-col gap-3">
          <Link to="/signup" className="btn-primary w-full">Sign Up</Link>
          <Link to="/login" className="btn-outline w-full">Log In</Link>
        </div>
        <p className="mt-8 text-xs text-muted-foreground">
          Built for MBBS students.
        </p>
      </div>
    </main>
  );
}

