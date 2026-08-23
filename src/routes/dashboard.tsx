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
import { 
  Target, 
  Lock, 
  Trophy, 
  BookOpen, 
  Bone, 
  CheckCircle2, 
  Flame, 
  TrendingUp, 
  Award,
  Zap,
  ChevronRight,
  Menu,
  X,
  Settings
} from "lucide-react";

// Design tokens using CSS variables for consistency
const designTokens = `
  :root {
    --primary: #009688;
    --primary-hover: #00796b;
    --primary-light: #e0f2f1;
    --primary-dark: #004d40;
    --bg-primary: #f8fafc;
    --bg-secondary: #ffffff;
    --bg-tertiary: #f1f5f9;
    --text-primary: #0f172a;
    --text-secondary: #475569;
    --text-tertiary: #94a3b8;
    --border-primary: #e2e8f0;
    --border-secondary: #f1f5f9;
  }
  
  .dark {
    --bg-primary: #0f172a;
    --bg-secondary: #1e293b;
    --bg-tertiary: #334155;
    --text-primary: #f8fafc;
    --text-secondary: #cbd5e1;
    --text-tertiary: #64748b;
    --border-primary: #334155;
    --border-secondary: #1e293b;
    --primary-light: rgba(0, 150, 136, 0.15);
  }
`;

// Inject design tokens
if (typeof document !== 'undefined') {
  const styleSheet = document.createElement("style");
  styleSheet.textContent = designTokens;
  document.head.appendChild(styleSheet);
}

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

// Type definitions remain the same...

function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800 ${className}`} />;
}

function Dashboard() {
  // Existing state and logic remains the same...
  
  return (
    <main className="min-h-screen bg-slate-50 dark:bg-slate-950 transition-colors duration-200">
      {/* HEADER - Full dark mode support */}
      <header className="border-b border-slate-200 dark:border-slate-800 sticky top-0 bg-white/95 dark:bg-slate-900/95 backdrop-blur z-50 transition-colors duration-200">
        <div ref={headerRef} className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 relative">
          
          {/* LOGO & BRANDING */}
          <Link to="/dashboard" onClick={closeMenu} className="flex items-center gap-3">
            <Logo size={32} />
            <span className="font-semibold text-slate-900 dark:text-slate-100">AnatomyAce</span>
          </Link>

          {/* DESKTOP HEADER */}
          <div className="hidden md:flex items-center gap-6">
            <nav className="flex items-center gap-6">
              <Link to="/study" className="text-slate-600 dark:text-slate-300 hover:text-teal-600 dark:hover:text-teal-400 text-sm font-medium transition-colors">
                Study
              </Link>
              <Link to="/bookmarks" className="text-slate-600 dark:text-slate-300 hover:text-teal-600 dark:hover:text-teal-400 text-sm font-medium transition-colors">
                Bookmarks
              </Link>
              <Link to="/progress" className="text-slate-600 dark:text-slate-300 hover:text-teal-600 dark:hover:text-teal-400 text-sm font-medium transition-colors">
                Progress
              </Link>
              <Link to="/planner" className="text-slate-600 dark:text-slate-300 hover:text-teal-600 dark:hover:text-teal-400 text-sm font-medium transition-colors">
                Revision Planner
              </Link>
            </nav>
            
            <div className="flex items-center gap-3">
              <ThemeToggle />
              <Link 
                to="/profile" 
                className="flex items-center gap-2 rounded-full border border-slate-200 dark:border-slate-700 pl-2 pr-3 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-800 transition" 
                aria-label="Open profile"
              >
                {photo ? (
                  <img src={photo} alt="Your profile" className="h-8 w-8 rounded-full object-cover" />
                ) : (
                  <span aria-hidden className="h-8 w-8 rounded-full bg-teal-600 text-white grid place-items-center text-sm font-semibold">
                    {initials(displayName, user?.email ?? null)}
                  </span>
                )}
                <span className="text-sm text-slate-700 dark:text-slate-300">Profile</span>
              </Link>
              <button 
                onClick={onLogout} 
                className="px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white border border-slate-200 dark:border-slate-700 rounded-full hover:bg-slate-50 dark:hover:bg-slate-800 transition"
              >
                Log out
              </button>
            </div>
          </div>

          {/* MOBILE HAMBURGER BUTTON */}
          <div className="flex md:hidden items-center">
            <button
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="p-2 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition focus:outline-none"
              aria-label="Toggle navigation menu"
              aria-expanded={isMobileMenuOpen}
            >
              {isMobileMenuOpen ? (
                <X className="w-6 h-6" />
              ) : (
                <Menu className="w-6 h-6" />
              )}
            </button>
          </div>

          {/* MOBILE DROPDOWN MENU */}
          {isMobileMenuOpen && (
            <div className="absolute top-full left-0 right-0 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 shadow-lg md:hidden z-50">
              <nav className="flex flex-col p-4 space-y-1">
                <Link
                  to="/dashboard"
                  onClick={closeMenu}
                  className="px-3 py-2 text-slate-600 dark:text-slate-300 hover:text-teal-600 dark:hover:text-teal-400 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg transition font-medium text-sm"
                >
                  Dashboard
                </Link>
                {/* Other mobile nav links with same dark mode classes */}
                
                <div className="border-t border-slate-200 dark:border-slate-700 my-2 pt-2 flex items-center justify-between px-3">
                  <span className="text-slate-700 dark:text-slate-300 font-medium text-sm">Theme</span>
                  <ThemeToggle />
                </div>

                <Link
                  to="/profile"
                  onClick={closeMenu}
                  className="flex items-center gap-3 px-3 py-2 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg transition font-medium text-sm"
                >
                  {photo ? (
                    <img src={photo} alt="Your profile" className="h-7 w-7 rounded-full object-cover" />
                  ) : (
                    <span aria-hidden className="h-7 w-7 rounded-full bg-teal-600 text-white grid place-items-center text-xs font-semibold">
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
                  className="w-full text-left px-3 py-2 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition font-medium text-sm"
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
            <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-slate-100">
              {greeting()}{displayName ? `, ${displayName.split(" ")[0]}` : ""}
            </h1>
            <p className="mt-1 text-slate-600 dark:text-slate-400">Here's your study snapshot for today.</p>
          </div>
          {data?.xp && (
            <div className="flex items-center gap-2 bg-teal-50 dark:bg-teal-900/30 text-teal-700 dark:text-teal-300 rounded-full px-4 py-2 border border-teal-100 dark:border-teal-800">
              <Zap className="w-5 h-5" />
              <span className="font-semibold">Level {data.xp.level}</span>
              <span className="text-slate-400 dark:text-slate-500">|</span>
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
          <div className="mt-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm p-6 text-center">
            <p className="text-slate-900 dark:text-slate-100 font-medium">Couldn't load your dashboard.</p>
            <button onClick={() => dashboardQuery.refetch()} className="mt-4 px-6 py-2.5 bg-teal-600 text-white rounded-xl hover:bg-teal-700 transition font-medium">
              Tap to retry
            </button>
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
            <div className="mt-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm p-6 sm:p-8 transition-colors duration-200">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Today's Study Progress</h2>
                <button
                  onClick={() => setGoalOpen(true)}
                  className="text-sm text-teal-600 dark:text-teal-400 hover:text-teal-700 dark:hover:text-teal-300 transition flex items-center gap-1"
                  aria-label="Edit today's goals"
                >
                  <Settings className="w-4 h-4" />
                  Edit goals
                </button>
              </div>
              
              <div className="flex flex-col lg:flex-row gap-8 items-center">
                {/* Circular Progress */}
                <div className="relative flex-shrink-0">
                  <ProgressRing value={totalToday} max={totalGoal} size={140} stroke={12} />
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-3xl font-bold text-slate-900 dark:text-slate-100">{totalToday}</span>
                    <span className="text-sm text-slate-600 dark:text-slate-400">of {totalGoal}</span>
                  </div>
                </div>
                
                {/* Category Progress */}
                <div className="flex-1 w-full space-y-4">
                  <div>
                    <div className="flex justify-between mb-2">
                      <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Flashcards</span>
                      <span className="text-sm text-slate-600 dark:text-slate-400">{todayFlashcards}/{stats.flashcards_daily_goal}</span>
                    </div>
                    <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-2.5">
                      <div 
                        className="bg-teal-600 dark:bg-teal-500 rounded-full h-2.5 transition-all duration-300"
                        style={{ width: `${Math.min(100, (todayFlashcards / Math.max(1, stats.flashcards_daily_goal)) * 100)}%` }}
                      />
                    </div>
                  </div>
                  
                  {/* Other progress bars with same styling */}
                </div>
              </div>
              
              {/* Primary CTA */}
              <div className="mt-6 flex justify-center">
                <Link to="/study" className="inline-flex items-center gap-2 px-6 py-3 bg-teal-600 text-white rounded-xl hover:bg-teal-700 transition text-base font-semibold shadow-sm dark:shadow-teal-900/20">
                  {stats.last_topic_studied ? (
                    <>
                      <span>Continue Studying</span>
                      <ChevronRight className="w-5 h-5" />
                    </>
                  ) : (
                    <>
                      <span>Start Studying</span>
                      <ChevronRight className="w-5 h-5" />
                    </>
                  )}
                </Link>
              </div>
            </div>

            {/* COMPACT METRICS GRID */}
            <div className="mt-6 grid gap-4 grid-cols-2 lg:grid-cols-4">
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm p-4 transition-colors duration-200 hover:shadow-md">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-orange-50 dark:bg-orange-900/30 rounded-lg">
                    <Flame className="w-6 h-6 text-orange-600 dark:text-orange-400" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-slate-900 dark:text-slate-100">{stats.current_streak}</p>
                    <p className="text-xs text-slate-600 dark:text-slate-400">Day Streak</p>
                  </div>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">Longest: {stats.longest_streak} days</p>
              </div>
              
              {/* Other metric cards with same dark mode styling */}
            </div>

            {/* MAIN ACTION AREA - Weak Subtopics & Continue Studying */}
            <div className="mt-6 grid gap-6 lg:grid-cols-2">
              {/* Weak Subtopics */}
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm p-5 transition-colors duration-200">
                <h2 className="font-semibold text-slate-900 dark:text-slate-100 mb-4 flex items-center gap-2">
                  <TrendingUp className="w-5 h-5 text-rose-500 dark:text-rose-400" />
                  Weak Subtopics
                </h2>
                {weakGroups.length === 0 ? (
                  <p className="text-sm text-slate-600 dark:text-slate-400">No weak spots — nice work!</p>
                ) : (
                  <div className="space-y-4">
                    {weakGroups.map((g) => (
                      <div key={g.topic_name}>
                        <h3 className="text-sm font-semibold text-slate-600 dark:text-slate-300 mb-2">{g.topic_name}</h3>
                        <div className="space-y-2">
                          {g.items.slice(0, 3).map((s) => (
                            <div key={s.subtopic_id} className="flex items-center gap-3">
                              <span className="text-sm text-slate-800 dark:text-slate-200 flex-1">
                                {s.subtopic_name}
                                <span className="text-slate-500 dark:text-slate-400 text-xs ml-1">({s.category_name})</span>
                              </span>
                              <div className="w-24 bg-slate-100 dark:bg-slate-800 rounded-full h-2">
                                <div 
                                  className="bg-rose-500 rounded-full h-2"
                                  style={{ width: `${s.accuracy}%` }}
                                />
                              </div>
                              <span className="text-xs font-semibold text-rose-600 dark:text-rose-400 w-10 text-right">{s.accuracy}%</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              
              {/* Continue Studying */}
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm p-5 flex flex-col justify-between transition-colors duration-200">
                <div>
                  <h2 className="font-semibold text-slate-900 dark:text-slate-100 mb-4 flex items-center gap-2">
                    <Target className="w-5 h-5 text-teal-600 dark:text-teal-400" />
                    Continue Studying
                  </h2>
                  {stats.last_topic_studied ? (
                    <>
                      <p className="text-lg font-semibold text-slate-900 dark:text-slate-100">{stats.last_topic_studied}</p>
                      <p className="text-sm text-slate-600 dark:text-slate-400 mt-2">Pick up where you left off.</p>
                    </>
                  ) : (
                    <p className="text-sm text-slate-600 dark:text-slate-400">Start a session to see your last topic here.</p>
                  )}
                </div>
                <Link to="/study" className="mt-4 w-full inline-flex justify-center items-center px-4 py-3 bg-teal-600 text-white rounded-xl hover:bg-teal-700 transition font-medium">
                  {stats.last_topic_studied ? "Resume" : "Start"}
                </Link>
              </div>
            </div>

            {/* STRONG SUBTOPICS */}
            {strongGroups.length > 0 && (
              <div className="mt-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm p-5 transition-colors duration-200">
                <h2 className="font-semibold text-slate-900 dark:text-slate-100 mb-4 flex items-center gap-2">
                  <Award className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                  Strong Subtopics
                </h2>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {strongGroups.map((g) => (
                    <div key={g.topic_name}>
                      <h3 className="text-sm font-semibold text-slate-600 dark:text-slate-300 mb-2">{g.topic_name}</h3>
                      <div className="space-y-2">
                        {g.items.slice(0, 3).map((s) => (
                          <div key={s.subtopic_id} className="flex items-center gap-3">
                            <span className="text-sm text-slate-800 dark:text-slate-200 flex-1">
                              {s.subtopic_name}
                              <span className="text-slate-500 dark:text-slate-400 text-xs ml-1">({s.category_name})</span>
                            </span>
                            <div className="w-20 bg-slate-100 dark:bg-slate-800 rounded-full h-2">
                              <div 
                                className="bg-emerald-500 rounded-full h-2"
                                style={{ width: `${s.accuracy}%` }}
                              />
                            </div>
                            <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 w-10 text-right">{s.accuracy}%</span>
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

            {/* WEEKLY PROGRESS - REDESIGNED */}
            <div className="mt-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm p-5 transition-colors duration-200">
              <div className="flex items-center justify-between mb-6">
                <h2 className="font-semibold text-slate-900 dark:text-slate-100">Weekly Progress</h2>
                <span className="text-xs text-slate-500 dark:text-slate-400">Last 7 days</span>
              </div>
              
              <div className="flex items-end justify-between gap-3 sm:gap-4">
                {weekly.map((w) => {
                  const pct = (w.count / weeklyMax) * 100;
                  const isToday = w.date === new Date().toISOString().slice(0, 10);
                  
                  return (
                    <div key={w.date} className="flex-1 flex flex-col items-center gap-2">
                      {/* Number label */}
                      <span className={`text-xs font-semibold ${w.count > 0 ? 'text-slate-700 dark:text-slate-300' : 'text-slate-400 dark:text-slate-600'}`}>
                        {w.count}
                      </span>
                      
                      {/* Bar container */}
                      <div className="w-full h-36 sm:h-40 md:h-44 relative flex items-end justify-center">
                        {/* Background track - subtle for zero days */}
                        <div className={`absolute inset-x-0 bottom-0 top-0 rounded-t-lg ${
                          w.count > 0 
                            ? 'bg-slate-100 dark:bg-slate-800' 
                            : 'bg-slate-50 dark:bg-slate-800/50'
                        }`} />
                        
                        {/* Fill bar */}
                        <div
                          className={`relative w-3/4 max-w-[48px] rounded-t-lg transition-all duration-300 ${
                            isToday 
                              ? 'bg-teal-600 dark:bg-teal-500' 
                              : 'bg-teal-500 dark:bg-teal-400'
                          }`}
                          style={{ 
                            height: w.count > 0 ? `${Math.max(pct, 4)}%` : '0%',
                            minHeight: w.count > 0 ? '4px' : '0'
                          }}
                          aria-label={`${w.count} items on ${w.date}`}
                        />
                      </div>
                      
                      {/* Day label */}
                      <span className={`text-xs font-medium pb-1 ${
                        isToday 
                          ? 'text-teal-600 dark:text-teal-400 font-bold border-b-2 border-teal-600 dark:border-teal-400' 
                          : 'text-slate-600 dark:text-slate-400'
                      }`}>
                        {w.label}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* ACHIEVEMENTS */}
            <div className="mt-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm p-5 transition-colors duration-200">
              <h2 className="font-semibold text-slate-900 dark:text-slate-100 mb-4 flex items-center gap-2">
                <Trophy className="w-5 h-5 text-amber-600 dark:text-amber-400" />
                Achievements
              </h2>
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
      <circle 
        cx={size / 2} 
        cy={size / 2} 
        r={r} 
        stroke="currentColor" 
        strokeWidth={stroke} 
        fill="none" 
        className="text-slate-200 dark:text-slate-700"
      />
      <circle
        cx={size / 2} 
        cy={size / 2} 
        r={r}
        stroke="#009688" 
        strokeWidth={stroke} 
        fill="none"
        strokeLinecap="round" 
        strokeDasharray={c} 
        strokeDashoffset={offset}
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
      className="fixed inset-0 z-50 grid place-items-center bg-slate-900/50 dark:bg-black/70 backdrop-blur-sm px-4"
      onClick={onClose}
    >
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-lg p-6 w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Daily Goals</h3>
        <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">Set your daily goals for each study mode.</p>
        
        <div className="mt-4 space-y-3">
          <div>
            <label className="text-sm font-medium text-slate-700 dark:text-slate-300 flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-teal-600 dark:text-teal-400" />
              Flashcards
            </label>
            <input
              type="number" min={1} max={500}
              value={flashcards} onChange={(e) => setFlashcards(e.target.value)}
              className="mt-1 w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-slate-100 bg-white dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-500 dark:focus:ring-teal-400 focus:border-transparent transition-colors"
              aria-label="Flashcards daily goal"
            />
          </div>
          {/* Other input fields with same styling */}
        </div>
        
        <div className="mt-6 flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white border border-slate-200 dark:border-slate-700 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 transition font-medium">
            Cancel
          </button>
          <button
            onClick={() => valid && onSave({ flashcards: nFlashcards, practical: nPractical, mcq: nMcq })}
            disabled={!valid || pending}
            className="px-4 py-2 bg-teal-600 text-white rounded-xl hover:bg-teal-700 transition font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {pending ? <Spinner className="h-4 w-4" /> : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
