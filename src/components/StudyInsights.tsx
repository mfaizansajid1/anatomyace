import { useMemo } from "react";

export type InsightEvent = { rating: string; reviewed_at: string; topic_name: string | null };
export type InsightActivity = { study_date: string; cards_studied: number };

const MIN_EVENTS_FOR_TIME = 20;
const MIN_REVIEWS_PER_TOPIC = 10;
const MIN_EVENTS_FOR_TREND = 14;
const MIN_ACTIVE_DAYS = 5;

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function isGood(rating: string) {
  return rating === "good" || rating === "easy";
}

function hourLabel(h: number) {
  const suffix = h < 12 ? "AM" : "PM";
  const base = h % 12 === 0 ? 12 : h % 12;
  return `${base} ${suffix}`;
}

function buildInsights(events: InsightEvent[], activity: InsightActivity[]): string[] {
  const out: string[] = [];

  // 1. Strongest vs weakest topic
  const byTopic = new Map<string, { good: number; total: number }>();
  for (const e of events) {
    if (!e.topic_name) continue;
    const cur = byTopic.get(e.topic_name) ?? { good: 0, total: 0 };
    cur.total += 1;
    if (isGood(e.rating)) cur.good += 1;
    byTopic.set(e.topic_name, cur);
  }
  const eligibleTopics = Array.from(byTopic.entries())
    .filter(([, v]) => v.total >= MIN_REVIEWS_PER_TOPIC)
    .map(([name, v]) => ({ name, acc: Math.round((v.good / v.total) * 100) }))
    .sort((a, b) => b.acc - a.acc);
  if (eligibleTopics.length >= 2) {
    const best = eligibleTopics[0];
    const worst = eligibleTopics[eligibleTopics.length - 1];
    if (best.name !== worst.name) {
      out.push(`You're strongest with ${best.name} (${best.acc}%) and weakest with ${worst.name} (${worst.acc}%).`);
    }
  }

  // 2. Best study time (by hour bucket)
  if (events.length >= MIN_EVENTS_FOR_TIME) {
    const byHour = new Map<number, { good: number; total: number }>();
    for (const e of events) {
      const h = new Date(e.reviewed_at).getHours();
      const cur = byHour.get(h) ?? { good: 0, total: 0 };
      cur.total += 1;
      if (isGood(e.rating)) cur.good += 1;
      byHour.set(h, cur);
    }
    const ranked = Array.from(byHour.entries())
      .filter(([, v]) => v.total >= 10)
      .map(([h, v]) => ({ h, acc: v.good / v.total }))
      .sort((a, b) => b.acc - a.acc);
    if (ranked.length > 0) {
      const h = ranked[0].h;
      out.push(`You tend to score highest when studying between ${hourLabel(h)}–${hourLabel((h + 1) % 24)}.`);
    }
  }

  // 3. Consistency pattern by weekday
  const activeDays = activity.filter((a) => a.cards_studied > 0);
  if (activeDays.length >= MIN_ACTIVE_DAYS) {
    const totals = new Array(7).fill(0) as number[];
    for (const a of activity) {
      const d = new Date(`${a.study_date}T00:00:00`).getDay();
      totals[d] += a.cards_studied;
    }
    const order = totals.map((v, i) => ({ i, v })).sort((a, b) => b.v - a.v);
    const bestDays = order.slice(0, 2).map((o) => DAY_NAMES[o.i]);
    const gapDay = DAY_NAMES[order[order.length - 1].i];
    out.push(`You study most consistently on ${bestDays.join(" and ")} — ${gapDay} tends to be your gap day.`);
  }

  // 4. Improvement trend over the last 30 days
  const cutoff = Date.now() - 30 * 86400000;
  const mid = Date.now() - 15 * 86400000;
  const recent = events.filter((e) => new Date(e.reviewed_at).getTime() >= cutoff);
  if (recent.length >= MIN_EVENTS_FOR_TREND) {
    const first = recent.filter((e) => new Date(e.reviewed_at).getTime() < mid);
    const second = recent.filter((e) => new Date(e.reviewed_at).getTime() >= mid);
    if (first.length >= 10 && second.length >= 10) {
      const a = Math.round((first.filter((e) => isGood(e.rating)).length / first.length) * 100);
      const b = Math.round((second.filter((e) => isGood(e.rating)).length / second.length) * 100);
      if (a !== b) {
        out.push(
          b > a
            ? `Your accuracy has improved from ${a}% to ${b}% over the last 30 days.`
            : `Your accuracy has slipped from ${a}% to ${b}% over the last 30 days — worth a refresher.`,
        );
      }
    }
  }

  return out.slice(0, 4);
}

export function StudyInsights({
  events,
  activity,
}: {
  events: InsightEvent[];
  activity: InsightActivity[];
}) {
  const insights = useMemo(() => buildInsights(events, activity), [events, activity]);

  return (
    <div className="card-surface p-5">
      <h2 className="font-semibold text-foreground">Your Study Insights</h2>
      {insights.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">
          Keep studying — your personal insights will appear here once you've reviewed a few more cards.
        </p>
      ) : (
        <ul className="mt-4 space-y-3">
          {insights.map((text) => (
            <li key={text} className="flex gap-3 rounded-xl bg-primary/5 p-3">
              <span aria-hidden className="text-base">💡</span>
              <span className="text-sm text-foreground">{text}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
