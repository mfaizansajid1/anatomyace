import { Crosshair, Flame, GraduationCap, Lock, Medal, Microscope, RotateCcw, Sparkles, Star, Target, Trophy, type LucideIcon } from "lucide-react";

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
  { id: "anatomist", label: "Anatomist", description: "100 correct Practical answers", Icon: Microscope },
  { id: "sharp_shooter", label: "Sharp Shooter", description: "100 correct MCQ answers", Icon: Crosshair },
  { id: "all_rounder", label: "All-Rounder", description: "Flashcards, Practical & MCQs in one day", Icon: Sparkles },
  { id: "exam_ready", label: "Exam Ready", description: "Complete 5 Test Mode sessions", Icon: GraduationCap },
  { id: "ace", label: "Ace", description: "Score 100% on a Test", Icon: Trophy },
  { id: "comeback_kid", label: "Comeback Kid", description: "Return after a 7+ day break", Icon: RotateCcw },
];

export function Achievements({ earned }: { earned: Set<string> }) {
  return (
    <div className="mt-4 grid grid-cols-2 sm:grid-cols-5 gap-3">
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
