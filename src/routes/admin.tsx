import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Logo } from "@/components/Logo";
import { Spinner } from "@/components/Spinner";
import { ThemeToggle } from "@/components/ThemeToggle";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "Admin — AnatomyAce" },
      { name: "description", content: "Manage topics, categories, subtopics, and flashcards." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AdminPage,
});

type Topic = { id: string; name: string; subject: string; display_order: number };
type Category = { id: string; topic_id: string; name: string; display_order: number };
type Subtopic = { id: string; topic_id: string; category_id: string; name: string; display_order: number };
type Flashcard = {
  id: string;
  topic_id: string;
  subtopic_id: string;
  question: string;
  answer: string;
  difficulty: "Easy" | "Medium" | "Hard";
  is_published: boolean;
};

type AuthState =
  | { status: "loading" }
  | { status: "guest" }
  | { status: "denied" }
  | { status: "admin"; userId: string };

function useAdminAuth(): AuthState {
  const [state, setState] = useState<AuthState>({ status: "loading" });
  const navigate = useNavigate();
  useEffect(() => {
    let active = true;
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!active) return;
      if (!u.user) {
        setState({ status: "guest" });
        navigate({ to: "/login" });
        return;
      }
      const { data: roles } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", u.user.id);
      if (!active) return;
      const isAdmin = (roles ?? []).some((r) => r.role === "admin");
      if (!isAdmin) {
        setState({ status: "denied" });
        toast.error("You don't have access to this page.");
        navigate({ to: "/dashboard", replace: true });
        return;
      }
      setState({ status: "admin", userId: u.user.id });
    })();
    return () => { active = false; };
  }, [navigate]);
  return state;
}

function AdminPage() {
  const auth = useAdminAuth();
  if (auth.status !== "admin") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Spinner />
      </div>
    );
  }
  return <AdminShell />;
}

function AdminShell() {
  const qc = useQueryClient();
  const [selectedTopic, setSelectedTopic] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedSubtopic, setSelectedSubtopic] = useState<string | null>(null);

  const topicsQ = useQuery({
    queryKey: ["admin", "topics"],
    queryFn: async () => {
      const { data, error } = await supabase.from("topics").select("*").order("display_order");
      if (error) throw error;
      return data as Topic[];
    },
  });

  const categoriesQ = useQuery({
    enabled: !!selectedTopic,
    queryKey: ["admin", "categories", selectedTopic],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("categories")
        .select("*")
        .eq("topic_id", selectedTopic!)
        .order("display_order");
      if (error) throw error;
      return data as Category[];
    },
  });

  const subtopicsQ = useQuery({
    enabled: !!selectedCategory,
    queryKey: ["admin", "subtopics", selectedCategory],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("subtopics")
        .select("*")
        .eq("category_id", selectedCategory!)
        .order("display_order");
      if (error) throw error;
      return data as Subtopic[];
    },
  });

  const flashcardsQ = useQuery({
    enabled: !!selectedSubtopic,
    queryKey: ["admin", "flashcards", selectedSubtopic],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("flashcards")
        .select("id,topic_id,subtopic_id,question,answer,difficulty,is_published")
        .eq("subtopic_id", selectedSubtopic!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Flashcard[];
    },
  });

  const invalidate = (k: "topics" | "categories" | "subtopics" | "flashcards") => {
    qc.invalidateQueries({ queryKey: ["admin", k] });
  };

  const currentTopic = topicsQ.data?.find((t) => t.id === selectedTopic) ?? null;
  const currentCategory = categoriesQ.data?.find((c) => c.id === selectedCategory) ?? null;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <Logo />
            <span className="text-sm font-semibold text-muted-foreground">Admin</span>
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Link to="/dashboard" className="text-sm text-primary hover:underline">
              ← Back to dashboard
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-6xl grid-cols-1 gap-4 px-4 py-6 md:grid-cols-[220px_1fr]">
        <aside className="rounded-2xl border border-border bg-card p-3">
          <TopicSidebar
            topics={topicsQ.data ?? []}
            loading={topicsQ.isLoading}
            selectedId={selectedTopic}
            onSelect={(id) => { setSelectedTopic(id); setSelectedCategory(null); setSelectedSubtopic(null); }}
            onChanged={() => invalidate("topics")}
          />
        </aside>

        <section className="space-y-4">
          {!selectedTopic ? (
            <div className="rounded-2xl border border-border bg-card p-8 text-center text-muted-foreground">
              Select a topic from the left to manage its categories, subtopics, and flashcards.
            </div>
          ) : (
            <>
              <CategoryPanel
                topic={currentTopic}
                categories={categoriesQ.data ?? []}
                loading={categoriesQ.isLoading}
                selectedId={selectedCategory}
                onSelect={(id) => { setSelectedCategory(id); setSelectedSubtopic(null); }}
                onChanged={() => invalidate("categories")}
              />
              {selectedCategory && (
                <SubtopicPanel
                  topic={currentTopic}
                  category={currentCategory}
                  subtopics={subtopicsQ.data ?? []}
                  loading={subtopicsQ.isLoading}
                  selectedId={selectedSubtopic}
                  onSelect={setSelectedSubtopic}
                  onChanged={() => invalidate("subtopics")}
                />
              )}
              {selectedSubtopic && selectedCategory && (
                <FlashcardPanel
                  topicId={selectedTopic}
                  categoryId={selectedCategory}
                  subtopicId={selectedSubtopic}
                  topics={topicsQ.data ?? []}
                  flashcards={flashcardsQ.data ?? []}
                  loading={flashcardsQ.isLoading}
                  onChanged={() => invalidate("flashcards")}
                />
              )}
            </>
          )}
          <CsvImportPanel
            onDone={() => { invalidate("flashcards"); }}
          />
        </section>
      </main>
    </div>
  );
}

/* ---------- Topics ---------- */

function TopicSidebar({
  topics, loading, selectedId, onSelect, onChanged,
}: {
  topics: Topic[];
  loading: boolean;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onChanged: () => void;
}) {
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [name, setName] = useState("");

  const create = useMutation({
    mutationFn: async () => {
      const trimmed = name.trim();
      if (!trimmed) throw new Error("Name is required");
      const nextOrder = Math.max(0, ...topics.map((t) => t.display_order)) + 1;
      const { error } = await supabase.from("topics").insert({ name: trimmed, display_order: nextOrder });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Topic added"); setAdding(false); setName(""); onChanged(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const update = useMutation({
    mutationFn: async (id: string) => {
      const trimmed = name.trim();
      if (!trimmed) throw new Error("Name is required");
      const { error } = await supabase.from("topics").update({ name: trimmed }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Topic updated"); setEditing(null); setName(""); onChanged(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      if (!confirm("Delete this topic? All its categories, subtopics, and flashcards will be deleted too.")) throw new Error("cancelled");
      const { error } = await supabase.from("topics").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Topic deleted"); onChanged(); },
    onError: (e: Error) => { if (e.message !== "cancelled") toast.error(e.message); },
  });

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between px-1">
        <h2 className="text-sm font-semibold">Topics</h2>
        <button className="text-xs text-primary hover:underline" onClick={() => { setAdding(true); setName(""); }}>
          + Add
        </button>
      </div>
      {adding && (
        <div className="space-y-1 rounded-xl border border-border p-2">
          <input
            className="w-full rounded-lg border border-border bg-background px-2 py-1 text-sm"
            placeholder="Topic name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
          <div className="flex gap-1">
            <button className="btn-primary px-2 py-1 text-xs" disabled={create.isPending} onClick={() => create.mutate()}>
              {create.isPending ? "…" : "Save"}
            </button>
            <button className="btn-outline px-2 py-1 text-xs" onClick={() => setAdding(false)}>Cancel</button>
          </div>
        </div>
      )}
      {loading ? (
        <div className="p-2 text-xs text-muted-foreground">Loading…</div>
      ) : topics.length === 0 ? (
        <div className="p-2 text-xs text-muted-foreground">No topics yet.</div>
      ) : (
        <ul className="space-y-1">
          {topics.map((t) => (
            <li key={t.id}>
              {editing === t.id ? (
                <div className="space-y-1 rounded-xl border border-border p-2">
                  <input
                    className="w-full rounded-lg border border-border bg-background px-2 py-1 text-sm"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    autoFocus
                  />
                  <div className="flex gap-1">
                    <button className="btn-primary px-2 py-1 text-xs" onClick={() => update.mutate(t.id)}>Save</button>
                    <button className="btn-outline px-2 py-1 text-xs" onClick={() => setEditing(null)}>Cancel</button>
                  </div>
                </div>
              ) : (
                <div className={`flex items-center justify-between rounded-xl px-2 py-1.5 text-sm ${selectedId === t.id ? "bg-primary/10 text-primary" : "hover:bg-muted"}`}>
                  <button className="flex-1 truncate text-left" onClick={() => onSelect(t.id)}>{t.name}</button>
                  <div className="flex gap-1 opacity-60">
                    <button className="text-xs hover:text-primary" onClick={() => { setEditing(t.id); setName(t.name); }}>edit</button>
                    <button className="text-xs hover:text-rose-500" onClick={() => remove.mutate(t.id)}>del</button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ---------- Categories ---------- */

function CategoryPanel({
  topic, categories, loading, selectedId, onSelect, onChanged,
}: {
  topic: Topic | null;
  categories: Category[];
  loading: boolean;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onChanged: () => void;
}) {
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [name, setName] = useState("");

  const create = useMutation({
    mutationFn: async () => {
      if (!topic) throw new Error("Pick a topic first");
      const trimmed = name.trim();
      if (!trimmed) throw new Error("Name is required");
      const nextOrder = Math.max(0, ...categories.map((c) => c.display_order)) + 1;
      const { error } = await supabase.from("categories").insert({
        topic_id: topic.id, name: trimmed, display_order: nextOrder,
      });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Category added"); setAdding(false); setName(""); onChanged(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const update = useMutation({
    mutationFn: async (id: string) => {
      const trimmed = name.trim();
      if (!trimmed) throw new Error("Name is required");
      const { error } = await supabase.from("categories").update({ name: trimmed }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Category updated"); setEditing(null); onChanged(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { count } = await supabase
        .from("subtopics")
        .select("*", { count: "exact", head: true })
        .eq("category_id", id);
      const warning = count && count > 0
        ? `⚠️ This category has ${count} subtopic${count === 1 ? "" : "s"} (and all their flashcards). Delete everything?`
        : "Delete this category?";
      if (!confirm(warning)) throw new Error("cancelled");
      const { error } = await supabase.from("categories").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Category deleted"); onChanged(); },
    onError: (e: Error) => { if (e.message !== "cancelled") toast.error(e.message); },
  });

  if (!topic) return null;

  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-semibold">{topic.name} · Categories</h2>
        <button className="btn-primary px-3 py-1.5 text-sm" onClick={() => { setAdding(true); setName(""); }}>
          + Add category
        </button>
      </div>
      {adding && (
        <div className="mb-3 flex gap-2 rounded-xl border border-border p-2">
          <input
            className="flex-1 rounded-lg border border-border bg-background px-2 py-1 text-sm"
            placeholder="Category name (e.g. Osteology, Muscles)"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
          <button className="btn-primary px-2 py-1 text-xs" onClick={() => create.mutate()}>Save</button>
          <button className="btn-outline px-2 py-1 text-xs" onClick={() => setAdding(false)}>Cancel</button>
        </div>
      )}
      {loading ? (
        <div className="text-sm text-muted-foreground">Loading…</div>
      ) : categories.length === 0 ? (
        <div className="text-sm text-muted-foreground">No categories yet. Add one to get started.</div>
      ) : (
        <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-3">
          {categories.map((c) => (
            <li key={c.id}>
              {editing === c.id ? (
                <div className="flex gap-1 rounded-xl border border-border p-2">
                  <input
                    className="flex-1 rounded-lg border border-border bg-background px-2 py-1 text-sm"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    autoFocus
                  />
                  <button className="btn-primary px-2 py-1 text-xs" onClick={() => update.mutate(c.id)}>Save</button>
                  <button className="btn-outline px-2 py-1 text-xs" onClick={() => setEditing(null)}>Cancel</button>
                </div>
              ) : (
                <div className={`flex items-center justify-between rounded-xl px-3 py-2 text-sm ${selectedId === c.id ? "bg-primary/10 text-primary" : "bg-muted/40 hover:bg-muted"}`}>
                  <button className="flex-1 truncate text-left" onClick={() => onSelect(c.id)}>{c.name}</button>
                  <div className="flex gap-2 text-xs opacity-70">
                    <button className="hover:text-primary" onClick={() => { setEditing(c.id); setName(c.name); }}>edit</button>
                    <button className="hover:text-rose-500" onClick={() => remove.mutate(c.id)}>delete</button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ---------- Subtopics ---------- */

function SubtopicPanel({
  topic, category, subtopics, loading, selectedId, onSelect, onChanged,
}: {
  topic: Topic | null;
  category: Category | null;
  subtopics: Subtopic[];
  loading: boolean;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onChanged: () => void;
}) {
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [name, setName] = useState("");

  const create = useMutation({
    mutationFn: async () => {
      if (!topic || !category) throw new Error("Pick a topic and category first");
      const trimmed = name.trim();
      if (!trimmed) throw new Error("Name is required");
      const nextOrder = Math.max(0, ...subtopics.map((s) => s.display_order)) + 1;
      const { error } = await supabase.from("subtopics").insert({
        topic_id: topic.id, category_id: category.id, name: trimmed, display_order: nextOrder,
      });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Subtopic added"); setAdding(false); setName(""); onChanged(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const update = useMutation({
    mutationFn: async (id: string) => {
      const trimmed = name.trim();
      if (!trimmed) throw new Error("Name is required");
      const { error } = await supabase.from("subtopics").update({ name: trimmed }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Subtopic updated"); setEditing(null); onChanged(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { count } = await supabase
        .from("flashcards")
        .select("*", { count: "exact", head: true })
        .eq("subtopic_id", id);
      const warning = count && count > 0
        ? `This subtopic has ${count} flashcard${count === 1 ? "" : "s"}. Delete all of them?`
        : "Delete this subtopic?";
      if (!confirm(warning)) throw new Error("cancelled");
      const { error } = await supabase.from("subtopics").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Subtopic deleted"); onChanged(); },
    onError: (e: Error) => { if (e.message !== "cancelled") toast.error(e.message); },
  });

  if (!topic || !category) return null;

  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-semibold">{topic.name} › {category.name} · Subtopics</h2>
        <button className="btn-primary px-3 py-1.5 text-sm" onClick={() => { setAdding(true); setName(""); }}>
          + Add subtopic
        </button>
      </div>
      {adding && (
        <div className="mb-3 flex gap-2 rounded-xl border border-border p-2">
          <input
            className="flex-1 rounded-lg border border-border bg-background px-2 py-1 text-sm"
            placeholder="Subtopic name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
          <button className="btn-primary px-2 py-1 text-xs" onClick={() => create.mutate()}>Save</button>
          <button className="btn-outline px-2 py-1 text-xs" onClick={() => setAdding(false)}>Cancel</button>
        </div>
      )}
      {loading ? (
        <div className="text-sm text-muted-foreground">Loading…</div>
      ) : subtopics.length === 0 ? (
        <div className="text-sm text-muted-foreground">No subtopics yet.</div>
      ) : (
        <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {subtopics.map((s) => (
            <li key={s.id}>
              {editing === s.id ? (
                <div className="flex gap-1 rounded-xl border border-border p-2">
                  <input
                    className="flex-1 rounded-lg border border-border bg-background px-2 py-1 text-sm"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    autoFocus
                  />
                  <button className="btn-primary px-2 py-1 text-xs" onClick={() => update.mutate(s.id)}>Save</button>
                  <button className="btn-outline px-2 py-1 text-xs" onClick={() => setEditing(null)}>Cancel</button>
                </div>
              ) : (
                <div className={`flex items-center justify-between rounded-xl px-3 py-2 text-sm ${selectedId === s.id ? "bg-primary/10 text-primary" : "bg-muted/40 hover:bg-muted"}`}>
                  <button className="flex-1 truncate text-left" onClick={() => onSelect(s.id)}>{s.name}</button>
                  <div className="flex gap-2 text-xs opacity-70">
                    <button className="hover:text-primary" onClick={() => { setEditing(s.id); setName(s.name); }}>edit</button>
                    <button className="hover:text-rose-500" onClick={() => remove.mutate(s.id)}>delete</button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ---------- Flashcards ---------- */

function diffBadge(d: string) {
  if (d === "Easy") return "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300";
  if (d === "Hard") return "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300";
  return "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300";
}

function FlashcardPanel({
  topicId, categoryId, subtopicId, topics, flashcards, loading, onChanged,
}: {
  topicId: string;
  categoryId: string;
  subtopicId: string;
  topics: Topic[];
  flashcards: Flashcard[];
  loading: boolean;
  onChanged: () => void;
}) {
  const [editing, setEditing] = useState<Flashcard | null>(null);
  const [creating, setCreating] = useState(false);

  const togglePublish = useMutation({
    mutationFn: async (fc: Flashcard) => {
      const { error } = await supabase.from("flashcards")
        .update({ is_published: !fc.is_published }).eq("id", fc.id);
      if (error) throw error;
    },
    onSuccess: () => onChanged(),
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      if (!confirm("Delete this flashcard?")) throw new Error("cancelled");
      const { error } = await supabase.from("flashcards").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Flashcard deleted"); onChanged(); },
    onError: (e: Error) => { if (e.message !== "cancelled") toast.error(e.message); },
  });

  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-base font-semibold">Flashcards</h3>
        <button className="btn-primary px-3 py-1.5 text-sm" onClick={() => setCreating(true)}>
          + Add flashcard
        </button>
      </div>

      {loading ? (
        <div className="text-sm text-muted-foreground">Loading…</div>
      ) : flashcards.length === 0 ? (
        <div className="text-sm text-muted-foreground">No flashcards yet.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="py-2 pr-3">Question</th>
                <th className="py-2 pr-3">Difficulty</th>
                <th className="py-2 pr-3">Published</th>
                <th className="py-2"></th>
              </tr>
            </thead>
            <tbody>
              {flashcards.map((fc) => (
                <tr key={fc.id} className="border-t border-border">
                  <td className="max-w-md py-2 pr-3 truncate">{fc.question}</td>
                  <td className="py-2 pr-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs ${diffBadge(fc.difficulty)}`}>{fc.difficulty}</span>
                  </td>
                  <td className="py-2 pr-3">
                    <button
                      className={`rounded-full px-2 py-0.5 text-xs ${fc.is_published ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}
                      onClick={() => togglePublish.mutate(fc)}
                    >
                      {fc.is_published ? "Published" : "Draft"}
                    </button>
                  </td>
                  <td className="py-2 text-right text-xs">
                    <button className="mr-2 text-primary hover:underline" onClick={() => setEditing(fc)}>Edit</button>
                    <button className="text-rose-500 hover:underline" onClick={() => remove.mutate(fc.id)}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {(creating || editing) && (
        <FlashcardForm
          topics={topics}
          initial={editing ?? { topic_id: topicId, category_id: categoryId, subtopic_id: subtopicId }}
          onClose={() => { setCreating(false); setEditing(null); }}
          onSaved={() => { setCreating(false); setEditing(null); onChanged(); }}
        />
      )}
    </div>
  );
}

function FlashcardForm({
  topics, initial, onClose, onSaved,
}: {
  topics: Topic[];
  initial: Partial<Flashcard> & { topic_id: string; category_id?: string; subtopic_id: string };
  onClose: () => void;
  onSaved: () => void;
}) {
  const [question, setQuestion] = useState(initial.question ?? "");
  const [answer, setAnswer] = useState(initial.answer ?? "");
  const [difficulty, setDifficulty] = useState<"Easy" | "Medium" | "Hard">(initial.difficulty ?? "Medium");
  const [topicId, setTopicId] = useState(initial.topic_id);
  const [categoryId, setCategoryId] = useState(initial.category_id ?? "");
  const [subtopicId, setSubtopicId] = useState(initial.subtopic_id);

  const categoriesQ = useQuery({
    enabled: !!topicId,
    queryKey: ["admin", "categories", topicId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("categories").select("*").eq("topic_id", topicId).order("display_order");
      if (error) throw error;
      return data as Category[];
    },
  });

  // If editing an existing card, derive category from its subtopic on first load
  useEffect(() => {
    if (categoryId || !initial.subtopic_id) return;
    (async () => {
      const { data } = await supabase.from("subtopics").select("category_id").eq("id", initial.subtopic_id).maybeSingle();
      if (data?.category_id) setCategoryId(data.category_id);
    })();
  }, [categoryId, initial.subtopic_id]);

  const subtopicsQ = useQuery({
    enabled: !!categoryId,
    queryKey: ["admin", "subtopics", categoryId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("subtopics").select("*").eq("category_id", categoryId).order("display_order");
      if (error) throw error;
      return data as Subtopic[];
    },
  });

  useEffect(() => {
    const list = categoriesQ.data ?? [];
    if (list.length && !list.some((c) => c.id === categoryId)) {
      setCategoryId(list[0].id);
    }
  }, [categoriesQ.data, categoryId]);

  useEffect(() => {
    const list = subtopicsQ.data ?? [];
    if (list.length && !list.some((s) => s.id === subtopicId)) {
      setSubtopicId(list[0].id);
    }
  }, [subtopicsQ.data, subtopicId]);

  const save = useMutation({
    mutationFn: async () => {
      if (!question.trim()) throw new Error("Question is required");
      if (!answer.trim()) throw new Error("Answer is required");
      if (!topicId || !categoryId || !subtopicId) throw new Error("Topic, category, and subtopic required");
      const payload = {
        topic_id: topicId,
        subtopic_id: subtopicId,
        question: question.trim(),
        answer: answer.trim(),
        difficulty,
      };
      if (initial.id) {
        const { error } = await supabase.from("flashcards").update(payload).eq("id", initial.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("flashcards").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => { toast.success(initial.id ? "Flashcard updated" : "Flashcard added"); onSaved(); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-lg rounded-2xl bg-card p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h3 className="mb-3 text-lg font-semibold">{initial.id ? "Edit flashcard" : "Add flashcard"}</h3>
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">Topic</label>
              <select className="w-full rounded-lg border border-border bg-background p-1.5 text-sm" value={topicId} onChange={(e) => setTopicId(e.target.value)}>
                {topics.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">Category</label>
              <select className="w-full rounded-lg border border-border bg-background p-1.5 text-sm" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
                {(categoriesQ.data ?? []).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">Subtopic</label>
              <select className="w-full rounded-lg border border-border bg-background p-1.5 text-sm" value={subtopicId} onChange={(e) => setSubtopicId(e.target.value)}>
                {(subtopicsQ.data ?? []).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">Question</label>
            <textarea
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
              rows={3}
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">Answer</label>
            <textarea
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
              rows={4}
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">Difficulty</label>
            <select className="w-full rounded-lg border border-border bg-background p-1.5 text-sm" value={difficulty} onChange={(e) => setDifficulty(e.target.value as any)}>
              <option value="Easy">Easy</option>
              <option value="Medium">Medium</option>
              <option value="Hard">Hard</option>
            </select>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button className="btn-outline px-4 py-2 text-sm" onClick={onClose}>Cancel</button>
            <button className="btn-primary px-4 py-2 text-sm" onClick={() => save.mutate()} disabled={save.isPending}>
              {save.isPending ? "Saving..." : "Save"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------- CSV Import ---------- */

function CsvImportPanel({ onDone }: { onDone: () => void }) {
  const [importing, setImporting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Helper to split a simple CSV row (handles basic quoted strings)
  const parseCsvLine = (text: string) => {
    const re = /(?!\s*$)\s*(?:'([^'\\]*(?:\\[\s\S][^'\\]*)*)'|"([^"\\]*(?:\\[\s\S][^"\\]*)*)"|([^,'"\s\\]*(?:\s+[^,'"\s\\]+)*))\s*(?:,|$)/g;
    const a: string[] = [];
    text.replace(re, (m, c1, c2, c3) => {
      a.push(c1 !== undefined ? c1 : c2 !== undefined ? c2 : c3 !== undefined ? c3 : "");
      return "";
    });
    return a.map(val => val.trim());
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImporting(true);
    try {
      const text = await file.text();
      const lines = text.split("\n").filter(l => l.trim().length > 0);
      if (lines.length < 2) throw new Error("CSV must have a header row and at least one data row");[cite: 1]

      // Fetch the hierarchy upfront for accurate matching
      const { data: topics, error: tErr } = await supabase.from("topics").select("id, name");
      if (tErr) throw tErr;
      
      const { data: categories, error: cErr } = await supabase.from("categories").select("id, topic_id, name");
      if (cErr) throw cErr;
      
      const { data: subtopics, error: sErr } = await supabase.from("subtopics").select("id, category_id, name");
      if (sErr) throw sErr;

      const flashcardsToInsert = [];

      for (let i = 1; i < lines.length; i++) {
        const row = parseCsvLine(lines[i]);
        if (row.length < 7) continue; // Skip malformed rows that don't have enough columns[cite: 1]
        
        // Exact mapping from image_bbea79.png
        const questionIdx = 0;
        const answerIdx = 1;
        // Index 2 is intentionally blank/skipped based on the provided image
        const diffIdx = 3;
        const topicIdx = 4;
        const categoryIdx = 5;
        const subtopicIdx = 6;
        
        const rowQuestion = row[questionIdx];
        const rowAnswer = row[answerIdx];
        const rowTopic = row[topicIdx];
        const rowCategory = row[categoryIdx];
        const rowSubtopic = row[subtopicIdx];
        
        if (!rowQuestion || !rowAnswer || !rowTopic || !rowCategory || !rowSubtopic) continue;
        
        // Default difficulty to Medium if missing/empty
        let rowDiff = "Medium";
        if (row[diffIdx]) {
           const d = row[diffIdx].charAt(0).toUpperCase() + row[diffIdx].slice(1).toLowerCase();
           if (["Easy", "Medium", "Hard"].includes(d)) rowDiff = d;
        }

        // 1. Resolve Topic
        const topicMatch = topics.find(t => t.name.toLowerCase() === rowTopic.toLowerCase());
        if (!topicMatch) {
          throw new Error(`Row ${i + 1} failed: Topic '${rowTopic}' not found.`);
        }

        // 2. Resolve Category (Match BOTH Topic ID and Category Name)
        const categoryMatch = categories.find(
          c => c.topic_id === topicMatch.id && c.name.toLowerCase() === rowCategory.toLowerCase()
        );
        if (!categoryMatch) {
          throw new Error(`Row ${i + 1} failed: Category '${rowCategory}' not found under Topic '${topicMatch.name}'.`);
        }

        // 3. Resolve Subtopic (Match BOTH Category ID and Subtopic Name)
        const subtopicMatch = subtopics.find(
          s => s.category_id === categoryMatch.id && s.name.toLowerCase() === rowSubtopic.toLowerCase()
        );
        if (!subtopicMatch) {
          throw new Error(`Row ${i + 1} failed: Subtopic '${rowSubtopic}' not found under Category '${categoryMatch.name}' (Topic: '${topicMatch.name}').`);
        }

        flashcardsToInsert.push({
          topic_id: topicMatch.id,
          subtopic_id: subtopicMatch.id,
          question: rowQuestion,
          answer: rowAnswer,
          difficulty: rowDiff,
          is_published: true, // Default to published on import
        });
      }

      if (flashcardsToInsert.length === 0) throw new Error("No valid rows found to import.");

      const { error: insertErr } = await supabase.from("flashcards").insert(flashcardsToInsert);
      if (insertErr) throw insertErr;

      toast.success(`Successfully imported ${flashcardsToInsert.length} flashcards.`);
      onDone();

    } catch (err: any) {
      toast.error(err.message || "Failed to parse CSV");
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <h3 className="mb-2 text-base font-semibold">Bulk Import Flashcards</h3>
      <p className="mb-4 text-xs text-muted-foreground">
        Upload a CSV file containing: <code>Question, Answer, [Blank], Difficulty, Topic, Category, Subtopic</code>
      </p>
      <div className="flex items-center gap-3">
        <input
          type="file"
          accept=".csv"
          ref={fileRef}
          onChange={handleImport}
          className="hidden"
          id="csv-upload"
          disabled={importing}
        />
        <label
          htmlFor="csv-upload"
          className={`cursor-pointer rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
            importing ? "bg-muted text-muted-foreground" : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
          }`}
        >
          {importing ? "Importing..." : "Choose CSV File"}
        </label>
      </div>
    </div>
  );
}
