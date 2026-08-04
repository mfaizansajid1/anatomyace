import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Chapter → Topic → Subtopic picker.
 * Display labels only: "Chapter" = topics table, "Topic" = categories table.
 */
export type HierarchySelection = {
  topicId: string;
  categoryId: string;
  subtopicId: string;
};

export function HierarchyPicker({
  value,
  onChange,
  disabled,
}: {
  value: HierarchySelection;
  onChange: (next: HierarchySelection) => void;
  disabled?: boolean;
}) {
  const topicsQ = useQuery({
    queryKey: ["hierarchy", "topics"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("topics")
        .select("id, name")
        .order("display_order", { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  const categoriesQ = useQuery({
    enabled: !!value.topicId,
    queryKey: ["hierarchy", "categories", value.topicId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("categories")
        .select("id, name")
        .eq("topic_id", value.topicId)
        .order("display_order", { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  const subtopicsQ = useQuery({
    enabled: !!value.categoryId,
    queryKey: ["hierarchy", "subtopics", value.categoryId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("subtopics")
        .select("id, name")
        .eq("category_id", value.categoryId)
        .order("display_order", { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  return (
    <>
      <div className="space-y-2">
        <label className="text-sm font-medium text-foreground" htmlFor="picker-chapter">Chapter</label>
        <select
          id="picker-chapter"
          className="input-field w-full"
          value={value.topicId}
          disabled={disabled}
          onChange={(e) => onChange({ topicId: e.target.value, categoryId: "", subtopicId: "" })}
        >
          <option value="">Select a chapter…</option>
          {topicsQ.data?.map((t) => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium text-foreground" htmlFor="picker-topic">Topic</label>
        <select
          id="picker-topic"
          className="input-field w-full"
          value={value.categoryId}
          disabled={disabled || !value.topicId || categoriesQ.isLoading}
          onChange={(e) => onChange({ ...value, categoryId: e.target.value, subtopicId: "" })}
        >
          <option value="">
            {value.topicId ? (categoriesQ.isLoading ? "Loading…" : "Select a topic…") : "Pick a chapter first"}
          </option>
          {categoriesQ.data?.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium text-foreground" htmlFor="picker-subtopic">Subtopic</label>
        <select
          id="picker-subtopic"
          className="input-field w-full"
          value={value.subtopicId}
          disabled={disabled || !value.categoryId || subtopicsQ.isLoading}
          onChange={(e) => onChange({ ...value, subtopicId: e.target.value })}
        >
          <option value="">
            {value.categoryId ? (subtopicsQ.isLoading ? "Loading…" : "Select a subtopic…") : "Pick a topic first"}
          </option>
          {subtopicsQ.data?.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
      </div>
    </>
  );
}
