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

type PracticalQuestion = {
  id: string;
  image_url: string;
  structure_type: string;
  labels: Array<{
    id: string;
    correct_answer: string;
    explanation: string | null;
  }>;
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
  const [guesses, setGuesses] = useState<Record<string, string>>({});
  const [results, setResults] = useState<Record<string, boolean>>({});
  const [score, setScore] = useState(0);
  const [answered, setAnswered] = useState(0);
  const [prevBadges, setPrevBadges] = useState<Set<string>>(new Set());
  const [goalCelebrated, setGoalCelebrated] = useState(false);
  const [labelsPerQuestion, setLabelsPerQuestion] = useState(5); // Default 5

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

  // Fetch labels per question setting
  const labelsPerQuestionQ = useQuery({
    queryKey: ["practical", "settings", sel.categoryId],
    enabled: signedIn && !!sel.categoryId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("practical_settings")
        .select("labels_per_question")
        .eq("category_id", sel.categoryId)
        .single();
      if (error) {
        // If no settings found, return default
        if (error.code === 'PGRST116') return 5;
        throw error;
      }
      return data?.labels_per_question ?? 5;
    },
  });

  useEffect(() => {
    if (labelsPerQuestionQ.data) {
      setLabelsPerQuestion(labelsPerQuestionQ.data);
    }
  }, [labelsPerQuestionQ.data]);

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

  // Group items into questions based on labelsPerQuestion
  const questions = useMemo(() => {
    const items = itemsQ.data ?? [];
    const grouped: PracticalQuestion[] = [];
    
    for (let i = 0; i < items.length; i += labelsPerQuestion) {
      const groupItems = items.slice(i, i + labelsPerQuestion);
      if (groupItems.length > 0) {
        grouped.push({
          id: `q-${i}`,
          image_url: groupItems[0].image_url, // Use first image as main image
          structure_type: groupItems[0].structure_type,
          labels: groupItems.map(item => ({
            id: item.id,
            correct_answer: item.correct_answer,
            explanation: item.explanation,
          })),
        });
      }
    }
    
    return grouped;
  }, [itemsQ.data, labelsPerQuestion]);

  const currentQuestion = questions[index];
  const total = questions.length;

  function begin() {
    if (!sel.categoryId) return;
    setIndex(0);
    setGuesses({});
    setResults({});
    setScore(0);
    setAnswered(0);
    setStarted(true);
  }

  function reset(pickNew: boolean) {
    setIndex(0);
    setGuesses({});
    setResults({});
    setScore(0);
    setAnswered(0);
    if (pickNew) {
      setStarted(false);
      setSel((s) => ({ ...s, categoryId: "" }));
    }
  }

  async function submitLabel(labelId: string, correctAnswer: string) {
    if (!currentQuestion || results[labelId] !== undefined) return;
    
    const guess = guesses[labelId] || "";
    const isCorrect = normalize(guess) === normalize(correctAnswer);
    
    setResults(prev => ({ ...prev, [labelId]: isCorrect }));
    setAnswered(a => a + 1);
    if (isCorrect) setScore(s => s + 1);

    const { error } = await supabase.rpc("record_practical_answer", {
      _practical_item_id: labelId,
      _is_correct: isCorrect,
    });
    if (error) {
      toast.error("Couldn't save your answer. Your progress may not be recorded.");
      return;
    }
    qc.invalidateQueries({ queryKey: ["dashboard"] });
  }

  async function submitAll() {
    if (!currentQuestion) return;
    
    // Submit all labels that have answers
    for (const label of currentQuestion.labels) {
      if (results[label.id] === undefined && guesses[label.id]?.trim()) {
        await submitLabel(label.id, label.correct_answer);
      }
    }
    
    await checkCelebrations(prevBadges, goalCelebrated, setGoalCelebrated, setPrevBadges);
  }

  function allAnswered() {
    return currentQuestion?.labels.every(label => results[label.id] !== undefined) ?? false;
  }

  function next() {
    setGuesses({});
    setResults({});
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
            <Link to="/study" className="text-sm text-muted-foreground hover:text-foreground">
              ← Study Hub
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
                Pick a chapter, topic, and subtopic, then identify the structures shown.
              </p>
            </div>

            <ChapterTopicPicker value={sel} onChange={setSel} />

            {sel.categoryId && labelsPerQuestionQ.data && (
              <div className="text-sm text-muted-foreground bg-muted/50 rounded-lg p-3">
                <span className="font-medium text-foreground">Session format:</span>{" "}
                {labelsPerQuestionQ.data} labels per question
              </div>
            )}

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

        {started && !itemsQ.isLoading && total > 0 && currentQuestion && (
          <div className="space-y-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm text-muted-foreground">
                <span>Question {index + 1} of {total}</span>
                <span className="capitalize">Type: {currentQuestion.structure_type}</span>
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

            <div className="card-surface p-6 space-y-6">
              <img
                src={currentQuestion.image_url}
                alt={`Identify the structures shown in this specimen`}
                className="w-full max-h-[380px] rounded-xl object-contain bg-muted"
                loading="lazy"
              />

              <div className="space-y-4">
                <div>
                  <h3 className="text-lg font-semibold text-foreground">
                    Identify the marked structures
                  </h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    {currentQuestion.labels.length} {currentQuestion.labels.length === 1 ? 'label' : 'labels'} to identify
                  </p>
                </div>
                
                {currentQuestion.labels.map((label, labelIndex) => (
                  <div key={label.id} className="space-y-2 p-4 rounded-lg border border-border">
                    <label className="text-sm font-medium text-foreground" htmlFor={`label-${label.id}`}>
                      Label {labelIndex + 1}:
                    </label>
                    <div className="flex gap-2">
                      <input
                        id={`label-${label.id}`}
                        className="input-field w-full"
                        value={guesses[label.id] || ""}
                        disabled={results[label.id] !== undefined}
                        placeholder={`Type answer for label ${labelIndex + 1}…`}
                        onChange={(e) => setGuesses(prev => ({ ...prev, [label.id]: e.target.value }))}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && guesses[label.id]?.trim() && results[label.id] === undefined) {
                            submitLabel(label.id, label.correct_answer);
                          }
                        }}
                      />
                      {results[label.id] === undefined ? (
                        <button 
                          className="btn-primary px-4 whitespace-nowrap"
                          onClick={() => submitLabel(label.id, label.correct_answer)}
                          disabled={!guesses[label.id]?.trim()}
                        >
                          Check
                        </button>
                      ) : (
                        <div className={`px-4 py-2 rounded-lg flex items-center ${results[label.id] ? "bg-primary/10" : "bg-destructive/10"}`}>
                          <span className="text-lg">{results[label.id] ? "✅" : "❌"}</span>
                        </div>
                      )}
                    </div>
                    
                    {results[label.id] !== undefined && (
                      <div className={`rounded-lg p-3 ${results[label.id] ? "bg-primary/10" : "bg-destructive/10"}`}>
                        <div className="text-sm">
                          <span className="font-medium">
                            {results[label.id] ? "Correct!" : "Incorrect"}
                          </span>
                          {!results[label.id] && (
                            <span className="ml-2">
                              Correct answer: <span className="font-medium">{label.correct_answer}</span>
                            </span>
                          )}
                        </div>
                        {label.explanation && (
                          <p className="text-sm text-muted-foreground mt-2 whitespace-pre-wrap">
                            {label.explanation}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                ))}

                {!allAnswered() ? (
                  <div className="space-y-2">
                    <button 
                      className="btn-primary w-full" 
                      onClick={submitAll}
                      disabled={!currentQuestion.labels.some(label => guesses[label.id]?.trim() && results[label.id] === undefined)}
                    >
                      Submit All Answers
                    </button>
                    <p className="text-xs text-center text-muted-foreground">
                      You can submit individual labels or submit all at once
                    </p>
                  </div>
                ) : (
                  <button className="btn-primary w-full" onClick={next}>
                    {index + 1 >= total ? "Finish session" : "Next question"}
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {started && !itemsQ.isLoading && total > 0 && !currentQuestion && (
          <div className="card-surface p-8 text-center space-y-4">
            <h2 className="text-2xl font-bold text-foreground">Session Complete 🎉</h2>
            <div className="text-muted-foreground space-y-1">
              <p>Score: <span className="font-medium text-foreground">{score} / {answered}</span></p>
              <p>Correct: <span className="font-medium text-foreground">{score}</span> · Incorrect: <span className="font-medium text-foreground">{answered - score}</span></p>
              <p>Accuracy: <span className="font-medium text-foreground">{answered > 0 ? Math.round((score / answered) * 100) : 0}%</span></p>
            </div>
            <div className="flex flex-wrap gap-2 justify-center">
              <button className="btn-outline" onClick={() => reset(false)}>↻ Restart session</button>
              <button className="btn-outline" onClick={() => reset(true)}>Try another subtopic</button>
              <Link to="/dashboard" className="btn-primary">Back to Dashboard</Link>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
