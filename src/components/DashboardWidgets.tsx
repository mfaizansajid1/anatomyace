import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { Layers, ClipboardCheck, CalendarCheck, ChevronRight, CheckCircle2 } from "lucide-react";

function localToday() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function timeAgo(iso: string) {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  return `${days} days ago`;
}

export function DueCardsCard({ userId }: { userId: string }) {
  const q = useQuery({
    queryKey: ["dash", "due", userId],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("card_reviews")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .lte("next_review_date", new Date().toISOString());
      if (error) throw error;
      return count ?? 0;
    },
  });
  const due = q.data ?? 0;
  return (
    <div className="card-surface p-5 flex flex-col">
      <div className="flex items-center gap-2">
        <Layers aria-hidden className="h-5 w-5 text-primary" />
        <h2 className="font-semibold text-foreground">Cards Due Today</h2>
      </div>
      {q.isLoading ? (
        <div className="mt-4 h-10 w-20 animate-pulse rounded-lg bg-muted/40" />
      ) : (
        <p className="mt-3 text-4xl font-bold text-foreground">
          {due} <span className="text-base font-medium text-muted-foreground">{due === 1 ? "card" : "cards"}</span>
        </p>
      )}
      <p className="mt-1 text-sm text-muted-foreground">
        {due > 0 ? "Scheduled for spaced-repetition review." : "You're all caught up. Learn something new!"}
      </p>
      <Link to="/review" search={{ subtopic: undefined }} className="btn-primary mt-4 self-start">
        {due > 0 ? "Review Now" : "Study Flashcards"} <ChevronRight className="h-4 w-4" />
      </Link>
    </div>
  );
}

export function RecentTestCard({ userId }: { userId: string }) {
  const q = useQuery({
    queryKey: ["dash", "recent-test", userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("test_results")
        .select("title, score, total, created_at, mode")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(3);
      if (error) throw error;
      return data;
    },
  });
  const rows = q.data ?? [];
  return (
    <div className="card-surface p-5 flex flex-col">
      <div className="flex items-center gap-2">
        <ClipboardCheck aria-hidden className="h-5 w-5 text-primary" />
        <h2 className="font-semibold text-foreground">Recent Tests</h2>
      </div>
      {q.isLoading ? (
        <div className="mt-4 h-16 animate-pulse rounded-lg bg-muted/40" />
      ) : rows.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">No tests yet. Take a timed exam to check your readiness.</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {rows.map((r, i) => {
            const pct = r.total > 0 ? Math.round((r.score / r.total) * 100) : 0;
            return (
              <li key={i} className="flex items-center gap-3 rounded-xl bg-muted/40 px-3 py-2">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{r.title}</p>
                  <p className="text-xs text-muted-foreground">{r.score}/{r.total} · {timeAgo(r.created_at)}</p>
                </div>
                <span className={`text-sm font-bold ${pct >= 60 ? "text-primary" : "text-destructive"}`}>{pct}%</span>
              </li>
            );
          })}
        </ul>
      )}
      <div className="mt-4 flex flex-wrap gap-2">
        <Link to="/test" search={{}} className="btn-primary">Take a Test</Link>
        {rows.length > 0 && <Link to="/progress" className="btn-outline">History</Link>}
      </div>
    </div>
  );
}

type PlanDay = {
  id: string;
  day_number: number;
  study_type: string;
  target_card_count: number;
  completed: boolean;
  is_test: boolean;
  subtopic_id: string | null;
  plan_id: string;
  subtopics: { name: string } | null;
  categories: { name: string } | null;
};

const TYPE_LABEL: Record<string, string> = { flashcard: "Flashcards", practical: "Practical", mcq: "MCQs" };

export function TodayPlanCard({ userId }: { userId: string }) {
  const today = localToday();
  const q = useQuery({
    queryKey: ["dash", "plan-today", userId, today],
    queryFn: async () => {
      const { data: plans, error } = await supabase
        .from("revision_plans")
        .select("id")
        .eq("user_id", userId)
        .lte("start_date", today)
        .gte("end_date", today)
        .order("created_at", { ascending: false })
        .limit(1);
      if (error) throw error;
      const plan = plans?.[0];
      if (!plan) return null;
      const { data: days, error: e2 } = await supabase
        .from("revision_plan_days")
        .select("id, day_number, study_type, target_card_count, completed, is_test, subtopic_id, plan_id, subtopics(name), categories(name)")
        .eq("plan_id", plan.id)
        .eq("plan_date", today);
      if (e2) throw e2;
      return (days ?? []) as unknown as PlanDay[];
    },
  });

  if (q.isLoading) return <div className="card-surface p-5 h-32 animate-pulse" />;
  const items = q.data;

  return (
    <div className="card-surface p-5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <CalendarCheck aria-hidden className="h-5 w-5 text-primary" />
          <h2 className="font-semibold text-foreground">
            Today on your Revision Plan{items && items[0] ? ` · Day ${items[0].day_number}` : ""}
          </h2>
        </div>
        <Link to="/planner" className="text-sm text-primary hover:underline">Open planner</Link>
      </div>

      {items === null || items === undefined ? (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">No active revision plan. Create one to get a daily study schedule.</p>
          <Link to="/planner" className="btn-outline">Create Plan</Link>
        </div>
      ) : items.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">Nothing scheduled for today — a good day to review due cards.</p>
      ) : items.some((d) => d.is_test) ? (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-foreground font-medium">Today is a Test Day. Put your revision to the test.</p>
          <Link to="/test" search={{ plan: items[0].plan_id, day: items[0].day_number }} className="btn-primary">
            Start Test
          </Link>
        </div>
      ) : (
        <ul className="mt-3 space-y-2">
          {items.map((d) => {
            const name = d.subtopics?.name ?? d.categories?.name ?? "Mixed revision";
            return (
              <li key={d.id} className="flex items-center gap-3 rounded-xl bg-muted/40 px-3 py-2">
                {d.completed ? (
                  <CheckCircle2 aria-label="Completed" className="h-5 w-5 text-primary shrink-0" />
                ) : (
                  <span aria-hidden className="h-5 w-5 rounded-full border-2 border-border shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-medium truncate ${d.completed ? "text-muted-foreground line-through" : "text-foreground"}`}>{name}</p>
                  <p className="text-xs text-muted-foreground">{TYPE_LABEL[d.study_type] ?? d.study_type} · {d.target_card_count} items</p>
                </div>
                {!d.completed && (
                  d.study_type === "flashcard" && d.subtopic_id ? (
                    <Link to="/review" search={{ subtopic: d.subtopic_id }} className="btn-outline text-sm" style={{ minHeight: 36 }}>Start</Link>
                  ) : d.study_type === "mcq" ? (
                    <Link to="/mcq" className="btn-outline text-sm" style={{ minHeight: 36 }}>Start</Link>
                  ) : d.study_type === "practical" ? (
                    <Link to="/practical" className="btn-outline text-sm" style={{ minHeight: 36 }}>Start</Link>
                  ) : (
                    <Link to="/planner" className="btn-outline text-sm" style={{ minHeight: 36 }}>Open</Link>
                  )
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
