import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Logo } from "@/components/Logo";
import { Spinner } from "@/components/Spinner";
import { ThemeToggle } from "@/components/ThemeToggle";
import { ChapterTopicPicker, type ChapterTopicSelection } from "@/components/ChapterTopicPicker";
import { TEST_TIMER_FALLBACK } from "@/components/TestTimerSettingsPanel";
import { checkCelebrations } from "@/lib/celebrate";
import {
  ArrowLeft,
  Bone,
  CheckCircle2,
  Flag,
  Layers,
  ListChecks,
  Send,
  Timer as TimerIcon,
} from "lucide-react";

type TestSearch = { plan?: string; day?: number };

export const Route = createFileRoute("/test")({
  validateSearch: (search: Record<string, unknown>): TestSearch => ({
    plan: typeof search.plan === "string" && search.plan ? search.plan : undefined,
    day: search.day != null && Number.isFinite(Number(search.day)) ? Number(search.day) : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Test Mode — AnatomyAce" },
      { name: "description", content: "Sit a timed, exam-style anatomy test combining flashcards, practical images and clinical MCQs." },
      { property: "og:title", content: "Test Mode — AnatomyAce" },
      { property: "og:description", content: "Sit a timed, exam-style anatomy test combining flashcards, practical images and clinical MCQs." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: TestPage,
});

/* ---------- Types ---------- */

type Question =
  | { kind: "flashcard"; id: string; prompt: string; correct: string; explanation: string | null }
  | { kind: "practical"; id: string; prompt: string; imageUrl: string; correct: string; explanation: string | null }
  | {
      kind: "mcq";
      id: string;
      prompt: string;
      options: { key: string; text: string }[];
      correct: string;
      explanation: string | null;
    };

type AnswerState = {
  value: string; // mcq option key, practical text, or flashcard "correct"/"incorrect"
  marked: boolean;
};

const KIND_META = {
  flashcard: { label: "Flashcards", Icon: Layers },
  practical: { label: "Practical", Icon: Bone },
  mcq: { label: "MCQs", Icon: ListChecks },
} as const;

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function normalize(s: string) {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

function fmtClock(totalSeconds: number) {
  const s = Math.max(0, Math.floor(totalSeconds));
  const m = Math.floor(s / 60);
  const rest = s % 60;
  return `${String(m).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
}

/* ---------- Pool builders ---------- */

async function fetchFlashcardsForCategories(categoryIds: string[], subtopicIds?: string[]) {
  let q = supabase
    .from("flashcards")
    .select("id, question, answer, explanation, subtopic_id, subtopics!inner(category_id)")
    .eq("is_published", true);
  if (subtopicIds && subtopicIds.length > 0) q = q.in("subtopic_id", subtopicIds);
  else q = q.in("subtopics.category_id", categoryIds);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []).map(
    (f: any): Question => ({
      kind: "flashcard",
      id: f.id,
      prompt: f.question,
      correct: f.answer,
      explanation: f.explanation ?? null,
    }),
  );
}

async function fetchPracticalForCategories(categoryIds: string[]) {
  if (categoryIds.length === 0) return [];
  const { data, error } = await supabase
    .from("practical_items")
    .select("id, image_url, correct_answer, explanation, structure_type")
    .in("category_id", categoryIds)
    .eq("is_published", true);
  if (error) throw error;
  return (data ?? []).map(
    (p: any): Question => ({
      kind: "practical",
      id: p.id,
      prompt: `Identify this ${p.structure_type ?? "structure"}.`,
      imageUrl: p.image_url,
      correct: p.correct_answer,
      explanation: p.explanation ?? null,
    }),
  );
}

async function fetchMcqsForCategories(categoryIds: string[]) {
  if (categoryIds.length === 0) return [];
  const { data, error } = await supabase
    .from("clinical_mcqs")
    .select("id, question, option_a, option_b, option_c, option_d, correct_option, explanation")
    .in("category_id", categoryIds)
    .eq("is_published", true);
  if (error) throw error;
  return (data ?? []).map(
    (m: any): Question => ({
      kind: "mcq",
      id: m.id,
      prompt: m.question,
      options: [
        { key: "a", text: m.option_a },
        { key: "b", text: m.option_b },
        { key: "c", text: m.option_c },
        { key: "d", text: m.option_d },
      ],
      correct: m.correct_option,
      explanation: m.explanation ?? null,
    }),
  );
}

/** Interleave the three pools evenly up to `count`. */
function mixPools(pools: Question[][], count: number): Question[] {
  const shuffled = pools.map((p) => shuffle(p));
  const picked: Question[] = [];
  let i = 0;
  while (picked.length < count && shuffled.some((p) => p.length > 0)) {
    const pool = shuffled[i % shuffled.length];
    const item = pool.shift();
    if (item) picked.push(item);
    i++;
  }
  return shuffle(picked);
}

/* ---------- Page ---------- */

function TestPage() {
  const navigate = useNavigate();
  const { plan: planId, day: dayNumber } = Route.useSearch();
  const [ready, setReady] = useState(false);

  const [sel, setSel] = useState<ChapterTopicSelection>({ topicId: "", categoryId: "" });
  const [questionCount, setQuestionCount] = useState(20);
  const [timerMode, setTimerMode] = useState<"auto" | "manual">("auto");
  const [manualMinutes, setManualMinutes] = useState<number | null>(null);
  const [building, setBuilding] = useState(false);
  const [pending, setPending] = useState<{ questions: Question[]; totalSeconds: number } | null>(null);
  const [started, setStarted] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!data.user) { navigate({ to: "/login" }); return; }
      setReady(true);
    })();
  }, [navigate]);

  const settingsQ = useQuery({
    queryKey: ["test-timer-settings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("test_timer_settings")
        .select("min_minutes_per_question, max_minutes_per_question, auto_default_minutes_per_question")
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data ?? TEST_TIMER_FALLBACK;
    },
  });
  const settings = settingsQ.data ?? TEST_TIMER_FALLBACK;
  const autoMinutes = Number(settings.auto_default_minutes_per_question);
  const minMinutes = Number(settings.min_minutes_per_question);
  const maxMinutes = Number(settings.max_minutes_per_question);
  const manualValue = manualMinutes ?? autoMinutes;
  const perQuestionMinutes = timerMode === "auto"
    ? autoMinutes
    : Math.min(maxMinutes, Math.max(minMinutes, manualValue));

  const isPlannerTest = !!planId && dayNumber != null;

  /* Planner-driven test: build automatically from the plan day */
  const plannerQ = useQuery({
    enabled: ready && isPlannerTest,
    queryKey: ["test", "planner-day", planId, dayNumber],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("revision_plan_days")
        .select("study_type, subtopic_id, category_id, target_card_count")
        .eq("plan_id", planId!)
        .eq("day_number", dayNumber!);
      if (error) throw error;
      const rows = data ?? [];
      const subIds = rows.filter((r) => r.study_type === "flashcard" && r.subtopic_id).map((r) => r.subtopic_id!);
      const practicalCats = rows.filter((r) => r.study_type === "practical" && r.category_id).map((r) => r.category_id!);
      const mcqCats = rows.filter((r) => r.study_type === "mcq" && r.category_id).map((r) => r.category_id!);
      const total = rows.reduce((sum, r) => sum + (r.target_card_count ?? 10), 0) || 20;

      const [fc, pr, mc] = await Promise.all([
        subIds.length ? fetchFlashcardsForCategories([], subIds) : Promise.resolve([]),
        fetchPracticalForCategories(practicalCats),
        fetchMcqsForCategories(mcqCats),
      ]);
      const questions = mixPools([fc, pr, mc], total);
      return { questions, total };
    },
  });

  useEffect(() => {
    if (!isPlannerTest || !plannerQ.data || pending) return;
    const qs = plannerQ.data.questions;
    if (qs.length === 0) return;
    setPending({ questions: qs, totalSeconds: Math.round(qs.length * autoMinutes * 60) });
  }, [isPlannerTest, plannerQ.data, pending, autoMinutes]);

  async function buildTest() {
    if (!sel.categoryId) { toast.error("Pick a chapter and topic first"); return; }
    if (questionCount < 1) { toast.error("Choose at least one question"); return; }
    setBuilding(true);
    try {
      const [fc, pr, mc] = await Promise.all([
        fetchFlashcardsForCategories([sel.categoryId]),
        fetchPracticalForCategories([sel.categoryId]),
        fetchMcqsForCategories([sel.categoryId]),
      ]);
      const questions = mixPools([fc, pr, mc], questionCount);
      if (questions.length === 0) {
        toast.error("No content available for this topic yet.");
        return;
      }
      if (questions.length < questionCount) {
        toast.warning(`Only ${questions.length} questions available for this topic.`);
      }
      setPending({ questions, totalSeconds: Math.round(questions.length * perQuestionMinutes * 60) });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBuilding(false);
    }
  }

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
          <Link to="/study" className="flex items-center gap-2">
            <Logo size={32} />
            <span className="font-semibold text-foreground">AnatomyAce</span>
          </Link>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            {!started && (
              <Link to="/study" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
                <ArrowLeft aria-hidden className="h-4 w-4" />
                Study Hub
              </Link>
            )}
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-4xl px-4 py-8 space-y-6">
        {!started && (
          <div>
            <h1 className="text-2xl font-bold text-foreground">Test Mode</h1>
            <p className="text-sm text-muted-foreground mt-1">
              One timed, exam-style paper combining flashcards, practical images and clinical MCQs.
            </p>
          </div>
        )}

        {/* Setup */}
        {!pending && !started && (
          isPlannerTest ? (
            <div className="card-surface p-6 flex items-center justify-center">
              {plannerQ.isLoading ? <Spinner /> : (
                <p className="text-sm text-muted-foreground">
                  No content is available for this planned test day yet.
                </p>
              )}
            </div>
          ) : (
            <div className="card-surface p-5 space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <ChapterTopicPicker idPrefix="test" value={sel} onChange={setSel} />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground" htmlFor="test-count">Number of questions</label>
                <input
                  id="test-count"
                  type="number"
                  min={1}
                  max={200}
                  className="input-field w-full sm:w-40"
                  value={questionCount}
                  onChange={(e) => setQuestionCount(Math.max(1, Number(e.target.value) || 1))}
                />
              </div>

              <fieldset className="space-y-2">
                <legend className="text-sm font-medium text-foreground">Timer mode</legend>
                <div className="flex flex-wrap gap-4">
                  <label className="flex items-center gap-2 text-sm">
                    <input type="radio" name="test-mode" checked={timerMode === "auto"} onChange={() => setTimerMode("auto")} />
                    Auto ({autoMinutes} min per question)
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <input type="radio" name="test-mode" checked={timerMode === "manual"} onChange={() => setTimerMode("manual")} />
                    Manual
                  </label>
                </div>
              </fieldset>

              {timerMode === "manual" && (
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground" htmlFor="test-manual">
                    Minutes per question: {manualValue}
                  </label>
                  <input
                    id="test-manual"
                    type="range"
                    className="w-full"
                    min={minMinutes}
                    max={maxMinutes}
                    step={0.1}
                    value={manualValue}
                    onChange={(e) => setManualMinutes(Number(e.target.value))}
                  />
                  <p className="text-xs text-muted-foreground">Allowed range: {minMinutes}–{maxMinutes} minutes.</p>
                </div>
              )}

              <p className="text-sm text-muted-foreground">
                Total duration: <span className="font-semibold text-foreground">{Math.round(questionCount * perQuestionMinutes)} minutes</span>
              </p>

              <button
                className="btn-primary px-4 py-2 text-sm"
                style={{ minHeight: 48 }}
                onClick={buildTest}
                disabled={!sel.categoryId || building}
              >
                {building ? "Preparing…" : "Start Test"}
              </button>
            </div>
          )
        )}

        {/* Pre-test instructions */}
        {pending && !started && (
          <div className="card-surface p-6 space-y-4">
            <h2 className="inline-flex items-center gap-2 text-xl font-semibold text-foreground">
              <TimerIcon aria-hidden className="h-5 w-5 text-primary" />
              Before you begin
            </h2>
            <ul className="space-y-1 text-sm text-foreground">
              <li><span className="font-semibold">{pending.questions.length}</span> questions</li>
              <li><span className="font-semibold">{fmtClock(pending.totalSeconds)}</span> total time allowed</li>
            </ul>
            <p className="rounded-xl bg-muted/40 p-3 text-sm text-muted-foreground">
              You can navigate freely between questions and change your answers before submitting. Once time runs out,
              the test will auto-submit automatically. You cannot pause once started.
            </p>
            <div className="flex flex-wrap gap-3">
              <button className="btn-primary px-4 py-2 text-sm" style={{ minHeight: 48 }} onClick={() => setStarted(true)}>
                I&apos;m Ready — Start Test
              </button>
              <button className="btn-outline px-4 py-2 text-sm" style={{ minHeight: 48 }} onClick={() => setPending(null)}>
                Go back
              </button>
            </div>
          </div>
        )}

        {pending && started && (
          <TestSession
            questions={pending.questions}
            totalSeconds={pending.totalSeconds}
            onRestart={() => { setStarted(false); setPending(null); }}
          />
        )}
      </section>
    </main>
  );
}

/* ---------- Session ---------- */

function TestSession({
  questions,
  totalSeconds,
  onRestart,
}: {
  questions: Question[];
  totalSeconds: number;
  onRestart: () => void;
}) {
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<number, AnswerState>>({});
  const [revealedFlash, setRevealedFlash] = useState<Record<number, boolean>>({});
  const [remaining, setRemaining] = useState(totalSeconds);
  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [timedOut, setTimedOut] = useState(false);
  const [finished, setFinished] = useState(false);
  const submittedRef = useRef(false);

  const [prevBadges, setPrevBadges] = useState<Set<string>>(new Set());
  const [goalCelebrated, setGoalCelebrated] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return;
      const { data: badges } = await supabase.from("user_achievements").select("badge_id").eq("user_id", u.user.id);
      setPrevBadges(new Set((badges ?? []).map((b) => b.badge_id)));
    })();
  }, []);

  const isCorrect = useCallback((q: Question, a?: AnswerState) => {
    if (!a || !a.value) return false;
    if (q.kind === "mcq") return a.value === q.correct;
    if (q.kind === "practical") return normalize(a.value) === normalize(q.correct);
    return a.value === "correct";
  }, []);

  const submit = useCallback(async () => {
    if (submittedRef.current) return;
    submittedRef.current = true;
    setSubmitting(true);
    try {
      for (let i = 0; i < questions.length; i++) {
        const q = questions[i];
        const a = answers[i];
        if (!a || !a.value) continue;
        const correct = isCorrect(q, a);
        if (q.kind === "mcq") {
          await supabase.rpc("record_mcq_answer", { _mcq_id: q.id, _is_correct: correct });
        } else if (q.kind === "practical") {
          await supabase.rpc("record_practical_answer", { _practical_item_id: q.id, _is_correct: correct });
        } else {
          await supabase.rpc("record_card_review", { _flashcard_id: q.id, _rating: correct ? "good" : "again" });
        }
      }
      await checkCelebrations(prevBadges, goalCelebrated, setGoalCelebrated, setPrevBadges);
    } catch (e) {
      toast.error("Some answers couldn't be saved, but your results are shown below.");
    } finally {
      setSubmitting(false);
      setFinished(true);
    }
  }, [answers, questions, isCorrect, prevBadges, goalCelebrated]);

  /* Countdown */
  useEffect(() => {
    if (finished) return;
    const t = setInterval(() => {
      setRemaining((r) => {
        if (r <= 1) {
          clearInterval(t);
          setTimedOut(true);
          void submit();
          return 0;
        }
        return r - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [finished, submit]);

  /* Warn on accidental exit */
  useEffect(() => {
    if (finished) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "Your test progress will be lost — are you sure you want to leave?";
      return e.returnValue;
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [finished]);

  const answeredCount = questions.filter((_, i) => answers[i]?.value).length;
  const markedCount = questions.filter((_, i) => answers[i]?.marked).length;

  function setAnswer(i: number, value: string) {
    setAnswers((a) => ({ ...a, [i]: { value, marked: a[i]?.marked ?? false } }));
  }
  function toggleMark(i: number) {
    setAnswers((a) => ({ ...a, [i]: { value: a[i]?.value ?? "", marked: !a[i]?.marked } }));
  }

  if (finished) {
    return (
      <TestResults
        questions={questions}
        answers={answers}
        isCorrect={isCorrect}
        timeUsed={totalSeconds - remaining}
        totalSeconds={totalSeconds}
        onRestart={onRestart}
      />
    );
  }

  if (timedOut || submitting) {
    return (
      <div className="card-surface p-10 space-y-3 text-center">
        <Spinner />
        <p className="text-sm text-muted-foreground">
          {timedOut ? "Time's up — submitting your test…" : "Submitting your test…"}
        </p>
      </div>
    );
  }

  const q = questions[index];
  const a = answers[index];
  const danger = remaining <= 120;

  return (
    <div className="space-y-4">
      {/* Timer bar */}
      <div
        className={`sticky top-0 z-10 flex items-center justify-between gap-3 rounded-2xl border px-4 py-3 backdrop-blur ${
          danger ? "border-red-500 bg-red-500/10 animate-pulse" : "border-border bg-card/90"
        }`}
      >
        <span className={`inline-flex items-center gap-2 text-lg font-bold tabular-nums ${danger ? "text-red-500" : "text-foreground"}`} aria-live="polite">
          <TimerIcon aria-hidden className="h-5 w-5" />
          {fmtClock(remaining)} remaining
        </span>
        <button className="btn-primary px-4 py-2 text-sm inline-flex items-center gap-2" style={{ minHeight: 48 }} onClick={() => setConfirming(true)}>
          <Send aria-hidden className="h-4 w-4" />
          Submit Test
        </button>
      </div>

      {/* Palette */}
      <div className="card-surface p-4 space-y-2">
        <p className="text-xs text-muted-foreground">
          {answeredCount} of {questions.length} answered · {markedCount} marked for review
        </p>
        <div className="flex flex-wrap gap-2">
          {questions.map((_, i) => {
            const st = answers[i];
            let cls = "border-border text-muted-foreground";
            if (st?.marked) cls = "border-amber-500 bg-amber-500/20 text-amber-700 dark:text-amber-300";
            else if (st?.value) cls = "border-primary bg-primary/15 text-primary";
            const currentCls = i === index ? "ring-2 ring-primary ring-offset-2 ring-offset-background" : "";
            return (
              <button
                key={i}
                onClick={() => setIndex(i)}
                aria-label={`Go to question ${i + 1}`}
                aria-current={i === index}
                className={`h-10 w-10 rounded-lg border text-sm font-semibold transition ${cls} ${currentCls}`}
              >
                {i + 1}
              </button>
            );
          })}
        </div>
      </div>

      {/* Question */}
      <div className="card-surface p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="inline-flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {(() => { const { Icon, label } = KIND_META[q.kind]; return (<><Icon aria-hidden className="h-4 w-4" />{label}</>); })()}
            · Question {index + 1} of {questions.length}
          </span>
          <button
            onClick={() => toggleMark(index)}
            style={{ minHeight: 48 }}
            className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm transition ${
              a?.marked ? "border-amber-500 bg-amber-500/15 text-amber-700 dark:text-amber-300" : "border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            <Flag aria-hidden className="h-4 w-4" />
            {a?.marked ? "Marked for review" : "Mark for Review"}
          </button>
        </div>

        <h2 className="text-base font-semibold text-foreground">{q.prompt}</h2>

        {q.kind === "practical" && (
          <img src={q.imageUrl} alt="Specimen to identify" className="max-h-80 w-full rounded-xl object-contain bg-muted" />
        )}

        {q.kind === "mcq" && (
          <ul className="space-y-2">
            {q.options.map((o) => (
              <li key={o.key}>
                <button
                  onClick={() => setAnswer(index, o.key)}
                  style={{ minHeight: 48 }}
                  className={`w-full rounded-xl border px-4 py-3 text-left text-sm text-foreground transition ${
                    a?.value === o.key ? "border-primary bg-primary/10" : "border-border bg-card hover:border-primary"
                  }`}
                >
                  <span className="mr-2 font-semibold uppercase">{o.key}.</span>
                  {o.text}
                </button>
              </li>
            ))}
          </ul>
        )}

        {q.kind === "practical" && (
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground" htmlFor="practical-answer">Your answer</label>
            <input
              id="practical-answer"
              className="input-field w-full"
              value={a?.value ?? ""}
              onChange={(e) => setAnswer(index, e.target.value)}
              placeholder="Name the structure…"
            />
          </div>
        )}

        {q.kind === "flashcard" && (
          <div className="space-y-3">
            {revealedFlash[index] ? (
              <>
                <div className="rounded-xl bg-muted/40 p-3 text-sm text-foreground">{q.correct}</div>
                <p className="text-sm font-medium text-foreground">Did you get it right?</p>
                <div className="flex gap-2">
                  <button
                    style={{ minHeight: 48 }}
                    onClick={() => setAnswer(index, "correct")}
                    className={`rounded-xl border px-4 py-2 text-sm transition ${a?.value === "correct" ? "border-primary bg-primary/10 text-foreground" : "border-border text-muted-foreground hover:text-foreground"}`}
                  >
                    I was correct
                  </button>
                  <button
                    style={{ minHeight: 48 }}
                    onClick={() => setAnswer(index, "incorrect")}
                    className={`rounded-xl border px-4 py-2 text-sm transition ${a?.value === "incorrect" ? "border-red-500 bg-red-500/10 text-foreground" : "border-border text-muted-foreground hover:text-foreground"}`}
                  >
                    I was incorrect
                  </button>
                </div>
              </>
            ) : (
              <button
                className="btn-outline px-4 py-2 text-sm"
                style={{ minHeight: 48 }}
                onClick={() => setRevealedFlash((r) => ({ ...r, [index]: true }))}
              >
                Reveal Answer
              </button>
            )}
          </div>
        )}

        <div className="flex justify-between gap-2 pt-2">
          <button
            className="btn-outline px-4 py-2 text-sm"
            style={{ minHeight: 48 }}
            onClick={() => setIndex((i) => Math.max(0, i - 1))}
            disabled={index === 0}
          >
            Previous
          </button>
          <button
            className="btn-outline px-4 py-2 text-sm"
            style={{ minHeight: 48 }}
            onClick={() => setIndex((i) => Math.min(questions.length - 1, i + 1))}
            disabled={index === questions.length - 1}
          >
            Next
          </button>
        </div>
      </div>

      {/* Confirm submit */}
      {confirming && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-md space-y-4 rounded-2xl border border-border bg-card p-6">
            <h2 className="text-lg font-semibold text-foreground">Submit your test?</h2>
            <p className="text-sm text-muted-foreground">
              {answeredCount} of {questions.length} answered, {markedCount} marked for review,{" "}
              {questions.length - answeredCount} unanswered — are you sure you want to submit?
            </p>
            <div className="flex justify-end gap-2">
              <button className="btn-outline px-4 py-2 text-sm" style={{ minHeight: 48 }} onClick={() => setConfirming(false)}>
                Go Back
              </button>
              <button
                className="btn-primary px-4 py-2 text-sm inline-flex items-center gap-2"
                style={{ minHeight: 48 }}
                onClick={() => { setConfirming(false); void submit(); }}
              >
                <CheckCircle2 aria-hidden className="h-4 w-4" />
                Submit Anyway
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------- Results ---------- */

function TestResults({
  questions,
  answers,
  isCorrect,
  timeUsed,
  totalSeconds,
  onRestart,
}: {
  questions: Question[];
  answers: Record<number, AnswerState>;
  isCorrect: (q: Question, a?: AnswerState) => boolean;
  timeUsed: number;
  totalSeconds: number;
  onRestart: () => void;
}) {
  const rows = useMemo(
    () => questions.map((q, i) => ({ q, a: answers[i], correct: isCorrect(q, answers[i]) })),
    [questions, answers, isCorrect],
  );
  const score = rows.filter((r) => r.correct).length;

  const byKind = (["flashcard", "practical", "mcq"] as const).map((kind) => {
    const subset = rows.filter((r) => r.q.kind === kind);
    return { kind, total: subset.length, correct: subset.filter((r) => r.correct).length };
  });

  return (
    <div className="space-y-4">
      <div className="card-surface p-6 space-y-3 text-center">
        <h2 className="text-xl font-semibold text-foreground">Test complete</h2>
        <p className="text-4xl font-bold text-primary">{score} / {questions.length}</p>
        <p className="inline-flex items-center justify-center gap-2 text-sm text-muted-foreground">
          <TimerIcon aria-hidden className="h-4 w-4" />
          {fmtClock(timeUsed)} used of {fmtClock(totalSeconds)} allowed
        </p>
      </div>

      <div className="card-surface p-5 space-y-3">
        <h3 className="text-sm font-semibold text-foreground">Breakdown by type</h3>
        <ul className="space-y-2">
          {byKind.filter((b) => b.total > 0).map((b) => {
            const { Icon, label } = KIND_META[b.kind];
            return (
              <li key={b.kind} className="flex items-center justify-between rounded-xl border border-border p-3 text-sm">
                <span className="inline-flex items-center gap-2 text-foreground"><Icon aria-hidden className="h-4 w-4" />{label}</span>
                <span className="font-semibold text-foreground">{b.correct} / {b.total}</span>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="card-surface p-5 space-y-3">
        <h3 className="text-sm font-semibold text-foreground">Review every question</h3>
        <ol className="space-y-3">
          {rows.map((r, i) => (
            <li key={i} className={`rounded-xl border p-3 text-sm ${r.correct ? "border-primary/50" : "border-red-500/50"}`}>
              <p className="font-medium text-foreground">{i + 1}. {r.q.prompt}</p>
              {r.q.kind === "practical" && (
                <img src={r.q.imageUrl} alt="" className="mt-2 max-h-40 rounded-lg object-contain bg-muted" />
              )}
              <p className="mt-1 text-muted-foreground">
                Your answer:{" "}
                <span className="text-foreground">
                  {r.a?.value
                    ? r.q.kind === "mcq"
                      ? `${r.a.value.toUpperCase()}. ${r.q.options.find((o) => o.key === r.a!.value)?.text ?? ""}`
                      : r.q.kind === "flashcard"
                        ? (r.a.value === "correct" ? "Self-marked correct" : "Self-marked incorrect")
                        : r.a.value
                    : "Not answered"}
                </span>
              </p>
              <p className="text-muted-foreground">
                Correct answer:{" "}
                <span className="text-foreground">
                  {r.q.kind === "mcq"
                    ? `${r.q.correct.toUpperCase()}. ${r.q.options.find((o) => o.key === r.q.correct)?.text ?? ""}`
                    : r.q.correct}
                </span>
              </p>
              {r.q.explanation && <p className="mt-1 text-muted-foreground">{r.q.explanation}</p>}
            </li>
          ))}
        </ol>
      </div>

      <div className="flex flex-wrap justify-center gap-3">
        <button className="btn-primary px-4 py-2 text-sm" style={{ minHeight: 48 }} onClick={onRestart}>
          Take another test
        </button>
        <Link to="/study" className="btn-outline px-4 py-2 text-sm" style={{ minHeight: 48 }}>Study Hub</Link>
      </div>
    </div>
  );
}
