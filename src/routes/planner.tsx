import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Logo } from "@/components/Logo";
import { Spinner } from "@/components/Spinner";
import { ThemeToggle } from "@/components/ThemeToggle";
import { toast } from "sonner";

export const Route = createFileRoute("/planner")({
  head: () => ({
    meta: [
      { title: "Revision Planner — AnatomyAce" },
      { name: "description", content: "Build a day-by-day anatomy revision plan." },
      { property: "og:title", content: "Revision Planner — AnatomyAce" },
      { property: "og:description", content: "Build a day-by-day anatomy revision plan." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: PlannerPage,
});

type SubtopicRow = {
  id: string;
  name: string;
  topic_id: string;
  category_id: string;
  topicName: string;
  categoryName: string;
};

type CategoryRow = {
  id: string;
  name: string;
  topic_id: string;
  topicName: string;
};

type StudyType = "flashcard" | "practical" | "mcq";

type DraftItem = {
  study_type: StudyType;
  subtopic_id: string;
  category_id: string;
  target_card_count: number;
};

type DraftDay = {
  day_number: number;
  plan_date: string;
  items: DraftItem[];
};

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}
function addDays(base: string, n: number) {
  const d = new Date(base + "T00:00:00");
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}
function daysBetween(a: string, b: string) {
  const ms = new Date(b + "T00:00:00").getTime() - new Date(a + "T00:00:00").getTime();
  return Math.round(ms / 86400000);
}
function prettyDate(d: string) {
  return new Date(d + "T00:00:00").toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

const studyTypeMeta: Record<StudyType, { icon: string; label: string }> = {
  flashcard: { icon: "🗂️", label: "Flashcards" },
  practical: { icon: "🦴", label: "Practical" },
  mcq: { icon: "✅", label: "MCQs" },
};

function createDefaultItem(): DraftItem {
  return {
    study_type: "flashcard",
    subtopic_id: "",
    category_id: "",
    target_card_count: 10,
  };
}

function PlannerPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [authChecked, setAuthChecked] = useState(false);
  const [signedIn, setSignedIn] = useState(false);

  const [lengthChoice, setLengthChoice] = useState<"7" | "15" | "30" | "custom">("7");
  const [examDate, setExamDate] = useState<string>("");
  const [mode, setMode] = useState<"auto" | "manual">("auto");
  const [draft, setDraft] = useState<DraftDay[] | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!data.user) {
        navigate({ to: "/login" });
        return;
      }
      setSignedIn(true);
      setAuthChecked(true);
    })();
  }, [navigate]);

  const totalDays = useMemo(() => {
    if (lengthChoice !== "custom") return parseInt(lengthChoice, 10);
    if (!examDate) return 0;
    return Math.max(1, daysBetween(todayStr(), examDate) + 1);
  }, [lengthChoice, examDate]);

  const subtopicsQ = useQuery({
    queryKey: ["planner", "subtopics"],
    enabled: signedIn,
    queryFn: async (): Promise<SubtopicRow[]> => {
      const { data, error } = await supabase
        .from("subtopics")
        .select("id, name, topic_id, category_id, topics(name), categories(name)")
        .order("display_order", { ascending: true });
      if (error) throw error;
      return (data ?? []).map((s: any) => ({
        id: s.id,
        name: s.name,
        topic_id: s.topic_id,
        category_id: s.category_id,
        topicName: s.topics?.name ?? "",
        categoryName: s.categories?.name ?? "",
      }));
    },
  });

  const categoriesQ = useQuery({
    queryKey: ["planner", "categories"],
    enabled: signedIn,
    queryFn: async (): Promise<CategoryRow[]> => {
      const { data, error } = await supabase
        .from("categories")
        .select("id, name, topic_id, topics(name)")
        .order("display_order", { ascending: true });
      if (error) throw error;
      return (data ?? []).map((c: any) => ({
        id: c.id,
        name: c.name,
        topic_id: c.topic_id,
        topicName: c.topics?.name ?? "",
      }));
    },
  });

  const flashcardAccuracyQ = useQuery({
    queryKey: ["planner", "flashcard-accuracy"],
    enabled: signedIn,
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      const uid = u.user?.id;
      if (!uid) return new Map<string, number>();
      const { data, error } = await supabase
        .from("card_reviews")
        .select("last_rating, flashcards!inner(subtopic_id)")
        .eq("user_id", uid);
      if (error) throw error;
      const agg = new Map<string, { good: number; total: number }>();
      (data ?? []).forEach((r: any) => {
        const sid = r.flashcards?.subtopic_id;
        if (!sid) return;
        const cur = agg.get(sid) ?? { good: 0, total: 0 };
        cur.total += 1;
        if (r.last_rating === "good" || r.last_rating === "easy") cur.good += 1;
        agg.set(sid, cur);
      });
      const out = new Map<string, number>();
      agg.forEach((v, k) => out.set(k, Math.round((v.good / v.total) * 100)));
      return out;
    },
  });

  const practicalCategoriesQ = useQuery({
    queryKey: ["planner", "practical-categories"],
    enabled: signedIn,
    queryFn: async (): Promise<Set<string>> => {
      const { data, error } = await supabase
        .from("practical_items")
        .select("category_id, is_published")
        .eq("is_published", true);
      if (error) throw error;
      const catIds = new Set<string>();
      (data ?? []).forEach((item: any) => {
        if (item.category_id) catIds.add(item.category_id);
      });
      return catIds;
    },
  });

  const mcqCategoriesQ = useQuery({
    queryKey: ["planner", "mcq-categories"],
    enabled: signedIn,
    queryFn: async (): Promise<Set<string>> => {
      const { data, error } = await supabase
        .from("clinical_mcqs")
        .select("category_id, is_published")
        .eq("is_published", true);
      if (error) throw error;
      const catIds = new Set<string>();
      (data ?? []).forEach((item: any) => {
        if (item.category_id) catIds.add(item.category_id);
      });
      return catIds;
    },
  });

  const planQ = useQuery({
    queryKey: ["planner", "plan"],
    enabled: signedIn,
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      const uid = u.user?.id;
      if (!uid) return null;
      const { data: plan, error } = await supabase
        .from("revision_plans")
        .select("id, plan_type, mode, start_date, end_date")
        .eq("user_id", uid)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      if (!plan) return null;
      const { data: days, error: dErr } = await supabase
        .from("revision_plan_days")
        .select("id, day_number, plan_date, study_type, subtopic_id, category_id, target_card_count, completed")
        .eq("plan_id", plan.id)
        .order("day_number", { ascending: true });
      if (dErr) throw dErr;
      return { plan, days: days ?? [] };
    },
  });

  const subtopics = subtopicsQ.data ?? [];
  const categories = categoriesQ.data ?? [];
  const subMap = useMemo(() => new Map(subtopics.map((s) => [s.id, s])), [subtopics]);
  const catMap = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);

  // ===== AUTO MODE GENERATION LOGIC =====
  // This section is structured so that if/when practical and MCQ accuracy tracking
  // becomes available, only the "pick weak areas" functions need to change.

  /**
   * Pick weak flashcard subtopics based on card_reviews accuracy.
   * Returns ordered list: weakest first, then unseen, then strong.
   */
  function pickWeakFlashcardSubtopics(acc: Map<string, number>): SubtopicRow[] {
    const scored = subtopics.map((s) => ({
      s,
      acc: acc.has(s.id) ? acc.get(s.id)! : null,
    }));
    const weak = scored.filter((x) => x.acc !== null && x.acc < 60).sort((a, b) => a.acc! - b.acc!);
    const unseen = scored.filter((x) => x.acc === null);
    const strong = scored.filter((x) => x.acc !== null && x.acc >= 60).sort((a, b) => a.acc! - b.acc!);
    return [...weak.map((x) => x.s), ...unseen.map((x) => x.s), ...strong.map((x) => x.s)];
  }

  /**
   * Pick practical categories evenly/round-robin.
   * Currently no accuracy tracking exists for practical mode, so this
   * returns all available categories in display order.
   * 
   * TODO: When practical accuracy tracking is available, replace this
   * with weakness-based ordering similar to pickWeakFlashcardSubtopics.
   */
  function pickPracticalCategories(practicalCatIds: Set<string>): CategoryRow[] {
    return categories.filter((c) => practicalCatIds.has(c.id));
  }

  /**
   * Pick MCQ categories evenly/round-robin.
   * Currently no accuracy tracking exists for MCQ mode, so this
   * returns all available categories in display order.
   * 
   * TODO: When MCQ accuracy tracking is available, replace this
   * with weakness-based ordering similar to pickWeakFlashcardSubtopics.
   */
  function pickMcqCategories(mcqCatIds: Set<string>): CategoryRow[] {
    return categories.filter((c) => mcqCatIds.has(c.id));
  }

  function generateAuto() {
    if (totalDays < 1) {
      toast.error("Pick a plan length first.");
      return;
    }
    if (subtopics.length === 0 && categories.length === 0) {
      toast.error("No study content available yet.");
      return;
    }

    const acc = flashcardAccuracyQ.data ?? new Map<string, number>();
    const practicalCatIds = practicalCategoriesQ.data ?? new Set<string>();
    const mcqCatIds = mcqCategoriesQ.data ?? new Set<string>();

    // Get weak-ordered lists for each type
    const flashcardSubtopics = pickWeakFlashcardSubtopics(acc);
    const practicalCats = pickPracticalCategories(practicalCatIds);
    const mcqCats = pickMcqCategories(mcqCatIds);

    // Build prioritized pool with weights
    // Flashcard subtopics: weight by weakness (weak appear twice)
    const flashcardPool: SubtopicRow[] = [
      ...flashcardSubtopics.filter((s) => acc.has(s.id) && acc.get(s.id)! < 60),
      ...flashcardSubtopics.filter((s) => acc.has(s.id) && acc.get(s.id)! < 60), // double weak
      ...flashcardSubtopics.filter((s) => !acc.has(s.id)),
      ...flashcardSubtopics.filter((s) => acc.has(s.id) && acc.get(s.id)! >= 60),
    ];

    const start = todayStr();
    const days: DraftDay[] = [];

    // Build a list of all study items to distribute
    const allItems: DraftItem[] = [];
    
    // Distribution: ~50% flashcards, 25% practical, 25% MCQ
    let flashcardIdx = 0;
    let practicalIdx = 0;
    let mcqIdx = 0;

    // Determine total number of items to create (aim for ~2 items per day)
    const totalItemsTarget = Math.min(
      totalDays * 2,
      flashcardPool.length + practicalCats.length + mcqCats.length
    );

    for (let i = 0; i < totalItemsTarget; i++) {
      const pattern = i % 4;
      if (pattern < 2 && flashcardPool.length > 0) {
        // Flashcard item (50%)
        allItems.push({
          study_type: "flashcard",
          subtopic_id: flashcardPool[flashcardIdx % flashcardPool.length].id,
          category_id: "",
          target_card_count: 10,
        });
        flashcardIdx++;
      } else if (pattern === 2 && practicalCats.length > 0) {
        // Practical item (25%)
        allItems.push({
          study_type: "practical",
          subtopic_id: "",
          category_id: practicalCats[practicalIdx % practicalCats.length].id,
          target_card_count: 10,
        });
        practicalIdx++;
      } else if (pattern === 3 && mcqCats.length > 0) {
        // MCQ item (25%)
        allItems.push({
          study_type: "mcq",
          subtopic_id: "",
          category_id: mcqCats[mcqIdx % mcqCats.length].id,
          target_card_count: 10,
        });
        mcqIdx++;
      } else {
        // Fallback: use whatever is available
        if (flashcardPool.length > 0) {
          allItems.push({
            study_type: "flashcard",
            subtopic_id: flashcardPool[flashcardIdx % flashcardPool.length].id,
            category_id: "",
            target_card_count: 10,
          });
          flashcardIdx++;
        } else if (practicalCats.length > 0) {
          allItems.push({
            study_type: "practical",
            subtopic_id: "",
            category_id: practicalCats[practicalIdx % practicalCats.length].id,
            target_card_count: 10,
          });
          practicalIdx++;
        } else if (mcqCats.length > 0) {
          allItems.push({
            study_type: "mcq",
            subtopic_id: "",
            category_id: mcqCats[mcqIdx % mcqCats.length].id,
            target_card_count: 10,
          });
          mcqIdx++;
        }
      }
    }

    // Distribute items across days
    const itemsPerDay = Math.ceil(allItems.length / totalDays);
    for (let dayIdx = 0; dayIdx < totalDays; dayIdx++) {
      const dayItems = allItems.slice(dayIdx * itemsPerDay, (dayIdx + 1) * itemsPerDay);
      if (dayItems.length > 0) {
        days.push({
          day_number: dayIdx + 1,
          plan_date: addDays(start, dayIdx),
          items: dayItems,
        });
      }
    }

    // Ensure at least one day exists
    if (days.length === 0) {
      days.push({
        day_number: 1,
        plan_date: start,
        items: [createDefaultItem()],
      });
    }

    setDraft(days);
  }

  function generateManual() {
    if (totalDays < 1) {
      toast.error("Pick a plan length first.");
      return;
    }
    const start = todayStr();
    const days: DraftDay[] = Array.from({ length: totalDays }, (_, i) => ({
      day_number: i + 1,
      plan_date: addDays(start, i),
      items: [createDefaultItem()],
    }));
    setDraft(days);
  }

  function updateDraftDay(i: number, patch: Partial<DraftDay>) {
    setDraft((d) => (d ? d.map((x, idx) => (idx === i ? { ...x, ...patch } : x)) : d));
  }

  function updateDraftItem(dayIdx: number, itemIdx: number, patch: Partial<DraftItem>) {
    setDraft((d) => {
      if (!d) return d;
      return d.map((day, idx) => {
        if (idx !== dayIdx) return day;
        const items = day.items.map((item, itemIdx2) => {
          if (itemIdx2 !== itemIdx) return item;
          return { ...item, ...patch };
        });
        return { ...day, items };
      });
    });
  }

  function addDraftItem(dayIdx: number) {
    setDraft((d) => {
      if (!d) return d;
      return d.map((day, idx) => {
        if (idx !== dayIdx) return day;
        return { ...day, items: [...day.items, createDefaultItem()] };
      });
    });
  }

  function removeDraftItem(dayIdx: number, itemIdx: number) {
    setDraft((d) => {
      if (!d) return d;
      const day = d[dayIdx];
      if (!day) return d;
      const items = day.items.filter((_, idx) => idx !== itemIdx);
      if (items.length === 0) {
        // Remove the entire day if it has no items left
        return d.filter((_, idx) => idx !== dayIdx).map((x, idx) => ({
          ...x,
          day_number: idx + 1,
          plan_date: addDays(todayStr(), idx),
        }));
      }
      return d.map((x, idx) => (idx === dayIdx ? { ...x, items } : x));
    });
  }

  function removeDraftDay(i: number) {
    setDraft((d) => {
      if (!d) return d;
      const next = d.filter((_, idx) => idx !== i);
      const start = todayStr();
      return next.map((x, idx) => ({ ...x, day_number: idx + 1, plan_date: addDays(start, idx) }));
    });
  }

  function moveDraftDay(i: number, dir: -1 | 1) {
    setDraft((d) => {
      if (!d) return d;
      const j = i + dir;
      if (j < 0 || j >= d.length) return d;
      const next = [...d];
      [next[i], next[j]] = [next[j], next[i]];
      const start = todayStr();
      return next.map((x, idx) => ({ ...x, day_number: idx + 1, plan_date: addDays(start, idx) }));
    });
  }

  function addDraftDay() {
    setDraft((d) => {
      const list = d ?? [];
      const start = todayStr();
      return [
        ...list,
        {
          day_number: list.length + 1,
          plan_date: addDays(start, list.length),
          items: [createDefaultItem()],
        },
      ];
    });
  }

  async function savePlan() {
    if (!draft || draft.length === 0) return;
    
    // Flatten the nested structure for saving
    const flatRows = draft.flatMap((day) => 
      day.items
        .filter((item) => 
          (item.study_type === "mcq" && item.category_id) || 
          (item.study_type === "practical" && item.category_id) || 
          (item.study_type === "flashcard" && item.subtopic_id)
        )
        .map((item) => ({
          day_number: day.day_number,
          plan_date: day.plan_date,
          study_type: item.study_type,
          subtopic_id: item.study_type === "flashcard" ? item.subtopic_id : null,
          category_id: (item.study_type === "practical" || item.study_type === "mcq") ? item.category_id : null,
          target_card_count: item.target_card_count,
        }))
    );

    if (flatRows.length === 0) {
      toast.error("Pick at least one study area for your plan.");
      return;
    }

    setSaving(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      const uid = u.user?.id;
      if (!uid) throw new Error("Not signed in");
      const start = todayStr();
      const { data: plan, error } = await supabase
        .from("revision_plans")
        .insert({
          user_id: uid,
          plan_type: lengthChoice === "custom" ? "custom" : `${lengthChoice}-day`,
          mode,
          start_date: start,
          end_date: addDays(start, Math.max(0, draft.length - 1)),
        })
        .select("id")
        .single();
      if (error) throw error;

      const { error: dErr } = await supabase.from("revision_plan_days").insert(
        flatRows.map((row) => ({
          plan_id: plan.id,
          day_number: row.day_number,
          plan_date: row.plan_date,
          study_type: row.study_type,
          subtopic_id: row.subtopic_id,
          category_id: row.category_id,
          target_card_count: row.target_card_count,
        })),
      );
      if (dErr) throw dErr;

      toast.success("Plan saved!");
      setDraft(null);
      qc.invalidateQueries({ queryKey: ["planner", "plan"] });
    } catch (e) {
      toast.error("Couldn't save your plan. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  async function deletePlan(planId: string) {
    const { error } = await supabase.from("revision_plans").delete().eq("id", planId);
    if (error) {
      toast.error("Couldn't delete the plan.");
      return;
    }
    toast.success("Plan deleted");
    qc.invalidateQueries({ queryKey: ["planner", "plan"] });
  }

  if (!authChecked) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-background">
        <Spinner />
      </main>
    );
  }

  const existing = planQ.data;

  // Helper function to render the appropriate picker for each draft item
  function renderItemPicker(item: DraftItem, dayIdx: number, itemIdx: number) {
    if (item.study_type === "flashcard") {
      // 3-level picker: Chapter → Topic → Subtopic (storing subtopic_id)
      const subtopic = item.subtopic_id ? subMap.get(item.subtopic_id) : undefined;
      const topicId = subtopic?.topic_id ?? "";
      const categoryId = subtopic?.category_id ?? "";
      
      return (
        <>
          <select
            className="input-field w-full"
            value={topicId}
            onChange={(e) => {
              updateDraftItem(dayIdx, itemIdx, { subtopic_id: "" });
            }}
            aria-label={`Chapter for day ${dayIdx + 1}, item ${itemIdx + 1}`}
          >
            <option value="">Select a chapter…</option>
            {Array.from(new Set(subtopics.map((s) => s.topic_id))).map((tid) => {
              const topicName = subtopics.find((s) => s.topic_id === tid)?.topicName ?? "";
              return (
                <option key={tid} value={tid}>
                  {topicName}
                </option>
              );
            })}
          </select>
          <select
            className="input-field w-full"
            value={categoryId}
            onChange={(e) => {
              updateDraftItem(dayIdx, itemIdx, { subtopic_id: "" });
            }}
            aria-label={`Topic for day ${dayIdx + 1}, item ${itemIdx + 1}`}
          >
            <option value="">Select a topic…</option>
            {subtopics
              .filter((s) => s.topic_id === topicId)
              .map((s) => {
                const catId = s.category_id;
                const catName = s.categoryName;
                return { catId, catName };
              })
              .filter((v, idx, arr) => arr.findIndex((x) => x.catId === v.catId) === idx)
              .map(({ catId, catName }) => (
                <option key={catId} value={catId}>
                  {catName}
                </option>
              ))}
          </select>
          <select
            className="input-field w-full"
            value={item.subtopic_id}
            onChange={(e) => updateDraftItem(dayIdx, itemIdx, { subtopic_id: e.target.value })}
            aria-label={`Subtopic for day ${dayIdx + 1}, item ${itemIdx + 1}`}
          >
            <option value="">Select a subtopic…</option>
            {subtopics
              .filter((s) => s.topic_id === topicId && s.category_id === categoryId)
              .map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
          </select>
        </>
      );
    } else {
      // 2-level picker: Chapter → Topic (storing category_id) for both practical and mcq
      const topicId = item.category_id ? catMap.get(item.category_id)?.topic_id ?? "" : "";
      return (
        <>
          <select
            className="input-field w-full"
            value={topicId}
            onChange={(e) => {
              updateDraftItem(dayIdx, itemIdx, { category_id: "" });
            }}
            aria-label={`Chapter for day ${dayIdx + 1}, item ${itemIdx + 1}`}
          >
            <option value="">Select a chapter…</option>
            {Array.from(new Set(categories.map((c) => c.topic_id))).map((tid) => {
              const topicName = categories.find((c) => c.topic_id === tid)?.topicName ?? "";
              return (
                <option key={tid} value={tid}>
                  {topicName}
                </option>
              );
            })}
          </select>
          <select
            className="input-field w-full"
            value={item.category_id}
            onChange={(e) => updateDraftItem(dayIdx, itemIdx, { category_id: e.target.value })}
            aria-label={`Topic for day ${dayIdx + 1}, item ${itemIdx + 1}`}
          >
            <option value="">Select a topic…</option>
            {categories
              .filter((c) => c.topic_id === topicId)
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
          </select>
        </>
      );
    }
  }

  return (
    <main className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="mx-auto max-w-3xl px-4 py-4 flex items-center justify-between">
          <Link to="/dashboard" className="flex items-center gap-2">
            <Logo size={32} />
            <span className="font-semibold text-foreground">AnatomyAce</span>
          </Link>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Link to="/dashboard" className="text-sm text-muted-foreground hover:text-foreground">
              ← Dashboard
            </Link>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-3xl px-4 py-8 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Revision Planner</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Build a day-by-day study schedule and start each day&apos;s session in one tap.
          </p>
        </div>

        {planQ.isLoading && (
          <div className="card-surface p-10 flex justify-center">
            <Spinner />
          </div>
        )}

        {!planQ.isLoading && existing && !draft && (
          <div className="card-surface p-6 space-y-4">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div>
                <h2 className="text-lg font-semibold text-foreground">
                  Your plan · {existing.plan.plan_type} · {existing.plan.mode === "auto" ? "Auto" : "Manual"}
                </h2>
                <p className="text-sm text-muted-foreground">
                  {prettyDate(existing.plan.start_date)} → {prettyDate(existing.plan.end_date)}
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  className="btn-outline"
                  onClick={() => {
                    // Load existing plan back into draft for editing
                    const daysMap = new Map<number, DraftDay>();
                    existing.days.forEach((d: any) => {
                      const dayNum = d.day_number;
                      if (!daysMap.has(dayNum)) {
                        daysMap.set(dayNum, {
                          day_number: dayNum,
                          plan_date: d.plan_date,
                          items: [],
                        });
                      }
                      const day = daysMap.get(dayNum)!;
                      day.items.push({
                        study_type: d.study_type,
                        subtopic_id: d.subtopic_id || "",
                        category_id: d.category_id || "",
                        target_card_count: d.target_card_count,
                      });
                    });
                    setDraft(Array.from(daysMap.values()).sort((a, b) => a.day_number - b.day_number));
                  }}
                >
                  Edit plan
                </button>
                <button className="btn-outline" onClick={() => deletePlan(existing.plan.id)}>
                  Delete plan
                </button>
              </div>
            </div>

            <ul className="space-y-2">
              {existing.days.map((d: any) => {
                const studyType = (d.study_type || "flashcard") as StudyType;
                const meta = studyTypeMeta[studyType];
                let label = "";
                
                if (studyType === "flashcard") {
                  const s = d.subtopic_id ? subMap.get(d.subtopic_id) : undefined;
                  label = s ? `${s.topicName}: ${s.categoryName} — ${s.name}` : "Subtopic removed";
                } else {
                  const c = d.category_id ? catMap.get(d.category_id) : undefined;
                  label = c ? `${c.topicName}: ${c.name}` : "Topic removed";
                }

                let startLink;
                if (!d.completed) {
                  if (studyType === "flashcard") {
                    startLink = (
                      <Link
                        to="/review"
                        search={{ subtopic: d.subtopic_id ?? undefined }}
                        className="btn-primary shrink-0"
                      >
                        Start
                      </Link>
                    );
                  } else if (studyType === "practical") {
                    startLink = (
                      <Link
                        to="/practical"
                        search={{ topic: d.category_id ?? undefined }}
                        className="btn-primary shrink-0"
                      >
                        Start
                      </Link>
                    );
                  } else {
                    startLink = (
                      <Link
                        to="/mcq"
                        search={{ topic: d.category_id ?? undefined }}
                        className="btn-primary shrink-0"
                      >
                        Start
                      </Link>
                    );
                  }
                }

                return (
                  <li
                    key={d.id}
                    className="flex items-center justify-between gap-3 rounded-xl border border-border p-3"
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-foreground truncate">
                        Day {d.day_number} — {meta.icon} {label}{" "}
                        <span className="text-muted-foreground font-normal">({d.target_card_count} items)</span>
                      </div>
                      <div className="text-xs text-muted-foreground">{prettyDate(d.plan_date)}</div>
                    </div>
                    {d.completed ? (
                      <span className="text-xs font-medium text-primary shrink-0">✓ Completed</span>
                    ) : (
                      startLink
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {!planQ.isLoading && !draft && (
          <div className="card-surface p-6 space-y-5">
            <h2 className="text-lg font-semibold text-foreground">
              {existing ? "Create a new plan" : "Create your plan"}
            </h2>

            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Plan length</label>
              <div className="flex flex-wrap gap-2">
                {(["7", "15", "30", "custom"] as const).map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setLengthChoice(v)}
                    className={lengthChoice === v ? "btn-primary" : "btn-outline"}
                  >
                    {v === "custom" ? "Exam date" : `${v}-Day`}
                  </button>
                ))}
              </div>
              {lengthChoice === "custom" && (
                <input
                  type="date"
                  className="input-field w-full mt-2"
                  value={examDate}
                  min={todayStr()}
                  onChange={(e) => setExamDate(e.target.value)}
                  aria-label="Exam date"
                />
              )}
              {totalDays > 0 && (
                <p className="text-xs text-muted-foreground">
                  {totalDays} day{totalDays === 1 ? "" : "s"} of study.
                </p>
              )}
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Mode</label>
              <div className="flex gap-2">
                <button
                  type="button"
                  className={mode === "auto" ? "btn-primary" : "btn-outline"}
                  onClick={() => setMode("auto")}
                >
                  Auto
                </button>
                <button
                  type="button"
                  className={mode === "manual" ? "btn-primary" : "btn-outline"}
                  onClick={() => setMode("manual")}
                >
                  Manual
                </button>
              </div>
              <p className="text-xs text-muted-foreground">
                {mode === "auto"
                  ? "Weak flashcard areas come first; practical and MCQ days are distributed evenly."
                  : "Pick a study type and area for each day yourself."}
              </p>
            </div>

            <button
              className="btn-primary w-full"
              onClick={mode === "auto" ? generateAuto : generateManual}
              disabled={totalDays < 1 || subtopicsQ.isLoading || categoriesQ.isLoading}
            >
              {mode === "auto" ? "Generate plan" : "Build plan manually"}
            </button>
          </div>
        )}

        {draft && (
          <div className="card-surface p-6 space-y-4">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <h2 className="text-lg font-semibold text-foreground">Review your plan</h2>
              <div className="flex gap-2">
                {mode === "auto" && (
                  <button className="btn-outline" onClick={generateAuto}>
                    Regenerate
                  </button>
                )}
                <button className="btn-outline" onClick={() => setDraft(null)}>
                  Cancel
                </button>
              </div>
            </div>

            <ul className="space-y-2">
              {draft.map((day, dayIdx) => (
                <li key={dayIdx} className="rounded-xl border border-border p-3 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium text-foreground">
                      Day {day.day_number} · {prettyDate(day.plan_date)}
                    </span>
                    <div className="flex gap-1">
                      <button
                        className="h-8 w-8 rounded-lg hover:bg-muted text-foreground"
                        onClick={() => moveDraftDay(dayIdx, -1)}
                        aria-label="Move up"
                      >
                        ↑
                      </button>
                      <button
                        className="h-8 w-8 rounded-lg hover:bg-muted text-foreground"
                        onClick={() => moveDraftDay(dayIdx, 1)}
                        aria-label="Move down"
                      >
                        ↓
                      </button>
                      <button
                        className="h-8 w-8 rounded-lg hover:bg-muted text-foreground"
                        onClick={() => removeDraftDay(dayIdx)}
                        aria-label="Remove day"
                      >
                        ✕
                      </button>
                    </div>
                  </div>

                  {/* Render each item in the day */}
                  {day.items.map((item, itemIdx) => (
                    <div key={itemIdx} className="space-y-2 border-t border-border pt-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-medium text-muted-foreground">
                          Item {itemIdx + 1}
                        </span>
                        <button
                          className="text-xs text-muted-foreground hover:text-foreground"
                          onClick={() => removeDraftItem(dayIdx, itemIdx)}
                          aria-label={`Remove item ${itemIdx + 1} from day ${day.day_number}`}
                        >
                          Remove
                        </button>
                      </div>

                      {/* Study type selector for this item */}
                      <div className="flex gap-2 flex-wrap">
                        {(Object.keys(studyTypeMeta) as StudyType[]).map((type) => (
                          <button
                            key={type}
                            type="button"
                            className={item.study_type === type ? "btn-primary" : "btn-outline"}
                            onClick={() =>
                              updateDraftItem(dayIdx, itemIdx, {
                                study_type: type,
                                subtopic_id: "",
                                category_id: "",
                              })
                            }
                          >
                            {studyTypeMeta[type].icon} {studyTypeMeta[type].label}
                          </button>
                        ))}
                      </div>

                      <div className="grid sm:grid-cols-[1fr_auto] gap-2">
                        <div className="space-y-2">
                          {renderItemPicker(item, dayIdx, itemIdx)}
                        </div>
                        <input
                          type="number"
                          min={1}
                          className="input-field w-full sm:w-28"
                          value={item.target_card_count}
                          onChange={(e) =>
                            updateDraftItem(dayIdx, itemIdx, {
                              target_card_count: Math.max(1, Number(e.target.value) || 1),
                            })
                          }
                          aria-label={`Target items for day ${day.day_number}, item ${itemIdx + 1}`}
                        />
                      </div>
                    </div>
                  ))}

                  {/* Add item button */}
                  <button
                    className="btn-outline w-full"
                    onClick={() => addDraftItem(dayIdx)}
                  >
                    + Add item to this day
                  </button>
                </li>
              ))}
            </ul>

            <div className="flex flex-wrap gap-2">
              <button className="btn-outline" onClick={addDraftDay}>
                + Add day
              </button>
              <button className="btn-primary flex-1" onClick={savePlan} disabled={saving}>
                {saving ? <Spinner /> : "Save plan"}
              </button>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
