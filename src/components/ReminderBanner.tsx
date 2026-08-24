import { useState } from "react";
import { Link } from "@tanstack/react-router";

type Props = {
  currentStreak: number;
  cardsStudiedToday: number;
  dailyGoal: number;
  lastStudyDate: string | null;
  cardsDue: number;
};

function daysSince(dateStr: string): number {
  const then = new Date(`${dateStr}T00:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((today.getTime() - then.getTime()) / 86400000);
}

/** Returns the highest-priority reminder message, or null when nothing applies. */
export function pickReminder({
  currentStreak,
  cardsStudiedToday,
  dailyGoal,
  lastStudyDate,
  cardsDue,
}: Props): { id: string; message: string } | null {
  const hour = new Date().getHours();

  if (currentStreak > 0 && cardsStudiedToday === 0 && hour >= 20) {
    return { id: "streak-risk", message: `Don't lose your ${currentStreak}-day streak — study today!` };
  }
    // (removed: cards-due reminder no longer applies across mixed study modes)
  if (lastStudyDate) {
    const away = daysSince(lastStudyDate);
    if (away >= 2) {
      return { id: "away", message: `You haven't studied in ${away} days — jump back in!` };
    }
  }
    if (cardsStudiedToday > 0 && cardsStudiedToday < dailyGoal) {
    const left = dailyGoal - cardsStudiedToday;
    return { id: "goal", message: `${left} more item${left === 1 ? "" : "s"} to hit today's goal.` };
  }
  return null;
}

const DISMISS_KEY = "aa-reminder-dismissed";

export function ReminderBanner(props: Props) {
  const reminder = pickReminder(props);
  const [dismissed, setDismissed] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    try {
      return window.sessionStorage.getItem(DISMISS_KEY);
    } catch {
      return null;
    }
  });

  if (!reminder || dismissed === reminder.id) return null;

  return (
    <div
      role="status"
      className="mt-6 card-surface p-4 flex items-center gap-3 border-l-4 border-l-primary bg-primary/5"
    >
      <span aria-hidden className="text-xl">🔔</span>
      <p className="flex-1 text-sm font-medium text-foreground">{reminder.message}</p>
      <Link to="/study" className="btn-primary text-sm shrink-0" style={{ minHeight: 40 }}>
        Study now
      </Link>
      <button
        type="button"
        aria-label="Dismiss reminder"
        className="shrink-0 rounded-full p-2 text-muted-foreground hover:text-foreground hover:bg-muted/60 transition"
        onClick={() => {
          setDismissed(reminder.id);
          try {
            window.sessionStorage.setItem(DISMISS_KEY, reminder.id);
          } catch {
            /* ignore */
          }
        }}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
          <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  );
}
