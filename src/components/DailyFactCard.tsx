import { useMemo, useState } from "react";
import { Lightbulb } from "lucide-react";
import { getDailyFact } from "@/lib/anatomy-facts";

export function DailyFactCard() {
  const fact = useMemo(() => getDailyFact(), []);
  const [expanded, setExpanded] = useState(false);
  const isLong = fact.fact.length > 110;

  return (
    <div className="card-surface p-5 flex flex-col">
      <div className="flex items-center gap-2">
        <Lightbulb aria-hidden className="h-5 w-5 text-primary" />
        <h2 className="font-semibold text-foreground">Daily Anatomy Fact</h2>
      </div>

      <p className={`mt-4 text-foreground ${!expanded && isLong ? "line-clamp-3" : ""}`}>
        “{fact.fact}”
      </p>

      <p className="mt-3 text-xs uppercase tracking-wide text-muted-foreground">Topic</p>
      <p className="text-sm text-foreground">{fact.topic}</p>

      {isLong && (
        <button
          onClick={() => setExpanded((v) => !v)}
          className="btn-outline mt-4 self-start"
          aria-expanded={expanded}
        >
          {expanded ? "Show Less" : "Read More"}
        </button>
      )}
    </div>
  );
}
