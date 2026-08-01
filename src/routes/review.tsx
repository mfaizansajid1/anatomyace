import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Logo } from "@/components/Logo";
import { Spinner } from "@/components/Spinner";
import { ThemeToggle } from "@/components/ThemeToggle";
import { toast } from "sonner";

export const Route = createFileRoute("/review")({
  validateSearch: (search: Record<string, unknown>) => ({
    subtopic: typeof search.subtopic === "string" ? search.subtopic : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Study — AnatomyAce" },
      { name: "description", content: "Study anatomy flashcards." },
      { property: "og:title", content: "Study — AnatomyAce" },
      { property: "og:description", content: "Study anatomy flashcards." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: StudyPage,
});

type Topic = { id: string; name: string };
type Category = { id: string; name: string; topic_id: string };
type Subtopic = { id: string; name: string; topic_id: string; category_id: string };
type Flashcard = {
  id: string;
  question: string;
  answer: string;
  difficulty: string;
  clinical_correlation: string | null;
  mnemonic: string | null;
  high_yield_point: string | null;
  image_url: string | null;
  reference: string | null;
};

function StudyPage() {
  const navigate = useNavigate();
  const [authChecked, setAuthChecked] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const [topicId, setTopicId] = useState<string>("");
  const [categoryId, setCategoryId] = useState<string>("");
  const [subtopicId, setSubtopicId] = useState<string>("");
  const [started, setStarted] = useState(false);
  const [examMode, setExamMode] = useState(false);
  const [index, setIndex] = useState(0);
  const [showAnswer, setShowAnswer] = useState(false);
  const [reviewed, setReviewed] = useState(0);
  const [prevBadges, setPrevBadges] = useState<Set<string>>(new Set());
  const [goalCelebrated, setGoalCelebrated] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!data.user) {
        navigate({ to: "/login" });
        return;
      }
      setSignedIn(true);
      setAuthChecked(true);
    })();
  }, [navigate]);

  const search = Route.useSearch();
  const prefillSubtopic = search.subtopic;

  useEffect(() => {
    if (!signedIn || !prefillSubtopic) return;
    (async () => {
      const { data } = await supabase
        .from("subtopics")
        .select("id, topic_id, category_id")
        .eq("id", prefillSubtopic)
        .maybeSingle();
      if (!data) return;
      setTopicId(data.topic_id);
      setCategoryId(data.category_id);
      setSubtopicId(data.id);
      setIndex(0);
      setReviewed(0);
      setShowAnswer(false);
      setStarted(true);
    })();
  }, [signedIn, prefillSubtopic]);

  const topicsQ = useQuery({
    queryKey: ["study", "topics"],
    enabled: signedIn,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("topics")
        .select("id, name")
        .order("display_order", { ascending: true });
      if (error) throw error;
      return data as Topic[];
    },
  });

  const categoriesQ = useQuery({
    queryKey: ["study", "categories", topicId],
    enabled: signedIn && !!topicId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("categories")
        .select("id, name, topic_id")
        .eq("topic_id", topicId)
        .order("display_order", { ascending: true });
      if (error) throw error;
      return data as Category[];
    },
  });

  const subtopicsQ = useQuery({
    queryKey: ["study", "subtopics", categoryId],
    enabled: signedIn && !!categoryId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("subtopics")
        .select("id, name, topic_id, category_id")
        .eq("category_id", categoryId)
        .order("display_order", { ascending: true });
      if (error) throw error;
      return data as Subtopic[];
    },
  });

  const qc = useQueryClient();

const cardsQ = useQuery({
    queryKey: ["study", "cards", subtopicId, examMode],
    enabled: signedIn && started && !!subtopicId,
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      const uid = u.user?.id;

      const { data: cards, error } = await supabase
        .from("flashcards")
        .select("id, question, answer, difficulty, clinical_correlation, mnemonic, high_yield_point, image_url, reference")
        .eq("subtopic_id", subtopicId)
        .eq("is_published", true);
      if (error) throw error;

      const cardIds = (cards ?? []).map((c) => c.id);
      let reviewMap = new Map<string, string>();
      if (uid && cardIds.length > 0) {
        const { data: reviews, error: revError } = await supabase
          .from("card_reviews")
          .select("flashcard_id, next_review_date")
          .eq("user_id", uid)
          .in("flashcard_id", cardIds);
        if (revError) throw revError;
        reviewMap = new Map((reviews ?? []).map((r) => [r.flashcard_id, r.next_review_date]));
      }

     if (examMode) {
        return cards as Flashcard[];
      }
      const nowMs = Date.now();
      const due = (cards as Flashcard[]).filter((c) => {
        const nextDate = reviewMap.get(c.id);
        if (!nextDate) return true;
        return new Date(nextDate).getTime() <= nowMs;
      });
      return due;
    },
  });

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
  }, [started]);;

  const cards = useMemo(() => cardsQ.data ?? [], [cardsQ.data]);
  const current = cards[index];
  const total = cards.length;
  const remaining = Math.max(0, total - index);
  const progressPct = total > 0 ? Math.min(100, Math.round((reviewed / total) * 100)) : 0;

  function begin() {
    if (!topicId || !categoryId || !subtopicId) return;
    setIndex(0);
    setReviewed(0);
    setShowAnswer(false);
    setStarted(true);
  }

  async function rate(rating: "again" | "hard" | "good" | "easy") {
    if (!current) return;
    const cardId = current.id;
    // optimistic advance
    setReviewed((r) => r + 1);
    setShowAnswer(false);
    setIndex((i) => i + 1);
    const { error } = await supabase.rpc("record_card_review", {
      _flashcard_id: cardId,
      _rating: rating,
    });
    if (error) {
      toast.error("Couldn't save your review. Please try again.");
      return;
    }
    qc.invalidateQueries({ queryKey: ["dashboard"] });
    markPlannerProgress(subtopicId).then((done) => {
      if (done) {
        toast.success("✅ Plan day completed!");
        qc.invalidateQueries({ queryKey: ["planner"] });
      }
    });

    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;

    const { data: stats } = await supabase
      .from("user_stats")
      .select("cards_studied_today, daily_goal")
      .eq("user_id", u.user.id)
      .maybeSingle();

    if (stats && !goalCelebrated && stats.cards_studied_today >= stats.daily_goal) {
      toast.success(`🎉 Daily goal complete! You've studied ${stats.cards_studied_today} cards today.`);
      setGoalCelebrated(true);
    }

    const { data: badges } = await supabase
      .from("user_achievements")
      .select("badge_id")
      .eq("user_id", u.user.id);

    const badgeNames: Record<string, string> = {
      first_session: "First Steps",
      streak_7: "7-Day Streak",
      century_100: "Century Club",
      perfectionist_10: "Perfectionist",
    };

    const newBadges = (badges ?? []).filter((b) => !prevBadges.has(b.badge_id));
    newBadges.forEach((b) => {
      toast.success(`🏆 Achievement unlocked: ${badgeNames[b.badge_id] ?? b.badge_id}!`);
    });
    if (newBadges.length > 0) {
      setPrevBadges(new Set((badges ?? []).map((b) => b.badge_id)));
    }
  }

  function restartSession() {
    setIndex(0);
    setReviewed(0);
    setShowAnswer(false);
    cardsQ.refetch();
  }

  function pickAnother() {
    setStarted(false);
    setSubtopicId("");
    setIndex(0);
    setReviewed(0);
    setShowAnswer(false);
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
            <Link to="/dashboard" className="text-sm text-muted-foreground hover:text-foreground">
              ← Dashboard
            </Link>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-3xl px-4 py-8">
        {!started && (
          <div className="card-surface p-6 space-y-5">
            <div>
              <h1 className="text-2xl font-bold text-foreground">Start a study session</h1>
              <p className="text-sm text-muted-foreground mt-1"> Pick a chapter, topic, and subtopic to begin.</p>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Chapter</label>
              <select
                className="input-field w-full"
                value={topicId}
                onChange={(e) => {
                  setTopicId(e.target.value);
                  setCategoryId("");
                  setSubtopicId("");
                }}
              >
                <option value="">Select a chapter…</option>
                {topicsQ.data?.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Topic</label>
              <select
                className="input-field w-full"
                value={categoryId}
                onChange={(e) => { setCategoryId(e.target.value); setSubtopicId(""); }}
                disabled={!topicId || categoriesQ.isLoading}
              >
                <option value="">
                  {topicId ? (categoriesQ.isLoading ? "Loading…" : "Select a topic…") : "Pick a chapter first"}
                </option>
                {categoriesQ.data?.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Subtopic</label>
              <select
                className="input-field w-full"
                value={subtopicId}
                onChange={(e) => setSubtopicId(e.target.value)}
                disabled={!categoryId || subtopicsQ.isLoading}
              >
                <option value="">
                  {categoryId ? (subtopicsQ.isLoading ? "Loading…" : "Select a subtopic…") : "Pick a topic first"}
                </option>
                {subtopicsQ.data?.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>

            <label className="flex items-center gap-2 text-sm text-foreground">
              <input
                type="checkbox"
                checked={examMode}
                onChange={(e) => setExamMode(e.target.checked)}
              />
              Exam Mode — review all cards, ignore due dates
            </label>

            <p className="text-xs text-muted-foreground">
              Again: see again in 10 min · Hard: 1 day · Good: 3 days · Easy: 7 days
            </p>

            <button className="btn-primary w-full" onClick={begin} disabled={!topicId || !categoryId || !subtopicId}>
              Start studying
            </button>
          </div>
        )}

        {started && cardsQ.isLoading && (
          <div className="card-surface p-10 flex justify-center">
            <Spinner />
          </div>
        )}

        {started && !cardsQ.isLoading && cards.length === 0 && (
          <div className="card-surface p-8 text-center space-y-4">
            <h2 className="text-xl font-semibold text-foreground">No flashcards here yet — check back soon.</h2>
            <button className="btn-outline" onClick={pickAnother}>Pick another subtopic</button>
          </div>
        )}

        {started && !cardsQ.isLoading && cards.length > 0 && current && (
          <div className="space-y-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm text-muted-foreground">
                <span>{reviewed} of {total} reviewed · {remaining} left</span>
                <span className="capitalize">Difficulty: {current.difficulty}</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full bg-primary transition-all duration-300"
                  style={{ width: `${progressPct}%` }}
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={progressPct}
                />
              </div>
              <div className="flex justify-end">
                <button className="text-xs text-muted-foreground hover:text-foreground underline" onClick={restartSession}>
                  ↻ Restart session
                </button>
              </div>
            </div>

            <div className="card-surface p-6 space-y-5">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1">
                  <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">Question</div>
                  <div className="text-lg text-foreground whitespace-pre-wrap">{current.question}</div>
                </div>
                <BookmarkStar flashcardId={current.id} />
              </div>

              {!showAnswer ? (
                <button className="btn-primary w-full" onClick={() => setShowAnswer(true)}>
                  Show Answer
                </button>
              ) : (
                <>
                  <div>
                    <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">Answer</div>
                    <div className="text-foreground whitespace-pre-wrap">{current.answer}</div>
                  </div>

                  <ReferenceSection value={current.reference} />

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2">
                    <button className="btn-outline" onClick={() => rate("again")}>Again</button>
                    <button className="btn-outline" onClick={() => rate("hard")}>Hard</button>
                    <button className="btn-outline" onClick={() => rate("good")}>Good</button>
                    <button className="btn-outline" onClick={() => rate("easy")}>Easy</button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {started && !cardsQ.isLoading && cards.length > 0 && !current && (
          <div className="card-surface p-8 text-center space-y-4">
            <h2 className="text-2xl font-bold text-foreground">Session Complete 🎉</h2>
            <p className="text-muted-foreground">You reviewed {reviewed} card{reviewed === 1 ? "" : "s"}.</p>
            <div className="flex flex-wrap gap-2 justify-center">
              <button className="btn-outline" onClick={restartSession}>↻ Restart session</button>
              <button className="btn-outline" onClick={pickAnother}>Study another subtopic</button>
              <Link to="/dashboard" className="btn-primary">Back to Dashboard</Link>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}

function ReferenceSection({ value }: { value: string | null }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Reference</div>
      <div className="text-foreground text-sm whitespace-pre-wrap">
        {value && value.trim() ? value : "Snell's Clinical Anatomy By Regions"}
      </div>
    </div>
  );
}

function BookmarkStar({ flashcardId }: { flashcardId: string }) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["bookmark", flashcardId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bookmarks")
        .select("id")
        .eq("flashcard_id", flashcardId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  const saved = !!q.data;

  async function toggle() {
    if (saved) {
      const { error } = await supabase.from("bookmarks").delete().eq("flashcard_id", flashcardId);
      if (error) { toast.error("Couldn't remove bookmark."); return; }
      toast.success("Bookmark removed");
    } else {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return;
      const { error } = await supabase.from("bookmarks").insert({ flashcard_id: flashcardId, user_id: u.user.id });
      if (error) { toast.error("Couldn't save bookmark."); return; }
      toast.success("Bookmarked");
    }
    qc.invalidateQueries({ queryKey: ["bookmark", flashcardId] });
    qc.invalidateQueries({ queryKey: ["bookmarks"] });
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={saved ? "Remove bookmark" : "Save bookmark"}
      aria-pressed={saved}
      className="h-10 w-10 rounded-full grid place-items-center hover:bg-muted transition text-foreground"
      title={saved ? "Bookmarked — tap to remove" : "Bookmark this card"}
    >
      <svg width="22" height="22" viewBox="0 0 24 24" fill={saved ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: saved ? "var(--color-primary)" : undefined }} aria-hidden>
        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
      </svg>
    </button>
  );
}

async function markPlannerProgress(subtopicId: string): Promise<boolean> {
  try {
    const { data: u } = await supabase.auth.getUser();
    const uid = u.user?.id;
    if (!uid || !subtopicId) return false;
    const today = new Date().toISOString().slice(0, 10);

    const { data: days } = await supabase
      .from("revision_plan_days")
      .select("id, target_card_count, completed, revision_plans!inner(user_id)")
      .eq("subtopic_id", subtopicId)
      .eq("plan_date", today)
      .eq("completed", false)
      .eq("revision_plans.user_id", uid);

    if (!days || days.length === 0) return false;

    const { data: cards } = await supabase
      .from("flashcards")
      .select("id")
      .eq("subtopic_id", subtopicId);
    const cardIds = (cards ?? []).map((c) => c.id);
    if (cardIds.length === 0) return false;

    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const { count } = await supabase
      .from("review_events")
      .select("id", { count: "exact", head: true })
      .eq("user_id", uid)
      .in("flashcard_id", cardIds)
      .gte("reviewed_at", startOfDay.toISOString());

    const reviewedToday = count ?? 0;
    const toComplete = days.filter((d) => reviewedToday >= d.target_card_count);
    if (toComplete.length === 0) return false;

    await supabase
      .from("revision_plan_days")
      .update({ completed: true })
      .in("id", toComplete.map((d) => d.id));
    return true;
  } catch {
    return false;
  }
}
