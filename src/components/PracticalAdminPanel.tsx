import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { ChapterTopicPicker, type ChapterTopicSelection } from "@/components/ChapterTopicPicker";
import { parseCSV } from "@/lib/csv";

const STRUCTURE_TYPES = ["bone", "muscle", "nerve", "artery", "vein"] as const;

type PracticalItem = {
  id: string;
  category_id: string | null;
  structure_type: string;
  image_url: string;
  correct_answer: string;
  explanation: string | null;
  is_published: boolean;
};

export function PracticalAdminPanel() {
  const qc = useQueryClient();
  const [sel, setSel] = useState<ChapterTopicSelection>({ topicId: "", categoryId: "" });
  const [structureType, setStructureType] = useState<string>("bone");
  const [imageUrl, setImageUrl] = useState("");
  const [answer, setAnswer] = useState("");
  const [explanation, setExplanation] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);

  const itemsQ = useQuery({
    enabled: !!sel.categoryId,
    queryKey: ["admin", "practical", sel.categoryId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("practical_items")
        .select("id, category_id, structure_type, image_url, correct_answer, explanation, is_published")
        .eq("category_id", sel.categoryId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as PracticalItem[];
    },
  });

  function clearForm() {
    setEditingId(null);
    setStructureType("bone");
    setImageUrl("");
    setAnswer("");
    setExplanation("");
  }

  const save = useMutation({
    mutationFn: async () => {
      if (!sel.categoryId) throw new Error("Pick a chapter and topic first");
      if (!imageUrl.trim()) throw new Error("Image URL is required");
      if (!answer.trim()) throw new Error("Correct answer is required");
      const payload = {
        category_id: sel.categoryId,
        structure_type: structureType,
        image_url: imageUrl.trim(),
        correct_answer: answer.trim(),
        explanation: explanation.trim() || null,
      };
      if (editingId) {
        const { error } = await supabase.from("practical_items").update(payload).eq("id", editingId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("practical_items").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(editingId ? "Practical item updated" : "Practical item added");
      clearForm();
      qc.invalidateQueries({ queryKey: ["admin", "practical"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      if (!confirm("Delete this practical item?")) throw new Error("cancelled");
      const { error } = await supabase.from("practical_items").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Practical item deleted");
      qc.invalidateQueries({ queryKey: ["admin", "practical"] });
    },
    onError: (err: Error) => { if (err.message !== "cancelled") toast.error(err.message); },
  });

  function startEdit(item: PracticalItem) {
    setEditingId(item.id);
    setStructureType(item.structure_type);
    setImageUrl(item.image_url);
    setAnswer(item.correct_answer);
    setExplanation(item.explanation ?? "");
  }

  return (
    <div className="space-y-4">
      <div className="space-y-4 rounded-2xl border border-border bg-card p-4">
        <h2 className="text-sm font-semibold">Add new practical item</h2>

        <div className="grid gap-3 sm:grid-cols-2">
          <ChapterTopicPicker idPrefix="pr" value={sel} onChange={(v) => { setSel(v); clearForm(); }} />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground" htmlFor="pr-type">Structure type</label>
            <select
              id="pr-type"
              className="input-field w-full"
              value={structureType}
              onChange={(e) => setStructureType(e.target.value)}
            >
              {STRUCTURE_TYPES.map((t) => (
                <option key={t} value={t} className="capitalize">{t}</option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground" htmlFor="pr-answer">Correct answer</label>
            <input
              id="pr-answer"
              className="input-field w-full"
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              placeholder="e.g. Femur"
            />
          </div>
        </div>

        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground" htmlFor="pr-image">Image URL</label>
          <input
            id="pr-image"
            className="input-field w-full"
            value={imageUrl}
            onChange={(e) => setImageUrl(e.target.value)}
            placeholder="https://…"
          />
        </div>

        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground" htmlFor="pr-expl">Explanation (optional)</label>
          <textarea
            id="pr-expl"
            className="input-field w-full"
            rows={2}
            value={explanation}
            onChange={(e) => setExplanation(e.target.value)}
          />
        </div>

        <div className="flex flex-wrap gap-2">
          <button className="btn-primary px-3 py-2 text-sm" disabled={save.isPending || !sel.categoryId} onClick={() => save.mutate()}>
            {save.isPending ? "Saving…" : editingId ? "Save changes" : "Add item"}
          </button>
          {editingId && (
            <button className="btn-outline px-3 py-2 text-sm" onClick={clearForm}>Cancel</button>
          )}
        </div>
      </div>

      <div className="space-y-2 rounded-2xl border border-border bg-card p-4">
        <h2 className="text-sm font-semibold">Existing practical items</h2>
        {!sel.categoryId ? (
          <p className="text-xs text-muted-foreground">Pick a chapter and topic to see its items.</p>
        ) : itemsQ.isLoading ? (
          <p className="text-xs text-muted-foreground">Loading…</p>
        ) : (itemsQ.data ?? []).length === 0 ? (
          <p className="text-xs text-muted-foreground">No practical items yet.</p>
        ) : (
          <ul className="space-y-2">
            {itemsQ.data!.map((item) => (
              <li key={item.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-border p-2">
                <img src={item.image_url} alt="" className="h-12 w-12 rounded-lg object-cover bg-muted" loading="lazy" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{item.correct_answer}</div>
                  <div className="truncate text-xs capitalize text-muted-foreground">{item.structure_type}</div>
                </div>
                <button className="text-xs text-primary hover:underline" onClick={() => startEdit(item)}>Edit</button>
                <button className="text-xs text-red-500 hover:underline" onClick={() => remove.mutate(item.id)}>Delete</button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <PracticalCsvImport onDone={() => qc.invalidateQueries({ queryKey: ["admin", "practical"] })} />
    </div>
  );
}

function PracticalCsvImport({ onDone }: { onDone: () => void }) {
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
      const col = (name: string) => header.indexOf(name);
      const iChapter = col("chapter");
      const iTopic = col("topic");
      const iType = col("structure_type");
      const iImage = col("image_url");
      const iAnswer = col("correct_answer");
      const iExpl = col("explanation");
      if (iChapter < 0 || iTopic < 0 || iImage < 0 || iAnswer < 0) {
        throw new Error("CSV header must include: chapter, topic, structure_type, image_url, correct_answer, explanation");
      }

      const { data: chapters, error: tErr } = await supabase.from("topics").select("id, name");
      if (tErr) throw tErr;
      const { data: topics, error: cErr } = await supabase.from("categories").select("id, name, topic_id");
      if (cErr) throw cErr;

      // Chapter is the parent that disambiguates topics with the same name.
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
      const inserts: {
        category_id: string;
        structure_type: string;
        image_url: string;
        correct_answer: string;
        explanation: string | null;
      }[] = [];

      for (let r = 1; r < rows.length; r++) {
        const row = rows[r];
        const chapterName = (row[iChapter] ?? "").trim();
        const topicName = (row[iTopic] ?? "").trim();
        const imageUrl = (row[iImage] ?? "").trim();
        const correct = (row[iAnswer] ?? "").trim();
        const structureType = (iType >= 0 ? (row[iType] ?? "").trim().toLowerCase() : "") || "bone";
        const explanation = iExpl >= 0 ? (row[iExpl] ?? "").trim() : "";

        if (!chapterName || !topicName) { failures.push({ row: r + 1, reason: "Missing chapter or topic." }); continue; }
        if (!imageUrl) { failures.push({ row: r + 1, reason: "Missing image_url." }); continue; }
        if (!correct) { failures.push({ row: r + 1, reason: "Missing correct_answer." }); continue; }
        if (!STRUCTURE_TYPES.includes(structureType as (typeof STRUCTURE_TYPES)[number])) {
          failures.push({ row: r + 1, reason: `Invalid structure_type "${structureType}". Use bone, muscle, nerve, artery or vein.` });
          continue;
        }

        const chapterIds = chapterIdsByName.get(chapterName.toLowerCase()) ?? [];
        if (chapterIds.length === 0) {
          failures.push({ row: r + 1, reason: `No chapter "${chapterName}" found.` });
          continue;
        }
        const matches = chapterIds.flatMap((cid) => topicByPair.get(`${cid}::${topicName.toLowerCase()}`) ?? []);
        if (matches.length === 0) {
          failures.push({ row: r + 1, reason: `No topic "${topicName}" found under chapter "${chapterName}".` });
          continue;
        }

        inserts.push({
          category_id: matches[0],
          structure_type: structureType,
          image_url: imageUrl,
          correct_answer: correct,
          explanation: explanation || null,
        });
      }

      let created = 0;
      if (inserts.length > 0) {
        const { error } = await supabase.from("practical_items").insert(inserts);
        if (error) throw error;
        created = inserts.length;
      }

      setSummary({ created, failures });
      toast.success(`${created} items created, ${failures.length} items failed`);
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
        Columns, in order: <code>chapter, topic, structure_type, image_url, correct_answer, explanation</code>.
        Each row is matched on the exact chapter + topic pair, so the same topic name may repeat under different chapters.
      </p>
      <input
        ref={fileRef}
        type="file"
        accept=".csv,text/csv"
        onChange={handleImport}
        disabled={importing}
        className="w-full text-sm"
        aria-label="Choose a practical items CSV file"
      />
      {importing && <p className="text-xs text-muted-foreground">Importing…</p>}
      {summary && (
        <div className="space-y-1 text-xs">
          <p className="font-medium">{summary.created} items created, {summary.failures.length} items failed</p>
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
