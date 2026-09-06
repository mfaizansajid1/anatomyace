import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Timer } from "lucide-react";

export const TEST_TIMER_FALLBACK = {
  min_minutes_per_question: 0.5,
  max_minutes_per_question: 3,
  auto_default_minutes_per_question: 1,
};

export function TestTimerSettingsPanel() {
  const qc = useQueryClient();
  const [draft, setDraft] = useState<{ min: string; max: string; auto: string } | null>(null);

  const settingsQ = useQuery({
    queryKey: ["test-timer-settings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("test_timer_settings")
        .select("id, min_minutes_per_question, max_minutes_per_question, auto_default_minutes_per_question")
        .order("updated_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const current = settingsQ.data;
  const values = draft ?? {
    min: String(current?.min_minutes_per_question ?? TEST_TIMER_FALLBACK.min_minutes_per_question),
    max: String(current?.max_minutes_per_question ?? TEST_TIMER_FALLBACK.max_minutes_per_question),
    auto: String(current?.auto_default_minutes_per_question ?? TEST_TIMER_FALLBACK.auto_default_minutes_per_question),
  };

  const save = useMutation({
    mutationFn: async () => {
      if (!current) throw new Error("Test timer settings not found");
      const min = Number(values.min);
      const max = Number(values.max);
      const auto = Number(values.auto);
      if (![min, max, auto].every((n) => Number.isFinite(n) && n > 0)) throw new Error("All values must be positive numbers");
      if (min > max) throw new Error("Minimum minutes cannot exceed maximum minutes");
      if (auto < min || auto > max) throw new Error("Auto default must sit between minimum and maximum");
      const { error } = await supabase
        .from("test_timer_settings")
        .update({
          min_minutes_per_question: min,
          max_minutes_per_question: max,
          auto_default_minutes_per_question: auto,
          updated_at: new Date().toISOString(),
        })
        .eq("id", current.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Test timer settings saved");
      setDraft(null);
      qc.invalidateQueries({ queryKey: ["test-timer-settings"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  function set(field: "min" | "max" | "auto", v: string) {
    setDraft({ ...values, [field]: v });
  }

  return (
    <div className="space-y-3 rounded-2xl border border-border bg-card p-4">
      <h2 className="inline-flex items-center gap-2 text-sm font-semibold">
        <Timer aria-hidden className="h-4 w-4" />
        Test Timer Settings
      </h2>
      <p className="text-xs text-muted-foreground">
        Applies to Test Mode (minutes per question). Total test time = question count × minutes per question.
      </p>
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground" htmlFor="ttm-min">Minimum minutes per question</label>
          <input id="ttm-min" type="number" min={0.1} step={0.1} className="input-field w-full" value={values.min} onChange={(e) => set("min", e.target.value)} />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground" htmlFor="ttm-max">Maximum minutes per question</label>
          <input id="ttm-max" type="number" min={0.1} step={0.1} className="input-field w-full" value={values.max} onChange={(e) => set("max", e.target.value)} />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground" htmlFor="ttm-auto">Auto mode default</label>
          <input id="ttm-auto" type="number" min={0.1} step={0.1} className="input-field w-full" value={values.auto} onChange={(e) => set("auto", e.target.value)} />
        </div>
      </div>
      <button className="btn-primary px-3 py-2 text-sm" disabled={save.isPending || settingsQ.isLoading} onClick={() => save.mutate()}>
        {save.isPending ? "Saving…" : "Save test timer settings"}
      </button>
    </div>
  );
}
