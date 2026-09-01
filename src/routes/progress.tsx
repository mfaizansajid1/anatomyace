import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Logo } from "@/components/Logo";
import { Spinner } from "@/components/Spinner";
import { ThemeToggle } from "@/components/ThemeToggle";
import { StudyInsights } from "@/components/StudyInsights";
import { AlertTriangle, Bone, Calendar, Clock, Layers, ListChecks, TrendingDown, TrendingUp } from "lucide-react";

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

      // Insight events: last 90 days, with topic names for per-topic accuracy
      const since90Events = new Date(Date.now() - 89 * 24 * 60 * 60 * 1000).toISOString();
      const { data: insightRows, error: insErr } = await supabase
        .from("review_events")
        .select("rating, reviewed_at, flashcards!inner(topics!inner(name))")
        .eq("user_id", uid)
        .gte("reviewed_at", since90Events);
      if (insErr) throw insErr;

      type InsightRow = { rating: string; reviewed_at: string; flashcards: { topics: { name: string } } | null };
      const insightEvents = ((insightRows ?? []) as unknown as InsightRow[]).map((r) => ({
        rating: r.rating,
        reviewed_at: r.reviewed_at,
        topic_name: r.flashcards?.topics?.name ?? null,
      }));

      // Fetch mode-specific stats
      const [cardReviewsRes, practicalAnswersRes, mcqAnswersRes] = await Promise.all([
        supabase
          .from("card_reviews")
          .select("last_rating")
          .eq("user_id", uid),
        supabase
          .from("practical_answers")
          .select("is_correct")
          .eq("user_id", uid),
        supabase
          .from("mcq_answers")
          .select("is_correct")
          .eq("user_id", uid),
      ]);

      if (cardReviewsRes.error) throw cardReviewsRes.error;
      if (practicalAnswersRes.error) throw practicalAnswersRes.error;
      if (mcqAnswersRes.error) throw mcqAnswersRes.error;

      // Calculate mode stats
      const cardReviews = cardReviewsRes.data ?? [];
      const practicalAnswers = practicalAnswersRes.data ?? [];
      const mcqAnswers = mcqAnswersRes.data ?? [];

      const flashcardTotal = cardReviews.length;
      const flashcardCorrect = cardReviews.filter(r => r.last_rating === 'good' || r.last_rating === 'easy').length;
      const flashcardAccuracy = flashcardTotal > 0 ? Math.round((flashcardCorrect / flashcardTotal) * 100) : 0;

      const practicalTotal = practicalAnswers.length;
      const practicalCorrect = practicalAnswers.filter(a => a.is_correct).length;
      const practicalAccuracy = practicalTotal > 0 ? Math.round((practicalCorrect / practicalTotal) * 100) : 0;

      const mcqTotal = mcqAnswers.length;
      const mcqCorrect = mcqAnswers.filter(a => a.is_correct).length;
      const mcqAccuracy = mcqTotal > 0 ? Math.round((mcqCorrect / mcqTotal) * 100) : 0;

      return {
        activity: activity ?? [],
        topics: topics ?? [],
        events: events ?? [],
        insightEvents,
        modeStats: {
          flashcards: { total: flashcardTotal, accuracy: flashcardAccuracy },
          practical: { total: practicalTotal, accuracy: practicalAccuracy },
          mcq: { total: mcqTotal, accuracy: mcqAccuracy },
        },
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

  // Filter trend data to only show up to the last date with actual data
  const filteredTrend = useMemo(() => {
    // Find the last index where accuracy is not null
    let lastDataIndex = -1;
    for (let i = trend.length - 1; i >= 0; i--) {
      if (trend[i].accuracy !== null) {
        lastDataIndex = i;
        break;
      }
    }
    // If no data at all, return empty array
    if (lastDataIndex === -1) return [];
    // Return data up to and including the last data point
    return trend.slice(0, lastDataIndex + 1);
  }, [trend]);

  function heatColor(count: number) {
    if (count === 0) return "bg-muted/20";
    const ratio = count / maxDay;
    if (ratio > 0.75) return "bg-primary";
    if (ratio > 0.5) return "bg-primary/75";
    if (ratio > 0.25) return "bg-primary/50";
    return "bg-primary/30";
  }

  function accColor(acc: number) {
    if (acc >= 80) return "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300";
    if (acc >= 60) return "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300";
    return "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300";
  }

  function barColor(acc: number) {
    if (acc >= 80) return "bg-emerald-500";
    if (acc >= 60) return "bg-amber-500";
    return "bg-rose-500";
  }

  function textColor(acc: number) {
    if (acc >= 80) return "text-emerald-600 dark:text-emerald-400";
    if (acc >= 60) return "text-amber-600 dark:text-amber-400";
    return "text-rose-600 dark:text-rose-400";
  }

  function notStartedBadge() {
    return "bg-muted/50 text-muted-foreground";
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
            {/* 1. By Study Mode */}
            <div className="card-surface p-5">
              <h2 className="font-semibold text-foreground">By Study Mode</h2>
              <div className="mt-4 space-y-3">
                <div className="flex items-center justify-between rounded-xl bg-muted/60 px-3 py-2">
                  <span className="flex items-center gap-2 text-sm text-foreground"><Layers aria-hidden className="h-4 w-4 text-muted-foreground" />Flashcards</span>
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-muted-foreground">{data?.modeStats.flashcards.total} reviews</span>
                    {data?.modeStats.flashcards.total === 0 ? (
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${notStartedBadge()}`}>
                        Not started
                      </span>
                    ) : (
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${accColor(data?.modeStats.flashcards.accuracy ?? 0)}`}>
                        {data?.modeStats.flashcards.accuracy}%
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center justify-between rounded-xl bg-muted/60 px-3 py-2">
                  <span className="flex items-center gap-2 text-sm text-foreground"><Bone aria-hidden className="h-4 w-4 text-muted-foreground" />Practical Mode</span>
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-muted-foreground">{data?.modeStats.practical.total} answers</span>
                    {data?.modeStats.practical.total === 0 ? (
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${notStartedBadge()}`}>
                        Not started
                      </span>
                    ) : (
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${accColor(data?.modeStats.practical.accuracy ?? 0)}`}>
                        {data?.modeStats.practical.accuracy}%
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center justify-between rounded-xl bg-muted/60 px-3 py-2">
                  <span className="flex items-center gap-2 text-sm text-foreground"><ListChecks aria-hidden className="h-4 w-4 text-muted-foreground" />Clinical MCQs</span>
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-muted-foreground">{data?.modeStats.mcq.total} answers</span>
                    {data?.modeStats.mcq.total === 0 ? (
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${notStartedBadge()}`}>
                        Not started
                      </span>
                    ) : (
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${accColor(data?.modeStats.mcq.accuracy ?? 0)}`}>
                        {data?.modeStats.mcq.accuracy}%
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* 2. Study Activity Heatmap */}
            <div className="card-surface p-5">
              <h2 className="font-semibold text-foreground">Study Activity — Last 30 Days</h2>
              <div className="mt-4 grid grid-cols-[repeat(30,minmax(0,1fr))] gap-1.5 overflow-x-auto">
                {heatmapDays.map((d) => (
                  <div
                    key={d.date}
                    title={`${d.count} cards on ${d.date}`}
                    className={`aspect-square rounded-md ${heatColor(d.count)}`}
                  />
                ))}
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                Darker squares mean more cards studied that day.
              </p>
            </div>

            {/* 3. Topic Mastery */}
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
                        <span className={`font-semibold ${textColor(t.accuracy_percentage)}`}>
                          {t.accuracy_percentage}%
                        </span>
                      </div>
                      <div className="h-2 rounded-full bg-muted/40 overflow-hidden">
                        <div
                          className={`h-full ${barColor(t.accuracy_percentage)} rounded-full`}
                          style={{ width: `${t.accuracy_percentage}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* 4. Accuracy Trend */}
            <div className="card-surface p-5">
              <h2 className="font-semibold text-foreground">Accuracy Trend — Last 30 Days</h2>
              <div className="mt-4 h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={filteredTrend}>
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

            {/* 5. Study Insights */}
            <StudyInsights
              events={data?.insightEvents ?? []}
              activity={data?.activity ?? []}
            />
          </>
        )}
      </main>
    </div>
  );
}
