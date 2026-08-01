import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Logo } from "@/components/Logo";
import { Spinner } from "@/components/Spinner";
import { ThemeToggle } from "@/components/ThemeToggle";
import { toast } from "sonner";

export const Route = createFileRoute("/planner")({
  head: () => ({
    meta: [
      { title: "Revision Planner — AnatomyAce" },
      { name: "description", content: "Build a day-by-day anatomy revision plan." },
      { property: "og:title", content: "Revision Planner — AnatomyAce" },
      { property: "og:description", content: "Build a day-by-day anatomy revision plan." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: PlannerPage,
});

type SubtopicRow = {
  id: string;
  name: string;
  topic_id: string;
  category_id: string;
  topicName: string;
  categoryName: string;
};

type DraftDay = {
  day_number: number;
  plan_date: string;
  subtopic_id: string;
  target_card_count: number;
};

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}
function addDays(base: string, n: number) {
  const d = new Date(base + "T00:00:00");
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}
function daysBetween(a: string, b: string) {
  const ms = new Date(b + "T00:00:00").getTime() - new Date(a + "T00:00:00").getTime();
  return Math.round(ms / 86400000);
}
function prettyDate(d: string) {
  return new Date(d + "T00:00:00").toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

function PlannerPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [authChecked, setAuthChecked] = useState(false);
  const [signedIn, setSignedIn] = useState(false);

  const [lengthChoice, setLengthChoice] = useState<"7" | "15" | "30" | "custom">("7");
  const [examDate, setExamDate] = useState<string>("");
  const [mode, setMode] = useState<"auto" | "manual">("auto");
  const [draft, setDraft] = useState<DraftDay[] | null>(null);
  const [saving, setSaving] = useState(false);

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

  const totalDays = useMemo(() => {
    if (lengthChoice !== "custom") return parseInt(lengthChoice, 10);
    if (!examDate) return 0;
    return Math.max(1, daysBetween(todayStr(), examDate) + 1);
  }, [lengthChoice, examDate]);

  const subtopicsQ = useQuery({
    queryKey: ["planner", "subtopics"],
    enabled: signedIn,
    queryFn: async (): Promise<SubtopicRow[]> => {
      const { data, error } = await supabase
        .from("subtopics")
        .select("id, name, topic_id, category_id, topics(name), categories(name)")
        .order("display_order", { ascending: true });
      if (error) throw error;
      return (data ?? []).map((s: any) => ({
        id: s.id,
        name: s.name,
        topic_id: s.topic_id,
        category_id: s.category_id,
        topicName: s.topics?.name ?? "",
        categoryName: s.categories?.name ?? "",
      }));
    },
  });

  const accuracyQ = useQuery({
    queryKey: ["planner", "accuracy"],
    enabled: signedIn,
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      const uid = u.user?.id;
      if (!uid) return new Map<string, number>();
      const { data, error } = await supabase
        .from("card_reviews")
        .select("last_rating, flashcards!inner(subtopic_id)")
        .eq("user_id", uid);
      if (error) throw error;
      const agg = new Map<string, { good: number; total: number }>();
      (data ?? []).forEach((r: any) => {
        const sid = r.flashcards?.subtopic_id;
        if (!sid) return;
        const cur = agg.get(sid) ?? { good: 0, total: 0 };
        cur.total += 1;
        if (r.last_rating === "good" || r.last_rating === "easy") cur.good += 1;
        agg.set(sid, cur);
      });
      const out = new Map<string, number>();
      agg.forEach((v, k) => out.set(k, Math.round((v.good / v.total) * 100)));
      return out;
    },
  });

  const planQ = useQuery({
    queryKey: ["planner", "plan"],
    enabled: signedIn,
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      const uid = u.user?.id;
      if (!uid) return null;
      const { data: plan, error } = await supabase
        .from("revision_plans")
        .select("id, plan_type, mode, start_date, end_date")
        .eq("user_id", uid)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      if (!plan) return null;
      const { data: days, error: dErr } = await supabase
        .from("revision_plan_days")
        .select("id, day_number, plan_date, subtopic_id, target_card_count, completed")
        .eq("plan_id", plan.id)
        .order("day_number", { ascending: true });
      if (dErr) throw dErr;
      return { plan, days: days ?? [] };
    },
  });

  const subtopics = subtopicsQ.data ?? [];
  const subMap = useMemo(() => new Map(subtopics.map((s) => [s.id, s])), [subtopics]);

  function generateAuto() {
    if (totalDays < 1) {
      toast.error("Pick a plan length first.");
      return;
    }
    if (subtopics.length === 0) {
      toast.error("No subtopics available yet.");
      return;
    }
    const acc = accuracyQ.data ?? new Map<string, number>();
    // Weakest first, then never-studied, then strong
    const scored = subtopics.map((s) => ({
      s,
      acc: acc.has(s.id) ? (acc.get(s.id) as number) : null,
    }));
    const weak = scored.filter((x) => x.acc !== null && (x.acc as number) < 60).sort((a, b) => (a.acc! - b.acc!));
    const unseen = scored.filter((x) => x.acc === null);
    const rest = scored.filter((x) => x.acc !== null && (x.acc as number) >= 60).sort((a, b) => a.acc! - b.acc!);

    const reviewDays = totalDays >= 5 ? 2 : totalDays >= 3 ? 1 : 0;
    const newDays = totalDays - reviewDays;

    const queue: SubtopicRow[] = [];
    // interleave: weak subtopics repeat more often
    const pool = [...weak.map((x) => x.s), ...weak.map((x) => x.s), ...unseen.map((x) => x.s), ...rest.map((x) => x.s)];
    const source = pool.length > 0 ? pool : subtopics;
    for (let i = 0; i < newDays; i++) queue.push(source[i % source.length]);

    const start = todayStr();
    const days: DraftDay[] = queue.map((s, i) => ({
      day_number: i + 1,
      plan_date: addDays(start, i),
      subtopic_id: s.id,
      target_card_count: 20,
    }));

    // final light review days — weakest subtopics, smaller targets
    const reviewSource = weak.length > 0 ? weak.map((x) => x.s) : source;
    for (let i = 0; i < reviewDays; i++) {
      const dn = newDays + i + 1;
      days.push({
        day_number: dn,
        plan_date: addDays(start, dn - 1),
        subtopic_id: reviewSource[i % reviewSource.length].id,
        target_card_count: 10,
      });
    }
    setDraft(days);
  }

  function generateManual() {
    if (totalDays < 1) {
      toast.error("Pick a plan length first.");
      return;
    }
    const start = todayStr();
    const days: DraftDay[] = Array.from({ length: totalDays }, (_, i) => ({
      day_number: i + 1,
      plan_date: addDays(start, i),
      subtopic_id: "",
      target_card_count: 20,
    }));
    setDraft(days);
  }

  function updateDraftDay(i: number, patch: Partial<DraftDay>) {
    setDraft((d) => (d ? d.map((x, idx) => (idx === i ? { ...x, ...patch } : x)) : d));
  }

  function removeDraftDay(i: number) {
    setDraft((d) => {
      if (!d) return d;
      const next = d.filter((_, idx) => idx !== i);
      const start = todayStr();
      return next.map((x, idx) => ({ ...x, day_number: idx + 1, plan_date: addDays(start, idx) }));
    });
  }

  function moveDraftDay(i: number, dir: -1 | 1) {
    setDraft((d) => {
      if (!d) return d;
      const j = i + dir;
      if (j < 0 || j >= d.length) return d;
      const next = [...d];
      [next[i], next[j]] = [next[j], next[i]];
      const start = todayStr();
      return next.map((x, idx) => ({ ...x, day_number: idx + 1, plan_date: addDays(start, idx) }));
    });
  }

  function addDraftDay() {
    setDraft((d) => {
      const list = d ?? [];
      const start = todayStr();
      return [
        ...list,
        { day_number: list.length + 1, plan_date: addDays(start, list.length), subtopic_id: "", target_card_count: 20 },
      ];
    });
  }

  async function savePlan() {
    if (!draft || draft.length === 0) return;
    const filled = draft.filter((d) => d.subtopic_id);
    if (filled.length === 0) {
      toast.error("Pick at least one subtopic.");
      return;
    }
    setSaving(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      const uid = u.user?.id;
      if (!uid) throw new Error("Not signed in");
      const start = todayStr();
      const { data: plan, error } = await supabase
        .from("revision_plans")
        .insert({
          user_id: uid,
          plan_type: lengthChoice === "custom" ? "custom" : `${lengthChoice}-day`,
          mode,
          start_date: start,
          end_date: addDays(start, Math.max(0, draft.length - 1)),
        })
        .select("id")
        .single();
      if (error) throw error;

      const { error: dErr } = await supabase.from("revision_plan_days").insert(
        filled.map((d, i) => ({
          plan_id: plan.id,
          day_number: i + 1,
          plan_date: addDays(start, i),
          subtopic_id: d.subtopic_id,
          target_card_count: d.target_card_count,
        })),
      );
      if (dErr) throw dErr;

      toast.success("Plan saved!");
      setDraft(null);
      qc.invalidateQueries({ queryKey: ["planner", "plan"] });
    } catch (e) {
      toast.error("Couldn't save your plan. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  async function deletePlan(planId: string) {
    const { error } = await supabase.from("revision_plans").delete().eq("id", planId);
    if (error) {
      toast.error("Couldn't delete the plan.");
      return;
    }
    toast.success("Plan deleted");
    qc.invalidateQueries({ queryKey: ["planner", "plan"] });
  }

  if (!authChecked) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-background">
        <Spinner />
      </main>
    );
  }

  const existing = planQ.data;

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

      <section className="mx-auto max-w-3xl px-4 py-8 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Revision Planner</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Build a day-by-day study schedule and start each day&apos;s session in one tap.
          </p>
        </div>

        {planQ.isLoading && (
          <div className="card-surface p-10 flex justify-center">
            <Spinner />
          </div>
        )}

        {!planQ.isLoading && existing && !draft && (
          <div className="card-surface p-6 space-y-4">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div>
                <h2 className="text-lg font-semibold text-foreground">
                  Your plan · {existing.plan.plan_type} · {existing.plan.mode === "auto" ? "Auto" : "Manual"}
                </h2>
                <p className="text-sm text-muted-foreground">
                  {prettyDate(existing.plan.start_date)} → {prettyDate(existing.plan.end_date)}
                </p>
              </div>
              <div className="flex gap-2">
                <button className="btn-outline" onClick={() => (mode === "auto" ? generateAuto() : generateManual())}>
                  Regenerate
                </button>
                <button className="btn-outline" onClick={() => deletePlan(existing.plan.id)}>
                  Delete plan
                </button>
              </div>
            </div>

            <ul className="space-y-2">
              {existing.days.map((d) => {
                const s = d.subtopic_id ? subMap.get(d.subtopic_id) : undefined;
                return (
                  <li
                    key={d.id}
                    className="flex items-center justify-between gap-3 rounded-xl border border-border p-3"
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-foreground truncate">
                        Day {d.day_number} — {s ? `${s.topicName}: ${s.categoryName} — ${s.name}` : "Subtopic removed"}{" "}
                        <span className="text-muted-foreground font-normal">({d.target_card_count} cards)</span>
                      </div>
                      <div className="text-xs text-muted-foreground">{prettyDate(d.plan_date)}</div>
                    </div>
                    {d.completed ? (
                      <span className="text-xs font-medium text-primary shrink-0">✓ Completed</span>
                    ) : (
                      <Link
                        to="/review"
                        search={{ subtopic: d.subtopic_id ?? undefined }}
                        className="btn-primary shrink-0"
                      >
                        Start
                      </Link>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {!planQ.isLoading && !draft && (
          <div className="card-surface p-6 space-y-5">
            <h2 className="text-lg font-semibold text-foreground">
              {existing ? "Create a new plan" : "Create your plan"}
            </h2>

            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Plan length</label>
              <div className="flex flex-wrap gap-2">
                {(["7", "15", "30", "custom"] as const).map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setLengthChoice(v)}
                    className={
                      lengthChoice === v
                        ? "btn-primary"
                        : "btn-outline"
                    }
                  >
                    {v === "custom" ? "Exam date" : `${v}-Day`}
                  </button>
                ))}
              </div>
              {lengthChoice === "custom" && (
                <input
                  type="date"
                  className="input-field w-full mt-2"
                  value={examDate}
                  min={todayStr()}
                  onChange={(e) => setExamDate(e.target.value)}
                  aria-label="Exam date"
                />
              )}
              {totalDays > 0 && (
                <p className="text-xs text-muted-foreground">{totalDays} day{totalDays === 1 ? "" : "s"} of study.</p>
              )}
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Mode</label>
              <div className="flex gap-2">
                <button
                  type="button"
                  className={mode === "auto" ? "btn-primary" : "btn-outline"}
                  onClick={() => setMode("auto")}
                >
                  Auto
                </button>
                <button
                  type="button"
                  className={mode === "manual" ? "btn-primary" : "btn-outline"}
                  onClick={() => setMode("manual")}
                >
                  Manual
                </button>
              </div>
              <p className="text-xs text-muted-foreground">
                {mode === "auto"
                  ? "Weak subtopics come first and repeat; new ones are spread out; the last days are light review."
                  : "Pick a subtopic and card target for each day yourself."}
              </p>
            </div>

            <button
              className="btn-primary w-full"
              onClick={mode === "auto" ? generateAuto : generateManual}
              disabled={totalDays < 1 || subtopicsQ.isLoading}
            >
              {mode === "auto" ? "Generate plan" : "Build plan manually"}
            </button>
          </div>
        )}

        {draft && (
          <div className="card-surface p-6 space-y-4">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <h2 className="text-lg font-semibold text-foreground">Review your plan</h2>
              <div className="flex gap-2">
                {mode === "auto" && (
                  <button className="btn-outline" onClick={generateAuto}>
                    Regenerate
                  </button>
                )}
                <button className="btn-outline" onClick={() => setDraft(null)}>
                  Cancel
                </button>
              </div>
            </div>

            <ul className="space-y-2">
              {draft.map((d, i) => (
                <li key={i} className="rounded-xl border border-border p-3 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium text-foreground">
                      Day {d.day_number} · {prettyDate(d.plan_date)}
                    </span>
                    <div className="flex gap-1">
                      <button className="h-8 w-8 rounded-lg hover:bg-muted text-foreground" onClick={() => moveDraftDay(i, -1)} aria-label="Move up">↑</button>
                      <button className="h-8 w-8 rounded-lg hover:bg-muted text-foreground" onClick={() => moveDraftDay(i, 1)} aria-label="Move down">↓</button>
                      <button className="h-8 w-8 rounded-lg hover:bg-muted text-foreground" onClick={() => removeDraftDay(i)} aria-label="Remove day">✕</button>
                    </div>
                  </div>
                  <div className="grid sm:grid-cols-[1fr_auto] gap-2">
                    <select
                      className="input-field w-full"
                      value={d.subtopic_id}
                      onChange={(e) => updateDraftDay(i, { subtopic_id: e.target.value })}
                      aria-label={`Subtopic for day ${d.day_number}`}
                    >
                      <option value="">Select a subtopic…</option>
                      {subtopics.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.topicName} → {s.categoryName} → {s.name}
                        </option>
                      ))}
                    </select>
                    <input
                      type="number"
                      min={1}
                      className="input-field w-full sm:w-28"
                      value={d.target_card_count}
                      onChange={(e) => updateDraftDay(i, { target_card_count: Math.max(1, Number(e.target.value) || 1) })}
                      aria-label={`Target cards for day ${d.day_number}`}
                    />
                  </div>
                </li>
              ))}
            </ul>

            <div className="flex flex-wrap gap-2">
              <button className="btn-outline" onClick={addDraftDay}>+ Add day</button>
              <button className="btn-primary flex-1" onClick={savePlan} disabled={saving}>
                {saving ? <Spinner /> : "Save plan"}
              </button>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
