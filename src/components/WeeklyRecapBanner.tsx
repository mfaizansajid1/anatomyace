import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { CalendarDays, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { BADGES } from "@/components/Achievements";

function ymd(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Monday 00:00 (local) of the current week. */
export function thisMonday(now = new Date()) {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diff = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - diff);
  return d;
}

const RATING_XP: Record<string, number> = { again: 2, hard: 5, good: 10, easy: 10 };

export function WeeklyRecapBanner({ userId }: { userId: string }) {
  const end = thisMonday();
  const start = new Date(end);
  start.setDate(start.getDate() - 7);
  const key = `anatomyace_weekly_recap_${userId}_${ymd(end)}`;
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    setDismissed(localStorage.getItem(key) === "1");
  }, [key]);

  const q = useQuery({
    queryKey: ["weekly-recap", userId, ymd(end)],
    enabled: !dismissed,
    queryFn: async () => {
      const s = start.toISOString();
      const e = end.toISOString();
      const [act, ach, rev, mcq, prac] = await Promise.all([
        supabase.from("study_activity").select("study_date, cards_studied").eq("user_id", userId)
          .gte("study_date", ymd(start)).lt("study_date", ymd(end)),
        supabase.from("user_achievements").select("badge_id").eq("user_id", userId).gte("earned_at", s).lt("earned_at", e),
        supabase.from("review_events").select("rating").eq("user_id", userId).gte("reviewed_at", s).lt("reviewed_at", e),
        supabase.from("mcq_answers").select("is_correct").eq("user_id", userId).gte("answered_at", s).lt("answered_at", e),
        supabase.from("practical_answers").select("is_correct").eq("user_id", userId).gte("answered_at", s).lt("answered_at", e),
      ]);
      const rows = act.data ?? [];
      const items = rows.reduce((n, r) => n + r.cards_studied, 0);
      const days = new Set(rows.map((r) => r.study_date)).size;
      const xp =
        (rev.data ?? []).reduce((n, r) => n + (RATING_XP[r.rating] ?? 0), 0) +
        [...(mcq.data ?? []), ...(prac.data ?? [])].reduce((n, r) => n + (r.is_correct ? 10 : 2), 0);
      const badges = (ach.data ?? []).map((b) => BADGES.find((x) => x.id === b.badge_id)?.label ?? b.badge_id);
      return { items, days, xp, badges };
    },
  });

  if (dismissed || !q.data || q.data.items === 0) return null;
  const { items, days, xp, badges } = q.data;

  function close() {
    localStorage.setItem(key, "1");
    setDismissed(true);
  }

  return (
    <div className="mt-4 card-surface p-4 sm:p-5 border border-primary/20 bg-primary/5 flex flex-wrap items-center gap-4">
      <CalendarDays aria-hidden className="h-6 w-6 text-primary shrink-0" />
      <div className="flex-1 min-w-[220px]">
        <p className="font-semibold text-foreground">Last week's recap</p>
        <p className="text-sm text-muted-foreground">
          You studied <strong className="text-foreground">{items}</strong> items over{" "}
          <strong className="text-foreground">{days}</strong> {days === 1 ? "day" : "days"}, earned{" "}
          <strong className="text-foreground">{xp} XP</strong>
          {badges.length > 0 ? (
            <> and unlocked <strong className="text-foreground">{badges.join(", ")}</strong></>
          ) : null}
          . Keep the momentum going!
        </p>
      </div>
      <Link to="/study" className="btn-primary">Start Today's Session</Link>
      <button onClick={close} aria-label="Dismiss recap" className="p-2 rounded-full hover:bg-muted text-muted-foreground">
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
