import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Logo } from "@/components/Logo";
import { Spinner } from "@/components/Spinner";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "Admin — AnatomyAce" },
      { name: "description", content: "Manage topics, subtopics, and flashcards." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AdminPage,
});

type Topic = { id: string; name: string; subject: string; display_order: number };
type Subtopic = { id: string; topic_id: string; name: string; display_order: number };
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
  const [selectedSubtopic, setSelectedSubtopic] = useState<string | null>(null);

  const topicsQ = useQuery({
    queryKey: ["admin", "topics"],
    queryFn: async () => {
      const { data, error } = await supabase.from("topics").select("*").order("display_order");
      if (error) throw error;
      return data as Topic[];
    },
  });

  const subtopicsQ = useQuery({
    enabled: !!selectedTopic,
    queryKey: ["admin", "subtopics", selectedTopic],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("subtopics")
        .select("*")
        .eq("topic_id", selectedTopic!)
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

  const invalidate = (k: "topics" | "subtopics" | "flashcards") => {
    if (k === "topics") qc.invalidateQueries({ queryKey: ["admin", "topics"] });
    if (k === "subtopics") qc.invalidateQueries({ queryKey: ["admin", "subtopics"] });
    if (k === "flashcards") qc.invalidateQueries({ queryKey: ["admin", "flashcards"] });
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <Logo />
            <span className="text-sm font-semibold text-muted-foreground">Admin</span>
          </div>
          <Link to="/dashboard" className="text-sm text-primary hover:underline">
            ← Back to dashboard
          </Link>
        </div>
      </header>

      <main className="mx-auto grid max-w-6xl grid-cols-1 gap-4 px-4 py-6 md:grid-cols-[240px_1fr]">
        <aside className="rounded-2xl border border-border bg-card p-3">
          <TopicSidebar
            topics={topicsQ.data ?? []}
            loading={topicsQ.isLoading}
            selectedId={selectedTopic}
            onSelect={(id) => { setSelectedTopic(id); setSelectedSubtopic(null); }}
            onChanged={() => invalidate("topics")}
          />
        </aside>

        <section className="space-y-4">
          {!selectedTopic ? (
            <div className="rounded-2xl border border-border bg-card p-8 text-center text-muted-foreground">
              Select a topic from the left to manage its subtopics and flashcards.
            </div>
          ) : (
            <>
              <SubtopicPanel
                topic={topicsQ.data?.find((t) => t.id === selectedTopic) ?? null}
                subtopics={subtopicsQ.data ?? []}
                loading={subtopicsQ.isLoading}
                selectedId={selectedSubtopic}
                onSelect={setSelectedSubtopic}
                onChanged={() => invalidate("subtopics")}
              />
              {selectedSubtopic && (
                <FlashcardPanel
                  topicId={selectedTopic}
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
            topics={topicsQ.data ?? []}
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
      if (!confirm("Delete this topic? All its subtopics and flashcards will be deleted too.")) throw new Error("cancelled");
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

/* ---------- Subtopics ---------- */

function SubtopicPanel({
  topic, subtopics, loading, selectedId, onSelect, onChanged,
}: {
  topic: Topic | null;
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
      if (!topic) throw new Error("Pick a topic first");
      const trimmed = name.trim();
      if (!trimmed) throw new Error("Name is required");
      const nextOrder = Math.max(0, ...subtopics.map((s) => s.display_order)) + 1;
      const { error } = await supabase.from("subtopics").insert({
        topic_id: topic.id, name: trimmed, display_order: nextOrder,
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

  if (!topic) return null;

  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-semibold">{topic.name} · Subtopics</h2>
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
  topicId, subtopicId, topics, flashcards, loading, onChanged,
}: {
  topicId: string;
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
          initial={editing ?? { topic_id: topicId, subtopic_id: subtopicId }}
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
  initial: Partial<Flashcard> & { topic_id: string; subtopic_id: string };
  onClose: () => void;
  onSaved: () => void;
}) {
  const [question, setQuestion] = useState(initial.question ?? "");
  const [answer, setAnswer] = useState(initial.answer ?? "");
  const [difficulty, setDifficulty] = useState<"Easy" | "Medium" | "Hard">(initial.difficulty ?? "Medium");
  const [topicId, setTopicId] = useState(initial.topic_id);
  const [subtopicId, setSubtopicId] = useState(initial.subtopic_id);

  const subtopicsQ = useQuery({
    queryKey: ["admin", "subtopics", topicId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("subtopics").select("id,name,topic_id,display_order").eq("topic_id", topicId).order("display_order");
      if (error) throw error;
      return data as Subtopic[];
    },
  });

  useEffect(() => {
    // if topic changes and current subtopic no longer belongs, reset
    const list = subtopicsQ.data ?? [];
    if (list.length && !list.some((s) => s.id === subtopicId)) {
      setSubtopicId(list[0].id);
    }
  }, [subtopicsQ.data, subtopicId]);

  const save = useMutation({
    mutationFn: async () => {
      if (!question.trim()) throw new Error("Question is required");
      if (!answer.trim()) throw new Error("Answer is required");
      if (!topicId || !subtopicId) throw new Error("Topic and subtopic required");
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
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium">Question</label>
            <textarea
              className="w-full rounded-lg border border-border bg-background p-2 text-sm"
              rows={3}
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium">Answer</label>
            <textarea
              className="w-full rounded-lg border border-border bg-background p-2 text-sm"
              rows={3}
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="mb-1 block text-xs font-medium">Difficulty</label>
              <select
                className="w-full rounded-lg border border-border bg-background p-2 text-sm"
                value={difficulty}
                onChange={(e) => setDifficulty(e.target.value as "Easy" | "Medium" | "Hard")}
              >
                <option>Easy</option><option>Medium</option><option>Hard</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium">Topic</label>
              <select
                className="w-full rounded-lg border border-border bg-background p-2 text-sm"
                value={topicId}
                onChange={(e) => setTopicId(e.target.value)}
              >
                {topics.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium">Subtopic</label>
              <select
                className="w-full rounded-lg border border-border bg-background p-2 text-sm"
                value={subtopicId}
                onChange={(e) => setSubtopicId(e.target.value)}
              >
                {(subtopicsQ.data ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
          </div>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button className="btn-outline px-3 py-1.5 text-sm" onClick={onClose}>Cancel</button>
          <button className="btn-primary px-3 py-1.5 text-sm" disabled={save.isPending} onClick={() => save.mutate()}>
            {save.isPending ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------- CSV import ---------- */

type ImportRow = { row: number; error?: string };

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let cur: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') { inQuotes = false; }
      else field += c;
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ',') { cur.push(field); field = ""; }
      else if (c === '\n' || c === '\r') {
        if (field.length || cur.length) { cur.push(field); rows.push(cur); cur = []; field = ""; }
        if (c === '\r' && text[i + 1] === '\n') i++;
      } else field += c;
    }
  }
  if (field.length || cur.length) { cur.push(field); rows.push(cur); }
  return rows;
}

function CsvImportPanel({ topics, onDone }: { topics: Topic[]; onDone: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [summary, setSummary] = useState<{ created: number; failed: ImportRow[] } | null>(null);

  const topicByName = useMemo(() => {
    const m = new Map<string, Topic>();
    for (const t of topics) m.set(t.name.toLowerCase(), t);
    return m;
  }, [topics]);

  async function handleFile(file: File) {
    setBusy(true);
    setSummary(null);
    try {
      const text = await file.text();
      const rows = parseCsv(text).filter((r) => r.some((c) => c.trim().length));
      if (rows.length === 0) { toast.error("Empty file"); return; }
      const header = rows[0].map((h) => h.trim().toLowerCase());
      const idx = {
        question: header.indexOf("question"),
        answer: header.indexOf("answer"),
        difficulty: header.indexOf("difficulty"),
        topic: header.indexOf("topic"),
        subtopic: header.indexOf("subtopic"),
      };
      if (Object.values(idx).some((v) => v < 0)) {
        toast.error("CSV must have columns: question, answer, difficulty, topic, subtopic");
        return;
      }

      // preload subtopics per topic used
      const subCache = new Map<string, Map<string, string>>(); // topicId -> (subName -> id)
      async function subtopicMap(topicId: string) {
        if (subCache.has(topicId)) return subCache.get(topicId)!;
        const { data } = await supabase.from("subtopics").select("id,name").eq("topic_id", topicId);
        const m = new Map<string, string>();
        for (const s of data ?? []) m.set(s.name.toLowerCase(), s.id);
        subCache.set(topicId, m);
        return m;
      }

      const failed: ImportRow[] = [];
      const toInsert: {
        topic_id: string; subtopic_id: string; question: string; answer: string; difficulty: string;
      }[] = [];

      for (let i = 1; i < rows.length; i++) {
        const r = rows[i];
        const rowNum = i + 1;
        const question = (r[idx.question] ?? "").trim();
        const answer = (r[idx.answer] ?? "").trim();
        const difficulty = (r[idx.difficulty] ?? "").trim();
        const topicName = (r[idx.topic] ?? "").trim();
        const subtopicName = (r[idx.subtopic] ?? "").trim();

        if (!question || !answer) { failed.push({ row: rowNum, error: "Missing question or answer" }); continue; }
        if (!["Easy", "Medium", "Hard"].includes(difficulty)) { failed.push({ row: rowNum, error: "Difficulty must be Easy, Medium, or Hard" }); continue; }
        const topic = topicByName.get(topicName.toLowerCase());
        if (!topic) { failed.push({ row: rowNum, error: `Topic not found: ${topicName}` }); continue; }
        const submap = await subtopicMap(topic.id);
        const subId = submap.get(subtopicName.toLowerCase());
        if (!subId) { failed.push({ row: rowNum, error: `Subtopic "${subtopicName}" not found under "${topicName}"` }); continue; }
        toInsert.push({ topic_id: topic.id, subtopic_id: subId, question, answer, difficulty });
      }

      let created = 0;
      if (toInsert.length) {
        const { error, data } = await supabase.from("flashcards").insert(toInsert).select("id");
        if (error) {
          toast.error(`Insert failed: ${error.message}`);
        } else {
          created = data?.length ?? toInsert.length;
        }
      }
      setSummary({ created, failed });
      if (created) toast.success(`${created} flashcard${created === 1 ? "" : "s"} imported`);
      onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Import failed");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-base font-semibold">Bulk CSV import</h3>
        <span className="text-xs text-muted-foreground">Columns: question, answer, difficulty, topic, subtopic</span>
      </div>
      <input
        ref={fileRef}
        type="file"
        accept=".csv,text/csv"
        disabled={busy}
        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
        className="block w-full text-sm"
      />
      {busy && <p className="mt-2 text-xs text-muted-foreground">Importing…</p>}
      {summary && (
        <div className="mt-3 space-y-1 text-sm">
          <p><strong>{summary.created}</strong> created, <strong>{summary.failed.length}</strong> failed.</p>
          {summary.failed.length > 0 && (
            <ul className="max-h-40 overflow-y-auto rounded-lg border border-border bg-muted/30 p-2 text-xs">
              {summary.failed.map((f) => (
                <li key={f.row}>Row {f.row}: {f.error}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
