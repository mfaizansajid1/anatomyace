import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Two-level picker used by Practical Mode.
 * Display labels only: "Chapter" = topics table, "Topic" = categories table.
 */
export type ChapterTopicSelection = {
  topicId: string;
  categoryId: string;
};

export function ChapterTopicPicker({
  value,
  onChange,
  disabled,
  idPrefix = "ct",
}: {
  value: ChapterTopicSelection;
  onChange: (next: ChapterTopicSelection) => void;
  disabled?: boolean;
  idPrefix?: string;
}) {
  const chaptersQ = useQuery({
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

  const topicsQ = useQuery({
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

  return (
    <>
      <div className="space-y-2">
        <label className="text-sm font-medium text-foreground" htmlFor={`${idPrefix}-chapter`}>Chapter</label>
        <select
          id={`${idPrefix}-chapter`}
          className="input-field w-full"
          value={value.topicId}
          disabled={disabled}
          onChange={(e) => onChange({ topicId: e.target.value, categoryId: "" })}
        >
          <option value="">Select a chapter…</option>
          {chaptersQ.data?.map((t) => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium text-foreground" htmlFor={`${idPrefix}-topic`}>Topic</label>
        <select
          id={`${idPrefix}-topic`}
          className="input-field w-full"
          value={value.categoryId}
          disabled={disabled || !value.topicId || topicsQ.isLoading}
          onChange={(e) => onChange({ ...value, categoryId: e.target.value })}
        >
          <option value="">
            {value.topicId ? (topicsQ.isLoading ? "Loading…" : "Select a topic…") : "Pick a chapter first"}
          </option>
          {topicsQ.data?.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </div>
    </>
  );
}
