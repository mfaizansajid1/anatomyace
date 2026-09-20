import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { ChapterTopicPicker, type ChapterTopicSelection } from "@/components/ChapterTopicPicker";
import { parseCSV } from "@/lib/csv";
import { Pencil, Trash2 } from "lucide-react";
import { TestTimerSettingsPanel } from "@/components/TestTimerSettingsPanel";

type Mcq = {
  id: string;
  category_id: string;
  subtopic_id: string | null;
  question: string;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
  correct_option: string;
  explanation: string | null;
  is_published: boolean;
  exam_name: string | null;
  exam_year: number | null;
};

const OPTIONS = ["a", "b", "c", "d"] as const;

export function McqAdminPanel() {
  const qc = useQueryClient();
  const [sel, setSel] = useState<ChapterTopicSelection>({ topicId: "", categoryId: "" });
  const [subtopicId, setSubtopicId] = useState("");
  const [question, setQuestion] = useState("");
  const [opts, setOpts] = useState({ a: "", b: "", c: "", d: "" });
  const [correct, setCorrect] = useState<string>("a");
  const [explanation, setExplanation] = useState("");
  const [examName, setExamName] = useState("");
  const [examYear, setExamYear] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);

  const subtopicsQ = useQuery({
    enabled: !!sel.categoryId,
    queryKey: ["admin", "mcq-subtopics", sel.categoryId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("subtopics")
        .select("id, name")
        .eq("category_id", sel.categoryId)
        .order("display_order", { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  const pathQ = useQuery({
    enabled: !!sel.categoryId,
    queryKey: ["admin", "mcq-path", sel.categoryId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("categories")
        .select("name, topics(name)")
        .eq("id", sel.categoryId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const subtopicNames = new Map((subtopicsQ.data ?? []).map((s) => [s.id, s.name]));
  const basePath = pathQ.data ? `${pathQ.data.topics?.name ?? ""} → ${pathQ.data.name}` : "";

  const listQ = useQuery({
    enabled: !!sel.categoryId,
    queryKey: ["admin", "mcqs", sel.categoryId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clinical_mcqs")
        .select("id, category_id, subtopic_id, question, option_a, option_b, option_c, option_d, correct_option, explanation, is_published, exam_name, exam_year")
        .eq("category_id", sel.categoryId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Mcq[];
    },
  });

  function clearForm() {
    setEditingId(null);
    setSubtopicId("");
    setQuestion("");
    setOpts({ a: "", b: "", c: "", d: "" });
    setCorrect("a");
    setExplanation("");
    setExamName("");
    setExamYear("");
  }

  const save = useMutation({
    mutationFn: async () => {
      if (!sel.categoryId) throw new Error("Pick a chapter and topic first");
      if (!question.trim()) throw new Error("Question is required");
      for (const k of OPTIONS) {
        if (!opts[k].trim()) throw new Error(`Option ${k.toUpperCase()} is required`);
      }
      const yearTrim = examYear.trim();
      const parsedYear = yearTrim ? Number(yearTrim) : null;
      if (parsedYear !== null && (!Number.isInteger(parsedYear) || parsedYear < 1900 || parsedYear > 2100)) {
        throw new Error("Exam year must be a whole year like 2023");
      }
      const payload = {
        category_id: sel.categoryId,
        question: question.trim(),
        option_a: opts.a.trim(),
        option_b: opts.b.trim(),
        option_c: opts.c.trim(),
        option_d: opts.d.trim(),
        correct_option: correct,
        explanation: explanation.trim() || null,
        exam_name: examName.trim() || null,
        exam_year: parsedYear,
      };
      if (editingId) {
        const { error } = await supabase.from("clinical_mcqs").update(payload).eq("id", editingId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("clinical_mcqs").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(editingId ? "MCQ updated" : "MCQ added");
      clearForm();
      qc.invalidateQueries({ queryKey: ["admin", "mcqs"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      if (!confirm("Delete this MCQ?")) throw new Error("cancelled");
      const { error } = await supabase.from("clinical_mcqs").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("MCQ deleted");
      qc.invalidateQueries({ queryKey: ["admin", "mcqs"] });
    },
    onError: (err: Error) => { if (err.message !== "cancelled") toast.error(err.message); },
  });

  function startEdit(m: Mcq) {
    setEditingId(m.id);
    setQuestion(m.question);
    setOpts({ a: m.option_a, b: m.option_b, c: m.option_c, d: m.option_d });
    setCorrect(m.correct_option);
    setExplanation(m.explanation ?? "");
    setExamName(m.exam_name ?? "");
    setExamYear(m.exam_year != null ? String(m.exam_year) : "");
  }

  return (
    <div className="space-y-4">
      <div className="space-y-4 rounded-2xl border border-border bg-card p-4">
        <h2 className="text-sm font-semibold">Add new MCQ</h2>

        <div className="grid gap-3 sm:grid-cols-2">
          <ChapterTopicPicker idPrefix="mcq" value={sel} onChange={(v) => { setSel(v); clearForm(); }} />
        </div>

        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground" htmlFor="mcq-q">Question</label>
          <textarea
            id="mcq-q"
            className="input-field w-full"
            rows={2}
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          {OPTIONS.map((k) => (
            <div key={k} className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground" htmlFor={`mcq-opt-${k}`}>
                Option {k.toUpperCase()}
              </label>
              <input
                id={`mcq-opt-${k}`}
                className="input-field w-full"
                value={opts[k]}
                onChange={(e) => setOpts((p) => ({ ...p, [k]: e.target.value }))}
              />
            </div>
          ))}
        </div>

        <fieldset className="space-y-1">
          <legend className="text-xs font-medium text-muted-foreground">Correct option</legend>
          <div className="flex flex-wrap gap-3">
            {OPTIONS.map((k) => (
              <label key={k} className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="mcq-correct"
                  value={k}
                  checked={correct === k}
                  onChange={() => setCorrect(k)}
                />
                {k.toUpperCase()}
              </label>
            ))}
          </div>
        </fieldset>

        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground" htmlFor="mcq-expl">Explanation (optional)</label>
          <textarea
            id="mcq-expl"
            className="input-field w-full"
            rows={2}
            value={explanation}
            onChange={(e) => setExplanation(e.target.value)}
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground" htmlFor="mcq-exam-name">Exam Name (optional)</label>
            <input
              id="mcq-exam-name"
              className="input-field w-full"
              placeholder='e.g., "NUMS", "MDCAT"'
              value={examName}
              onChange={(e) => setExamName(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground" htmlFor="mcq-exam-year">Exam Year (optional)</label>
            <input
              id="mcq-exam-year"
              type="number"
              min={1900}
              max={2100}
              className="input-field w-full"
              placeholder="e.g., 2023"
              value={examYear}
              onChange={(e) => setExamYear(e.target.value)}
            />
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <button className="btn-primary px-3 py-2 text-sm" disabled={save.isPending || !sel.categoryId} onClick={() => save.mutate()}>
            {save.isPending ? "Saving…" : editingId ? "Save changes" : "Add MCQ"}
          </button>
          {editingId && <button className="btn-outline px-3 py-2 text-sm" onClick={clearForm}>Cancel</button>}
        </div>
      </div>

      <div className="space-y-2 rounded-2xl border border-border bg-card p-4">
        <h2 className="text-sm font-semibold">Existing MCQs</h2>
        {!sel.categoryId ? (
          <p className="text-xs text-muted-foreground">Pick a chapter and topic to see its MCQs.</p>
        ) : listQ.isLoading ? (
          <p className="text-xs text-muted-foreground">Loading…</p>
        ) : (listQ.data ?? []).length === 0 ? (
          <p className="text-xs text-muted-foreground">No MCQs yet.</p>
        ) : (
          <ul className="space-y-2">
            {listQ.data!.map((m) => (
              <li key={m.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-border p-2">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{m.question}</div>
                  <div className="flex items-center gap-2 truncate text-xs text-muted-foreground">
                    <span>Correct: {m.correct_option.toUpperCase()}</span>
                    {m.exam_name && m.exam_year != null && (
                      <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                        {m.exam_name} {m.exam_year}
                      </span>
                    )}
                  </div>
                </div>
                <button className="inline-flex items-center gap-1 text-xs text-primary hover:underline" onClick={() => startEdit(m)}><Pencil aria-hidden className="h-3.5 w-3.5" />Edit</button>
                <button className="inline-flex items-center gap-1 text-xs text-red-500 hover:underline" onClick={() => remove.mutate(m.id)}><Trash2 aria-hidden className="h-3.5 w-3.5" />Delete</button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <McqTimerSettingsPanel />

      <TestTimerSettingsPanel />

      <McqCsvImport onDone={() => qc.invalidateQueries({ queryKey: ["admin", "mcqs"] })} />
    </div>
  );
}

function McqTimerSettingsPanel() {
  const qc = useQueryClient();
  const [draft, setDraft] = useState<{ min: string; max: string; auto: string } | null>(null);

  const settingsQ = useQuery({
    queryKey: ["mcq-timer-settings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("mcq_timer_settings")
        .select("id, min_seconds, max_seconds, auto_default_seconds")
        .order("updated_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const current = settingsQ.data;
  const values = draft ?? {
    min: String(current?.min_seconds ?? 10),
    max: String(current?.max_seconds ?? 60),
    auto: String(current?.auto_default_seconds ?? 30),
  };

  const save = useMutation({
    mutationFn: async () => {
      if (!current) throw new Error("Timer settings not found");
      const min = Number(values.min);
      const max = Number(values.max);
      const auto = Number(values.auto);
      if (![min, max, auto].every((n) => Number.isFinite(n) && n > 0)) throw new Error("All values must be positive numbers");
      if (min > max) throw new Error("Minimum time cannot exceed maximum time");
      if (auto < min || auto > max) throw new Error("Auto default must sit between minimum and maximum");
      const { error } = await supabase
        .from("mcq_timer_settings")
        .update({ min_seconds: min, max_seconds: max, auto_default_seconds: auto })
        .eq("id", current.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Timer settings saved");
      setDraft(null);
      qc.invalidateQueries({ queryKey: ["mcq-timer-settings"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  function set(field: "min" | "max" | "auto", v: string) {
    setDraft({ ...values, [field]: v });
  }

  return (
    <div className="space-y-3 rounded-2xl border border-border bg-card p-4">
      <h2 className="text-sm font-semibold">Timer settings</h2>
      <p className="text-xs text-muted-foreground">Applies to every Clinical MCQ session (seconds per question).</p>
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground" htmlFor="tm-min">Minimum time</label>
          <input id="tm-min" type="number" min={1} className="input-field w-full" value={values.min} onChange={(e) => set("min", e.target.value)} />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground" htmlFor="tm-max">Maximum time</label>
          <input id="tm-max" type="number" min={1} className="input-field w-full" value={values.max} onChange={(e) => set("max", e.target.value)} />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground" htmlFor="tm-auto">Auto mode default</label>
          <input id="tm-auto" type="number" min={1} className="input-field w-full" value={values.auto} onChange={(e) => set("auto", e.target.value)} />
        </div>
      </div>
      <button className="btn-primary px-3 py-2 text-sm" disabled={save.isPending || settingsQ.isLoading} onClick={() => save.mutate()}>
        {save.isPending ? "Saving…" : "Save timer settings"}
      </button>
    </div>
  );
}

function McqCsvImport({ onDone }: { onDone: () => void }) {
  const [importing, setImporting] = useState(false);
  const [summary, setSummary] = useState<{ created: number; failures: { row: number; reason: string }[] } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    setSummary(null);
    try {
      const rows = parseCSV(await file.text());
      if (rows.length < 2) throw new Error("CSV must contain a header row and at least one data row.");

      const header = rows[0].map((h) => h.trim().toLowerCase());
      const col = (n: string) => header.indexOf(n);
      const iChapter = col("chapter");
      const iTopic = col("topic");
      const iQuestion = col("question");
      const iA = col("option_a");
      const iB = col("option_b");
      const iC = col("option_c");
      const iD = col("option_d");
      const iCorrect = col("correct_option");
      const iExpl = col("explanation");
      const iExamName = col("exam_name");
      const iExamYear = col("exam_year");
      if ([iChapter, iTopic, iQuestion, iA, iB, iC, iD, iCorrect].some((i) => i < 0)) {
        throw new Error("CSV header must include: chapter, topic, question, option_a, option_b, option_c, option_d, correct_option, explanation");
      }

      const { data: chapters, error: tErr } = await supabase.from("topics").select("id, name");
      if (tErr) throw tErr;
      const { data: topics, error: cErr } = await supabase.from("categories").select("id, name, topic_id");
      if (cErr) throw cErr;

      const chapterIdsByName = new Map<string, string[]>();
      (chapters ?? []).forEach((t) => {
        const key = t.name.trim().toLowerCase();
        chapterIdsByName.set(key, [...(chapterIdsByName.get(key) ?? []), t.id]);
      });
      const topicByPair = new Map<string, string[]>();
      (topics ?? []).forEach((c) => {
        const key = `${c.topic_id}::${c.name.trim().toLowerCase()}`;
        topicByPair.set(key, [...(topicByPair.get(key) ?? []), c.id]);
      });

      const failures: { row: number; reason: string }[] = [];
      const inserts: Record<string, string | number | null>[] = [];

      for (let r = 1; r < rows.length; r++) {
        const row = rows[r];
        const get = (i: number) => (i >= 0 ? (row[i] ?? "").trim() : "");
        const chapterName = get(iChapter);
        const topicName = get(iTopic);
        const question = get(iQuestion);
        const a = get(iA), b = get(iB), c = get(iC), d = get(iD);
        const correct = get(iCorrect).toLowerCase();
        const explanation = get(iExpl);
        const examName = get(iExamName);
        const examYearRaw = get(iExamYear);
        const examYearParsed = Number(examYearRaw);
        const examYear = examYearRaw && Number.isInteger(examYearParsed) ? examYearParsed : null;

        if (!chapterName || !topicName) { failures.push({ row: r + 1, reason: "Missing chapter or topic." }); continue; }
        if (!question) { failures.push({ row: r + 1, reason: "Missing question." }); continue; }
        if (!a || !b || !c || !d) { failures.push({ row: r + 1, reason: "All four options are required." }); continue; }
        if (!["a", "b", "c", "d"].includes(correct)) {
          failures.push({ row: r + 1, reason: `Invalid correct_option "${correct}". Use a, b, c or d.` });
          continue;
        }

        const chapterIds = chapterIdsByName.get(chapterName.toLowerCase()) ?? [];
        if (chapterIds.length === 0) { failures.push({ row: r + 1, reason: `No chapter "${chapterName}" found.` }); continue; }
        const matches = chapterIds.flatMap((cid) => topicByPair.get(`${cid}::${topicName.toLowerCase()}`) ?? []);
        if (matches.length === 0) {
          failures.push({ row: r + 1, reason: `No topic "${topicName}" found under chapter "${chapterName}".` });
          continue;
        }

        inserts.push({
          category_id: matches[0],
          question,
          option_a: a,
          option_b: b,
          option_c: c,
          option_d: d,
          correct_option: correct,
          explanation: explanation || null,
          exam_name: examName || null,
          exam_year: examYear,
        });
      }

      let created = 0;
      if (inserts.length > 0) {
        const { error } = await supabase.from("clinical_mcqs").insert(inserts as never);
        if (error) throw error;
        created = inserts.length;
      }

      setSummary({ created, failures });
      toast.success(`${created} MCQs created, ${failures.length} rows failed`);
      onDone();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <div className="space-y-2 rounded-2xl border border-border bg-card p-4">
      <h2 className="text-sm font-semibold">Bulk CSV import</h2>
      <p className="text-xs text-muted-foreground">
        Columns, in order: <code>chapter, topic, question, option_a, option_b, option_c, option_d, correct_option, explanation, exam_name, exam_year</code>.
        The final <code>exam_name</code> and <code>exam_year</code> columns are optional — leave them blank for non-past-paper questions.
        Rows match on the exact chapter + topic pair, so the same topic name may repeat under different chapters.
      </p>
      <input
        ref={fileRef}
        type="file"
        accept=".csv,text/csv"
        onChange={handleImport}
        disabled={importing}
        className="w-full text-sm"
        aria-label="Choose a clinical MCQ CSV file"
      />
      {importing && <p className="text-xs text-muted-foreground">Importing…</p>}
      {summary && (
        <div className="space-y-1 text-xs">
          <p className="font-medium">{summary.created} MCQs created, {summary.failures.length} rows failed</p>
          {summary.failures.length > 0 && (
            <ul className="list-disc space-y-0.5 pl-4 text-red-500">
              {summary.failures.map((f) => (
                <li key={f.row}>Row {f.row}: {f.reason}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
