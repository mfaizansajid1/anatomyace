import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const badgeNames: Record<string, string> = {
  first_session: "First Steps",
  streak_7: "7-Day Streak",
  century_100: "Century Club",
  perfectionist_10: "Perfectionist",
};

export async function checkCelebrations(
  prevBadges: Set<string>,
  goalCelebrated: boolean,
  setGoalCelebrated: (v: boolean) => void,
  setPrevBadges: (v: Set<string>) => void
) {
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) return;
  const uid = u.user.id;
  const today = new Date().toISOString().slice(0, 10);

  const { data: stats } = await supabase
    .from("user_stats")
    .select("flashcards_daily_goal, practical_daily_goal, mcq_daily_goal")
    .eq("user_id", uid)
    .maybeSingle();

  const { data: activity } = await supabase
    .from("study_activity")
    .select("cards_studied")
    .eq("user_id", uid)
    .eq("study_date", today);

  const totalToday = (activity ?? []).reduce((sum, a) => sum + a.cards_studied, 0);
  const totalGoal =
    (stats?.flashcards_daily_goal ?? 0) +
    (stats?.practical_daily_goal ?? 0) +
    (stats?.mcq_daily_goal ?? 0);

  if (stats && !goalCelebrated && totalToday >= totalGoal && totalGoal > 0) {
    toast.success(`🎉 Daily goal complete! You've studied ${totalToday} items today.`);
    setGoalCelebrated(true);
  }

  const { data: badges } = await supabase
    .from("user_achievements")
    .select("badge_id")
    .eq("user_id", uid);

  const newBadges = (badges ?? []).filter((b) => !prevBadges.has(b.badge_id));
  newBadges.forEach((b) => {
    toast.success(`🏆 Achievement unlocked: ${badgeNames[b.badge_id] ?? b.badge_id}!`);
  });
  if (newBadges.length > 0) {
    setPrevBadges(new Set((badges ?? []).map((b) => b.badge_id)));
  }
}
