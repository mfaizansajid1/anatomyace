import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Logo } from "@/components/Logo";
import { Spinner } from "@/components/Spinner";
import { ThemeToggle } from "@/components/ThemeToggle";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";

export const Route = createFileRoute("/progress")({
  head: () => ({
    meta: [
      { title: "Progress — AnatomyAce" },
      { name: "description", content: "Your study progress over time." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ProgressPage,
});

function dateStr(d: Date) {
  return d.toISOString().slice(0, 10);
}

function ProgressPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["progress-page"],
    queryFn: async () => {
      const { data: authData } = await supabase.auth.getUser();
      if (!authData.user) throw new Error("User not logged in");
      const uid = authData.user.id;

      const since90 = dateStr(new Date(Date.now() - 89 * 24 * 60 * 60 * 1000));
      const { data: activity, error: actErr } = await supabase
        .from("study_activity")
        .select("study_date, cards_studied")
        .eq("user_id", uid)
        .gte("study_date", since90)
        .order("study_date", { ascending: true });
      if (actErr) throw actErr;

      const { data: topics, error: topErr } = await supabase
        .from("topic_performance")
        .select("topic_name, accuracy_percentage")
        .eq("user_id", uid)
        .order("topic_name", { ascending: true });
      if (topErr) throw topErr;

      const since30Events = new Date(Date.now() - 29 * 24 * 60 * 60 * 1000).toISOString();
      const { data: events, error: evErr } = await supabase
        .from("review_events")
        .select("rating, reviewed_at")
        .eq("user_id", uid)
        .gte("reviewed_at", since30Events);
      if (evErr) throw evErr;

      return {
        activity: activity ?? [],
        topics: topics ?? [],
        events: events ?? [],
      };
    },
  });

  const heatmapDays = useMemo(() => {
    const map = new Map<string, number>();
    (data?.activity ?? []).forEach((a) => map.set(a.study_date, a.cards_studied));
    const days: { date: string; count: number }[] = [];
    for (let i = 29; i >= 0; i--) {
      const d = dateStr(new Date(Date.now() - i * 24 * 60 * 60 * 1000));
      days.push({ date: d, count: map.get(d) ?? 0 });
    }
    return days;
  }, [data]);

  const maxDay = Math.max(1, ...heatmapDays.map((d) => d.count));

  const trend = useMemo(() => {
    const byDay = new Map<string, { good: number; total: number }>();
    (data?.events ?? []).forEach((e) => {
      const d = e.reviewed_at.slice(0, 10);
      const entry = byDay.get(d) ?? { good: 0, total: 0 };
      entry.total += 1;
      if (e.rating === "good" || e.rating === "easy") entry.good += 1;
      byDay.set(d, entry);
    });
    const days: { date: string; accuracy: number | null }[] = [];
    for (let i = 29; i >= 0; i--) {
      const d = dateStr(new Date(Date.now() - i * 24 * 60 * 60 * 1000));
      const entry = byDay.get(d);
      days.push({
        date: d.slice(5),
        accuracy: entry && entry.total > 0 ? Math.round((entry.good / entry.total) * 100) : null,
      });
    }
    return days;
  }, [data]);

  function heatColor(count: number) {
    if (count === 0) return "bg-muted/40";
    const ratio = count / maxDay;
    if (ratio > 0.75) return "bg-primary";
    if (ratio > 0.5) return "bg-primary/70";
    if (ratio > 0.25) return "bg-primary/40";
    return "bg-primary/20";
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

      <main className="mx-auto max-w-5xl px-4 sm:px-6 py-8 space-y-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground">Progress</h1>
          <p className="mt-1 text-muted-foreground">Your study activity and accuracy over time.</p>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-10">
            <Spinner className="h-6 w-6" />
          </div>
        ) : (
          <>
            <div className="card-surface p-5">
              <h2 className="font-semibold text-foreground">Study Activity — Last 30 Days</h2>
              <div className="mt-4 grid grid-cols-[repeat(30,minmax(0,1fr))] gap-1 overflow-x-auto">
                {heatmapDays.map((d) => (
                  <div
                    key={d.date}
                    title={`${d.count} cards on ${d.date}`}
                    className={`aspect-square rounded-sm ${heatColor(d.count)}`}
                  />
                ))}
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                Darker squares mean more cards studied that day.
              </p>
            </div>

            <div className="card-surface p-5">
              <h2 className="font-semibold text-foreground">Accuracy Trend — Last 30 Days</h2>
              <div className="mt-4 h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={trend}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} unit="%" />
                    <Tooltip />
                    <Line
                      type="monotone"
                      dataKey="accuracy"
                      stroke="currentColor"
                      className="text-primary"
                      strokeWidth={2}
                      dot={false}
                      connectNulls
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="card-surface p-5">
              <h2 className="font-semibold text-foreground">Topic Mastery</h2>
              {(!data?.topics || data.topics.length === 0) ? (
                <p className="mt-3 text-sm text-muted-foreground">
                  Study a few cards to see your topic breakdown here.
                </p>
              ) : (
                <div className="mt-4 space-y-3">
                  {data.topics.map((t) => (
                    <div key={t.topic_name}>
                      <div className="flex items-center justify-between text-sm mb-1">
                        <span className="text-foreground font-medium">{t.topic_name}</span>
                        <span className="text-muted-foreground">{t.accuracy_percentage}%</span>
                      </div>
                      <div className="h-2 rounded-full bg-muted/40 overflow-hidden">
                        <div
                          className="h-full bg-primary rounded-full"
                          style={{ width: `${t.accuracy_percentage}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
