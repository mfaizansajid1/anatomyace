import { Flame, Lock, Medal, Star, Target, type LucideIcon } from "lucide-react";

type Badge = {
  id: string;
  label: string;
  description: string;
  Icon: LucideIcon;
};

const BADGES: Badge[] = [
  { id: "first_session", label: "First Steps", description: "Complete your first study session", Icon: Target },
  { id: "streak_7", label: "7-Day Streak", description: "Study 7 days in a row", Icon: Flame },
  { id: "century_100", label: "Century Club", description: "Study 100 cards total", Icon: Medal },
  { id: "perfectionist_10", label: "Perfectionist", description: "10 correct in a row", Icon: Star },
];

export function Achievements({ earned }: { earned: Set<string> }) {
  return (
    <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
      {BADGES.map((badge) => {
        const isEarned = earned.has(badge.id);
        const Icon = isEarned ? badge.Icon : Lock;
        return (
          <div
            key={badge.id}
            className={`rounded-xl border p-3 text-center transition-colors ${
              isEarned
                ? "border-primary/40 bg-primary/5"
                : "border-border bg-muted/30 opacity-60"
            }`}
            title={badge.description}
          >
            <Icon
              aria-hidden
              className={`mx-auto h-6 w-6 ${isEarned ? "text-primary" : "text-muted-foreground"}`}
            />
            <div className="mt-1.5 text-xs font-medium text-foreground">
              {badge.label}
            </div>
            <div className="mt-0.5 text-[11px] text-muted-foreground">
              {badge.description}
            </div>
          </div>
        );
      })}
    </div>
  );
}
