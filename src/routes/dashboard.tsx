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
import { ReminderBanner } from "@/components/ReminderBanner";

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
  flashcards_daily_goal: number;
  practical_daily_goal: number;
  mcq_daily_goal: number;
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

type TopicPerf = {
  category_id: string;
  category_name: string;
  topic_name: string;
  accuracy: number;
  reviews: number;
  sources: string[];
};

type GroupedTopicPerf = { topic_name: string; items: TopicPerf[] };

type ActivityRow = { study_date: string; study_type: string; cards_studied: number };

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
      const todayStr = new Date().toISOString().slice(0, 10);

      const [reviewsRes, activityRes, profileRes, xpRes, achRes, practicalRes, mcqRes] = await Promise.all([
        supabase
          .from("card_reviews")
          .select("last_rating, flashcards!inner(subtopic_id, subtopics!inner(id, name, categories!inner(name, topics!inner(name))))")
          .eq("user_id", uid),
        supabase.from("study_activity").select("study_date,study_type,cards_studied").eq("user_id", uid).gte("study_date", sinceStr).order("study_date"),
        supabase.from("users").select("profile_photo_url,full_name").eq("id", uid).maybeSingle(),
        supabase.from("user_xp").select("total_xp, level").eq("user_id", uid).maybeSingle(),
        supabase.from("user_achievements").select("badge_id, earned_at").eq("user_id", uid),
        supabase
          .from("practical_answers")
          .select("is_correct, categories!inner(id, name, topics!inner(name))")
          .eq("user_id", uid),
        supabase
          .from("mcq_answers")
          .select("is_correct, categories!inner(id, name, topics!inner(name))")
          .eq("user_id", uid),
      ]);
      if (reviewsRes.error) throw reviewsRes.error;
      if (activityRes.error) throw activityRes.error;
      if (practicalRes.error) throw practicalRes.error;
      if (mcqRes.error) throw mcqRes.error;

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

      // Aggregate topics from practical and MCQ answers
      const topicMap = new Map<string, TopicPerf & { good: number }>();
      
      type PracticalRow = {
        is_correct: boolean;
        categories: { id: string; name: string; topics: { name: string } };
      };
      
      for (const r of (practicalRes.data ?? []) as unknown as PracticalRow[]) {
        const cat = r.categories;
        if (!cat) continue;
        const key = cat.id;
        const cur = topicMap.get(key) ?? {
          category_id: cat.id,
          category_name: cat.name,
          topic_name: cat.topics.name,
          accuracy: 0,
          reviews: 0,
          sources: [],
          good: 0,
        };
        cur.reviews += 1;
        if (r.is_correct) cur.good += 1;
        if (!cur.sources.includes('practical')) cur.sources.push('practical');
        topicMap.set(key, cur);
      }

      type McqRow = {
        is_correct: boolean;
        categories: { id: string; name: string; topics: { name: string } };
      };
      
      for (const r of (mcqRes.data ?? []) as unknown as McqRow[]) {
        const cat = r.categories;
        if (!cat) continue;
        const key = cat.id;
        const cur = topicMap.get(key) ?? {
          category_id: cat.id,
          category_name: cat.name,
          topic_name: cat.topics.name,
          accuracy: 0,
          reviews: 0,
          sources: [],
          good: 0,
        };
        cur.reviews += 1;
        if (r.is_correct) cur.good += 1;
        if (!cur.sources.includes('mcq')) cur.sources.push('mcq');
        topicMap.set(key, cur);
      }

      const topics: TopicPerf[] = Array.from(topicMap.values()).map((t) => ({
        category_id: t.category_id,
        category_name: t.category_name,
        topic_name: t.topic_name,
        reviews: t.reviews,
        accuracy: Math.round((t.good / t.reviews) * 100),
        sources: t.sources,
      }));

      return {
        stats,
        subtopics,
        topics,
        activity: (activityRes.data ?? []) as ActivityRow[],
        profile: profileRes.data as { profile_photo_url: string | null; full_name: string | null } | null,
        xp: (xpRes.data as { total_xp: number; level: number } | null) ?? { total_xp: 0, level: 1 },
        earnedBadges: new Set(((achRes.data ?? []) as { badge_id: string }[]).map((a) => a.badge_id)),
      };
    },
  });

  const updateGoals = useMutation({
    mutationFn: async (goals: { flashcards: number; practical: number; mcq: number }) => {
      const { error } = await supabase
        .from("user_stats")
        .update({
          flashcards_daily_goal: goals.flashcards,
          practical_daily_goal: goals.practical,
          mcq_daily_goal: goals.mcq,
        })
        .eq("user_id", user!.id);
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

  const { weakTopicGroups, strongTopicGroups } = useMemo(() => {
    const topics = data?.topics ?? [];
    const qualified = topics.filter((t) => t.reviews >= MIN_REVIEWS);
    const group = (list: TopicPerf[]): GroupedTopicPerf[] => {
      const m = new Map<string, TopicPerf[]>();
      for (const t of list) {
        const arr = m.get(t.topic_name) ?? [];
        arr.push(t);
        m.set(t.topic_name, arr);
      }
      return Array.from(m.entries())
        .map(([topic_name, items]) => ({
          topic_name,
          items: items.sort((a, b) => a.accuracy - b.accuracy),
        }))
        .sort((a, b) => a.topic_name.localeCompare(b.topic_name));
    };
    const weak = qualified.filter((t) => t.accuracy < WEAK_THRESHOLD);
    const strong = qualified.filter((t) => t.accuracy >= STRONG_THRESHOLD);
    return {
      weakTopicGroups: group(weak),
      strongTopicGroups: group(strong).map((g) => ({
        ...g,
        items: [...g.items].sort((a, b) => b.accuracy - a.accuracy),
      })),
    };
  }, [data?.topics]);

  const todayStr = new Date().toISOString().slice(0, 10);
  const todayActivity = (data?.activity ?? []).filter(a => a.study_date === todayStr);
  
  const todayFlashcards = todayActivity.filter(a => a.study_type === 'flashcard').reduce((sum, a) => sum + a.cards_studied, 0);
  const todayPractical = todayActivity.filter(a => a.study_type === 'practical').reduce((sum, a) => sum + a.cards_studied, 0);
  const todayMcq = todayActivity.filter(a => a.study_type === 'mcq').reduce((sum, a) => sum + a.cards_studied, 0);
  
  const totalToday = todayFlashcards + todayPractical + todayMcq;
  const totalGoal = (stats?.flashcards_daily_goal ?? 0) + (stats?.practical_daily_goal ?? 0) + (stats?.mcq_daily_goal ?? 0);

  const weekly = useMemo(() => {
    const map = new Map<string, number>();
    (data?.activity ?? []).forEach((a) => {
      map.set(a.study_date, (map.get(a.study_date) ?? 0) + a.cards_studied);
    });
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
            <Link to="/study" className="btn-outline flex items-center px-3" style={{ minHeight: 40 }}>
              Study
            </Link>
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
                  to="/study"
                  onClick={closeMenu}
                  className="px-3 py-2 rounded-md text-foreground hover:bg-muted transition font-medium text-sm"
                >
                  Study
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
        {/* Header with Greeting and XP */}
        <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-foreground">
              {greeting()}{displayName ? `, ${displayName.split(" ")[0]}` : ""}
            </h1>
            <p className="mt-1 text-muted-foreground">Here's your study snapshot for today.</p>
          </div>
          {data?.xp && (
            <div className="flex items-center gap-2 bg-primary/10 text-primary rounded-full px-4 py-2">
              <span aria-hidden className="text-lg">⭐</span>
              <span className="font-semibold">Level {data.xp.level}</span>
              <span className="text-muted-foreground">|</span>
              <span className="font-medium">{data.xp.total_xp} XP</span>
            </div>
          )}
        </div>

        {stats && (
          <ReminderBanner
            currentStreak={stats.current_streak}
            cardsStudiedToday={totalToday}
            dailyGoal={totalGoal}
            lastStudyDate={stats.last_study_date}
            cardsDue={0}
          />
        )}

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
          <>
            {/* HERO SECTION - Today's Study Progress */}
            <div className="mt-6 bg-card-surface rounded-2xl p-6 sm:p-8">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-lg font-semibold text-foreground">Today's Study Progress</h2>
                <button
                  onClick={() => setGoalOpen(true)}
                  className="text-sm text-primary hover:text-primary/80 transition"
                  aria-label="Edit today's goals"
                >
                  Edit goals
                </button>
              </div>
              
              <div className="flex flex-col lg:flex-row gap-8 items-center">
                {/* Circular Progress */}
                <div className="relative flex-shrink-0">
                  <ProgressRing value={totalToday} max={totalGoal} size={140} stroke={12} />
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-3xl font-bold text-foreground">{totalToday}</span>
                    <span className="text-sm text-muted-foreground">of {totalGoal}</span>
                  </div>
                </div>
                
                {/* Category Progress */}
                <div className="flex-1 w-full space-y-4">
                  <div>
                    <div className="flex justify-between mb-2">
                      <span className="text-sm font-medium text-foreground">Flashcards</span>
                      <span className="text-sm text-muted-foreground">{todayFlashcards}/{stats.flashcards_daily_goal}</span>
                    </div>
                    <div className="w-full bg-muted rounded-full h-2">
                      <div 
                        className="bg-primary rounded-full h-2 transition-all"
                        style={{ width: `${Math.min(100, (todayFlashcards / Math.max(1, stats.flashcards_daily_goal)) * 100)}%` }}
                      />
                    </div>
                  </div>
                  
                  <div>
                    <div className="flex justify-between mb-2">
                      <span className="text-sm font-medium text-foreground">Practical</span>
                      <span className="text-sm text-muted-foreground">{todayPractical}/{stats.practical_daily_goal}</span>
                    </div>
                    <div className="w-full bg-muted rounded-full h-2">
                      <div 
                        className="bg-primary rounded-full h-2 transition-all"
                        style={{ width: `${Math.min(100, (todayPractical / Math.max(1, stats.practical_daily_goal)) * 100)}%` }}
                      />
                    </div>
                  </div>
                  
                  <div>
                    <div className="flex justify-between mb-2">
                      <span className="text-sm font-medium text-foreground">MCQs</span>
                      <span className="text-sm text-muted-foreground">{todayMcq}/{stats.mcq_daily_goal}</span>
                    </div>
                    <div className="w-full bg-muted rounded-full h-2">
                      <div 
                        className="bg-primary rounded-full h-2 transition-all"
                        style={{ width: `${Math.min(100, (todayMcq / Math.max(1, stats.mcq_daily_goal)) * 100)}%` }}
                      />
                    </div>
                  </div>
                </div>
              </div>
              
              {/* Primary CTA */}
              <div className="mt-6 flex justify-center">
                <Link to="/study" className="btn-primary inline-flex items-center gap-2 px-6 py-3 text-base font-semibold">
                  {stats.last_topic_studied ? (
                    <>
                      <span>Continue Studying</span>
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                      </svg>
                    </>
                  ) : (
                    <>
                      <span>Start Studying</span>
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                      </svg>
                    </>
                  )}
                </Link>
              </div>
            </div>

            {/* COMPACT METRICS GRID */}
            <div className="mt-6 grid gap-4 grid-cols-2 lg:grid-cols-4">
              <div className="card-surface p-4">
                <div className="flex items-center gap-3">
                  <span className="text-2xl" aria-hidden>🔥</span>
                  <div>
                    <p className="text-2xl font-bold text-foreground">{stats.current_streak}</p>
                    <p className="text-xs text-muted-foreground">Day Streak</p>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground mt-2">Longest: {stats.longest_streak} days</p>
              </div>
              
              <div className="card-surface p-4">
                <div className="flex items-center gap-3">
                  <span className="text-2xl" aria-hidden>📚</span>
                  <div>
                    <p className="text-2xl font-bold text-foreground">{stats.cards_studied_total}</p>
                    <p className="text-xs text-muted-foreground">Flashcards Studied</p>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground mt-2">{stats.cards_studied_this_week} this week</p>
              </div>
              
              <div className="card-surface p-4">
                <div className="flex items-center gap-3">
                  <span className="text-2xl" aria-hidden>🦴</span>
                  <div>
                    <p className="text-2xl font-bold text-foreground">
                      {data.topics.filter(t => t.sources.includes('practical')).reduce((sum, t) => sum + t.reviews, 0)}
                    </p>
                    <p className="text-xs text-muted-foreground">Practical Completed</p>
                  </div>
                </div>
              </div>
              
              <div className="card-surface p-4">
                <div className="flex items-center gap-3">
                  <span className="text-2xl" aria-hidden>✅</span>
                  <div>
                    <p className="text-2xl font-bold text-foreground">
                      {data.topics.filter(t => t.sources.includes('mcq')).reduce((sum, t) => sum + t.reviews, 0)}
                    </p>
                    <p className="text-xs text-muted-foreground">MCQs Completed</p>
                  </div>
                </div>
              </div>
            </div>

            {/* MAIN ACTION AREA - Weak Subtopics & Continue Studying */}
            <div className="mt-6 grid gap-6 lg:grid-cols-2">
              {/* Weak Subtopics */}
              <div className="card-surface p-5">
                <h2 className="font-semibold text-foreground mb-4">Weak Subtopics</h2>
                {weakGroups.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No weak spots — nice work!</p>
                ) : (
                  <div className="space-y-4">
                    {weakGroups.map((g) => (
                      <div key={g.topic_name}>
                        <h3 className="text-sm font-semibold text-muted-foreground mb-2">{g.topic_name}</h3>
                        <div className="space-y-2">
                          {g.items.slice(0, 3).map((s) => (
                            <div key={s.subtopic_id} className="flex items-center gap-3">
                              <span className="text-sm text-foreground flex-1">
                                {s.subtopic_name}
                                <span className="text-muted-foreground text-xs ml-1">({s.category_name})</span>
                              </span>
                              <div className="w-24 bg-muted rounded-full h-2">
                                <div 
                                  className="bg-rose-400 rounded-full h-2"
                                  style={{ width: `${s.accuracy}%` }}
                                />
                              </div>
                              <span className="text-xs font-semibold text-rose-600 w-10 text-right">{s.accuracy}%</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              
              {/* Continue Studying */}
              <div className="card-surface p-5 flex flex-col justify-between">
                <div>
                  <h2 className="font-semibold text-foreground mb-4">Continue Studying</h2>
                  {stats.last_topic_studied ? (
                    <>
                      <p className="text-lg font-semibold text-foreground">{stats.last_topic_studied}</p>
                      <p className="text-sm text-muted-foreground mt-2">Pick up where you left off.</p>
                    </>
                  ) : (
                    <p className="text-sm text-muted-foreground">Start a session to see your last topic here.</p>
                  )}
                </div>
                <Link to="/study" className="btn-primary mt-4 w-full justify-center">
                  {stats.last_topic_studied ? "Resume" : "Start"}
                </Link>
              </div>
            </div>

            {/* STRONG SUBTOPICS */}
            {strongGroups.length > 0 && (
              <div className="mt-6 card-surface p-5">
                <h2 className="font-semibold text-foreground mb-4">Strong Subtopics</h2>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {strongGroups.map((g) => (
                    <div key={g.topic_name}>
                      <h3 className="text-sm font-semibold text-muted-foreground mb-2">{g.topic_name}</h3>
                      <div className="space-y-2">
                        {g.items.slice(0, 3).map((s) => (
                          <div key={s.subtopic_id} className="flex items-center gap-3">
                            <span className="text-sm text-foreground flex-1">
                              {s.subtopic_name}
                              <span className="text-muted-foreground text-xs ml-1">({s.category_name})</span>
                            </span>
                            <div className="w-20 bg-muted rounded-full h-2">
                              <div 
                                className="bg-emerald-400 rounded-full h-2"
                                style={{ width: `${s.accuracy}%` }}
                              />
                            </div>
                            <span className="text-xs font-semibold text-emerald-600 w-10 text-right">{s.accuracy}%</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* EXAM COUNTDOWN & DAILY FACT */}
            <div className="mt-6 grid gap-6 lg:grid-cols-2">
              <ExamCountdownCard
                settings={{ exam_name: stats.exam_name ?? null, exam_date: stats.exam_date ?? null }}
                pending={updateExam.isPending}
                onSave={(s) => updateExam.mutate(s)}
              />
              <DailyFactCard />
            </div>

            {/* WEEKLY PROGRESS */}
            <div className="mt-6 card-surface p-5">
              <div className="flex items-center justify-between mb-6">
                <h2 className="font-semibold text-foreground">Weekly Progress</h2>
                <span className="text-xs text-muted-foreground">Last 7 days</span>
              </div>
                            <div className="flex items-stretch justify-between gap-3 h-48">
                {weekly.map((w) => {
                  const pct = (w.count / weeklyMax) * 100;
                  const isToday = w.date === new Date().toISOString().slice(0, 10);
                  return (
                    <div key={w.date} className="flex-1 flex flex-col items-center gap-2">
                      <span className={`text-xs font-medium ${isToday ? 'text-primary' : 'text-muted-foreground'}`}>
                        {w.count}
                      </span>
                      <div className="w-full flex-1 flex items-end">
                        <div
                          className={`w-full rounded-t-lg transition-all ${
                            isToday ? "bg-primary" : "bg-muted hover:bg-primary/60"
                          }`}
                          style={{ height: `${Math.max(pct, 4)}%` }}
                          aria-label={`${w.count} items on ${w.date}`}
                        />
                      </div>
                      <span className={`text-xs ${isToday ? 'font-semibold text-primary' : 'text-muted-foreground'}`}>
                        {w.label}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* ACHIEVEMENTS */}
            <div className="mt-6 card-surface p-5">
              <h2 className="font-semibold text-foreground mb-4">Achievements</h2>
              <Achievements earned={data.earnedBadges} />
            </div>
          </>
        )}
      </section>

      {goalOpen && stats && (
        <GoalDialog
          initial={{
            flashcards: stats.flashcards_daily_goal,
            practical: stats.practical_daily_goal,
            mcq: stats.mcq_daily_goal,
          }}
          pending={updateGoals.isPending}
          onClose={() => setGoalOpen(false)}
          onSave={async (goals) => {
            await updateGoals.mutateAsync(goals);
            setGoalOpen(false);
          }}
        />
      )}
    </main>
  );
}

function ProgressRing({ value, max, size = 72, stroke = 8 }: { value: number; max: number; size?: number; stroke?: number }) {
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
        className="transition-all duration-300"
      />
    </svg>
  );
}

function GoalDialog({
  initial, pending, onClose, onSave,
}: { 
  initial: { flashcards: number; practical: number; mcq: number }; 
  pending: boolean; 
  onClose: () => void; 
  onSave: (goals: { flashcards: number; practical: number; mcq: number }) => void;
}) {
  const [flashcards, setFlashcards] = useState(String(initial.flashcards));
  const [practical, setPractical] = useState(String(initial.practical));
  const [mcq, setMcq] = useState(String(initial.mcq));
  
  const nFlashcards = Number(flashcards);
  const nPractical = Number(practical);
  const nMcq = Number(mcq);
  
  const valid = Number.isFinite(nFlashcards) && nFlashcards >= 1 && nFlashcards <= 500 &&
                Number.isFinite(nPractical) && nPractical >= 1 && nPractical <= 500 &&
                Number.isFinite(nMcq) && nMcq >= 1 && nMcq <= 500;
                
  return (
    <div role="dialog" aria-modal="true" aria-label="Edit daily goals"
      className="fixed inset-0 z-50 grid place-items-center bg-black/40 px-4"
      onClick={onClose}
    >
      <div className="card-surface p-6 w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-semibold text-foreground">Daily Goals</h3>
        <p className="text-sm text-muted-foreground mt-1">Set your daily goals for each study mode.</p>
        
        <div className="mt-4 space-y-3">
          <div>
            <label className="text-sm font-medium text-foreground">🗂️ Flashcards</label>
            <input
              type="number" min={1} max={500}
              value={flashcards} onChange={(e) => setFlashcards(e.target.value)}
              className="input-field mt-1"
              aria-label="Flashcards daily goal"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-foreground">🦴 Practical Mode</label>
            <input
              type="number" min={1} max={500}
              value={practical} onChange={(e) => setPractical(e.target.value)}
              className="input-field mt-1"
              aria-label="Practical mode daily goal"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-foreground">✅ Clinical MCQs</label>
            <input
              type="number" min={1} max={500}
              value={mcq} onChange={(e) => setMcq(e.target.value)}
              className="input-field mt-1"
              aria-label="MCQ daily goal"
            />
          </div>
        </div>
        
        <div className="mt-6 flex justify-end gap-2">
          <button onClick={onClose} className="btn-outline" style={{ minHeight: 44 }}>Cancel</button>
          <button
            onClick={() => valid && onSave({ flashcards: nFlashcards, practical: nPractical, mcq: nMcq })}
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
