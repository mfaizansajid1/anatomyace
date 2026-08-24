import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Logo } from "@/components/Logo";
import { Spinner } from "@/components/Spinner";
import { ThemeToggle } from "@/components/ThemeToggle";
import { ChapterTopicPicker, type ChapterTopicSelection } from "@/components/ChapterTopicPicker";
import { checkCelebrations } from "@/lib/celebrate";

export const Route = createFileRoute("/mcq")({
  head: () => ({
    meta: [
      { title: "Clinical MCQs — AnatomyAce" },
      { name: "description", content: "Timed exam-style clinical multiple-choice questions by chapter and topic." },
      { property: "og:title", content: "Clinical MCQs — AnatomyAce" },
      { property: "og:description", content: "Timed exam-style clinical multiple-choice questions by chapter and topic." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: McqPage,
});

type Mcq = {
  id: string;
  question: string;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
  correct_option: string;
  explanation: string | null;
};

const KEYS = ["a", "b", "c", "d"] as const;
type OptKey = (typeof KEYS)[number];

function McqPage() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);

  const [sel, setSel] = useState<ChapterTopicSelection>({ topicId: "", categoryId: "" });
  const [mode, setMode] = useState<"auto" | "manual">("auto");
  const [manualSeconds, setManualSeconds] = useState<number | null>(null);
  const [session, setSession] = useState<{ items: Mcq[]; seconds: number } | null>(null);
  const [prevBadges, setPrevBadges] = useState<Set<string>>(new Set());
  const [goalCelebrated, setGoalCelebrated] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!data.user) { navigate({ to: "/login" }); return; }
      setReady(true);
    })();
  }, [navigate]);

  useEffect(() => {
    if (!session) return;
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
  }, [session]);

  const settingsQ = useQuery({
    queryKey: ["mcq-timer-settings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("mcq_timer_settings")
        .select("min_seconds, max_seconds, auto_default_seconds")
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data ?? { min_seconds: 10, max_seconds: 60, auto_default_seconds: 30 };
    },
  });

  const settings = settingsQ.data ?? { min_seconds: 10, max_seconds: 60, auto_default_seconds: 30 };
  const manualValue = manualSeconds ?? settings.auto_default_seconds;

  async function startSession() {
    if (!sel.categoryId) { toast.error("Pick a chapter and topic first"); return; }
    const { data, error } = await supabase
      .from("clinical_mcqs")
      .select("id, question, option_a, option_b, option_c, option_d, correct_option, explanation")
      .eq("category_id", sel.categoryId)
      .eq("is_published", true);
    if (error) { toast.error(error.message); return; }
    const items = (data ?? []) as Mcq[];
    if (items.length === 0) { toast.error("No MCQs available for this topic yet."); return; }
    const shuffled = [...items].sort(() => Math.random() - 0.5);
    const seconds = mode === "auto"
      ? settings.auto_default_seconds
      : Math.min(settings.max_seconds, Math.max(settings.min_seconds, manualValue));
    setSession({ items: shuffled, seconds });
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
        <div className="mx-auto max-w-3xl px-4 py-4 flex items-center justify-between">
          <Link to="/study" className="flex items-center gap-2">
            <Logo size={32} />
            <span className="font-semibold text-foreground">AnatomyAce</span>
          </Link>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Link to="/study" className="text-sm text-muted-foreground hover:text-foreground">← Study Hub</Link>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-3xl px-4 py-8 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Clinical MCQs</h1>
          <p className="text-sm text-muted-foreground mt-1">Exam-style questions, one at a time, against the clock.</p>
        </div>

        {session ? (
          <McqSession
            items={session.items}
            seconds={session.seconds}
            onExit={() => setSession(null)}
            prevBadges={prevBadges}
            goalCelebrated={goalCelebrated}
            setPrevBadges={setPrevBadges}
            setGoalCelebrated={setGoalCelebrated}
          />
        ) : (
          <div className="card-surface p-5 space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <ChapterTopicPicker idPrefix="mcqs" value={sel} onChange={setSel} />
            </div>

            <fieldset className="space-y-2">
              <legend className="text-sm font-medium text-foreground">Timer mode</legend>
              <div className="flex flex-wrap gap-4">
                <label className="flex items-center gap-2 text-sm">
                  <input type="radio" name="mode" checked={mode === "auto"} onChange={() => setMode("auto")} />
                  Auto ({settings.auto_default_seconds}s per question)
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input type="radio" name="mode" checked={mode === "manual"} onChange={() => setMode("manual")} />
                  Manual
                </label>
              </div>
            </fieldset>

            {mode === "manual" && (
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground" htmlFor="mcq-manual">
                  Seconds per question: {manualValue}
                </label>
                <input
                  id="mcq-manual"
                  type="range"
                  className="w-full"
                  min={settings.min_seconds}
                  max={settings.max_seconds}
                  value={manualValue}
                  onChange={(e) => setManualSeconds(Number(e.target.value))}
                />
                <p className="text-xs text-muted-foreground">
                  Allowed range: {settings.min_seconds}–{settings.max_seconds} seconds.
                </p>
              </div>
            )}

            <button className="btn-primary px-4 py-2 text-sm" style={{ minHeight: 48 }} onClick={startSession} disabled={!sel.categoryId}>
              Start session
            </button>
          </div>
        )}
      </section>
    </main>
  );
}

function McqSession({ 
  items, 
  seconds, 
  onExit, 
  prevBadges, 
  goalCelebrated, 
  setPrevBadges, 
  setGoalCelebrated 
}: { 
  items: Mcq[]; 
  seconds: number; 
  onExit: () => void; 
  prevBadges: Set<string>; 
  goalCelebrated: boolean; 
  setPrevBadges: (v: Set<string>) => void; 
  setGoalCelebrated: (v: boolean) => void; 
}) {
  const [index, setIndex] = useState(0);
  const [picked, setPicked] = useState<OptKey | null>(null);
  const [timedOut, setTimedOut] = useState(false);
  const [remaining, setRemaining] = useState(seconds);
  const [score, setScore] = useState({ correct: 0, incorrect: 0, timedOut: 0 });
  const [done, setDone] = useState(false);
  const answeredRef = useRef(false);

  const current = items[index];
  const revealed = picked !== null || timedOut;

  const record = useCallback(async (mcqId: string, isCorrect: boolean) => {
    const { error } = await supabase.rpc("record_mcq_answer", { _mcq_id: mcqId, _is_correct: isCorrect });
    if (error) {
      toast.error(error.message);
      return;
    }
    await checkCelebrations(prevBadges, goalCelebrated, setGoalCelebrated, setPrevBadges);
  }, [prevBadges, goalCelebrated, setGoalCelebrated, setPrevBadges]);

  useEffect(() => {
    answeredRef.current = false;
    setPicked(null);
    setTimedOut(false);
    setRemaining(seconds);
  }, [index, seconds]);

  useEffect(() => {
    if (done || revealed) return;
    const t = setInterval(() => {
      setRemaining((r) => {
        if (r <= 1) {
          clearInterval(t);
          if (!answeredRef.current) {
            answeredRef.current = true;
            setTimedOut(true);
            setScore((s) => ({ ...s, timedOut: s.timedOut + 1 }));
            void record(current.id, false);
          }
          return 0;
        }
        return r - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [done, revealed, current, record]);

  function choose(k: OptKey) {
    if (answeredRef.current) return;
    answeredRef.current = true;
    setPicked(k);
    const isCorrect = k === current.correct_option;
    setScore((s) => ({ ...s, correct: s.correct + (isCorrect ? 1 : 0), incorrect: s.incorrect + (isCorrect ? 0 : 1) }));
    void record(current.id, isCorrect);
  }

  function next() {
    if (index + 1 >= items.length) { setDone(true); return; }
    setIndex((i) => i + 1);
  }

  const options = useMemo(
    () => KEYS.map((k) => ({ key: k, text: current ? (current[`option_${k}` as const] as string) : "" })),
    [current],
  );

  if (done) {
    const total = items.length;
    const accuracy = total > 0 ? Math.round((score.correct / total) * 100) : 0;
    return (
      <div className="card-surface p-6 space-y-4 text-center">
        <h2 className="text-xl font-semibold text-foreground">Session complete</h2>
        <p className="text-3xl font-bold text-primary">{score.correct} / {total}</p>
        <p className="text-sm text-muted-foreground">
          {score.correct} correct, {score.incorrect} incorrect, {score.timedOut} timed out · {accuracy}% accuracy
        </p>
        <div className="flex justify-center gap-3">
          <button className="btn-primary px-4 py-2 text-sm" style={{ minHeight: 48 }} onClick={onExit}>Pick another topic</button>
          <Link to="/study" className="btn-outline px-4 py-2 text-sm" style={{ minHeight: 48 }}>Study Hub</Link>
        </div>
      </div>
    );
  }

  const warn = remaining <= 5;
  const pct = Math.max(0, Math.round((remaining / seconds) * 100));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">Question {index + 1} of {items.length}</span>
        <span className={warn ? "font-semibold text-red-500" : "font-semibold text-foreground"} aria-live="polite">
          {remaining}s
        </span>
      </div>

      <div className="h-2 w-full overflow-hidden rounded-full bg-muted/40">
        <div
          className={`h-full rounded-full transition-all duration-1000 ease-linear ${warn ? "bg-red-500" : "bg-primary"}`}
          style={{ width: `${pct}%` }}
        />
      </div>

      <div className="card-surface p-5 space-y-4">
        <h2 className="text-base font-semibold text-foreground">{current.question}</h2>

        <ul className="space-y-2">
          {options.map((o) => {
            const isCorrect = o.key === current.correct_option;
            const isPicked = picked === o.key;
            let cls = "border-border bg-card hover:border-primary";
            if (revealed && isCorrect) cls = "border-primary bg-primary/10";
            else if (revealed && isPicked) cls = "border-red-500 bg-red-500/10";
            return (
              <li key={o.key}>
                <button
                  onClick={() => choose(o.key)}
                  disabled={revealed}
                  style={{ minHeight: 48 }}
                  className={`w-full rounded-xl border px-4 py-3 text-left text-sm text-foreground transition ${cls}`}
                >
                  <span className="mr-2 font-semibold uppercase">{o.key}.</span>
                  {o.text}
                </button>
              </li>
            );
          })}
        </ul>

        {revealed && (
          <div className="space-y-2 rounded-xl bg-muted/40 p-3">
            <p className="text-sm font-medium text-foreground">
              {timedOut
                ? `Time's up — the correct answer was ${current.correct_option.toUpperCase()}.`
                : picked === current.correct_option
                  ? "Correct!"
                  : `Incorrect — the correct answer was ${current.correct_option.toUpperCase()}.`}
            </p>
            {current.explanation && <p className="text-sm text-muted-foreground">{current.explanation}</p>}
            <button className="btn-primary px-4 py-2 text-sm" style={{ minHeight: 48 }} onClick={next}>
              {index + 1 >= items.length ? "Finish" : "Next"}
            </button>
          </div>
        )}
      </div>

      <button className="text-sm text-muted-foreground hover:text-foreground" onClick={onExit}>End session</button>
    </div>
  );
}
