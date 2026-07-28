type Badge = {
  id: string;
  label: string;
  description: string;
  icon: string;
};

const BADGES: Badge[] = [
  { id: "first_session", label: "First Steps", description: "Complete your first study session", icon: "🎯" },
  { id: "streak_7", label: "7-Day Streak", description: "Study 7 days in a row", icon: "🔥" },
  { id: "century_100", label: "Century Club", description: "Study 100 cards total", icon: "💯" },
  { id: "perfectionist_10", label: "Perfectionist", description: "10 correct in a row", icon: "⭐" },
];

export function Achievements({ earned }: { earned: Set<string> }) {
  return (
    <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
      {BADGES.map((badge) => {
        const isEarned = earned.has(badge.id);
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
            <div className="text-2xl" aria-hidden="true">
              {isEarned ? badge.icon : "🔒"}
            </div>
            <div className="mt-1 text-xs font-medium text-foreground">
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
