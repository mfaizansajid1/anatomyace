import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Logo } from "@/components/Logo";
import { Spinner } from "@/components/Spinner";
import { ThemeToggle } from "@/components/ThemeToggle";
import { ChapterTopicPicker, type ChapterTopicSelection } from "@/components/ChapterTopicPicker";
import { toast } from "sonner";
import { checkCelebrations } from "@/lib/celebrate";
import { ArrowLeft, CheckCircle2, CircleAlert, PartyPopper, RotateCcw } from "lucide-react";

export const Route = createFileRoute("/practical")({
  head: () => ({
    meta: [
      { title: "Practical Mode — AnatomyAce" },
      { name: "description", content: "Identify anatomical structures from images and test your practical knowledge." },
      { property: "og:title", content: "Practical Mode — AnatomyAce" },
      { property: "og:description", content: "Identify anatomical structures from images and test your practical knowledge." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: PracticalPage,
});

type PracticalItem = {
  id: string;
  structure_type: string;
  image_url: string;
  correct_answer: string;
  explanation: string | null;
};

function normalize(s: string) {
  return s.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ");
}

function PracticalPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [authChecked, setAuthChecked] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const [sel, setSel] = useState<ChapterTopicSelection>({ topicId: "", categoryId: "" });
  const [started, setStarted] = useState(false);
  const [index, setIndex] = useState(0);
  const [guess, setGuess] = useState("");
  const [result, setResult] = useState<null | { correct: boolean }>(null);
  const [score, setScore] = useState(0);
  const [answered, setAnswered] = useState(0);
  const [prevBadges, setPrevBadges] = useState<Set<string>>(new Set());
  const [goalCelebrated, setGoalCelebrated] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!data.user) { navigate({ to: "/login" }); return; }
      setSignedIn(true);
      setAuthChecked(true);
    })();
  }, [navigate]);

  useEffect(() => {
    if (!started) return;
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return;
      const { data: badges } = await supabase
        .from("user_achievements")
        .select("badge_id")
        .eq("user_id", u.user.id);
      setPrevBadges(new Set((badges ?? []).map((b) => b.badge_id)));
      setGoalCelebrated(false);
    })();
  }, [started]);

  const itemsQ = useQuery({
    queryKey: ["practical", "items", sel.categoryId],
    enabled: signedIn && started && !!sel.categoryId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("practical_items")
        .select("id, structure_type, image_url, correct_answer, explanation")
        .eq("category_id", sel.categoryId)
        .eq("is_published", true)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data as PracticalItem[];
    },
  });

  const items = useMemo(() => itemsQ.data ?? [], [itemsQ.data]);
  const current = items[index];
  const total = items.length;

  function begin() {
    if (!sel.categoryId) return;
    setIndex(0);
    setGuess("");
    setResult(null);
    setScore(0);
    setAnswered(0);
    setStarted(true);
  }

  function reset(pickNew: boolean) {
    setIndex(0);
    setGuess("");
    setResult(null);
    setScore(0);
    setAnswered(0);
    if (pickNew) {
      setStarted(false);
      setSel((s) => ({ ...s, categoryId: "" }));
    }
  }

  async function submit() {
    if (!current || result) return;
    const isCorrect = normalize(guess) === normalize(current.correct_answer);
    setResult({ correct: isCorrect });
    setAnswered((a) => a + 1);
    if (isCorrect) setScore((s) => s + 1);

    const { error } = await supabase.rpc("record_practical_answer", {
      _practical_item_id: current.id,
      _is_correct: isCorrect,
    });
    if (error) {
      toast.error("Couldn't save your answer. Your progress may not be recorded.");
      return;
    }
    qc.invalidateQueries({ queryKey: ["dashboard"] });

    await checkCelebrations(prevBadges, goalCelebrated, setGoalCelebrated, setPrevBadges);
  }

  function next() {
    setGuess("");
    setResult(null);
    setIndex((i) => i + 1);
  }

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
            <span className="font-semibold text-foreground">AnatomyAce</span>
          </Link>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Link to="/study" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
              <ArrowLeft aria-hidden className="h-4 w-4" />
              Study Hub
            </Link>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-3xl px-4 py-8">
        {!started && (
          <div className="card-surface p-6 space-y-5">
            <div>
              <h1 className="text-2xl font-bold text-foreground">Practical Mode</h1>
              <p className="text-sm text-muted-foreground mt-1">
                Pick a chapter, topic, and subtopic, then identify each structure shown.
              </p>
            </div>

            <ChapterTopicPicker value={sel} onChange={setSel} />

            <button className="btn-primary w-full" onClick={begin} disabled={!sel.categoryId}>
              Start practical session
            </button>
          </div>
        )}

        {started && itemsQ.isLoading && (
          <div className="card-surface p-10 flex justify-center"><Spinner /></div>
        )}

        {started && !itemsQ.isLoading && total === 0 && (
          <div className="card-surface p-8 text-center space-y-4">
            <h2 className="text-xl font-semibold text-foreground">No practical items here yet — check back soon.</h2>
            <button className="btn-outline" onClick={() => reset(true)}>Pick another subtopic</button>
          </div>
        )}

        {started && !itemsQ.isLoading && total > 0 && current && (
          <div className="space-y-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm text-muted-foreground">
                <span>Item {index + 1} of {total}</span>
                <span className="capitalize">Type: {current.structure_type}</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full bg-primary transition-all duration-300"
                  style={{ width: `${Math.round((index / total) * 100)}%` }}
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.round((index / total) * 100)}
                />
              </div>
            </div>

            <div className="card-surface p-6 space-y-5">
              <img
                src={current.image_url}
                alt={`Identify the ${current.structure_type} shown in this specimen`}
                className="w-full max-h-[380px] rounded-xl object-contain bg-muted"
                loading="lazy"
              />

              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground" htmlFor="practical-guess">
                  Name the marked structure
                </label>
                <input
                  id="practical-guess"
                  className="input-field w-full"
                  value={guess}
                  disabled={!!result}
                  placeholder="Type your answer…"
                  onChange={(e) => setGuess(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
                />
              </div>

              {!result ? (
                <button className="btn-primary w-full" onClick={submit} disabled={!guess.trim()}>
                  Submit answer
                </button>
              ) : (
                <div className="space-y-4">
                  <div
                    className={`rounded-xl p-4 ${result.correct ? "bg-primary/10 text-foreground" : "bg-destructive/10 text-foreground"}`}
                    role="status"
                  >
                    <div className="flex items-center gap-2 font-semibold">
                      {result.correct ? (
                        <CheckCircle2 aria-hidden className="h-5 w-5 text-primary" />
                      ) : (
                        <CircleAlert aria-hidden className="h-5 w-5 text-destructive" />
                      )}
                      {result.correct ? "Correct!" : "Not quite."}
                    </div>
                    <div className="text-sm mt-1">
                      Correct answer: <span className="font-medium">{current.correct_answer}</span>
                    </div>
                    {current.explanation && (
                      <p className="text-sm text-muted-foreground mt-2 whitespace-pre-wrap">{current.explanation}</p>
                    )}
                  </div>
                  <button className="btn-primary w-full" onClick={next}>
                    {index + 1 >= total ? "Finish session" : "Next"}
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {started && !itemsQ.isLoading && total > 0 && !current && (
          <div className="card-surface p-8 text-center space-y-4">
            <h2 className="flex items-center justify-center gap-2 text-2xl font-bold text-foreground"><PartyPopper aria-hidden className="h-6 w-6 text-primary" />Session Complete</h2>
            <div className="text-muted-foreground space-y-1">
              <p>Score: <span className="font-medium text-foreground">{score} / {answered}</span></p>
              <p>Correct: <span className="font-medium text-foreground">{score}</span> · Incorrect: <span className="font-medium text-foreground">{answered - score}</span></p>
              <p>Accuracy: <span className="font-medium text-foreground">{answered > 0 ? Math.round((score / answered) * 100) : 0}%</span></p>
            </div>
            <div className="flex flex-wrap gap-2 justify-center">
              <button className="btn-outline" onClick={() => reset(false)}><RotateCcw aria-hidden className="h-4 w-4" />Restart session</button>
              <button className="btn-outline" onClick={() => reset(true)}>Try another subtopic</button>
              <Link to="/dashboard" className="btn-primary">Back to Dashboard</Link>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
