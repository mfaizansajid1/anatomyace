import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Logo } from "@/components/Logo";
import { Spinner } from "@/components/Spinner";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Achievements } from "@/components/Achievements";
import { ExamCountdownCard } from "@/components/ExamCountdownCard";
import { DailyFactCard } from "@/components/DailyFactCard";


export const Route = createFileRoute("/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — AnatomyAce" },
      { name: "description", content: "Your AnatomyAce study dashboard." },
      { property: "og:title", content: "Dashboard — AnatomyAce" },
      { property: "og:description", content: "Your AnatomyAce study dashboard." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Dashboard,
});

type UserStats = {
  user_id: string;
  daily_goal: number;
  cards_studied_today: number;
  cards_studied_total: number;
  cards_studied_this_week: number;
  current_streak: number;
  longest_streak: number;
  last_study_date: string | null;
  last_topic_studied: string | null;
  exam_name: string | null;
  exam_date: string | null;
};


type SubtopicPerf = {
  subtopic_id: string;
  subtopic_name: string;
  category_name: string;
  topic_name: string;
  accuracy: number;
  reviews: number;
};

type GroupedPerf = { topic_name: string; items: SubtopicPerf[] };

type ActivityRow = { study_date: string; cards_studied: number };

const WEAK_THRESHOLD = 60;
const STRONG_THRESHOLD = 80;
const MIN_REVIEWS = 3;

type SessionUser = { id: string; email: string | null; fullName: string | null; photo: string | null };

function greeting() {
  const h = new Date().getHours();
  if (h < 3) return "Good night";
  if (h < 12) return "Good morning";
  if (h < 14) return "Good noon";
  if (h < 18) return "Good afternoon";
  return "Good night";
}

function initials(name: string | null, email: string | null) {
  const src = (name || email || "?").trim();
  const parts = src.split(/\s+/);
  const letters = parts.length >= 2 ? parts[0][0] + parts[1][0] : src.slice(0, 2);
  return letters.toUpperCase();
}

function accColor(acc: number) {
  if (acc >= 80) return "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300";
  if (acc >= 65) return "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300";
  return "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300";
}

function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-2xl bg-muted ${className}`} />;
}

function Dashboard() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [user, setUser] = useState<SessionUser | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [goalOpen, setGoalOpen] = useState(false);

  // Mobile navigation state and click-outside ref
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const headerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!active) return;
      if (!data.user) {
        navigate({ to: "/login" });
        return;
      }
      const meta = (data.user.user_metadata ?? {}) as { full_name?: string; name?: string; avatar_url?: string };
      setUser({
        id: data.user.id,
        email: data.user.email ?? null,
        fullName: meta.full_name ?? meta.name ?? null,
        photo: meta.avatar_url ?? null,
      });
      setAuthChecked(true);
    })();
    return () => { active = false; };
  }, [navigate]);

  // Click outside listener for mobile menu
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (headerRef.current && !headerRef.current.contains(event.target as Node)) {
        setIsMobileMenuOpen(false);
      }
    };

    if (isMobileMenuOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isMobileMenuOpen]);

  const closeMenu = () => setIsMobileMenuOpen(false);

  const dashboardQuery = useQuery({
    enabled: !!user,
    queryKey: ["dashboard", user?.id],
    queryFn: async () => {
      const uid = user!.id;
      // ensure stats row
      const { data: statsRow } = await supabase
        .from("user_stats").select("*").eq("user_id", uid).maybeSingle();
      let stats = statsRow as UserStats | null;
      if (!stats) {
        const { data: inserted, error } = await supabase
          .from("user_stats").insert({ user_id: uid }).select("*").single();
        if (error) throw error;
        stats = inserted as UserStats;
      }

      const since = new Date();
      since.setDate(since.getDate() - 6);
      const sinceStr = since.toISOString().slice(0, 10);

      const [reviewsRes, activityRes, profileRes, dueRes, xpRes, achRes] = await Promise.all([
        supabase
          .from("card_reviews")
          .select("last_rating, flashcards!inner(subtopic_id, subtopics!inner(id, name, categories!inner(name, topics!inner(name))))")
          .eq("user_id", uid),
        supabase.from("study_activity").select("study_date,cards_studied").eq("user_id", uid).gte("study_date", sinceStr).order("study_date"),
        supabase.from("users").select("profile_photo_url,full_name").eq("id", uid).maybeSingle(),
        supabase.rpc("cards_due_count"),
        supabase.from("user_xp").select("total_xp, level").eq("user_id", uid).maybeSingle(),
        supabase.from("user_achievements").select("badge_id, earned_at").eq("user_id", uid),
      ]);
      if (reviewsRes.error) throw reviewsRes.error;
      if (activityRes.error) throw activityRes.error;

      // Aggregate per subtopic
      const map = new Map<string, SubtopicPerf & { good: number }>();
      type ReviewRow = {
        last_rating: string | null;
        flashcards: { subtopic_id: string; subtopics: { id: string; name: string; categories: { name: string; topics: { name: string } } } };
      };
      for (const r of (reviewsRes.data ?? []) as unknown as ReviewRow[]) {
        const sub = r.flashcards?.subtopics;
        if (!sub) continue;
        const key = sub.id;
        const cur = map.get(key) ?? {
          subtopic_id: sub.id,
          subtopic_name: sub.name,
          category_name: sub.categories.name,
          topic_name: sub.categories.topics.name,
          accuracy: 0,
          reviews: 0,
          good: 0,
        };
        cur.reviews += 1;
        if (r.last_rating === "good" || r.last_rating === "easy") cur.good += 1;
        map.set(key, cur);
      }
      const subtopics: SubtopicPerf[] = Array.from(map.values()).map((s) => ({
        subtopic_id: s.subtopic_id,
        subtopic_name: s.subtopic_name,
        category_name: s.category_name,
        topic_name: s.topic_name,
        reviews: s.reviews,
        accuracy: Math.round((s.good / s.reviews) * 100),
      }));

      return {
        stats,
        subtopics,
        activity: (activityRes.data ?? []) as ActivityRow[],
        profile: profileRes.data as { profile_photo_url: string | null; full_name: string | null } | null,
        cardsDue: (dueRes.data as number | null) ?? 0,
        xp: (xpRes.data as { total_xp: number; level: number } | null) ?? { total_xp: 0, level: 1 },
        earnedBadges: new Set(((achRes.data ?? []) as { badge_id: string }[]).map((a) => a.badge_id)),
      };
    },
  });

  const updateGoal = useMutation({
    mutationFn: async (goal: number) => {
      const { error } = await supabase.from("user_stats").update({ daily_goal: goal }).eq("user_id", user!.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["dashboard", user?.id] }),
  });

  const updateExam = useMutation({
    mutationFn: async (s: { exam_name: string; exam_date: string }) => {
      const { error } = await supabase
        .from("user_stats")
        .update({ exam_name: s.exam_name, exam_date: s.exam_date })
        .eq("user_id", user!.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["dashboard", user?.id] }),
  });


  async function onLogout() {
    await supabase.auth.signOut();
    navigate({ to: "/", replace: true });
  }

  const data = dashboardQuery.data;
  const stats = data?.stats;
  const photo = data?.profile?.profile_photo_url ?? user?.photo ?? null;
  const displayName = data?.profile?.full_name ?? user?.fullName ?? null;

  const { weakGroups, strongGroups } = useMemo(() => {
    const subs = data?.subtopics ?? [];
    const qualified = subs.filter((s) => s.reviews >= MIN_REVIEWS);
    const group = (list: SubtopicPerf[]): GroupedPerf[] => {
      const m = new Map<string, SubtopicPerf[]>();
      for (const s of list) {
        const arr = m.get(s.topic_name) ?? [];
        arr.push(s);
        m.set(s.topic_name, arr);
      }
      return Array.from(m.entries())
        .map(([topic_name, items]) => ({
          topic_name,
          items: items.sort((a, b) => a.accuracy - b.accuracy),
        }))
        .sort((a, b) => a.topic_name.localeCompare(b.topic_name));
    };
    const weak = qualified.filter((s) => s.accuracy < WEAK_THRESHOLD);
    const strong = qualified.filter((s) => s.accuracy >= STRONG_THRESHOLD);
    return {
      weakGroups: group(weak),
      strongGroups: group(strong).map((g) => ({
        ...g,
        items: [...g.items].sort((a, b) => b.accuracy - a.accuracy),
      })),
    };
  }, [data?.subtopics]);

  const cardsDue = data?.cardsDue ?? 0;

  const weekly = useMemo(() => {
    const map = new Map((data?.activity ?? []).map((a) => [a.study_date, a.cards_studied]));
    const out: { label: string; date: string; count: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      out.push({
        label: d.toLocaleDateString(undefined, { weekday: "short" }).slice(0, 2),
        date: key,
        count: map.get(key) ?? 0,
      });
    }
    return out;
  }, [data?.activity]);
  const weeklyMax = Math.max(1, ...weekly.map((w) => w.count));

  if (!authChecked) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-background">
        <Spinner className="h-6 w-6 text-primary" />
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-background">
      {/* HEADER */}
      <header className="border-b border-border sticky top-0 bg-background/85 backdrop-blur z-50">
        <div ref={headerRef} className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 relative">
          
          {/* LOGO & BRANDING */}
          <Link to="/dashboard" onClick={closeMenu} className="flex items-center gap-3">
            <Logo size={32} />
            <span className="font-semibold text-foreground">AnatomyAce</span>
          </Link>

          {/* DESKTOP HEADER (Hidden on mobile) */}
          <div className="hidden md:flex items-center gap-2">
            <Link to="/bookmarks" className="btn-outline flex items-center px-3" style={{ minHeight: 40 }}>
              Bookmarks
            </Link> 
            <Link to="/progress" className="btn-outline flex items-center px-3" style={{ minHeight: 40 }}>
              Progress
            </Link>
            <Link to="/planner" className="btn-outline flex items-center px-3" style={{ minHeight: 40 }}>
              Revision Planner
            </Link>
            <ThemeToggle />
            <Link 
              to="/profile" 
              className="flex items-center gap-2 rounded-full border border-border pl-2 pr-3 py-1 hover:bg-muted transition" 
              aria-label="Open profile"
            >
              {photo ? (
                <img src={photo} alt="Your profile" className="h-8 w-8 rounded-full object-cover" />
              ) : (
                <span aria-hidden className="h-8 w-8 rounded-full bg-primary text-primary-foreground grid place-items-center text-sm font-semibold">
                  {initials(displayName, user?.email ?? null)}
                </span>
              )}
              <span className="text-sm text-foreground">Profile</span>
            </Link>
            <button onClick={onLogout} className="btn-outline px-3" style={{ minHeight: 40 }}>
              Log out
            </button>
          </div>

          {/* MOBILE HAMBURGER BUTTON */}
          <div className="flex md:hidden items-center">
            <button
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="p-2 rounded-md border border-border text-foreground hover:bg-muted transition focus:outline-none"
              aria-label="Toggle navigation menu"
              aria-expanded={isMobileMenuOpen}
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                {isMobileMenuOpen ? (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16m-7 6h7" />
                )}
              </svg>
            </button>
          </div>

          {/* MOBILE DROPDOWN MENU */}
          {isMobileMenuOpen && (
            <div className="absolute top-full left-0 right-0 bg-background border-b border-border shadow-lg md:hidden z-50">
              <nav className="flex flex-col p-4 space-y-2">
                <Link
                  to="/dashboard"
                  onClick={closeMenu}
                  className="px-3 py-2 rounded-md text-foreground hover:bg-muted transition font-medium text-sm"
                >
                  Dashboard
                </Link>
                <Link
                  to="/bookmarks"
                  onClick={closeMenu}
                  className="px-3 py-2 rounded-md text-foreground hover:bg-muted transition font-medium text-sm"
                >
                  Bookmarks
                </Link>
                <Link
                  to="/progress"
                  onClick={closeMenu}
                  className="px-3 py-2 rounded-md text-foreground hover:bg-muted transition font-medium text-sm"
                >
                  Progress
                </Link>
                <Link
                  to="/planner"
                  onClick={closeMenu}
                  className="px-3 py-2 rounded-md text-foreground hover:bg-muted transition font-medium text-sm"
                >
                  Revision Planner
                </Link>

                <div className="border-t border-border my-2 pt-2 flex items-center justify-between px-3">
                  <span className="text-foreground font-medium text-sm">Theme</span>
                  <ThemeToggle />
                </div>

                <Link
                  to="/profile"
                  onClick={closeMenu}
                  className="flex items-center gap-3 px-3 py-2 rounded-md text-foreground hover:bg-muted transition font-medium text-sm"
                >
                  {photo ? (
                    <img src={photo} alt="Your profile" className="h-7 w-7 rounded-full object-cover" />
                  ) : (
                    <span aria-hidden className="h-7 w-7 rounded-full bg-primary text-primary-foreground grid place-items-center text-xs font-semibold">
                      {initials(displayName, user?.email ?? null)}
                    </span>
                  )}
                  <span>Profile</span>
                </Link>

                <button
                  onClick={() => {
                    closeMenu();
                    onLogout();
                  }}
                  className="w-full text-left px-3 py-2 rounded-md text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20 transition font-medium text-sm"
                >
                  Log out
                </button>
              </nav>
            </div>
          )}

        </div>
      </header>

      {/* DASHBOARD CONTENT */}
      <section className="mx-auto max-w-6xl px-4 py-8 sm:py-10">
        <div className="flex flex-wrap items-baseline gap-3">
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground">
            {greeting()}{displayName ? `, ${displayName.split(" ")[0]}` : ""} 👋
          </h1>
          {data?.xp && (
            <span className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-primary to-teal-500 text-white px-4 py-1.5 text-sm font-bold shadow-md">
              <span aria-hidden className="text-base">⭐</span>
              <span>Level {data.xp.level}</span>
              <span className="opacity-60">|</span>
              <span className="font-medium opacity-90">{data.xp.total_xp} XP</span>
            </span>
          )}
        </div>
        <p className="mt-1 text-muted-foreground">Here's your study snapshot for today.</p>

        {dashboardQuery.isError && (
          <div className="mt-6 card-surface p-6 text-center">
            <p className="text-foreground font-medium">Couldn't load your dashboard.</p>
            <button onClick={() => dashboardQuery.refetch()} className="btn-primary mt-4">Tap to retry</button>
          </div>
        )}

        {dashboardQuery.isLoading && (
          <div className="mt-6 grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-40" />)}
          </div>
        )}

        {stats && data && (
          <div className="mt-6 grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
            {/* Today's Goal */}
            <button
              onClick={() => setGoalOpen(true)}
              className="card-surface p-5 text-left hover:brightness-[1.02] transition"
              aria-label="Edit today's goal"
            >
              <div className="flex items-center justify-between">
                <h2 className="font-semibold text-foreground">Today's Goal</h2>
                <span className="text-xs text-muted-foreground">Tap to edit</span>
              </div>
              <div className="mt-4 flex items-center gap-4">
                <ProgressRing value={stats.cards_studied_today} max={stats.daily_goal} />
                <div>
                  <p className="text-2xl font-bold text-foreground">
                    {stats.cards_studied_today} <span className="text-muted-foreground text-base font-medium">/ {stats.daily_goal}</span>
                  </p>
                  <p className="text-sm text-muted-foreground">cards today</p>
                </div>
              </div>
            </button>

            {/* Cards Due */}
            <div className="card-surface p-5 flex flex-col">
              <h2 className="font-semibold text-foreground">Cards Due</h2>
              <p className="mt-4 text-4xl font-bold text-foreground">{cardsDue}</p>
              <p className="text-sm text-muted-foreground">ready for review</p>
              <Link to="/review" className="btn-primary mt-4 self-start">Start Review</Link>
            </div>

            {/* Streak */}
            <div className="card-surface p-5">
              <h2 className="font-semibold text-foreground">Study Streak</h2>
              <div className="mt-4 flex items-baseline gap-2">
                <span aria-hidden className="text-3xl">🔥</span>
                <p className="text-4xl font-bold text-foreground">{stats.current_streak}</p>
                <span className="text-muted-foreground">days</span>
              </div>
              <p className="text-sm text-muted-foreground mt-2">Longest: {stats.longest_streak} days</p>
            </div>

            {/* Cards Studied */}
            <div className="card-surface p-5">
              <h2 className="font-semibold text-foreground">Cards Studied</h2>
              <p className="mt-4 text-4xl font-bold text-foreground">{stats.cards_studied_total}</p>
              <p className="text-sm text-muted-foreground">all-time</p>
              <p className="mt-3 text-sm text-foreground">
                <span className="font-semibold">{stats.cards_studied_this_week}</span>{" "}
                <span className="text-muted-foreground">this week</span>
              </p>
            </div>

            {/* Weak / Strong */}
            <div className="card-surface p-5 sm:col-span-2">
              {(data.subtopics.length === 0) ? (
                <div className="text-center py-6">
                  <p className="font-semibold text-foreground">Ready to start your first study session?</p>
                  <p className="text-sm text-muted-foreground mt-1">Your weak and strong subtopics will appear here.</p>
                </div>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2">
                  <SubtopicGroups title="Weak Subtopics" groups={weakGroups} emptyText="No weak spots — nice!" />
                  <SubtopicGroups title="Strong Subtopics" groups={strongGroups} emptyText="Study more to see strengths." />
                </div>
              )}
            </div>

            {/* Exam Countdown */}
            <ExamCountdownCard
              settings={{ exam_name: stats.exam_name ?? null, exam_date: stats.exam_date ?? null }}
              pending={updateExam.isPending}
              onSave={(s) => updateExam.mutate(s)}
            />

            {/* Daily Anatomy Fact */}
            <DailyFactCard />



            {/* Continue Studying */}
            <div className="card-surface p-5">
              <h2 className="font-semibold text-foreground">Continue Studying</h2>
              {stats.last_topic_studied ? (
                <>
                  <p className="mt-3 text-foreground">{stats.last_topic_studied}</p>
                  <p className="text-sm text-muted-foreground">Pick up where you left off.</p>
                  <Link to="/review" className="btn-primary mt-4 self-start">Resume</Link>
                </>
              ) : (
                <p className="mt-3 text-sm text-muted-foreground">Start a session to see your last topic here.</p>
              )}
            </div>

            {/* Weekly chart */}
            <div className="card-surface p-5 sm:col-span-2 lg:col-span-3">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold text-foreground">Progress Overview</h2>
                <span className="text-xs text-muted-foreground">Last 7 days</span>
              </div>
              <div className="mt-6 flex items-stretch justify-between gap-2 h-40">
                {weekly.map((w) => {
                  const pct = (w.count / weeklyMax) * 100;
                  const isToday = w.date === new Date().toISOString().slice(0, 10);
                  return (
                    <div key={w.date} className="flex-1 flex flex-col items-center gap-2">
                      <span className="text-xs text-foreground font-medium">{w.count}</span>
                      <div className="w-full flex-1 flex items-end">
                        <div
                          className={`w-full rounded-t-lg transition-all ${isToday ? "bg-primary" : "bg-accent/60"}`}
                          style={{ height: `${Math.max(pct, 4)}%` }}
                          aria-label={`${w.count} cards on ${w.date}`}
                        />
                      </div>
                      <span className="text-xs text-muted-foreground">{w.label}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Achievements */}
            <div className="card-surface p-5 sm:col-span-2 lg:col-span-3">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold text-foreground">Achievements</h2>
              </div>
              <Achievements earned={data.earnedBadges} />
            </div>

          </div>
        )}
      </section>

      {goalOpen && stats && (
        <GoalDialog
          initial={stats.daily_goal}
          pending={updateGoal.isPending}
          onClose={() => setGoalOpen(false)}
          onSave={async (n) => {
            await updateGoal.mutateAsync(n);
            setGoalOpen(false);
          }}
        />
      )}
    </main>
  );
}

function SubtopicGroups({ title, groups, emptyText }: { title: string; groups: GroupedPerf[]; emptyText: string }) {
  return (
    <div>
      <h3 className="font-bold text-foreground text-lg">{title}</h3>
      {groups.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">{emptyText}</p>
      ) : (
        <div className="mt-3 space-y-4">
          {groups.map((g) => (
            <div key={g.topic_name}>
              <h4 className="text-sm font-semibold text-muted-foreground mb-2">{g.topic_name}</h4>
              <ul className="space-y-2">
                {g.items.map((s) => (
                  <li key={s.subtopic_id} className="flex items-center justify-between rounded-xl bg-muted/60 px-3 py-2">
                    <span className="text-sm text-foreground">
                      {s.subtopic_name}{" "}
                      <span className="text-muted-foreground">({s.category_name})</span>
                    </span>
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${accColor(s.accuracy)}`}>
                      {s.accuracy}%
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ProgressRing({ value, max }: { value: number; max: number }) {
  const size = 72;
  const stroke = 8;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.min(1, max > 0 ? value / max : 0);
  const offset = c * (1 - pct);
  return (
    <svg width={size} height={size} className="-rotate-90" aria-hidden>
      <circle cx={size / 2} cy={size / 2} r={r} stroke="var(--color-muted)" strokeWidth={stroke} fill="none" />
      <circle
        cx={size / 2} cy={size / 2} r={r}
        stroke="var(--color-primary)" strokeWidth={stroke} fill="none"
        strokeLinecap="round" strokeDasharray={c} strokeDashoffset={offset}
      />
    </svg>
  );
}

function GoalDialog({
  initial, pending, onClose, onSave,
}: { initial: number; pending: boolean; onClose: () => void; onSave: (n: number) => void }) {
  const [val, setVal] = useState(String(initial));
  const n = Number(val);
  const valid = Number.isFinite(n) && n >= 1 && n <= 500;
  return (
    <div role="dialog" aria-modal="true" aria-label="Edit daily goal"
      className="fixed inset-0 z-50 grid place-items-center bg-black/40 px-4"
      onClick={onClose}
    >
      <div className="card-surface p-6 w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-semibold text-foreground">Daily Goal</h3>
        <p className="text-sm text-muted-foreground mt-1">How many cards do you want to study per day?</p>
        <input
          autoFocus
          type="number" min={1} max={500}
          value={val} onChange={(e) => setVal(e.target.value)}
          className="input-field mt-4"
          aria-label="Daily card goal"
        />
        <div className="mt-6 flex justify-end gap-2">
          <button onClick={onClose} className="btn-outline" style={{ minHeight: 44 }}>Cancel</button>
          <button
            onClick={() => valid && onSave(n)}
            disabled={!valid || pending}
            className="btn-primary" style={{ minHeight: 44 }}
          >
            {pending ? <Spinner className="h-4 w-4" /> : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
