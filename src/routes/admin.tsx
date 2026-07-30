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

  if (loading) return <div className="p-4 text-center text-sm text-muted-foreground"><Spinner /></div>;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between pb-2 text-sm font-semibold text-muted-foreground">
        <span>Topics</span>
        <button
          onClick={() => { setAdding(!adding); setName(""); }}
          className="text-primary hover:underline"
        >
          {adding ? "Cancel" : "Add"}
        </button>
      </div>

      {adding && (
        <form onSubmit={(e) => { e.preventDefault(); create.mutate(); }} className="mb-2 flex gap-2">
          <input
            autoFocus
            className="w-full rounded bg-muted px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-primary"
            value={name} onChange={(e) => setName(e.target.value)} placeholder="Topic name..."
          />
          <button type="submit" disabled={create.isPending} className="text-sm font-medium text-primary">Save</button>
        </form>
      )}

      {topics.map((t) => (
        <div key={t.id}>
          {editing === t.id ? (
            <form onSubmit={(e) => { e.preventDefault(); update.mutate(t.id); }} className="flex gap-2 p-1">
              <input
                autoFocus
                className="w-full rounded bg-muted px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-primary"
                value={name} onChange={(e) => setName(e.target.value)}
              />
              <button type="button" onClick={() => setEditing(null)} className="text-sm text-muted-foreground">Cancel</button>
              <button type="submit" disabled={update.isPending} className="text-sm font-medium text-primary">Save</button>
            </form>
          ) : (
            <div className="group flex items-center justify-between gap-2">
              <button
                onClick={() => onSelect(t.id)}
                className={`flex-1 rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                  selectedId === t.id ? "bg-primary text-primary-foreground font-medium" : "hover:bg-muted"
                }`}
              >
                {t.name}
              </button>
              <button
                onClick={() => { setEditing(t.id); setName(t.name); }}
                className="hidden text-xs text-muted-foreground hover:text-foreground group-hover:block px-2"
                title="Edit"
              >
                ✎
              </button>
            </div>
          )}
        </div>
      ))}
      {topics.length === 0 && !adding && <p className="text-xs text-muted-foreground">No topics yet.</p>}
    </div>
  );
}

/* ---------- Categories ---------- */

function CategoryPanel({
  topic, categories, loading, selectedId, onSelect, onChanged
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
      const trimmed = name.trim();
      if (!trimmed || !topic) return;
      const nextOrder = Math.max(0, ...categories.map((c) => c.display_order)) + 1;
      const { error } = await supabase.from("categories").insert({ topic_id: topic.id, name: trimmed, display_order: nextOrder });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Category added"); setAdding(false); setName(""); onChanged(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const update = useMutation({
    mutationFn: async (id: string) => {
      const trimmed = name.trim();
      if (!trimmed) throw new Error("Name required");
      const { error } = await supabase.from("categories").update({ name: trimmed }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Category updated"); setEditing(null); setName(""); onChanged(); },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!topic) return null;

  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-base font-semibold">Categories in <span className="text-primary">{topic.name}</span></h2>
        <button
          onClick={() => { setAdding(!adding); setName(""); }}
          className="text-sm font-medium text-primary hover:underline"
        >
          {adding ? "Cancel" : "+ Add Category"}
        </button>
      </div>

      {adding && (
        <form onSubmit={(e) => { e.preventDefault(); create.mutate(); }} className="mb-4 flex gap-2">
          <input
            autoFocus
            className="flex-1 rounded-md border border-border bg-transparent px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-primary"
            value={name} onChange={(e) => setName(e.target.value)} placeholder="Category name..."
          />
          <button type="submit" disabled={create.isPending} className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground">
            Save
          </button>
        </form>
      )}

      {loading ? (
        <div className="flex justify-center p-4"><Spinner /></div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {categories.map((c) => (
            <div key={c.id}>
              {editing === c.id ? (
                 <form onSubmit={(e) => { e.preventDefault(); update.mutate(c.id); }} className="flex gap-1 items-center">
                   <input
                     autoFocus
                     className="w-32 rounded border border-border bg-transparent px-2 py-1 text-sm outline-none"
                     value={name} onChange={(e) => setName(e.target.value)}
                   />
                   <button type="button" onClick={() => setEditing(null)} className="text-xs text-muted-foreground">✕</button>
                   <button type="submit" className="text-xs text-primary">✓</button>
                 </form>
              ) : (
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => onSelect(c.id)}
                    className={`rounded-full border px-4 py-1.5 text-sm transition-colors ${
                      selectedId === c.id ? "border-primary bg-primary text-primary-foreground font-medium" : "border-border bg-muted/50 hover:bg-muted"
                    }`}
                  >
                    {c.name}
                  </button>
                  <button onClick={() => { setEditing(c.id); setName(c.name); }} className="text-xs text-muted-foreground hover:text-foreground">✎</button>
                </div>
              )}
            </div>
          ))}
          {categories.length === 0 && !adding && <p className="text-sm text-muted-foreground">No categories yet.</p>}
        </div>
      )}
    </div>
  );
}

/* ---------- Subtopics ---------- */

function SubtopicPanel({
  topic, category, subtopics, loading, selectedId, onSelect, onChanged
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
      const trimmed = name.trim();
      if (!trimmed || !topic || !category) return;
      const nextOrder = Math.max(0, ...subtopics.map((s) => s.display_order)) + 1;
      const { error } = await supabase.from("subtopics").insert({
        topic_id: topic.id, category_id: category.id, name: trimmed, display_order: nextOrder
      });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Subtopic added"); setAdding(false); setName(""); onChanged(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const update = useMutation({
    mutationThe CSV importer is throwing an error because there is an empty, unnamed column between **Answer** and **Difficulty** in the `image_bbf91f.png` file you provided. 

Here is the corrected header row with the blank column removed, keeping everything else exactly the same:

```csv
Question,Answer,Difficulty,Topic,Category,Subtopic
